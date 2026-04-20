import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { clothingItem } from '../db/schema'
import { clothingItemInsertSchema, clothingItemUpdateSchema } from '../zod-schemas'
import { requirePermission } from './authed'

const listClothingItems = requirePermission({ permission: { clothingItem: ['read'] } }).handler(
  async ({ context }) => {
    const { db, user } = context
    return db
      .select()
      .from(clothingItem)
      .where(eq(clothingItem.userId, user.id))
      .orderBy(desc(clothingItem.createdAt))
  },
)

const findClothingItem = requirePermission({ permission: { clothingItem: ['read'] } })
  .input(z.object({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const result = await db
      .select()
      .from(clothingItem)
      .where(and(eq(clothingItem.id, input.id), eq(clothingItem.userId, user.id)))
    return result[0] ?? null
  })

const createClothingItem = requirePermission({ permission: { clothingItem: ['create'] } })
  .input(clothingItemInsertSchema.omit({ userId: true }))
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const result = await db
      .insert(clothingItem)
      .values({ ...input, userId: user.id })
      .returning()
    return result[0]
  })

const updateClothingItem = requirePermission({ permission: { clothingItem: ['update'] } })
  .input(clothingItemUpdateSchema.omit({ userId: true }))
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const { id, ...updateData } = input

    const result = await db
      .update(clothingItem)
      .set({ ...updateData, updatedAt: new Date() })
      .where(and(eq(clothingItem.id, id), eq(clothingItem.userId, user.id)))
      .returning()
    return result[0]
  })

const deleteClothingItem = requirePermission({ permission: { clothingItem: ['delete'] } })
  .input(z.object({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    const { db, user } = context
    await db
      .delete(clothingItem)
      .where(and(eq(clothingItem.id, input.id), eq(clothingItem.userId, user.id)))
    return true
  })

export const clothingItemHandlers = {
  list: listClothingItems,
  find: findClothingItem,
  create: createClothingItem,
  update: updateClothingItem,
  delete: deleteClothingItem,
}
