// Spec: specs/social-share.allium — ShareClick (lines 105-111),
// RecordShareClick (lines 212-222), AttributeClickToSignup (lines 225-232).
//
// The `record` handler is PUBLIC — it uses `base` directly (no auth
// middleware) because third-party clicks arrive before any session exists.
// Everything else is auth-gated.
//
// Attribution (AttributeClickToSignup) is exported as a plain helper
// `attributeClickToUser` for auth.ts's databaseHooks to call on signup once
// the deep-link state plumbing lands in the mobile client.

import { ORPCError } from '@orpc/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db as realDb } from '../db/db'
import { shareableCard, shareClick } from '../db/schema'
import { requirePermission } from './authed'
import { base } from './orpc-base'

const PLATFORMS = ['instagram_story', 'snapchat', 'tiktok', 'twitter', 'clipboard'] as const

// Public endpoint — no auth middleware. Takes { cardId, platform }; verifies
// the card is active; inserts a ShareClick with referredUserId=null; returns
// the card for deep-link deep-render on the client.
const record = base
  .input(z.object({ cardId: z.uuid(), platform: z.enum(PLATFORMS) }))
  .handler(async ({ context, input }) => {
    const { db } = context
    const cardRows = await db.select().from(shareableCard).where(eq(shareableCard.id, input.cardId))
    const card = cardRows[0]
    if (!card) {
      throw new ORPCError('NOT_FOUND', { message: 'Card not found' })
    }
    if (card.status !== 'active') {
      throw new ORPCError('BAD_REQUEST', { message: 'Card is not active' })
    }
    const inserted = await db
      .insert(shareClick)
      .values({
        cardId: input.cardId,
        platform: input.platform,
        referredUserId: null,
      })
      .returning()
    return { click: inserted[0], card }
  })

// analytics — aggregate clicks per platform for a caller-owned card.
const analytics = requirePermission({
  permission: { shareClick: ['read-own-analytics'] },
})
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
    const clicks = await db.select().from(shareClick).where(eq(shareClick.cardId, input.cardId))

    const byPlatform: Record<string, number> = {}
    for (const platform of PLATFORMS) byPlatform[platform] = 0
    for (const c of clicks as Array<{ platform: string }>) {
      byPlatform[c.platform] = (byPlatform[c.platform] ?? 0) + 1
    }
    return {
      total: (clicks as unknown[]).length,
      byPlatform: byPlatform as Record<(typeof PLATFORMS)[number], number>,
    }
  })

// AttributeClickToSignup helper (lines 225-232). Call from auth hooks on
// user creation when a share-click id is carried in the signup context.
// NOT yet plumbed through to the mobile deep-link flow — see auth.ts TODO.
export async function attributeClickToUser(
  clickId: string,
  newUserId: string,
  db: typeof realDb = realDb,
): Promise<void> {
  await db.update(shareClick).set({ referredUserId: newUserId }).where(eq(shareClick.id, clickId))
}

export const shareClickHandlers = {
  record,
  analytics,
}
