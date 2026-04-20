import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod'
import { z } from 'zod'
import { clothingItem } from './db/schema'

export const clothingItemSelectSchema = createSelectSchema(clothingItem)
export const clothingItemInsertSchema = createInsertSchema(clothingItem).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export const clothingItemUpdateSchema = createUpdateSchema(clothingItem)
  .omit({ createdAt: true, updatedAt: true })
  .extend({ id: z.uuid() })
