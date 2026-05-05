import * as z from 'zod'
import {
  analyzeSingleClothing,
  FIT_PROFILES,
  GARMENT_LENGTHS,
  ITEM_CATEGORIES,
} from '../avatar/services/analyze-clothing-service'
import { authed } from './authed'

// Add Clothes flow:
//   1. Client picks one or more clothing-item photos and calls `start`
//      with base64. Server kicks off the analyze-clothing pipeline in
//      the background (one session per image) and returns a sessionId.
//   2. Client polls `progress` while showing the upload-wardrobe
//      carousel (Removing background → Optimizing image → Prefilling
//      tags → Wrapping up). On `done`, the result holds metadata to
//      pre-fill the review form.
//
// Mirrors backend/avatar/scripts/analyze-clothing.ts but exposes only
// the metadata extraction (vision analyze + deterministic color
// k-means). The cleanup pipeline (compose-on-hanger / canvas-place)
// can be added later when we wire the create-item submit.

const colorSchema = z.object({
  name: z.string(),
  hex: z.string(),
  ratio: z.number(),
})

const itemSchema = z.object({
  title: z.string(),
  category: z.enum(ITEM_CATEGORIES),
  fit: z.enum(FIT_PROFILES).nullable(),
  length: z.enum(GARMENT_LENGTHS).nullable(),
  colors: z.array(colorSchema),
  /** Raw fal URL of the user's upload. Persisted as
   *  `originalImageUrl`. */
  originalImageUrl: z.string(),
  /** fal URL of the cleaned/canvas-anchored PNG. Persisted as the
   *  clothing_item `imageUrl`. */
  processedImageUrl: z.string(),
})

export type AddClothesItem = z.infer<typeof itemSchema>

const CLASSIFICATIONS = ['unsupported', 'unknown', 'no_error'] as const

const resultSchema = z.object({
  result: z.enum(CLASSIFICATIONS),
  items: z.array(itemSchema),
})

export type AddClothesResult = z.infer<typeof resultSchema>

type Progress =
  | { phase: 'detect' | 'extract' | 'refine' }
  | { phase: 'done'; result: AddClothesResult }
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
): Promise<void> {
  const start = Date.now()
  try {
    const buf = Buffer.from(imageBase64, 'base64')

    sessions.set(sessionId, { phase: 'detect' })
    const analysis = await analyzeSingleClothing(buf, mimeType)
    if (analysis.kind === 'unsupported') {
      sessions.set(sessionId, {
        phase: 'done',
        result: { result: 'unsupported', items: [] },
      })
      return
    }

    // No real per-stage work past analyze; the carousel paces itself
    // client-side. Setting markers is a courtesy in case we want them
    // for diagnostics/back-pressure later.
    sessions.set(sessionId, { phase: 'extract' })
    sessions.set(sessionId, { phase: 'refine' })

    console.log(
      `[add-clothes:${userId}] analyze ${Date.now() - start}ms ` +
        `category=${analysis.item.category} fit=${analysis.item.fit ?? 'null'} ` +
        `length=${analysis.item.length ?? 'null'} ` +
        `colors=${analysis.item.colors.map((c) => `${c.name}(${Math.round(c.ratio * 100)}%)`).join(',') || '(none)'}`,
    )
    sessions.set(sessionId, {
      phase: 'done',
      result: {
        result: 'no_error',
        items: [
          {
            ...analysis.item,
            originalImageUrl: analysis.originalImageUrl,
            processedImageUrl: analysis.processedImageUrl,
          },
        ],
      },
    })
  } catch (err) {
    // Log the full error for ops, but expose only a generic message to
    // the client. Raw upstream errors (fal, vision provider) leak stack
    // frames and internal headers that aren't useful to a user.
    console.error(`[add-clothes:${userId}] pipeline error:`, err)
    sessions.set(sessionId, {
      phase: 'error',
      message: 'Could not process this photo. Please try again.',
    })
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
    const { user } = context
    const sessionId = crypto.randomUUID()
    sessions.set(sessionId, { phase: 'detect' })
    sessionCreatedAt.set(sessionId, Date.now())
    void runPipeline(sessionId, user.id, input.imageBase64, input.mimeType)
    return { sessionId }
  })

const progressSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('detect') }),
  z.object({ phase: z.literal('extract') }),
  z.object({ phase: z.literal('refine') }),
  z.object({ phase: z.literal('done'), result: resultSchema }),
  z.object({ phase: z.literal('error'), message: z.string() }),
])

export type AddClothesProgress = z.infer<typeof progressSchema>

const progress = authed
  .input(z.object({ sessionId: z.string() }))
  .handler(async ({ input }): Promise<z.infer<typeof progressSchema>> => {
    const p = sessions.get(input.sessionId)
    if (!p) return { phase: 'error', message: 'Session not found (server may have restarted)' }
    return p
  })

export const addClothesHandlers = { start, progress }
