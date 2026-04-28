import { ORPCError } from '@orpc/server'
import { and, desc, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { clothingItem, outfit, outfitRecommendationRequest } from '../db/schema'
import { requirePermission } from './authed'

// Spec: specs/fit-page.allium — OutfitRecommendationRequest (lines 108-112),
// RequestRecommendations (lines 227-244). config.min_wardrobe_items_for_
// recommendations = 5 (line 125).
//
// Recommendation computation is deferred (see specs/fit-page.allium:300-302).
// A background worker would consume these rows and transition them to
// 'computed' or 'failed'. This handler only writes 'pending'.

const MIN_WARDROBE_ITEMS = 5

const requestSchema = z
  .object({
    kind: z.enum(['gap_filling', 'outfit_generation']),
    basedOnOutfitId: z.uuid().optional(),
  })
  .refine(
    (v) => (v.kind === 'gap_filling' ? !v.basedOnOutfitId : !!v.basedOnOutfitId),
    {
      message:
        'gap_filling must omit basedOnOutfitId; outfit_generation requires it',
    },
  )

const list = requirePermission({ permission: { outfitRecommendation: ['read'] } }).handler(
  async ({ context }) => {
    const { db, user } = context
    return db
      .select()
      .from(outfitRecommendationRequest)
      .where(eq(outfitRecommendationRequest.userId, user.id))
      .orderBy(desc(outfitRecommendationRequest.requestedAt))
  },
)

const request = requirePermission({ permission: { outfitRecommendation: ['request'] } })
  .input(requestSchema)
  .handler(async ({ context, input }) => {
    const { db, user } = context

    if (input.kind === 'outfit_generation' && input.basedOnOutfitId) {
      const outfitRows = await db
        .select()
        .from(outfit)
        .where(
          and(eq(outfit.id, input.basedOnOutfitId), eq(outfit.userId, user.id)),
        )
      const seed = outfitRows[0]
      if (!seed) {
        throw new ORPCError('NOT_FOUND', { message: 'Seed outfit not found' })
      }
      if (seed.status !== 'active') {
        throw new ORPCError('BAD_REQUEST', { message: 'Seed outfit is not active' })
      }
    }

    // Gate on min wardrobe size (spec line 232).
    const activeItems = await db
      .select()
      .from(clothingItem)
      .where(
        and(eq(clothingItem.userId, user.id), ne(clothingItem.status, 'removed')),
      )
    // 'archived' items do not count — only 'active'.
    const activeCount = activeItems.filter((i) => i.status === 'active').length
    if (activeCount < MIN_WARDROBE_ITEMS) {
      throw new ORPCError('BAD_REQUEST', {
        message: `Need at least ${MIN_WARDROBE_ITEMS} active wardrobe items`,
      })
    }

    const now = new Date()
    const result = await db
      .insert(outfitRecommendationRequest)
      .values({
        userId: user.id,
        kind: input.kind,
        basedOnOutfitId: input.basedOnOutfitId ?? null,
        status: 'pending',
        requestedAt: now,
      })
      .returning()
    return result[0]
  })

export const outfitRecommendationHandlers = {
  list,
  request,
}
