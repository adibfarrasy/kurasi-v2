import { ORPCError } from '@orpc/server'
import { and, desc, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { clothingItem, outfit } from '../db/schema'
import { outfitInsertSchema, outfitUpdateSchema } from '../zod-schemas'
import { requirePermission } from './authed'

const listOutfits = requirePermission({ permission: { outfit: ['read'] } }).handler(
  async ({ context }) => {
    const { db, user } = context
    return db
      .select()
      .from(outfit)
      .where(and(eq(outfit.userId, user.id), ne(outfit.status, 'deleted')))
      .orderBy(desc(outfit.createdAt))
  },
)

const findOutfit = requirePermission({ permission: { outfit: ['read'] } })
  .input(z.object({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const result = await db
      .select()
      .from(outfit)
      .where(and(eq(outfit.id, input.id), eq(outfit.userId, user.id)))
    return result[0] ?? null
  })

const SLOT_KEYS = ['headwearId', 'baseId', 'outerId', 'bottomId', 'footwearId'] as const

const createOutfit = requirePermission({ permission: { outfit: ['create'] } })
  .input(outfitInsertSchema)
  .handler(async ({ context, input }) => {
    const { db, user } = context

    // SaveOutfit requires at least one slot non-null.
    const slotIds = SLOT_KEYS.map((k) => input[k]).filter((v): v is string => !!v)
    if (slotIds.length === 0) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'outfit must include at least one piece',
      })
    }

    // Every referenced item must belong to caller and be non-removed.
    for (const itemId of slotIds) {
      const rows = await db
        .select()
        .from(clothingItem)
        .where(and(eq(clothingItem.id, itemId), eq(clothingItem.userId, user.id)))
      const row = rows[0]
      if (!row || row.status === 'removed') {
        throw new ORPCError('BAD_REQUEST', { message: 'slot item not available' })
      }
    }

    const result = await db
      .insert(outfit)
      .values({ ...input, userId: user.id })
      .returning()
    return result[0]
  })

const updateOutfit = requirePermission({ permission: { outfit: ['update'] } })
  .input(outfitUpdateSchema.pick({ id: true, name: true, tags: true, notes: true }))
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const { id, ...updateData } = input

    const result = await db
      .update(outfit)
      .set({ ...updateData, updatedAt: new Date() })
      .where(and(eq(outfit.id, id), eq(outfit.userId, user.id), eq(outfit.status, 'active')))
      .returning()
    if (!result[0]) {
      throw new ORPCError('NOT_FOUND', { message: 'Outfit not found' })
    }
    return result[0]
  })

const deleteOutfit = requirePermission({ permission: { outfit: ['delete'] } })
  .input(z.object({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const result = await db
      .update(outfit)
      .set({ status: 'deleted', deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(outfit.id, input.id), eq(outfit.userId, user.id), eq(outfit.status, 'active')))
      .returning()
    if (!result[0]) {
      throw new ORPCError('NOT_FOUND', { message: 'Outfit not found' })
    }
    return true
  })

const rateOutfit = requirePermission({ permission: { outfit: ['update'] } })
  .input(
    z.object({
      id: z.uuid(),
      rating: z.enum(['loved', 'ok', 'didnt_work']),
      wornAt: z.date().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const patch: { rating: 'loved' | 'ok' | 'didnt_work'; wornAt?: Date; updatedAt: Date } = {
      rating: input.rating,
      updatedAt: new Date(),
    }
    if (input.wornAt) patch.wornAt = input.wornAt

    const result = await db
      .update(outfit)
      .set(patch)
      .where(and(eq(outfit.id, input.id), eq(outfit.userId, user.id), eq(outfit.status, 'active')))
      .returning()
    if (!result[0]) {
      throw new ORPCError('NOT_FOUND', { message: 'Outfit not found' })
    }
    return result[0]
  })

export const outfitHandlers = {
  list: listOutfits,
  find: findOutfit,
  create: createOutfit,
  update: updateOutfit,
  delete: deleteOutfit,
  rate: rateOutfit,
}
