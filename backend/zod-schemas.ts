import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod'
import { z } from 'zod'
import { clothingItem, outfit, userBiometrics } from './db/schema'

export const clothingItemSelectSchema = createSelectSchema(clothingItem)

// Server-controlled fields are stripped from the insert shape. userId comes
// from auth context; id/timestamps/removedAt/status are all managed by
// the server.
export const clothingItemInsertSchema = createInsertSchema(clothingItem).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  removedAt: true,
  status: true,
})

export const clothingItemUpdateSchema = createUpdateSchema(clothingItem)
  .omit({
    createdAt: true,
    updatedAt: true,
    removedAt: true,
    status: true,
    userId: true,
  })
  .extend({ id: z.uuid() })

export const outfitSelectSchema = createSelectSchema(outfit)

// Server-controlled: id/timestamps/deletedAt/status managed by server. userId comes from auth.
export const outfitInsertSchema = createInsertSchema(outfit).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  status: true,
  userId: true,
})

export const outfitUpdateSchema = createUpdateSchema(outfit)
  .omit({
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
    status: true,
    userId: true,
  })
  .extend({ id: z.uuid() })

// UserBiometrics — min/max values mirror specs/fit-page.allium config block
// (min_height_cm=130, max_height_cm=220, min_weight_kg=30, max_weight_kg=200).
// Hardcoded for now; plumb through a config system later.
export const userBiometricsSelectSchema = createSelectSchema(userBiometrics)

export const userBiometricsInsertSchema = createInsertSchema(userBiometrics, {
  heightCm: z.number().int().min(130).max(220),
  weightKg: z.number().int().min(30).max(200),
  facePhotoUrl: z.url().optional(),
}).omit({
  userId: true,
  createdAt: true,
  updatedAt: true,
})
