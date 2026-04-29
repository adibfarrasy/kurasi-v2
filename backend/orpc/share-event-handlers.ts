// Spec: specs/social-share.allium — ShareEvent (lines 99-103),
// PostCardToPlatform (lines 200-208).

import { ORPCError } from '@orpc/server'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { shareableCard, shareEvent } from '../db/schema'
import { requirePermission } from './authed'

const PLATFORMS = ['instagram_story', 'snapchat', 'tiktok', 'twitter', 'clipboard'] as const

const record = requirePermission({ permission: { shareEvent: ['create'] } })
  .input(z.object({ cardId: z.uuid(), platform: z.enum(PLATFORMS) }))
  .handler(async ({ context, input }) => {
    const { db, user } = context
    // Require card caller-owned and active.
    const cardRows = await db
      .select()
      .from(shareableCard)
      .where(and(eq(shareableCard.id, input.cardId), eq(shareableCard.userId, user.id)))
    const card = cardRows[0]
    if (!card) {
      throw new ORPCError('NOT_FOUND', { message: 'Card not found' })
    }
    if (card.status !== 'active') {
      throw new ORPCError('BAD_REQUEST', { message: 'Card is not active' })
    }
    const result = await db
      .insert(shareEvent)
      .values({
        cardId: input.cardId,
        platform: input.platform,
      })
      .returning()
    return result[0]
  })

// listForCard: all ShareEvents for a card the caller owns. Scoped to caller.
const listForCard = requirePermission({ permission: { shareEvent: ['read'] } })
  .input(z.object({ cardId: z.uuid() }))
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const cardRows = await db
      .select()
      .from(shareableCard)
      .where(and(eq(shareableCard.id, input.cardId), eq(shareableCard.userId, user.id)))
    if (!cardRows[0]) {
      throw new ORPCError('NOT_FOUND', { message: 'Card not found' })
    }
    return db
      .select()
      .from(shareEvent)
      .where(eq(shareEvent.cardId, input.cardId))
      .orderBy(desc(shareEvent.occurredAt))
  })

export const shareEventHandlers = {
  record,
  listForCard,
}
