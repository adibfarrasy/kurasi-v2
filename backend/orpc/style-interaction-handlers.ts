// Spec: specs/style-board.allium
//
// LikeStyleCard and SkipStyleCard are permanent, one-shot interactions per
// (user, card). AtMostOneInteractionPerUserCard is the governing invariant.
// Once a user has interacted with a card (either liked or skipped), any
// further interaction attempts are rejected — no "change your mind".
//
// Liking atomically creates the interaction AND a SavedStyle row
// (SavedStyleImpliesLike invariant).

import { ORPCError } from '@orpc/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { savedStyle, styleCard, styleInteraction } from '../db/schema'
import { authed } from './authed'

// LikeStyleCard rule (spec lines 100-117).
// Requires: card is active; no prior interaction from this user on this card.
// Ensures: StyleInteraction(kind=liked) + SavedStyle(status=saved) both exist.
// Idempotent: if a like already exists AND a save already exists, return them
// as a no-op so clients can retry safely. If any other interaction (skip)
// exists, reject — the spec's "not exists StyleInteraction" precondition.
const likeStyleCard = authed
  .input(z.object({ cardId: z.uuid() }))
  .handler(async ({ context, input }) => {
    const { db, user } = context
    return db.transaction(async (tx) => {
      const cardRows = await tx.select().from(styleCard).where(eq(styleCard.id, input.cardId))
      const card = cardRows[0]
      if (!card) {
        throw new ORPCError('NOT_FOUND', { message: 'Style card not found' })
      }
      if (card.status !== 'active') {
        throw new ORPCError('BAD_REQUEST', { message: 'Card is retired' })
      }

      const existing = await tx
        .select()
        .from(styleInteraction)
        .where(and(eq(styleInteraction.userId, user.id), eq(styleInteraction.cardId, input.cardId)))
      const prior = existing[0]
      if (prior) {
        if (prior.kind === 'skipped') {
          throw new ORPCError('BAD_REQUEST', {
            message: 'Card was already skipped and cannot be liked',
          })
        }
        // prior.kind === 'liked' — idempotent path. Ensure save exists.
        const savedRows = await tx
          .select()
          .from(savedStyle)
          .where(and(eq(savedStyle.userId, user.id), eq(savedStyle.cardId, input.cardId)))
        let saved = savedRows[0]
        if (!saved) {
          const inserted = await tx
            .insert(savedStyle)
            .values({ userId: user.id, cardId: input.cardId })
            .returning()
          saved = inserted[0]
        }
        return { interaction: prior, saved }
      }

      // Fresh like: insert both rows.
      const interactionInserted = await tx
        .insert(styleInteraction)
        .values({ userId: user.id, cardId: input.cardId, kind: 'liked' })
        .returning()
      const savedInserted = await tx
        .insert(savedStyle)
        .values({ userId: user.id, cardId: input.cardId })
        .returning()
      const interaction = interactionInserted[0]
      if (!interaction) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'Failed to create interaction' })
      }
      const saved = savedInserted[0]
      if (!saved) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'Failed to create saved' })
      }
      return { interaction, saved }
    })
  })

// SkipStyleCard rule (spec lines 120-135). Records a permanent skip.
// Idempotent on (userId, cardId) if the prior interaction is also a skip.
// If the prior is a like, reject — interactions are permanent per spec.
const skipStyleCard = authed
  .input(z.object({ cardId: z.uuid() }))
  .handler(async ({ context, input }) => {
    const { db, user } = context
    return db.transaction(async (tx) => {
      const cardRows = await tx.select().from(styleCard).where(eq(styleCard.id, input.cardId))
      const card = cardRows[0]
      if (!card) {
        throw new ORPCError('NOT_FOUND', { message: 'Style card not found' })
      }
      if (card.status !== 'active') {
        throw new ORPCError('BAD_REQUEST', { message: 'Card is retired' })
      }

      const existing = await tx
        .select()
        .from(styleInteraction)
        .where(and(eq(styleInteraction.userId, user.id), eq(styleInteraction.cardId, input.cardId)))
      const prior = existing[0]
      if (prior) {
        if (prior.kind === 'liked') {
          throw new ORPCError('BAD_REQUEST', {
            message: 'Card was already liked and cannot be skipped',
          })
        }
        return prior // idempotent skip
      }

      const inserted = await tx
        .insert(styleInteraction)
        .values({ userId: user.id, cardId: input.cardId, kind: 'skipped' })
        .returning()
      const interaction = inserted[0]
      if (!interaction) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'Failed to create interaction' })
      }
      return interaction
    })
  })

export const styleInteractionHandlers = {
  like: likeStyleCard,
  skip: skipStyleCard,
}
