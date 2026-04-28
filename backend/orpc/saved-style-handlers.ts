// Spec: specs/style-board.allium
//
// PersonalStyleBoard surface. The caller sees their saved cards (including
// retired ones — spec decision: saves persist when curators retire cards).
//
// RemoveFromBoard deletes the SavedStyle row only. The underlying
// StyleInteraction(kind=liked) persists: it still counts as a "signal" for
// recommendations (spec lines 137-138).

import { ORPCError } from '@orpc/server'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { savedStyle, styleCard, styleCardTag, styleTag } from '../db/schema'
import { requirePermission } from './authed'

const listSavedStyles = requirePermission({ permission: { savedStyle: ['read'] } }).handler(
  async ({ context }) => {
    const { db, user } = context
    const saved = await db
      .select({
        savedId: savedStyle.id,
        savedAt: savedStyle.savedAt,
        card: styleCard,
      })
      .from(savedStyle)
      .innerJoin(styleCard, eq(savedStyle.cardId, styleCard.id))
      .where(eq(savedStyle.userId, user.id))
      .orderBy(desc(savedStyle.savedAt))

    if (saved.length === 0) return []

    const cardIds = saved.map((s) => s.card.id)
    const tagRows = await db
      .select({ cardId: styleCardTag.cardId, tag: styleTag })
      .from(styleCardTag)
      .innerJoin(styleTag, eq(styleCardTag.tagId, styleTag.id))
      .where(inArray(styleCardTag.cardId, cardIds))

    const tagsByCard = new Map<string, Array<typeof styleTag.$inferSelect>>()
    for (const r of tagRows) {
      const list = tagsByCard.get(r.cardId) ?? []
      list.push(r.tag)
      tagsByCard.set(r.cardId, list)
    }
    return saved.map((s) => ({
      savedId: s.savedId,
      savedAt: s.savedAt,
      card: { ...s.card, tags: tagsByCard.get(s.card.id) ?? [] },
    }))
  },
)

// RemoveFromBoard rule (spec lines 137-145). Deletes the saved row for the
// caller on the given card. Does NOT delete the underlying StyleInteraction
// (like signal remains for recs). NOT_FOUND if no save exists.
const removeSavedStyle = requirePermission({ permission: { savedStyle: ['delete'] } })
  .input(z.object({ cardId: z.uuid() }))
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const result = await db
      .delete(savedStyle)
      .where(
        and(eq(savedStyle.userId, user.id), eq(savedStyle.cardId, input.cardId)),
      )
      .returning()
    if (!result[0]) {
      throw new ORPCError('NOT_FOUND', { message: 'Saved style not found' })
    }
    return true
  })

export const savedStyleHandlers = {
  list: listSavedStyles,
  remove: removeSavedStyle,
}
