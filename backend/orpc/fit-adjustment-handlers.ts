import { ORPCError } from '@orpc/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { clothingItem, fitAdjustment } from '../db/schema'
import { requirePermission } from './authed'

// Spec: specs/fit-page.allium — FitAdjustment (lines 81-90),
// SetFitAdjustment (lines 165-198). Invariants: OneFitAdjustmentPerUserItem
// (lines 272-276), FitAdjustmentOwnedByUser (lines 278-281).

const LENGTH = ['shorter', 'true_to_size', 'longer'] as const
const WIDTH = ['tighter', 'true_to_size', 'looser'] as const
const SLEEVE = ['too_short', 'true_to_size', 'too_long'] as const
const RISE = ['low_rise', 'mid_rise', 'high_rise'] as const

const setFitAdjustmentSchema = z.object({
  itemId: z.uuid(),
  length: z.enum(LENGTH).optional(),
  width: z.enum(WIDTH).optional(),
  sleeve: z.enum(SLEEVE).optional(),
  rise: z.enum(RISE).optional(),
  customNotes: z.string().max(2000).optional(),
})

const getForItem = requirePermission({ permission: { fitAdjustment: ['read'] } })
  .input(z.object({ itemId: z.uuid() }))
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const rows = await db
      .select()
      .from(fitAdjustment)
      .where(and(eq(fitAdjustment.userId, user.id), eq(fitAdjustment.itemId, input.itemId)))
    return rows[0] ?? null
  })

// Upsert on (userId, itemId). Requires the item to belong to the caller and
// have a non-'removed' status, per SetFitAdjustment rule.
const upsert = requirePermission({ permission: { fitAdjustment: ['upsert'] } })
  .input(setFitAdjustmentSchema)
  .handler(async ({ context, input }) => {
    const { db, user } = context

    const itemRows = await db
      .select()
      .from(clothingItem)
      .where(and(eq(clothingItem.id, input.itemId), eq(clothingItem.userId, user.id)))
    const item = itemRows[0]
    if (!item) {
      throw new ORPCError('NOT_FOUND', { message: 'Item not found' })
    }
    if (item.status === 'removed') {
      throw new ORPCError('BAD_REQUEST', { message: 'Cannot adjust a removed item' })
    }

    const now = new Date()
    const values = {
      userId: user.id,
      itemId: input.itemId,
      length: input.length ?? null,
      width: input.width ?? null,
      sleeve: input.sleeve ?? null,
      rise: input.rise ?? null,
      customNotes: input.customNotes ?? null,
    }
    const result = await db
      .insert(fitAdjustment)
      .values(values)
      .onConflictDoUpdate({
        target: [fitAdjustment.userId, fitAdjustment.itemId],
        set: {
          length: values.length,
          width: values.width,
          sleeve: values.sleeve,
          rise: values.rise,
          customNotes: values.customNotes,
          updatedAt: now,
        },
      })
      .returning()
    return result[0]
  })

const remove = requirePermission({ permission: { fitAdjustment: ['delete'] } })
  .input(z.object({ itemId: z.uuid() }))
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const result = await db
      .delete(fitAdjustment)
      .where(and(eq(fitAdjustment.userId, user.id), eq(fitAdjustment.itemId, input.itemId)))
      .returning()
    if (!result[0]) {
      throw new ORPCError('NOT_FOUND', { message: 'Fit adjustment not found' })
    }
    return true
  })

export const fitAdjustmentHandlers = {
  getForItem,
  upsert,
  remove,
}
