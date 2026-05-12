import { eq } from 'drizzle-orm'
import * as z from 'zod'
import {
  type NormalizeAvatarPhase,
  normalizeAvatar,
} from '../avatar/services/normalize-avatar-service'
import { db as appDb } from '../db/db'
import { userBiometrics } from '../db/schema'
import { authed } from './authed'

// Normalize Avatar flow:
//   1. Onboarding-3 Continue → client uploads the captured half-body
//      photo via `start` with base64 + gender/height/weight. Server kicks
//      off the normalize-avatar pipeline in the background and returns a
//      sessionId. Frontend stows the sessionId so the membership-card
//      page can pick it up.
//   2. Membership-card page polls `progress` while the user customizes
//      the card. Once `phase === 'done'`, the mannequin swaps to the
//      returned avatar URL. If the user finishes signing before the
//      backend resolves, the loading carousel sits over the mannequin
//      until it lands.
//
// Mirrors backend/orpc/add-clothes-handlers.ts (start/progress polling
// with an in-memory session map). The actual pipeline lives in
// normalize-avatar-service.ts so this file stays a thin adapter.

type Progress =
  | { phase: 'classify' | 'pass1' | 'pass2' | 'faceswap' | 'rembg' | 'finalize' }
  | { phase: 'done'; avatarUrl: string }
  | { phase: 'error'; message: string }

const sessions = new Map<string, Progress>()
const sessionCreatedAt = new Map<string, number>()
const SESSION_TTL_MS = 30 * 60 * 1000

function gcSessions() {
  const cutoff = Date.now() - SESSION_TTL_MS
  for (const [id, ts] of sessionCreatedAt) {
    if (ts < cutoff) {
      sessions.delete(id)
      sessionCreatedAt.delete(id)
    }
  }
}

async function runPipeline(
  sessionId: string,
  userId: string,
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
  gender: 'masc' | 'femme',
  heightCm: number | undefined,
  weightKg: number | undefined,
): Promise<void> {
  const start = Date.now()
  try {
    const buf = Buffer.from(imageBase64, 'base64')
    sessions.set(sessionId, { phase: 'classify' })
    const onPhase = (phase: NormalizeAvatarPhase) => {
      sessions.set(sessionId, { phase })
    }
    const { avatarUrl } = await normalizeAvatar({
      bodyImage: buf,
      bodyMimeType: mimeType,
      gender,
      heightCm,
      weightKg,
      onPhase,
    })
    console.log(`[normalize-avatar:${userId}] done ${Date.now() - start}ms → ${avatarUrl}`)
    sessions.set(sessionId, { phase: 'done', avatarUrl })
    // Persist the generated avatar so try-on and other surfaces can find
    // it after the in-memory session expires. user_biometrics is created
    // by biometrics.set during onboarding-3, so an update is sufficient.
    // Best-effort: log + swallow so a DB hiccup never breaks the avatar
    // result the client is already polling for.
    try {
      await appDb
        .update(userBiometrics)
        .set({ defaultAvatarUrl: avatarUrl, updatedAt: new Date() })
        .where(eq(userBiometrics.userId, userId))
    } catch (e) {
      console.warn(`[normalize-avatar:${userId}] persist defaultAvatarUrl failed:`, e)
    }
  } catch (err) {
    console.error(`[normalize-avatar:${userId}] pipeline error:`, err)
    sessions.set(sessionId, {
      phase: 'error',
      message: 'Could not generate your avatar. Please try again.',
    })
  }
}

const start = authed
  .input(
    z.object({
      imageBase64: z.string().min(1),
      mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
      gender: z.enum(['masc', 'femme']),
      heightCm: z.number().int().min(130).max(220).optional(),
      weightKg: z.number().int().min(30).max(200).optional(),
    }),
  )
  .handler(async ({ context, input }): Promise<{ sessionId: string }> => {
    gcSessions()
    const { user } = context
    const sessionId = crypto.randomUUID()
    sessions.set(sessionId, { phase: 'classify' })
    sessionCreatedAt.set(sessionId, Date.now())
    void runPipeline(
      sessionId,
      user.id,
      input.imageBase64,
      input.mimeType,
      input.gender,
      input.heightCm,
      input.weightKg,
    )
    return { sessionId }
  })

const progressSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('classify') }),
  z.object({ phase: z.literal('pass1') }),
  z.object({ phase: z.literal('pass2') }),
  z.object({ phase: z.literal('faceswap') }),
  z.object({ phase: z.literal('rembg') }),
  z.object({ phase: z.literal('finalize') }),
  z.object({ phase: z.literal('done'), avatarUrl: z.string() }),
  z.object({ phase: z.literal('error'), message: z.string() }),
])

export type NormalizeAvatarProgress = z.infer<typeof progressSchema>

const progress = authed
  .input(z.object({ sessionId: z.string() }))
  .handler(async ({ input }): Promise<z.infer<typeof progressSchema>> => {
    const p = sessions.get(input.sessionId)
    if (!p) return { phase: 'error', message: 'Session not found (server may have restarted)' }
    return p
  })

export const normalizeAvatarHandlers = { start, progress }
