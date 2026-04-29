// Spec: specs/style-board.allium
//
// StyleCard is curated content. Regular users can browse the feed (active
// cards they haven't interacted with) and find individual cards (active or
// retired — a retired card they saved must still be viewable). Admins seed
// and retire the catalog.

import { ORPCError } from '@orpc/server'
import { and, desc, eq, inArray, lt, notInArray } from 'drizzle-orm'
import { z } from 'zod'
import { styleCard, styleCardTag, styleInteraction, styleTag } from '../db/schema'
import { authed } from './authed'

// Load tags for a set of cards, returning a map cardId -> tag[].
async function loadTagsForCards(
  db: {
    select: (shape?: unknown) => {
      from: (t: unknown) => {
        innerJoin: (
          t: unknown,
          on: unknown,
        ) => {
          where: (
            w: unknown,
          ) => Promise<Array<{ cardId: string; tag: typeof styleTag.$inferSelect }>>
        }
      }
    }
  },
  cardIds: string[],
): Promise<Map<string, Array<typeof styleTag.$inferSelect>>> {
  const byCard = new Map<string, Array<typeof styleTag.$inferSelect>>()
  if (cardIds.length === 0) return byCard
  const rows = await db
    .select({ cardId: styleCardTag.cardId, tag: styleTag })
    .from(styleCardTag)
    .innerJoin(styleTag, eq(styleCardTag.tagId, styleTag.id))
    .where(inArray(styleCardTag.cardId, cardIds))
  for (const r of rows) {
    const list = byCard.get(r.cardId) ?? []
    list.push(r.tag)
    byCard.set(r.cardId, list)
  }
  return byCard
}

// feed — active cards the caller has NOT yet interacted with, newest first.
// Skipped cards are permanently excluded (spec decision, lines 121-123); liked
// cards became saves so they shouldn't re-appear either. We exclude by
// checking absence in style_interaction regardless of kind.
//
// Pagination: cursor is a createdAt ISO string. Returns up to `limit` items
// (default 20, max 50) + a nextCursor if more may exist.
const feedStyleCards = authed
  .input(
    z
      .object({
        limit: z.number().int().min(1).max(50).optional(),
        cursor: z.string().optional(),
      })
      .optional(),
  )
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const limit = input?.limit ?? 20

    // Find the set of cardIds this user has ever interacted with.
    const interactedRows = await db
      .select({ cardId: styleInteraction.cardId })
      .from(styleInteraction)
      .where(eq(styleInteraction.userId, user.id))
    const interactedIds = interactedRows.map((r) => r.cardId)

    const conditions = [eq(styleCard.status, 'active')]
    if (interactedIds.length > 0) {
      conditions.push(notInArray(styleCard.id, interactedIds))
    }
    if (input?.cursor) {
      conditions.push(lt(styleCard.createdAt, new Date(input.cursor)))
    }

    const cards = await db
      .select()
      .from(styleCard)
      .where(and(...conditions))
      .orderBy(desc(styleCard.createdAt))
      .limit(limit + 1)

    const hasMore = cards.length > limit
    const page = hasMore ? cards.slice(0, limit) : cards
    const tagsByCard = await loadTagsForCards(
      db as never,
      page.map((c) => c.id),
    )
    const items = page.map((c) => ({ ...c, tags: tagsByCard.get(c.id) ?? [] }))
    const nextCursor = hasMore ? page[page.length - 1]?.createdAt.toISOString() : null
    return { items, nextCursor }
  })

// find — by id. Returns card + tags for both active and retired (so users
// can view a retired card they saved).
const findStyleCard = authed
  .input(z.object({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    const { db } = context
    const rows = await db.select().from(styleCard).where(eq(styleCard.id, input.id))
    const card = rows[0]
    if (!card) return null
    const tagsByCard = await loadTagsForCards(db as never, [card.id])
    return { ...card, tags: tagsByCard.get(card.id) ?? [] }
  })

// createCard — seed the catalog. Validates that every tagId exists.
const createCard = authed
  .input(
    z.object({
      imageUrl: z.string().min(1),
      sourceAttribution: z.string().min(1),
      tagIds: z.array(z.uuid()).default([]),
    }),
  )
  .handler(async ({ context, input }) => {
    const { db } = context
    return db.transaction(async (tx) => {
      if (input.tagIds.length > 0) {
        const tagRows = await tx.select().from(styleTag).where(inArray(styleTag.id, input.tagIds))
        if (tagRows.length !== new Set(input.tagIds).size) {
          throw new ORPCError('BAD_REQUEST', { message: 'unknown tag id' })
        }
      }
      const inserted = await tx
        .insert(styleCard)
        .values({
          imageUrl: input.imageUrl,
          sourceAttribution: input.sourceAttribution,
          status: 'active',
        })
        .returning()
      const card = inserted[0]
      if (!card) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'Failed to create card' })
      }
      if (input.tagIds.length > 0) {
        await tx
          .insert(styleCardTag)
          .values(input.tagIds.map((tagId) => ({ cardId: card.id, tagId })))
      }
      const tagsByCard = await loadTagsForCards(tx as never, [card.id])
      return { ...card, tags: tagsByCard.get(card.id) ?? [] }
    })
  })

// retireCard — RetireStyleCard rule. published -> retired, sets
// retiredAt. SavedStyle rows remain intact (no cascade on status change).
const retireCard = authed.input(z.object({ id: z.uuid() })).handler(async ({ context, input }) => {
  const { db } = context
  const now = new Date()
  const result = await db
    .update(styleCard)
    .set({ status: 'retired', retiredAt: now })
    .where(and(eq(styleCard.id, input.id), eq(styleCard.status, 'active')))
    .returning()
  if (!result[0]) {
    throw new ORPCError('NOT_FOUND', {
      message: 'Style card not found or already retired',
    })
  }
  return result[0]
})

export const styleCardHandlers = {
  feed: feedStyleCards,
  find: findStyleCard,
  createCard,
  retire: retireCard,
}
