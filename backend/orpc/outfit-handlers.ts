import { ORPCError } from '@orpc/server'
import { and, desc, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import {
  FIT_PROFILES,
  GARMENT_LENGTHS,
  ITEM_CATEGORIES,
} from '../avatar/services/steal-the-look-pipeline'
import { clothingItem, outfit } from '../db/schema'
import { outfitInsertSchema, outfitUpdateSchema } from '../zod-schemas'
import { authed } from './authed'

const listOutfits = authed.handler(async ({ context }) => {
  const { db, user } = context
  return db
    .select()
    .from(outfit)
    .where(and(eq(outfit.userId, user.id), ne(outfit.status, 'deleted')))
    .orderBy(desc(outfit.createdAt))
})

const findOutfit = authed.input(z.object({ id: z.uuid() })).handler(async ({ context, input }) => {
  const { db, user } = context
  const result = await db
    .select()
    .from(outfit)
    .where(and(eq(outfit.id, input.id), eq(outfit.userId, user.id)))
  return result[0] ?? null
})

const SLOT_KEYS = ['headwearId', 'baseId', 'outerId', 'bottomId', 'footwearId'] as const

const createOutfit = authed.input(outfitInsertSchema).handler(async ({ context, input }) => {
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

const updateOutfit = authed
  .input(outfitUpdateSchema.pick({ id: true, name: true, notes: true }))
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

const deleteOutfit = authed
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

const rateOutfit = authed
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

// ──────────────────────────────────────────────────────────────────────────
// Try-On Save flow
//
// The Try On screen ends with a Save sheet that may include a mix of:
//   - wardrobe items (already in clothing_item — pass `wardrobeId`)
//   - AI items from the steal-the-look draft (NOT in clothing_item — pass
//     the full `aiItem` payload; we promote them as owned=false rows)
// We resolve every slot to a clothing_item id, then write a single outfit
// row referencing those ids. The hero preview is local-only (the draft
// atom + regenHeroUrl state) — not persisted server-side.
// ──────────────────────────────────────────────────────────────────────────

const colorSchema = z.object({
  name: z.string(),
  hex: z.string(),
  ratio: z.number(),
})

const aiItemPayloadSchema = z.object({
  imageUrl: z.string(),
  category: z.enum(ITEM_CATEGORIES),
  brand: z.string().nullable(),
  fit: z.enum(FIT_PROFILES).nullable(),
  length: z.enum(GARMENT_LENGTHS).nullable(),
  colors: z.array(colorSchema),
})

const slotInputSchema = z
  .object({
    category: z.enum(ITEM_CATEGORIES),
    wardrobeId: z.uuid().optional(),
    aiItem: aiItemPayloadSchema.optional(),
  })
  .refine((v) => !!v.wardrobeId !== !!v.aiItem, {
    message: 'slot must specify exactly one of wardrobeId or aiItem',
  })

const CATEGORY_TO_SLOT_KEY = {
  headwear: 'headwearId',
  shirt: 'baseId',
  jacket: 'outerId',
  pants: 'bottomId',
  footwear: 'footwearId',
} as const

const saveFromTryOn = authed
  .input(
    z.object({
      name: z.string().nullable(),
      heroImageUrl: z.string().nullable(),
      slots: z.array(slotInputSchema).min(1),
    }),
  )
  .handler(async ({ context, input }) => {
    const { db, user } = context

    // Resolve each slot to a clothing_item id. AI payloads are promoted
    // as owned=false rows; wardrobe ids are validated to belong to the
    // caller and be non-removed.
    const slotIds: Partial<
      Record<(typeof CATEGORY_TO_SLOT_KEY)[keyof typeof CATEGORY_TO_SLOT_KEY], string>
    > = {}
    for (const slot of input.slots) {
      let itemId: string
      if (slot.wardrobeId) {
        const rows = await db
          .select()
          .from(clothingItem)
          .where(and(eq(clothingItem.id, slot.wardrobeId), eq(clothingItem.userId, user.id)))
        const row = rows[0]
        if (!row || row.status === 'removed') {
          throw new ORPCError('BAD_REQUEST', { message: 'slot item not available' })
        }
        if (row.category !== slot.category) {
          throw new ORPCError('BAD_REQUEST', { message: 'slot category mismatch' })
        }
        itemId = row.id
      } else if (slot.aiItem) {
        const inserted = await db
          .insert(clothingItem)
          .values({
            userId: user.id,
            imageUrl: slot.aiItem.imageUrl,
            category: slot.aiItem.category,
            brand: slot.aiItem.brand,
            fit: slot.aiItem.fit,
            length: slot.aiItem.length,
            colors: slot.aiItem.colors,
            owned: false,
          })
          .returning()
        const row = inserted[0]
        if (!row)
          throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'failed to save ai item' })
        itemId = row.id
      } else {
        // Unreachable per slotInputSchema refine — narrows the type.
        throw new ORPCError('BAD_REQUEST', { message: 'invalid slot' })
      }
      slotIds[CATEGORY_TO_SLOT_KEY[slot.category]] = itemId
    }

    const result = await db
      .insert(outfit)
      .values({
        userId: user.id,
        name: input.name,
        heroImageUrl: input.heroImageUrl,
        ...slotIds,
      })
      .returning()
    return result[0]
  })

export const outfitHandlers = {
  list: listOutfits,
  find: findOutfit,
  create: createOutfit,
  saveFromTryOn,
  update: updateOutfit,
  delete: deleteOutfit,
  rate: rateOutfit,
}
