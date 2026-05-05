import path from 'node:path'
import { fal } from '@fal-ai/client'
import sharp from 'sharp'
import {
  ensureFalReachableUrl,
  ITEM_CATEGORIES,
  type ItemCategory,
  uploadBufferToFal,
} from './steal-the-look-pipeline'
import { TRYON_PROMPT } from './tryon-prompt'

// Both passes use seedream — it preserves the requested 832x1248
// canvas (nano-banana doesn't accept image_size and the 1:1 / 3:4
// canvases it returns instead don't fit our hero crop).
const PASS1_MODEL = 'fal-ai/bytedance/seedream/v5/lite/edit'
const PASS2_MODEL = 'fal-ai/bytedance/seedream/v5/lite/edit'
const REMBG_MODEL = 'fal-ai/bria/background/remove'

const POSE_MANNEQUIN_PATH = path.join(import.meta.dir, '../assets/pose.png')

export type DressAvatarPhase = 'pass1' | 'pass2' | 'rembg'

const SLOTS = ['headwear', 'base', 'outer', 'bottom', 'footwear'] as const
export type Slot = (typeof SLOTS)[number]

const CATEGORY_TO_SLOT: Record<ItemCategory, Slot> = {
  shirt: 'base',
  pants: 'bottom',
  jacket: 'outer',
  footwear: 'footwear',
  headwear: 'headwear',
}

export type FitProfile = 'skinny' | 'regular' | 'relaxed' | 'oversize'
// Length is meaningful only for jacket and pants — the union covers
// both ranges. The pipeline ignores length on other categories.
export type GarmentLength =
  | 'cropped'
  | 'waist'
  | 'hip'
  | 'thigh'
  | 'knee'
  | 'full-length'
  | 'thigh-shorts'
  | 'knee-shorts'
  | 'ankle-length'

export type DressAvatarItem = {
  category: ItemCategory
  imageUrl: string
  // Fit + length improve the prompt's specificity for shirt/jacket/pants.
  // Pipelines should pass them whenever known; null/undefined falls back
  // to "infer from the garment image".
  fit?: FitProfile | null
  length?: GarmentLength | null
}

export type DressAvatarOptions = {
  avatarUrl: string
  items: DressAvatarItem[]
  onPhase?: (phase: DressAvatarPhase) => void
}

// Translate the internal fit / length values into descriptive English
// fragments. Helps seedream interpret the metadata literally instead of
// regressing toward a generic "average fit" / "full-length" output.
function fitDescriptor(fit: FitProfile | null | undefined): string {
  if (!fit) return ''
  const desc: Record<FitProfile, string> = {
    skinny: 'a SKINNY fit (close to the body, narrow silhouette through torso/limbs)',
    regular: 'a REGULAR fit (standard cut, neither tight nor loose)',
    relaxed: 'a RELAXED fit (loose drape with extra room through torso/limbs, but not oversize)',
    oversize: 'an OVERSIZE fit (intentionally large, dropped shoulders, voluminous silhouette)',
  }
  return ` The garment must be rendered with ${desc[fit]}; do NOT idealize toward a different fit.`
}

const TOP_LENGTH_DESC: Partial<Record<GarmentLength, string>> = {
  cropped: 'CROPPED — hem above the natural waist, exposing midriff or the very upper waistband',
  waist: 'WAIST length — hem sits exactly at the natural waist',
  hip: 'HIP length — hem falls at the hip line, just below the natural waist',
  thigh: 'THIGH length — hem extends down to mid-thigh, like a tunic or long sweater',
  knee: 'KNEE length — hem reaches the knee, like a long coat',
  'full-length': 'FULL-LENGTH — hem extends past the knee toward the ankle, like a long coat',
}

const PANTS_LENGTH_DESC: Partial<Record<GarmentLength, string>> = {
  'thigh-shorts': 'THIGH SHORTS — hem ends at mid-thigh',
  'knee-shorts': 'KNEE SHORTS — hem ends at the knee',
  'ankle-length': 'ANKLE LENGTH — hem sits at the ankle bone, slightly above the foot',
  'full-length': 'FULL LENGTH — hem reaches the ankle and breaks over the foot',
}

function topLengthDescriptor(length: GarmentLength | null | undefined): string {
  if (!length) return ''
  const desc = TOP_LENGTH_DESC[length]
  if (!desc) return ''
  return ` The hem length is ${desc}; match that exact hem position regardless of how the source image is framed.`
}

function pantsLengthDescriptor(length: GarmentLength | null | undefined): string {
  if (!length) return ''
  const desc = PANTS_LENGTH_DESC[length]
  if (!desc) return ''
  return ` The hem length is ${desc}; do NOT default to full-length if the metadata says otherwise.`
}

export const SLOT_CLAUSES: Record<
  Slot,
  (idx: number, item: { fit?: FitProfile | null; length?: GarmentLength | null }) => string
> = {
  base: (i, item) =>
    `Image ${i} is a BASE-LAYER top garment (t-shirt, blouse, sweater, dress, etc.). REMOVE the plain white t-shirt from image 1 entirely and replace it with this garment, draped naturally on the body in three dimensions — fabric wraps around the torso, sleeves wrap around the arms, with realistic folds and shading. Match the neckline, sleeve length, hem position, and overall silhouette to what is shown in image ${i} (if the source is short-sleeve, output is short-sleeve; if long-sleeve, output is long-sleeve; if cropped, output is cropped). If image ${i} shows a dress, the dress replaces BOTH the white tee AND the white shorts; do not draw any visible bottom under it. Do not render this garment as a flat 2D panel pasted on the body.${fitDescriptor(item.fit)}`,
  outer: (i, item) =>
    `Image ${i} is an OUTER-LAYER garment (jacket, coat, cardigan, sweater, pullover, hoodie, blazer, etc.). Add this garment OVER whatever upper-body garment is now present in image 1, draped naturally in three dimensions — collar, lapels, sleeves, and hem matching what is shown in image ${i}. The outer layer's OWN fabric, color, knit texture, distressing, prints, and graphics come EXCLUSIVELY from image ${i}; do NOT transfer the base-layer top's print, graphic, logo, or color onto the outer layer's surface. The outer layer is OPAQUE wherever its fabric exists in image ${i} — its body, sleeves, and front fully OCCLUDE the base-layer top's chest design. Only if image ${i} explicitly shows the outer as OPEN/UNZIPPED/UNBUTTONED at the front, or shows actual TORN HOLES with empty space behind them, may the base-layer top peek through — and then only inside those exact openings, never bleeding onto the outer's intact fabric. Do not render this garment as a flat 2D panel.${fitDescriptor(item.fit)}${topLengthDescriptor(item.length)}`,
  bottom: (i, item) =>
    `Image ${i} is a BOTTOM garment (pants, shorts, skirt, etc.). REMOVE the plain white shorts from image 1 entirely and replace them with this garment. The garment wraps fully around the lower body in three dimensions — both legs are completely covered by fabric, with no see-through and no bare leg visible behind the fabric (it is NOT a flat 2D panel, it is real garment fabric draped around the legs). The waistband sits at the natural waist or hip as shown in image ${i}, and the fabric drapes naturally over the legs with realistic folds and shading.${fitDescriptor(item.fit)}${pantsLengthDescriptor(item.length)}`,
  footwear: (i) =>
    `Image ${i} is FOOTWEAR (shoes, sneakers, boots, sandals, etc.). Add this footwear to the figure's bare feet in image 1, with both feet wearing the same pair, properly fitted, and rendered in three dimensions. Do not leave the feet bare.`,
  headwear: (i) =>
    `Image ${i} is HEADWEAR (hat, cap, beanie, etc.). Add this headwear to the figure's head in image 1, sitting naturally on top of the hair without crushing or removing it.`,
}

const drapeClause = `Render each new garment with realistic fabric drape, shadows, and folds appropriate to its shape and material as shown in its source image. Match the cut shown in each source: if the source shows a relaxed-fit garment, drape it loosely; if fitted, drape it close to the body. Do not idealize or alter the cut.`

const pass1SceneClause = `Preserve from image 1: camera angle, framing (full body visible head to feet), and overall figure proportions. Photorealistic, sharp focus, no text, no watermarks. Plain studio lighting.`

/**
 * Edge decontamination — same as normalize-user.ts. Removes background
 * color contamination baked into semi-transparent edge pixels.
 *   composite = α·fg + (1−α)·bg   ⇒   fg = (composite − (1−α)·bg) / α
 */
async function decontaminate(rembgPng: Buffer, rawPng: Buffer): Promise<Buffer> {
  const { data: rawData, info: rawInfo } = await sharp(rawPng)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const w = rawInfo.width
  const h = rawInfo.height
  const ch = rawInfo.channels
  const samplePts: Array<[number, number]> = [
    [4, 4],
    [w - 5, 4],
    [4, h - 5],
    [w - 5, h - 5],
  ]
  let br = 0
  let bg = 0
  let bb = 0
  for (const [x, y] of samplePts) {
    const i = (y * w + x) * ch
    br += rawData[i] ?? 0
    bg += rawData[i + 1] ?? 0
    bb += rawData[i + 2] ?? 0
  }
  br /= samplePts.length
  bg /= samplePts.length
  bb /= samplePts.length

  const { data, info } = await sharp(rembgPng)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const out = Buffer.from(data)
  for (let i = 0; i < out.length; i += 4) {
    const a = (out[i + 3] ?? 0) / 255
    if (a >= 0.999 || a <= 0.001) continue
    const r = ((out[i] ?? 0) - (1 - a) * br) / a
    const g = ((out[i + 1] ?? 0) - (1 - a) * bg) / a
    const b = ((out[i + 2] ?? 0) - (1 - a) * bb) / a
    out[i] = Math.max(0, Math.min(255, r))
    out[i + 1] = Math.max(0, Math.min(255, g))
    out[i + 2] = Math.max(0, Math.min(255, b))
  }
  return await sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer()
}

async function fetchToBuffer(url: string): Promise<Buffer> {
  return Buffer.from(await (await fetch(url)).arrayBuffer())
}

async function uploadFile(filePath: string): Promise<string> {
  const fs = await import('node:fs/promises')
  const buf = await fs.readFile(filePath)
  const ext = filePath.toLowerCase().split('.').pop() ?? 'png'
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'
  return await uploadBufferToFal(buf, path.basename(filePath), mime)
}

/**
 * End-to-end "dress-avatar" rendering. Pass 1 composes the outfit on a
 * faceless mannequin (multi-image seedream-edit). Pass 2 re-anchors
 * identity/pose on the user's avatar via the shared TRYON_PROMPT
 * (2-image seedream-edit, same shape as steal-the-look's
 * tryOnFromInspiration). Final pass strips the background.
 *
 * Caller passes garments by category (the app's vocabulary); we map
 * to the dress-avatar slot vocabulary internally.
 */
export async function dressAvatar(opts: DressAvatarOptions): Promise<string> {
  const totalStart = Date.now()
  const { avatarUrl, items, onPhase } = opts

  if (items.length === 0) {
    throw new Error('dressAvatar requires at least one garment')
  }

  // Map app categories → dress-avatar slots and de-dupe (keep first per slot).
  const seenSlots = new Set<Slot>()
  const garments: Array<{
    slot: Slot
    imageUrl: string
    fit?: FitProfile | null
    length?: GarmentLength | null
  }> = []
  for (const it of items) {
    if (!ITEM_CATEGORIES.includes(it.category)) continue
    const slot = CATEGORY_TO_SLOT[it.category]
    if (seenSlots.has(slot)) continue
    seenSlots.add(slot)
    garments.push({ slot, imageUrl: it.imageUrl, fit: it.fit, length: it.length })
  }

  // Make sure all input URLs are reachable from fal (rehost local URLs in dev).
  const reachableAvatar = await ensureFalReachableUrl(avatarUrl)
  const reachableGarments = await Promise.all(
    garments.map(async (g) => ({ ...g, imageUrl: await ensureFalReachableUrl(g.imageUrl) })),
  )
  const mannequinUrl = await uploadFile(POSE_MANNEQUIN_PATH)

  // ─── Pass 1: compose outfit on faceless mannequin ──────────────────────
  onPhase?.('pass1')
  const slotClauses = reachableGarments
    .map((g, idx) => SLOT_CLAUSES[g.slot](idx + 2, { fit: g.fit, length: g.length }))
    .join(' ')

  // Build a per-slot "DO NOT INVENT" clause for absent slots so seedream
  // doesn't hallucinate garments. The mannequin in pose.png has placeholder
  // shoes/socks at the feet — without an explicit instruction the model
  // tends to read those as "shoes are part of the look".
  const presentSlots = new Set(reachableGarments.map((g) => g.slot))
  const absenceClauses: string[] = []
  if (!presentSlots.has('footwear')) {
    absenceClauses.push(
      'NO FOOTWEAR: the output figure must be BAREFOOT. Do not add shoes, sneakers, boots, sandals, socks, or any covering on the feet. The placeholder shoes / socks visible on the mannequin in image 1 are NOT part of the outfit — render the bare feet showing skin and toes naturally.',
    )
  }
  if (!presentSlots.has('headwear')) {
    absenceClauses.push(
      'NO HEADWEAR: the output figure must be BAREHEADED. Do not add a hat, cap, beanie, headband, or any head covering — leave the hair fully visible and uncovered.',
    )
  }
  if (!presentSlots.has('outer')) {
    absenceClauses.push(
      'NO OUTER LAYER: do not add a jacket, coat, cardigan, blazer, vest, or any second top layer over the base garment.',
    )
  }
  const absenceClause = absenceClauses.length > 0 ? `\n\n${absenceClauses.join(' ')}` : ''
  const pass1Prompt = `DRESS THE MANNEQUIN: image 1 shows a faceless mannequin wearing a plain white t-shirt and plain white shorts as placeholders. Replace those placeholders with the garments described below. If a garment slot is not provided (e.g. no base, no bottom), keep the corresponding placeholder garment as-is. The mannequin has no face — keep it that way; do not add a face. ${slotClauses}${absenceClause}

GARMENT FIT: the base-layer top hangs straight down from the shoulders to the hip, FULLY UNTUCKED, OUTSIDE the bottom garment's waistband — no tucking, no asymmetric bunching, no awkward folds at the waist. The bottom garment's waistband sits at the natural waist or hip and is COVERED by the base-layer top's hem. Any outer layer drapes naturally over the untucked base-layer.

LAYERING ISOLATION: each garment keeps its own source image's fabric, color, texture, prints, graphics, and distressing. NEVER copy the base-layer top's print, logo, or graphic onto the outer layer's surface — the outer layer's body and sleeves are opaque and fully cover the base-layer's chest design wherever the outer's fabric exists. Holes, rips, or distressing visible in the outer layer's source must look like REAL torn fabric edges with the bare base-layer fabric color showing through, NOT like a graphic painted onto the outer's surface.

${drapeClause}

${pass1SceneClause}`

  const pass1Start = Date.now()
  const pass1Result = await fal.subscribe(PASS1_MODEL, {
    input: {
      prompt: pass1Prompt,
      image_urls: [mannequinUrl, ...reachableGarments.map((g) => g.imageUrl)],
      num_images: 1,
      image_size: { width: 832, height: 1248 },
    },
    logs: false,
  })
  const pass1Data = pass1Result.data as any
  const pass1Url = (pass1Data?.images?.[0]?.url ?? pass1Data?.image?.url) as string | undefined
  if (!pass1Url) throw new Error('[dress-avatar] pass1 returned no image URL')
  console.log(`[dress-avatar] pass1 ${Date.now() - pass1Start}ms`)

  // ─── Pass 2: re-anchor identity/pose on the user's avatar ──────────────
  onPhase?.('pass2')
  const pass2Start = Date.now()
  const pass2Result = await fal.subscribe(PASS2_MODEL, {
    input: {
      prompt: TRYON_PROMPT,
      image_urls: [reachableAvatar, pass1Url],
      num_images: 1,
      image_size: { width: 832, height: 1248 },
    },
    logs: false,
  })
  const pass2Data = pass2Result.data as any
  const stagedUrl = (pass2Data?.images?.[0]?.url ?? pass2Data?.image?.url) as string | undefined
  if (!stagedUrl) throw new Error('[dress-avatar] pass2 returned no image URL')
  console.log(`[dress-avatar] pass2 ${Date.now() - pass2Start}ms`)

  // ─── Background remove + decontaminate ─────────────────────────────────
  onPhase?.('rembg')
  const rembgStart = Date.now()
  const rembgResult = await fal.subscribe(REMBG_MODEL, {
    input: { image_url: stagedUrl },
    logs: false,
  })
  const rembgData = rembgResult.data as any
  const cleanUrl = (rembgData?.image?.url ?? rembgData?.images?.[0]?.url) as string | undefined
  if (!cleanUrl) throw new Error('[dress-avatar] rembg returned no image URL')

  const stagedBuf = await fetchToBuffer(stagedUrl)
  const rembgBuf = await fetchToBuffer(cleanUrl)
  const decontaminated = await decontaminate(rembgBuf, stagedBuf)
  const finalUrl = await uploadBufferToFal(decontaminated, 'tryon-final.png', 'image/png')
  console.log(`[dress-avatar] rembg+decontam ${Date.now() - rembgStart}ms`)

  console.log(`[dress-avatar] total ${Date.now() - totalStart}ms`)
  return finalUrl
}
