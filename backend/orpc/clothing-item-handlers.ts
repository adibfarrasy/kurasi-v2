import { ORPCError } from '@orpc/server'
import { and, desc, eq, ne, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { clothingItem, onboardingProgress, outfit } from '../db/schema'
import { clothingItemInsertSchema, clothingItemUpdateSchema } from '../zod-schemas'
import { authed } from './authed'
import { maybeCompleteOnboarding, STARTER_WARDROBE_THRESHOLD } from './onboarding-helpers'

const ITEM_CATEGORIES = ['headwear', 'shirt', 'jacket', 'pants', 'footwear'] as const
const FIT_PROFILES = ['skinny', 'regular', 'relaxed', 'oversize'] as const
const GARMENT_LENGTHS = [
  'cropped',
  'waist',
  'hip',
  'thigh',
  'knee',
  'full-length',
  'thigh-shorts',
  'knee-shorts',
  'ankle-length',
] as const

const uploadItemSchema = z.object({
  imageUrl: z.string().min(1),
  originalImageUrl: z.string().nullable(),
  category: z.enum(ITEM_CATEGORIES),
  name: z.string().nullable(),
  brand: z.string().nullable(),
  fit: z.enum(FIT_PROFILES).nullable(),
  length: z.enum(GARMENT_LENGTHS).nullable(),
  customNotes: z.string().nullable(),
  colors: z.array(z.object({ name: z.string(), hex: z.string(), ratio: z.number() })).default([]),
})

const listClothingItems = authed.handler(async ({ context }) => {
  const { db, user } = context

  const items = await db
    .select()
    .from(clothingItem)
    .where(and(eq(clothingItem.userId, user.id), eq(clothingItem.status, 'active')))
    .orderBy(desc(clothingItem.createdAt))

  // Aggregate per-slot counts via a single grouped query. Indexes on each
  // outfit slot FK column (drizzle/0009) keep this cheap. Cheaper than 5
  // separate queries; cheaper than shipping the outfit list to the client.
  const countRows = await db.execute<{ id: string; cnt: string }>(sql`
      SELECT id, count(*) AS cnt FROM (
        SELECT headwear_id AS id FROM outfit
          WHERE user_id = ${user.id} AND status = 'active' AND headwear_id IS NOT NULL
        UNION ALL
        SELECT base_id     FROM outfit
          WHERE user_id = ${user.id} AND status = 'active' AND base_id IS NOT NULL
        UNION ALL
        SELECT outer_id    FROM outfit
          WHERE user_id = ${user.id} AND status = 'active' AND outer_id IS NOT NULL
        UNION ALL
        SELECT bottom_id   FROM outfit
          WHERE user_id = ${user.id} AND status = 'active' AND bottom_id IS NOT NULL
        UNION ALL
        SELECT footwear_id FROM outfit
          WHERE user_id = ${user.id} AND status = 'active' AND footwear_id IS NOT NULL
      ) t
      GROUP BY id
    `)
  const countMap = new Map<string, number>()
  for (const row of countRows.rows) countMap.set(row.id, Number(row.cnt))

  return items.map((it) => ({ ...it, outfitCount: countMap.get(it.id) ?? 0 }))
})

const findClothingItem = authed
  .input(z.object({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const result = await db
      .select()
      .from(clothingItem)
      .where(
        and(
          eq(clothingItem.id, input.id),
          eq(clothingItem.userId, user.id),
          ne(clothingItem.status, 'removed'),
        ),
      )
    return result[0] ?? null
  })

// Escape hatch for historical reads (e.g. displaying a removed item referenced
// by an old outfit). Scoped to the owner so it cannot leak cross-user data.
const findIncludingRemoved = authed
  .input(z.object({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const result = await db
      .select()
      .from(clothingItem)
      .where(and(eq(clothingItem.id, input.id), eq(clothingItem.userId, user.id)))
    return result[0] ?? null
  })

const createClothingItem = authed
  .input(clothingItemInsertSchema.omit({ userId: true }))
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const result = await db
      .insert(clothingItem)
      .values({ ...input, userId: user.id })
      .returning()

    // CompleteStarterWardrobeStep (specs/onboarding.allium lines 99-109).
    // Decision on "crosses threshold": we simply count active items after
    // the insert and mark the step done when count >= threshold AND the
    // step isn't already marked. This is idempotent for items 6, 7, ... —
    // the null-check prevents re-stamping. We only run the count query
    // when the onboarding row's starter_wardrobe step is still pending,
    // which is a one-shot gate so the extra query is bounded.
    const progressRows = await db
      .select()
      .from(onboardingProgress)
      .where(eq(onboardingProgress.userId, user.id))
    const progress = progressRows[0]
    if (progress && progress.starterWardrobeCompletedAt === null) {
      const activeItems = await db
        .select()
        .from(clothingItem)
        .where(and(eq(clothingItem.userId, user.id), eq(clothingItem.status, 'active')))
      if (activeItems.length >= STARTER_WARDROBE_THRESHOLD) {
        const now = new Date()
        await db
          .update(onboardingProgress)
          .set({ starterWardrobeCompletedAt: now, updatedAt: now })
          .where(eq(onboardingProgress.userId, user.id))
        await maybeCompleteOnboarding(db, user.id)
      }
    }

    return result[0]
  })

const updateClothingItem = authed
  .input(clothingItemUpdateSchema)
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const { id, ...updateData } = input

    const result = await db
      .update(clothingItem)
      .set({ ...updateData, updatedAt: new Date() })
      .where(and(eq(clothingItem.id, id), eq(clothingItem.userId, user.id)))
      .returning()
    if (!result[0]) {
      throw new ORPCError('NOT_FOUND', { message: 'Clothing item not found' })
    }
    return result[0]
  })

// RemoveItemPreservingOutfits (wardrobe.allium rule, 234-240). Soft-removes
// the item; outfits continue to reference it for historical display.
const removeItemPreserving = authed
  .input(z.object({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const now = new Date()
    const result = await db
      .update(clothingItem)
      .set({ status: 'removed', removedAt: now, updatedAt: now })
      .where(
        and(
          eq(clothingItem.id, input.id),
          eq(clothingItem.userId, user.id),
          ne(clothingItem.status, 'removed'),
        ),
      )
      .returning()
    if (!result[0]) {
      throw new ORPCError('NOT_FOUND', { message: 'Clothing item not found or already removed' })
    }
    return result[0]
  })

// RemoveItemAndOutfits (wardrobe.allium rule, 243-252). Soft-deletes every
// outfit referencing the item in any slot, then soft-removes the item. Done
// in a transaction so a partial failure rolls back.
const removeItemAndOutfits = authed
  .input(z.object({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const now = new Date()

    return db.transaction(async (tx) => {
      // Verify the item exists, belongs to caller, and is not already removed.
      const itemRows = await tx
        .select()
        .from(clothingItem)
        .where(
          and(
            eq(clothingItem.id, input.id),
            eq(clothingItem.userId, user.id),
            ne(clothingItem.status, 'removed'),
          ),
        )
      if (!itemRows[0]) {
        throw new ORPCError('NOT_FOUND', { message: 'Clothing item not found or already removed' })
      }

      // Soft-delete any outfit where any slot references this item.
      // outfits_using (wardrobe.allium 108-111): headwear|base|outer|bottom|footwear.
      await tx
        .update(outfit)
        .set({ status: 'deleted', deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(outfit.userId, user.id),
            eq(outfit.status, 'active'),
            or(
              eq(outfit.headwearId, input.id),
              eq(outfit.baseId, input.id),
              eq(outfit.outerId, input.id),
              eq(outfit.bottomId, input.id),
              eq(outfit.footwearId, input.id),
            ),
          ),
        )

      const result = await tx
        .update(clothingItem)
        .set({ status: 'removed', removedAt: now, updatedAt: now })
        .where(and(eq(clothingItem.id, input.id), eq(clothingItem.userId, user.id)))
        .returning()
      return result[0]
    })
  })

// Batch insert from the Add Clothes review form. The user picked N
// photos, walked the carousel, edited per-page metadata, and is hitting
// Save. Each entry becomes one clothing_item row in a single
// transaction so a partial failure rolls back. The starter-wardrobe
// onboarding step is checked once at the end (not per-item) for
// efficiency.
const saveFromUpload = authed
  .input(z.object({ items: z.array(uploadItemSchema).min(1) }))
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const inserted = await db.transaction(async (tx) => {
      const out: (typeof clothingItem.$inferSelect)[] = []
      for (const it of input.items) {
        const [row] = await tx
          .insert(clothingItem)
          .values({
            userId: user.id,
            imageUrl: it.imageUrl,
            originalImageUrl: it.originalImageUrl,
            category: it.category,
            name: it.name,
            brand: it.brand,
            fit: it.fit,
            length: it.length,
            customNotes: it.customNotes,
            colors: it.colors,
            owned: true,
          })
          .returning()
        if (row) out.push(row)
      }
      return out
    })

    // CompleteStarterWardrobeStep — same gate as createClothingItem,
    // run once after the batch so it doesn't re-check N times.
    const progressRows = await db
      .select()
      .from(onboardingProgress)
      .where(eq(onboardingProgress.userId, user.id))
    const progress = progressRows[0]
    if (progress && progress.starterWardrobeCompletedAt === null) {
      const activeItems = await db
        .select()
        .from(clothingItem)
        .where(and(eq(clothingItem.userId, user.id), eq(clothingItem.status, 'active')))
      if (activeItems.length >= STARTER_WARDROBE_THRESHOLD) {
        const now = new Date()
        await db
          .update(onboardingProgress)
          .set({ starterWardrobeCompletedAt: now, updatedAt: now })
          .where(eq(onboardingProgress.userId, user.id))
        await maybeCompleteOnboarding(db, user.id)
      }
    }

    return { items: inserted }
  })

export const clothingItemHandlers = {
  list: listClothingItems,
  find: findClothingItem,
  findIncludingRemoved: findIncludingRemoved,
  create: createClothingItem,
  update: updateClothingItem,
  removePreserving: removeItemPreserving,
  removeAndOutfits: removeItemAndOutfits,
  saveFromUpload,
}
