import { ORPCError } from '@orpc/server'
import { and, desc, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { user as userTable } from '../db/auth-schema.gen'
import { outfit, sharedOutfit } from '../db/schema'
import { requirePermission } from './authed'

// Spec: specs/fit-page.allium — SharedOutfit (lines 92-106),
// PublishOutfit (lines 201-215), UnpublishOutfit (lines 217-223),
// DiscoverFeed surface (lines 362-374).
//
// Decision re: the spec's open question "Can a user publish the same outfit
// multiple times, or is SharedOutfit a singleton per Outfit?" (line 381):
// SINGLETON per Outfit (matches OneSharedOutfitPerOutfit invariant). A user
// may re-publish an unpublished SharedOutfit — that transitions status back
// to 'published' and may update face_anonymisation / show_username.

const FACE_ANONYMISATION = ['none', 'blur_face', 'block_eyes'] as const

const publishSchema = z.object({
  outfitId: z.uuid(),
  faceAnonymisation: z.enum(FACE_ANONYMISATION),
  showUsername: z.boolean(),
})

const discoverSchema = z
  .object({
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().datetime().optional(),
  })
  .optional()

// Discover feed — all 'published' SharedOutfits except caller's own.
const discover = requirePermission({ permission: { sharedOutfit: ['read'] } })
  .input(discoverSchema)
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const limit = input?.limit ?? 20
    const rows = await db
      .select()
      .from(sharedOutfit)
      .where(and(eq(sharedOutfit.status, 'published'), ne(sharedOutfit.userId, user.id)))
      .orderBy(desc(sharedOutfit.sharedAt))
      .limit(limit)

    // Hydrate outfit + publisher username (null when showUsername=false).
    const hydrated = []
    for (const row of rows) {
      const outfitRows = await db.select().from(outfit).where(eq(outfit.id, row.outfitId))
      const publisherRows = await db.select().from(userTable).where(eq(userTable.id, row.userId))
      const publisher = publisherRows[0]
      hydrated.push({
        ...row,
        outfit: outfitRows[0] ?? null,
        publisherUsername: row.showUsername ? (publisher?.name ?? null) : null,
      })
    }
    return hydrated
  })

const findByOutfit = requirePermission({ permission: { sharedOutfit: ['read'] } })
  .input(z.object({ outfitId: z.uuid() }))
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const rows = await db
      .select()
      .from(sharedOutfit)
      .where(and(eq(sharedOutfit.outfitId, input.outfitId), eq(sharedOutfit.userId, user.id)))
    return rows[0] ?? null
  })

// PublishOutfit. Verifies outfit ownership + status='active'. If an existing
// SharedOutfit row exists (singleton), re-enables it — which satisfies the
// user flow "unpublish, then publish again with different anonymisation".
const publish = requirePermission({ permission: { sharedOutfit: ['publish'] } })
  .input(publishSchema)
  .handler(async ({ context, input }) => {
    const { db, user } = context

    const outfitRows = await db
      .select()
      .from(outfit)
      .where(and(eq(outfit.id, input.outfitId), eq(outfit.userId, user.id)))
    const ownedOutfit = outfitRows[0]
    if (!ownedOutfit) {
      throw new ORPCError('NOT_FOUND', { message: 'Outfit not found' })
    }
    if (ownedOutfit.status !== 'active') {
      throw new ORPCError('BAD_REQUEST', { message: 'Outfit is not active' })
    }

    const now = new Date()
    const existing = await db
      .select()
      .from(sharedOutfit)
      .where(eq(sharedOutfit.outfitId, input.outfitId))
    if (existing[0]) {
      const updated = await db
        .update(sharedOutfit)
        .set({
          status: 'published',
          faceAnonymisation: input.faceAnonymisation,
          showUsername: input.showUsername,
          sharedAt: now,
          unpublishedAt: null,
          updatedAt: now,
        })
        .where(eq(sharedOutfit.outfitId, input.outfitId))
        .returning()
      return updated[0]
    }

    const inserted = await db
      .insert(sharedOutfit)
      .values({
        userId: user.id,
        outfitId: input.outfitId,
        faceAnonymisation: input.faceAnonymisation,
        showUsername: input.showUsername,
        status: 'published',
        sharedAt: now,
      })
      .returning()
    return inserted[0]
  })

const unpublish = requirePermission({ permission: { sharedOutfit: ['unpublish'] } })
  .input(z.object({ outfitId: z.uuid() }))
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const now = new Date()
    const result = await db
      .update(sharedOutfit)
      .set({ status: 'unpublished', unpublishedAt: now, updatedAt: now })
      .where(
        and(
          eq(sharedOutfit.outfitId, input.outfitId),
          eq(sharedOutfit.userId, user.id),
          eq(sharedOutfit.status, 'published'),
        ),
      )
      .returning()
    if (!result[0]) {
      throw new ORPCError('NOT_FOUND', {
        message: 'No active SharedOutfit to unpublish',
      })
    }
    return result[0]
  })

export const sharedOutfitHandlers = {
  discover,
  findByOutfit,
  publish,
  unpublish,
}
