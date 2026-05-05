import { ORPCError } from '@orpc/server'
import { eq } from 'drizzle-orm'
import * as z from 'zod'
import { getOutfitTone, type Tone } from '../avatar/services/outfit-tone'
import {
  type DetectedItem,
  detectItems,
  extractItems,
  FIT_PROFILES,
  GARMENT_LENGTHS,
  ITEM_CATEGORIES,
  refineItem,
  tryOnFromInspiration,
  uploadBufferToFal,
} from '../avatar/services/steal-the-look-pipeline'
import { userBiometrics } from '../db/schema'
import { authed } from './authed'

const CLASSIFICATIONS = ['multiple_people', 'unknown', 'no_error'] as const
const PHASES = ['detect', 'extract', 'refine', 'done', 'error'] as const

const colorSchema = z.object({
  name: z.string(),
  hex: z.string(),
  ratio: z.number(),
})

const itemSchema = z.object({
  id: z.string(),
  imageUrl: z.string(),
  brand: z.string().nullable(),
  title: z.string(),
  category: z.enum(ITEM_CATEGORIES),
  fit: z.enum(FIT_PROFILES).nullable(),
  length: z.enum(GARMENT_LENGTHS).nullable(),
  colors: z.array(colorSchema),
})

export type StealTheLookItem = z.infer<typeof itemSchema>

const TONES = ['warm', 'cool', 'neutral'] as const

const resultSchema = z.object({
  result: z.enum(CLASSIFICATIONS),
  heroImageUrl: z.string().nullable(),
  items: z.array(itemSchema),
  tone: z.enum(TONES),
})

export type StealTheLookResult = z.infer<typeof resultSchema>

// ──────────────────────────────────────────────────────────────────────────
// In-memory progress store. The pipeline runs in the background after the
// client calls `start`; the client polls `progress` every second to drive
// the analyzing carousel and learn when it's done.
//
// This is intentionally process-local — sessions don't survive a restart,
// which is fine because the entire flow (start → done) is short-lived
// (~3min worst case) and the client treats a missing session as an error.
// ──────────────────────────────────────────────────────────────────────────

type Progress =
  | { phase: 'detect' | 'extract' | 'refine' }
  | { phase: 'done'; result: StealTheLookResult }
  | { phase: 'error'; message: string }

const sessions = new Map<string, Progress>()

// Belt-and-braces: drop sessions older than 30min so a long-running app
// doesn't accumulate them.
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

function buildItem(d: DetectedItem, idx: number, refinedUrl: string): StealTheLookItem {
  return {
    id: `${idx}-${d.category}`,
    imageUrl: refinedUrl,
    brand: null,
    title: d.title,
    category: d.category,
    fit: d.fit,
    length: d.length,
    colors: d.colors,
  }
}

async function runPipeline(
  sessionId: string,
  userId: string,
  defaultAvatarUrl: string,
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
): Promise<void> {
  const start = Date.now()
  try {
    const inspirationBuf = Buffer.from(imageBase64, 'base64')
    const inspirationUrl = await uploadBufferToFal(inspirationBuf, 'inspiration', mimeType)

    sessions.set(sessionId, { phase: 'detect' })
    const detectStart = Date.now()
    const detection = await detectItems(inspirationUrl)
    console.log(`[steal-the-look:${userId}] detect ${Date.now() - detectStart}ms`)
    if (detection.kind === 'error') {
      sessions.set(sessionId, {
        phase: 'done',
        result: {
          result: detection.reason,
          heroImageUrl: defaultAvatarUrl,
          items: [],
          tone: 'neutral',
        },
      })
      return
    }

    sessions.set(sessionId, { phase: 'extract' })
    const extractStart = Date.now()
    const extracted = await extractItems(inspirationBuf, inspirationUrl, detection.items)
    console.log(
      `[steal-the-look:${userId}] extract ${Date.now() - extractStart}ms (${extracted.length} items)`,
    )

    sessions.set(sessionId, { phase: 'refine' })

    // Refine items + try-on the avatar in PARALLEL. Try-on doesn't depend on
    // refined items (it uses the inspiration directly), so we don't need to
    // wait for refine to start the avatar dressing. ANY error from either
    // branch aborts the whole pipeline — no silent fallbacks.
    const refineStart = Date.now()
    const refinePromise = Promise.all(
      detection.items.map(async (d, i) => {
        const e = extracted[i]
        if (!e) throw new Error(`extracted[${i}/${d.category}] missing`)
        return await refineItem(e.buf, d.category)
      }),
    )
    const tryonPromise = tryOnFromInspiration(defaultAvatarUrl, inspirationUrl)

    const [refinedUrls, heroImageUrl] = await Promise.all([refinePromise, tryonPromise])
    console.log(`[steal-the-look:${userId}] refine+tryon ${Date.now() - refineStart}ms`)

    const items: StealTheLookItem[] = detection.items.map((d, i) =>
      buildItem(d, i, refinedUrls[i] ?? ''),
    )

    // Aggregate the dominant color names across detected items so the Try On
    // gradient matches the outfit's overall warmth.
    const tone: Tone = getOutfitTone(detection.items.flatMap((d) => d.colors.map((c) => c.name)))

    console.log(
      `[steal-the-look:${userId}] analyze total ${Date.now() - start}ms ${items.length} items tone=${tone}`,
    )
    sessions.set(sessionId, {
      phase: 'done',
      result: { result: 'no_error', heroImageUrl, items, tone },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'pipeline failed'
    console.error(`[steal-the-look:${userId}] pipeline error:`, err)
    sessions.set(sessionId, { phase: 'error', message })
  }
}

const start = authed
  .input(
    z.object({
      imageBase64: z.string().min(1),
      mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    }),
  )
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
    sessions.set(sessionId, { phase: 'detect' })
    sessionCreatedAt.set(sessionId, Date.now())

    // Kick off the pipeline in the background; the client polls `progress`.
    void runPipeline(sessionId, user.id, defaultAvatarUrl, input.imageBase64, input.mimeType)

    return { sessionId }
  })

const progressSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('detect') }),
  z.object({ phase: z.literal('extract') }),
  z.object({ phase: z.literal('refine') }),
  z.object({ phase: z.literal('done'), result: resultSchema }),
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

export const stealTheLookHandlers = {
  start,
  progress,
}

// Re-export for the client's type imports.
export type StealTheLookPhase = (typeof PHASES)[number]
