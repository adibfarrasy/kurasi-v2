import { ORPCError } from '@orpc/server'
import { eq } from 'drizzle-orm'
import * as z from 'zod'
import { type DressAvatarPhase, dressAvatar } from '../avatar/services/dress-avatar-pipeline'
import { ITEM_CATEGORIES } from '../avatar/services/steal-the-look-pipeline'
import { userBiometrics } from '../db/schema'
import { authed } from './authed'

// ──────────────────────────────────────────────────────────────────────────
// In-memory progress store. Same shape & lifecycle as the steal-the-look
// session map: process-local, GC'd after 30 min. The pipeline runs in
// the background after the client calls `start`; the client polls
// `progress` every ~2s while the regenerate UI is up.
// ──────────────────────────────────────────────────────────────────────────

type Progress =
  | { phase: 'pass1' | 'pass2' | 'rembg' }
  | { phase: 'done'; resultUrl: string }
  | { phase: 'error'; message: string }

const sessions = new Map<string, Progress>()

const SESSION_TTL_MS = 30 * 60 * 1000
const sessionCreatedAt = new Map<string, number>()
function gcSessions() {
  const cutoff = Date.now() - SESSION_TTL_MS
  for (const [id, ts] of sessionCreatedAt) {
    if (ts < cutoff) {
      sessions.delete(id)
      sessionCreatedAt.delete(id)
    }
  }
}

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

const itemSchema = z.object({
  category: z.enum(ITEM_CATEGORIES),
  imageUrl: z.url(),
  fit: z.enum(FIT_PROFILES).nullable().optional(),
  length: z.enum(GARMENT_LENGTHS).nullable().optional(),
})

async function runPipeline(
  sessionId: string,
  userId: string,
  avatarUrl: string,
  items: z.infer<typeof itemSchema>[],
): Promise<void> {
  try {
    const finalUrl = await dressAvatar({
      avatarUrl,
      items,
      onPhase: (phase: DressAvatarPhase) => {
        sessions.set(sessionId, { phase })
      },
    })
    sessions.set(sessionId, { phase: 'done', resultUrl: finalUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'pipeline failed'
    console.error(`[regenerate-fit:${userId}] pipeline error:`, err)
    sessions.set(sessionId, { phase: 'error', message })
  }
}

const start = authed
  .input(z.object({ items: z.array(itemSchema).min(1).max(5) }))
  .handler(async ({ context, input }): Promise<{ sessionId: string }> => {
    gcSessions()
    const { db, user } = context

    const rows = await db
      .select({ defaultAvatarUrl: userBiometrics.defaultAvatarUrl })
      .from(userBiometrics)
      .where(eq(userBiometrics.userId, user.id))
    const defaultAvatarUrl = rows[0]?.defaultAvatarUrl ?? null
    if (!defaultAvatarUrl) {
      throw new ORPCError('PRECONDITION_FAILED', {
        message: 'User has no defaultAvatarUrl. Run the seed.',
      })
    }

    const sessionId = crypto.randomUUID()
    sessions.set(sessionId, { phase: 'pass1' })
    sessionCreatedAt.set(sessionId, Date.now())

    void runPipeline(sessionId, user.id, defaultAvatarUrl, input.items)

    return { sessionId }
  })

const progressSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('pass1') }),
  z.object({ phase: z.literal('pass2') }),
  z.object({ phase: z.literal('rembg') }),
  z.object({ phase: z.literal('done'), resultUrl: z.url() }),
  z.object({ phase: z.literal('error'), message: z.string() }),
])

const progress = authed
  .input(z.object({ sessionId: z.string() }))
  .handler(async ({ input }): Promise<z.infer<typeof progressSchema>> => {
    const p = sessions.get(input.sessionId)
    if (!p) {
      return { phase: 'error', message: 'Session not found (server may have restarted)' }
    }
    return p
  })

export const regenerateFitHandlers = {
  start,
  progress,
}
