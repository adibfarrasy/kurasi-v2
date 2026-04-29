// Spec: specs/social-share.allium — ShareableCard (lines 59-97),
// GenerateOutfitCard / GenerateWardrobeShowcaseCard / GenerateStyleStatsCard
// (lines 129-189), UpdateCardCaption (lines 191-196), ExpireShareableCard
// (lines 235-241), ShowcaseModeMatchesFilter invariant (lines 264-270).
//
// Decisions:
//   - card_ttl: 90 days (from spec config line 122).
//   - min_items_to_unlock_sharing: 5 (spec config line 121).
//   - "live" in the spec maps to status='active' in our schema (harmonised
//     with the common active/expired enum used elsewhere in the codebase).
//   - Rendered image is a black-box in the spec; we accept an optional
//     `renderedImageUrl` from the caller and fall back to a deterministic
//     stub URL so the column stays non-null. Real rendering lands later.
//   - ExpireShareableCard is a temporal rule; exposed here as an admin-only
//     handler `expireOldCards` (cron target), mirroring subscription.lapseAfterGrace.

import { ORPCError } from '@orpc/server'
import { and, desc, eq, lt } from 'drizzle-orm'
import { z } from 'zod'
import { clothingItem, outfit, shareableCard } from '../db/schema'
import { requirePermission } from './authed'

const SHOWCASE_MODES = ['by_category', 'by_color', 'by_style', 'entire_wardrobe'] as const
const STATS_PERIODS = ['week', 'month', 'year'] as const
const THEMES = ['light', 'dark', 'colorful'] as const

export const MIN_ITEMS_TO_UNLOCK_SHARING = 5
export const CARD_TTL_DAYS = 90
const MS_PER_DAY = 24 * 60 * 60 * 1000

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_PER_DAY)
}

function stubImageUrl(id: string): string {
  return `https://cdn.kurasi.dev/cards/${id}.png`
}

async function assertMinWardrobe(db: unknown, userId: string): Promise<void> {
  // biome-ignore lint: dynamic db shape
  const d = db as any
  const items = await d
    .select()
    .from(clothingItem)
    .where(and(eq(clothingItem.userId, userId), eq(clothingItem.status, 'active')))
  if ((items as unknown[]).length < MIN_ITEMS_TO_UNLOCK_SHARING) {
    throw new ORPCError('BAD_REQUEST', {
      message: `Sharing requires at least ${MIN_ITEMS_TO_UNLOCK_SHARING} active wardrobe items`,
    })
  }
}

const listCards = requirePermission({ permission: { shareableCard: ['read'] } })
  .input(z.object({ includeExpired: z.boolean().optional() }).optional())
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const includeExpired = input?.includeExpired ?? false
    const whereClause = includeExpired
      ? eq(shareableCard.userId, user.id)
      : and(eq(shareableCard.userId, user.id), eq(shareableCard.status, 'active'))
    return db.select().from(shareableCard).where(whereClause).orderBy(desc(shareableCard.createdAt))
  })

// find: caller-owned OR active (active cards are publicly resolvable via the
// share deep-link). Returns `{ card, isOwner }`.
const findCard = requirePermission({ permission: { shareableCard: ['read'] } })
  .input(z.object({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const rows = await db.select().from(shareableCard).where(eq(shareableCard.id, input.id))
    const row = rows[0]
    if (!row) {
      throw new ORPCError('NOT_FOUND', { message: 'Card not found' })
    }
    const isOwner = row.userId === user.id
    if (!isOwner && row.status !== 'active') {
      throw new ORPCError('NOT_FOUND', { message: 'Card not found' })
    }
    return { card: row, isOwner }
  })

const generateOutfit = requirePermission({ permission: { shareableCard: ['generate'] } })
  .input(
    z.object({
      outfitId: z.uuid(),
      theme: z.enum(THEMES),
      caption: z.string().optional(),
      renderedImageUrl: z.url().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const { db, user } = context
    // Outfit ownership + active status check.
    const outfitRows = await db
      .select()
      .from(outfit)
      .where(and(eq(outfit.id, input.outfitId), eq(outfit.userId, user.id)))
    const owned = outfitRows[0]
    if (!owned) {
      throw new ORPCError('NOT_FOUND', { message: 'Outfit not found' })
    }
    if (owned.status !== 'active') {
      throw new ORPCError('BAD_REQUEST', { message: 'Outfit is not active' })
    }
    await assertMinWardrobe(db, user.id)

    const now = new Date()
    const id = crypto.randomUUID()
    const result = await db
      .insert(shareableCard)
      .values({
        id,
        userId: user.id,
        kind: 'outfit',
        theme: input.theme,
        caption: input.caption ?? null,
        renderedImageUrl: input.renderedImageUrl ?? stubImageUrl(id),
        status: 'active',
        createdAt: now,
        expiresAt: addDays(now, CARD_TTL_DAYS),
        outfitId: input.outfitId,
      })
      .returning()
    return result[0]
  })

const generateWardrobeShowcase = requirePermission({
  permission: { shareableCard: ['generate'] },
})
  .input(
    z.object({
      mode: z.enum(SHOWCASE_MODES),
      theme: z.enum(THEMES),
      caption: z.string().optional(),
      renderedImageUrl: z.url().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const { db, user } = context
    await assertMinWardrobe(db, user.id)

    const now = new Date()
    const id = crypto.randomUUID()
    const result = await db
      .insert(shareableCard)
      .values({
        id,
        userId: user.id,
        kind: 'wardrobe_showcase',
        theme: input.theme,
        caption: input.caption ?? null,
        renderedImageUrl: input.renderedImageUrl ?? stubImageUrl(id),
        status: 'active',
        createdAt: now,
        expiresAt: addDays(now, CARD_TTL_DAYS),
        showcaseMode: input.mode,
      })
      .returning()
    return result[0]
  })

const generateStyleStats = requirePermission({
  permission: { shareableCard: ['generate'] },
})
  .input(
    z.object({
      period: z.enum(STATS_PERIODS),
      theme: z.enum(THEMES),
      caption: z.string().optional(),
      renderedImageUrl: z.url().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const { db, user } = context
    await assertMinWardrobe(db, user.id)

    const now = new Date()
    const id = crypto.randomUUID()
    const result = await db
      .insert(shareableCard)
      .values({
        id,
        userId: user.id,
        kind: 'style_stats',
        theme: input.theme,
        caption: input.caption ?? null,
        renderedImageUrl: input.renderedImageUrl ?? stubImageUrl(id),
        status: 'active',
        createdAt: now,
        expiresAt: addDays(now, CARD_TTL_DAYS),
        statsPeriod: input.period,
      })
      .returning()
    return result[0]
  })

const updateCaption = requirePermission({
  permission: { shareableCard: ['update-caption'] },
})
  .input(z.object({ cardId: z.uuid(), caption: z.string() }))
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const result = await db
      .update(shareableCard)
      .set({ caption: input.caption })
      .where(
        and(
          eq(shareableCard.id, input.cardId),
          eq(shareableCard.userId, user.id),
          eq(shareableCard.status, 'active'),
        ),
      )
      .returning()
    if (!result[0]) {
      throw new ORPCError('NOT_FOUND', { message: 'Card not found' })
    }
    return result[0]
  })

// ExpireShareableCard (lines 235-241). Cron target. Admin-only.
const expireOldCards = requirePermission({
  permission: { shareableCard: ['admin-expire'] },
}).handler(async ({ context }) => {
  const { db } = context
  const now = new Date()
  const result = await db
    .update(shareableCard)
    .set({ status: 'expired' })
    .where(and(eq(shareableCard.status, 'active'), lt(shareableCard.expiresAt, now)))
    .returning()
  return { expiredCount: (result as unknown[]).length }
})

export const shareableCardHandlers = {
  list: listCards,
  find: findCard,
  generateOutfit,
  generateWardrobeShowcase,
  generateStyleStats,
  updateCaption,
  expireOldCards,
}
