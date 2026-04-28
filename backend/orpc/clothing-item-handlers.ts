import { ORPCError } from '@orpc/server'
import { and, desc, eq, ne, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { clothingItem, onboardingProgress, outfit } from '../db/schema'
import { clothingItemInsertSchema, clothingItemUpdateSchema } from '../zod-schemas'
import { requirePermission } from './authed'
import { maybeCompleteOnboarding, STARTER_WARDROBE_THRESHOLD } from './onboarding-helpers'

const listClothingItems = requirePermission({ permission: { clothingItem: ['read'] } })
  .input(z.object({ includeArchived: z.boolean().optional() }).optional())
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const includeArchived = input?.includeArchived ?? false
    const statusFilter = includeArchived
      ? ne(clothingItem.status, 'removed')
      : eq(clothingItem.status, 'active')

    const items = await db
      .select()
      .from(clothingItem)
      .where(and(eq(clothingItem.userId, user.id), statusFilter))
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

const findClothingItem = requirePermission({ permission: { clothingItem: ['read'] } })
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
const findIncludingRemoved = requirePermission({ permission: { clothingItem: ['read'] } })
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

const updateClothingItem = requirePermission({ permission: { clothingItem: ['update'] } })
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

// ArchiveItem (wardrobe.allium rule ArchiveItem, 215-221): active -> archived.
const archiveClothingItem = requirePermission({ permission: { clothingItem: ['archive'] } })
  .input(z.object({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const now = new Date()
    const result = await db
      .update(clothingItem)
      .set({ status: 'archived', archivedAt: now, updatedAt: now })
      .where(
        and(
          eq(clothingItem.id, input.id),
          eq(clothingItem.userId, user.id),
          eq(clothingItem.status, 'active'),
        ),
      )
      .returning()
    if (!result[0]) {
      throw new ORPCError('NOT_FOUND', { message: 'Clothing item not found or not active' })
    }
    return result[0]
  })

// UnarchiveItem (wardrobe.allium rule UnarchiveItem, 223-229): archived -> active.
const unarchiveClothingItem = requirePermission({ permission: { clothingItem: ['unarchive'] } })
  .input(z.object({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const result = await db
      .update(clothingItem)
      .set({ status: 'active', archivedAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(clothingItem.id, input.id),
          eq(clothingItem.userId, user.id),
          eq(clothingItem.status, 'archived'),
        ),
      )
      .returning()
    if (!result[0]) {
      throw new ORPCError('NOT_FOUND', { message: 'Clothing item not found or not archived' })
    }
    return result[0]
  })

// ToggleFavorite (wardrobe.allium rule ToggleFavorite, 207-211). Requires status=active.
// Two-step read-then-write: we need the current isFavorite to flip it.
const toggleFavoriteClothingItem = requirePermission({
  permission: { clothingItem: ['toggle-favorite'] },
})
  .input(z.object({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const rows = await db
      .select()
      .from(clothingItem)
      .where(
        and(
          eq(clothingItem.id, input.id),
          eq(clothingItem.userId, user.id),
          eq(clothingItem.status, 'active'),
        ),
      )
    const row = rows[0]
    if (!row) {
      throw new ORPCError('NOT_FOUND', { message: 'Clothing item not found or not active' })
    }
    const result = await db
      .update(clothingItem)
      .set({ isFavorite: !row.isFavorite, updatedAt: new Date() })
      .where(and(eq(clothingItem.id, input.id), eq(clothingItem.userId, user.id)))
      .returning()
    return result[0]
  })

// RemoveItemPreservingOutfits (wardrobe.allium rule, 234-240). Soft-removes
// the item; outfits continue to reference it for historical display.
const removeItemPreserving = requirePermission({
  permission: { clothingItem: ['remove-preserving'] },
})
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
const removeItemAndOutfits = requirePermission({
  permission: { clothingItem: ['remove-and-outfits'] },
})
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

export const clothingItemHandlers = {
  list: listClothingItems,
  find: findClothingItem,
  findIncludingRemoved: findIncludingRemoved,
  create: createClothingItem,
  update: updateClothingItem,
  archive: archiveClothingItem,
  unarchive: unarchiveClothingItem,
  toggleFavorite: toggleFavoriteClothingItem,
  removePreserving: removeItemPreserving,
  removeAndOutfits: removeItemAndOutfits,
}
