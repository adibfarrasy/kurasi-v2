/**
 * Steal-the-Look pipeline — converts a single uploaded inspiration photo into
 * a try-on result (hero image + per-item analyzed wardrobe entries).
 *
 * The shape of this pipeline mirrors backend/avatar/scripts/{analyze-clothing,
 * dress-avatar}.ts (those are CLI references, not imported). Each phase
 * corresponds to one of the carousel stages the user sees:
 *
 *   detect    — vision LLM finds every garment, returns metadata + bbox
 *   extract   — SAM2 segments each garment, sharp masks + crops it
 *   refine    — flux-edit composes onto a hanger, bria removes bg, decontaminate
 *   composite — CatVTON (base/bottom) then flux-edit (outer/footwear/headwear)
 */

import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fal } from '@fal-ai/client'
import sharp from 'sharp'
import { env, isDevMode } from '../../env'

// Resolve `backend/outputs/` regardless of where the process was launched
// from (`task be-dev` cwd's into `backend/`, scripts may run from repo root).
const OUTPUTS_DIR = path.resolve(import.meta.dir, '..', '..', 'outputs')

/** No-op in production; in dev writes the buffer to backend/outputs/<name>. */
async function devDump(name: string, buf: Buffer): Promise<void> {
  if (!isDevMode) return
  await fs.mkdir(OUTPUTS_DIR, { recursive: true }).catch(() => {})
  await fs.writeFile(path.join(OUTPUTS_DIR, name), buf).catch(() => {})
}

// ──────────────────────────────────────────────────────────────────────────
// Shared types
// ──────────────────────────────────────────────────────────────────────────

export const ITEM_CATEGORIES = ['headwear', 'shirt', 'jacket', 'pants', 'footwear'] as const

export type ItemCategory = (typeof ITEM_CATEGORIES)[number]

export const FIT_PROFILES = ['skinny', 'regular', 'relaxed', 'oversize'] as const
export type FitProfile = (typeof FIT_PROFILES)[number]

// Hem position. Jacket and pants only — split into two sub-ranges so the
// detector can be given category-specific value lists in its prompt.
export const JACKET_LENGTHS = ['cropped', 'waist', 'hip', 'thigh', 'knee', 'full-length'] as const
export const PANTS_LENGTHS = ['thigh-shorts', 'knee-shorts', 'ankle-length', 'full-length'] as const
export const GARMENT_LENGTHS = [...JACKET_LENGTHS, ...PANTS_LENGTHS] as const
export type GarmentLength = (typeof GARMENT_LENGTHS)[number]

const FITTABLE_CATEGORIES: ReadonlySet<ItemCategory> = new Set(['shirt', 'jacket', 'pants'])
const LENGTH_BY_CATEGORY: Partial<Record<ItemCategory, ReadonlySet<GarmentLength>>> = {
  jacket: new Set(JACKET_LENGTHS),
  pants: new Set(PANTS_LENGTHS),
}

export type DetectedColor = {
  name: string
  hex: string
  ratio: number
}

export type DetectedItem = {
  category: ItemCategory
  title: string
  fit: FitProfile | null
  /** Hem position. Only set for jacket and pants (otherwise null). */
  length: GarmentLength | null
  colors: DetectedColor[]
  /** Normalized [0..1] floats: [x, y, width, height] from top-left. */
  bbox: [number, number, number, number]
}

export type DetectResult =
  | { kind: 'ok'; items: DetectedItem[] }
  | { kind: 'error'; reason: 'multiple_people' | 'unknown' }

// ──────────────────────────────────────────────────────────────────────────
// fal helpers
// ──────────────────────────────────────────────────────────────────────────

let configured = false
function ensureFalConfigured(): void {
  if (configured) return
  if (!env.FAL_KEY) throw new Error('FAL_KEY is not configured')
  fal.config({ credentials: env.FAL_KEY })
  configured = true
}

export async function uploadBufferToFal(
  buf: Buffer,
  filename: string,
  mime: string,
): Promise<string> {
  ensureFalConfigured()
  const file = new File([new Uint8Array(buf)], filename, { type: mime })
  return await fal.storage.upload(file)
}

/**
 * Dev-only convenience: fal's CDN can't reach `localhost` / LAN IPs, so when
 * `REHOST_LOCAL_TO_FAL=true` (set in dev/test envs only) we download the
 * file from our local server and re-upload it to fal storage so it becomes
 * fetchable. In production this flag stays false and avatar URLs are
 * expected to already be public; a localhost URL there is a real bug.
 *
 * Results are cached so we only pay the round-trip once per source URL per
 * server lifetime.
 */
const reachableUrlCache = new Map<string, string>()
export async function ensureFalReachableUrl(url: string): Promise<string> {
  ensureFalConfigured()
  const isLocalUrl =
    /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
      url,
    )
  if (!isLocalUrl) return url
  if (!isDevMode) {
    throw new Error(
      `URL ${url} is not reachable from fal. Set ENVIRONMENT=dev to enable localhost rehosting, or use a public URL in production.`,
    )
  }

  const cached = reachableUrlCache.get(url)
  if (cached) return cached

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Could not fetch local URL ${url} for fal re-upload: ${res.status}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  const ct = res.headers.get('content-type') ?? 'image/png'
  const name = url.split('/').pop()?.split('?')[0] || 'rehost.png'
  const falUrl = await uploadBufferToFal(buf, name, ct)
  reachableUrlCache.set(url, falUrl)
  console.log(`[steal-the-look] rehosted ${url} → ${falUrl}`)
  return falUrl
}

// ──────────────────────────────────────────────────────────────────────────
// detect
// ──────────────────────────────────────────────────────────────────────────

const VISION_MODEL = 'google/gemini-2.5-flash'

const DETECT_PROMPT = `You are a fashion analyst. Look at the photo and detect every clothing item visible on the single person in the frame that fits one of these EXACT categories. DISCARD anything else (bags, scarves, jewelry, watches, glasses, sunglasses, ties, belts, dresses, skirts, shorts, etc.) — do NOT include them in the output.

Special cases (respond with JSON shape \`{ "error": "<reason>" }\`):
  - More than one person visible → \`{ "error": "multiple_people" }\`
  - No person visible, or no recognizable garment → \`{ "error": "unknown" }\`

Otherwise respond with a JSON ARRAY (no commentary, no markdown fences) where each element has this exact shape:
{
  "category": one of "headwear" | "shirt" | "jacket" | "pants" | "footwear",
  "title": short descriptive title (3-7 plain-English words, no brand names),
  "fit": one of "skinny" | "regular" | "relaxed" | "oversize", or null for non-body-worn items,
  "length": hem position — see length rules below; null for items where length doesn't apply,
  "colors": array of 1-3 dominant colors of the garment, each \`{ "name": string, "hex": "#rrggbb", "ratio": number 0..1 }\`. Ratios sum to ~1.
  "bbox": [x, y, w, h] — NORMALIZED 0..1 floats, top-left origin, of the smallest axis-aligned rectangle that contains the garment. For HEADWEAR specifically, INCLUDE THE BRIM if it has one (a baseball cap's brim must be inside the bbox, not cut off) — bias the bbox a little wider/taller for headwear to be safe.
}

Category rules:
  - headwear: any hat, cap, beanie, headband, bucket hat, sun hat
  - shirt: any top worn directly on the torso — t-shirt, tank, henley, button-down, polo, oxford, blouse
  - jacket: any outer-layer garment — jacket, coat, hoodie, cardigan, blazer, vest, parka, sweater
  - pants: any full-length lower garment — trousers, jeans, leggings, chinos
  - footwear: any shoes, boots, sandals, heels, sneakers, slippers

DO NOT emit items for: bags, scarves, glasses, sunglasses, watches, jewelry, belts, ties, dresses, skirts, shorts. Just leave them out of the array.

Fit rules:
  - "fit" is the silhouette, not the cut name.
  - skinny: garment hugs the body closely — narrow silhouette through torso/limbs.
  - regular: standard cut, neither tight nor loose.
  - relaxed: loose drape with extra room through torso/limbs, but not oversize.
  - oversize: intentionally large — dropped shoulders, voluminous silhouette.
  - Set fit only for shirt, jacket, pants. Otherwise null.

Length rules (hem position):
  - jacket: one of "cropped" | "waist" | "hip" | "thigh" | "knee" | "full-length".
      cropped = above the natural waist, exposing midriff or upper waistband.
      waist = at the natural waist.
      hip = falls at the hip, just below the waist.
      thigh = mid-thigh (tunic / long sweater length).
      knee = reaches the knee (long coat).
      full-length = past the knee toward the ankle (overcoat).
  - pants: one of "thigh-shorts" | "knee-shorts" | "ankle-length" | "full-length".
      thigh-shorts = mid-thigh hem.
      knee-shorts = knee-length hem.
      ankle-length = sits at the ankle, slightly above the foot.
      full-length = reaches the ankle and breaks over the foot.
  - For headwear / shirt / footwear set length to null.

For LAYERED outerwear (open jacket over a shirt) report BOTH items separately with their own bboxes — the bboxes may overlap; that is correct.

Reply with ONLY the JSON. No other text.`

function tryParseJson(text: string): unknown {
  // Strip optional ```json fences.
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

function isItemCategory(s: unknown): s is ItemCategory {
  return typeof s === 'string' && (ITEM_CATEGORIES as readonly string[]).includes(s)
}

function isFitProfile(s: unknown): s is FitProfile {
  return typeof s === 'string' && (FIT_PROFILES as readonly string[]).includes(s)
}

function isGarmentLength(s: unknown): s is GarmentLength {
  return typeof s === 'string' && (GARMENT_LENGTHS as readonly string[]).includes(s)
}

function coerceItem(raw: unknown): DetectedItem | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!isItemCategory(r.category)) return null
  const title = typeof r.title === 'string' ? r.title : 'Wardrobe item'
  const fit = isFitProfile(r.fit) ? r.fit : null
  // Non-fittable categories must have null fit.
  const finalFit = FITTABLE_CATEGORIES.has(r.category) ? fit : null
  // Validate length against the category-specific subset. Drop the value
  // if the model returned a length that doesn't apply to this category
  // (e.g. "thigh-shorts" on a jacket).
  const allowedLengths = LENGTH_BY_CATEGORY[r.category]
  const length =
    allowedLengths && isGarmentLength(r.length) && allowedLengths.has(r.length) ? r.length : null

  const rawColors = Array.isArray(r.colors) ? r.colors : []
  const colors: DetectedColor[] = []
  for (const c of rawColors) {
    if (!c || typeof c !== 'object') continue
    const cc = c as Record<string, unknown>
    if (typeof cc.name === 'string' && typeof cc.hex === 'string' && typeof cc.ratio === 'number') {
      colors.push({ name: cc.name, hex: cc.hex, ratio: cc.ratio })
    }
  }

  const bb = r.bbox
  if (!Array.isArray(bb) || bb.length !== 4) return null
  const nums = bb.map((n) => (typeof n === 'number' ? n : Number.NaN))
  if (nums.some((n) => Number.isNaN(n))) return null
  // Clamp to [0, 1].
  const [x, y, w, h] = nums.map((n) => Math.max(0, Math.min(1, n))) as [
    number,
    number,
    number,
    number,
  ]
  if (w <= 0 || h <= 0) return null

  return {
    category: r.category,
    title,
    fit: finalFit,
    length,
    colors,
    bbox: [x, y, w, h],
  }
}

export async function detectItems(imageUrl: string): Promise<DetectResult> {
  ensureFalConfigured()
  const result = await fal.subscribe('fal-ai/any-llm/vision', {
    // biome-ignore lint/suspicious/noExplicitAny: fal's union type is too narrow for any-llm/vision model strings
    input: { model: VISION_MODEL as any, prompt: DETECT_PROMPT, image_url: imageUrl },
    logs: false,
  })
  // biome-ignore lint/suspicious/noExplicitAny: fal subscribe response shape isn't typed
  const text = String((result.data as any)?.output ?? '').trim()

  const parsed = tryParseJson(text)
  if (!parsed) {
    console.error('[steal-the-look] detect: could not parse JSON. Raw:', text)
    return { kind: 'error', reason: 'unknown' }
  }

  // Error envelope shape.
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'error' in parsed) {
    const err = (parsed as { error: unknown }).error
    if (err === 'multiple_people' || err === 'unknown') {
      return { kind: 'error', reason: err }
    }
    return { kind: 'error', reason: 'unknown' }
  }

  if (!Array.isArray(parsed)) {
    console.error('[steal-the-look] detect: expected array, got:', typeof parsed)
    return { kind: 'error', reason: 'unknown' }
  }

  const items: DetectedItem[] = []
  for (const raw of parsed) {
    const item = coerceItem(raw)
    if (item) items.push(item)
  }

  if (items.length === 0) {
    return { kind: 'error', reason: 'unknown' }
  }
  return { kind: 'ok', items }
}

// ──────────────────────────────────────────────────────────────────────────
// extract — SAM2 segmentation + sharp masking + crop
// ──────────────────────────────────────────────────────────────────────────

const SAM2_MODEL = 'fal-ai/sam2/image'

export type ExtractedItem = {
  /** Buffer of the cropped, transparent PNG. */
  buf: Buffer
  /** Pixel-space bounding box used for the crop, [x, y, w, h]. */
  pxBbox: [number, number, number, number]
}

async function fetchToBuffer(url: string): Promise<Buffer> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`fetch ${url} → ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
}

/** Convert a normalized [x, y, w, h] bbox into pixel coordinates. */
function toPixelBbox(
  bbox: [number, number, number, number],
  width: number,
  height: number,
): [number, number, number, number] {
  const [nx, ny, nw, nh] = bbox
  const x = Math.max(0, Math.floor(nx * width))
  const y = Math.max(0, Math.floor(ny * height))
  const w = Math.max(1, Math.min(width - x, Math.ceil(nw * width)))
  const h = Math.max(1, Math.min(height - y, Math.ceil(nh * height)))
  return [x, y, w, h]
}

/**
 * Run SAM2 with a single box prompt, returning the URL of the resulting mask
 * PNG (white = item, black = background).
 *
 * Defensive: fal's SAM2 response shape isn't strongly typed, so we walk a
 * couple of common shapes before bailing out.
 */
async function sam2BoxMask(
  imageUrl: string,
  pxBbox: [number, number, number, number],
): Promise<string> {
  ensureFalConfigured()
  const [x, y, w, h] = pxBbox
  const x_min = x
  const y_min = y
  const x_max = x + w
  const y_max = y + h

  const result = await fal.subscribe(SAM2_MODEL, {
    input: {
      image_url: imageUrl,
      prompts: [{ type: 'box', x_min, y_min, x_max, y_max }],
    },
    logs: false,
    // biome-ignore lint/suspicious/noExplicitAny: SAM2 input shape isn't typed
  } as any)
  // biome-ignore lint/suspicious/noExplicitAny: SAM2 response shape isn't typed
  const data = result.data as any
  const url: string | undefined =
    data?.image?.url ??
    data?.mask?.url ??
    (Array.isArray(data?.masks) ? data.masks[0]?.url : undefined) ??
    (Array.isArray(data?.images) ? data.images[0]?.url : undefined)
  if (!url) {
    console.error('[steal-the-look] SAM2 unexpected response shape:', data)
    throw new Error('SAM2 returned no mask URL')
  }
  return url
}

/**
 * Apply a grayscale mask to the source image as alpha, then crop to the
 * provided pixel bbox. Returns a transparent-background PNG buffer of just
 * the segmented item.
 */
async function applyMaskAndCrop(
  sourceBuf: Buffer,
  maskBuf: Buffer,
  pxBbox: [number, number, number, number],
  width: number,
  height: number,
): Promise<Buffer> {
  // Resize mask to match source dims and convert to a single grayscale
  // channel, then bake it into a flat RGBA where R=G=B=255 and A=mask. This
  // lets us composite with `dest-in` to keep source pixels only where the
  // mask is opaque.
  const maskGray = await sharp(maskBuf)
    .resize(width, height, { fit: 'fill' })
    .greyscale()
    .toColorspace('b-w')
    .raw()
    .toBuffer()

  const alphaPlate = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .joinChannel(maskGray, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer()

  const masked = await sharp(sourceBuf)
    .ensureAlpha()
    .composite([{ input: alphaPlate, blend: 'dest-in' }])
    .png()
    .toBuffer()

  const [x, y, w, h] = pxBbox
  return await sharp(masked).extract({ left: x, top: y, width: w, height: h }).png().toBuffer()
}

/**
 * For each detected item, crop the source image to the item's bbox.
 *
 * NOTE: an earlier version called `fal-ai/sam2/image` to produce a per-item
 * mask before cropping, but the API shape was guesswork and produced bad
 * masks (resulting in mostly-transparent fragments that fed flux-edit black
 * silhouettes). For now we trust flux-edit's prompt to isolate the garment
 * from a tight bbox crop. Layered outerwear (jacket over shirt) is a known
 * limitation — to be revisited with a verified fashion-segmentation model.
 *
 * For dev visibility, the bbox crop is also dumped to
 * `backend/outputs/extract-<idx>-<category>.png`.
 */
export async function extractItems(
  inspirationBuf: Buffer,
  _inspirationUrl: string,
  detected: DetectedItem[],
): Promise<ExtractedItem[]> {
  const meta = await sharp(inspirationBuf).metadata()
  if (!meta.width || !meta.height) {
    throw new Error('Could not read source image dimensions')
  }
  const W = meta.width
  const H = meta.height

  // Per-category bbox padding (fraction of the bbox dimension on each side).
  // Headwear gets the most generous expansion because the LLM tends to clip
  // the cap brim off the bottom of its bbox, and flux-edit then renders a
  // beanie instead of a cap. Other categories get a small margin to avoid
  // tight crops that lose hems / collars.
  const PAD: Record<ItemCategory, number> = {
    headwear: 0.2,
    shirt: 0.05,
    jacket: 0.05,
    pants: 0.05,
    footwear: 0.1,
  }

  const out: ExtractedItem[] = []
  for (let i = 0; i < detected.length; i++) {
    const item = detected[i]
    if (!item) continue
    const pad = PAD[item.category] ?? 0.05
    const pxBbox = toPixelBbox(item.bbox, W, H)
    const [bx, by, bw, bh] = pxBbox
    const padX = Math.round(bw * pad)
    const padY = Math.round(bh * pad)
    const x = Math.max(0, bx - padX)
    const y = Math.max(0, by - padY)
    const w = Math.min(W - x, bw + 2 * padX)
    const h = Math.min(H - y, bh + 2 * padY)

    const buf = await sharp(inspirationBuf)
      .extract({ left: x, top: y, width: w, height: h })
      .png()
      .toBuffer()
    out.push({ buf, pxBbox: [x, y, w, h] })
    await devDump(`extract-${i}-${item.category}.png`, buf)
  }
  return out
}

// ──────────────────────────────────────────────────────────────────────────
// refine — compose on hanger/template, bg-remove, decontaminate, canvas-place
// (faithful port of analyze-clothing.ts steps 2a / 2b / 2c)
// ──────────────────────────────────────────────────────────────────────────

const EDIT_MODEL = 'fal-ai/bytedance/seedream/v5/lite/edit'
const REMBG_MODEL = 'fal-ai/bria/background/remove'

const CANVAS_W = 832
const CANVAS_H = 1024

const ASSETS_ROOT = path.resolve(import.meta.dir, '..', 'assets')
const HANGER_TOP_PATH = path.join(ASSETS_ROOT, 'hanger-top.png')
const HANGER_BOTTOM_PATH = path.join(ASSETS_ROOT, 'hanger-bottom.png')
const HEADWEAR_BASE_PATH = path.join(ASSETS_ROOT, 'headwear-base.png')

type RefineMode = 'hanger-top' | 'hanger-bottom' | 'headwear-base' | 'flat'

const CATEGORY_TO_MODE: Record<ItemCategory, RefineMode> = {
  shirt: 'hanger-top',
  jacket: 'hanger-top',
  pants: 'hanger-bottom',
  headwear: 'headwear-base',
  footwear: 'flat',
}

const CATEGORY_LABEL: Record<ItemCategory, string> = {
  shirt: 'shirt',
  jacket: 'outer-layer garment',
  pants: 'pair of pants',
  footwear: 'pair of shoes',
  headwear: 'piece of headwear',
}

// Cache uploaded template URLs across calls to avoid re-uploading the same
// hanger image on every detected garment.
const templateUrlCache = new Map<string, string>()
async function templateUrl(localPath: string): Promise<string> {
  ensureFalConfigured()
  const cached = templateUrlCache.get(localPath)
  if (cached) return cached
  if (!existsSync(localPath)) {
    throw new Error(`Template asset not found: ${localPath}`)
  }
  const buf = await fs.readFile(localPath)
  const url = await uploadBufferToFal(buf, path.basename(localPath), 'image/png')
  templateUrlCache.set(localPath, url)
  return url
}

const SHARED_SUFFIX = `Photorealistic, sharp focus, even soft studio lighting, no text, no watermarks, no tags.`

function buildHangerPrompt(mode: RefineMode, categoryLabel: string): string {
  if (mode === 'hanger-top') {
    return `Place the garment from image 1 (a ${categoryLabel}) onto the EXACT wooden clothes hanger shown in image 2. The garment hangs naturally from the hanger's shoulders, fabric falling straight down with subtle natural folds. Front-facing view, garment fully visible. CRITICAL: the hanger in the result MUST be the same matte WHITE-PAINTED wooden hanger as in image 2 — same white color, same shape, same size, same hook (chrome metal), same position. Do NOT change the hanger to a darker wood, stained wood, plastic, or wire hanger. Do NOT alter the hanger's color, finish, or proportions in any way. Keep the deep teal background from image 2 unchanged — same color, no gradient, no shadow. Preserve the garment's exact color, pattern, fabric texture, print, logos, and proportions from image 1 — do not invent or alter any design detail. Do not add any human figure. ${SHARED_SUFFIX}`
  }
  if (mode === 'hanger-bottom') {
    return `Place the bottoms from image 1 (a ${categoryLabel}) onto the EXACT clip hanger shown in image 2. The waistband is held by the hanger's clips with the legs hanging straight down naturally with gravity. Front-facing view, garment fully visible. CRITICAL: the hanger in the result MUST be the same matte WHITE plastic clip hanger as in image 2 — same white color, same shape, same size, same chrome hook, same clips. Do NOT change the hanger to a darker color, different style, wooden, or wire hanger. Do NOT alter the hanger's color, finish, or proportions in any way. Keep the deep teal background from image 2 unchanged — same color, no gradient, no shadow. Preserve the garment's exact color, pattern, fabric texture, and proportions from image 1 — do not invent or alter any design detail. Do not add any human figure. ${SHARED_SUFFIX}`
  }
  // headwear-base
  return `A photograph of the white mannequin head from image 2 wearing the EXACT headwear shown in image 1. Identify the type from image 1 (cap, beanie, bucket hat, sun hat, etc.) and PRESERVE its exact silhouette in 3D — do NOT morph it into a different category of hat. Image 2 is the canonical scene; do NOT modify it: every pixel of the mannequin and the teal background that is not occluded by the new headwear must be IDENTICAL to image 2. The mannequin's facial orientation is fixed by image 2 and must not change. Rotate the headwear (not the head) so its front aligns with the direction the mannequin's face points. Sizing must be SNUG — the inner band hugs the head's circumference at the brow line, same width as the head, NOT larger, NOT floating. The crown's visible width (excluding any brim) must NOT exceed the visible width of the head at the temples. If anything, render the headwear slightly UNDERSIZED rather than oversized. Keep the deep teal background from image 2 unchanged — same color, no gradient, no shadow. Preserve the headwear's exact color, material, pattern, branding, and proportions from image 1. Do not add any human figure. ${SHARED_SUFFIX}`
}

function buildFlatPrompt(_category: ItemCategory, categoryLabel: string): string {
  // Only `footwear` is in flat mode now (everything else is hangable). Kept
  // category-aware in case we add more flat categories later.
  const flatSuffix = `${SHARED_SUFFIX} Plain seamless deep teal studio background, fully saturated solid color, no gradient, no shadow.`
  return `Clean studio product shot of the footwear from image 1 (a ${categoryLabel}). Show a PAIR of shoes (left and right) sitting side by side, both in a clear THREE-QUARTER ANGLED view — the camera looks down at the shoes from roughly 30 degrees above eye-level and 30 degrees off the side, so BOTH the side profile AND the top of each shoe are clearly visible at the same time. Both shoes sit level on an invisible flat ground, with toes pointing to the right and slightly toward the camera. The two shoes are placed close to each other but NOT overlapping. Preserve the exact color, material, pattern, laces, sole, branding, and proportions from image 1. Do not add any human figure or feet. ${flatSuffix}`
}

async function falEditCompose(prompt: string, imageUrls: string[]): Promise<string> {
  ensureFalConfigured()
  const result = await fal.subscribe(EDIT_MODEL, {
    input: {
      prompt,
      image_urls: imageUrls,
      num_images: 1,
      image_size: { width: CANVAS_W, height: CANVAS_H },
      // biome-ignore lint/suspicious/noExplicitAny: model accepts output_format at runtime; type is too narrow
      output_format: 'png' as any,
      // biome-ignore lint/suspicious/noExplicitAny: see above
    } as any,
    logs: false,
  })
  // biome-ignore lint/suspicious/noExplicitAny: fal subscribe response shape isn't typed
  const data = result.data as any
  const url: string | undefined = data?.images?.[0]?.url ?? data?.image?.url
  if (!url) {
    console.error('[steal-the-look] EDIT_MODEL returned no URL:', data)
    throw new Error('flux-edit returned no image URL')
  }
  return url
}

async function falRemoveBackground(imageUrl: string): Promise<string> {
  ensureFalConfigured()
  const result = await fal.subscribe(REMBG_MODEL, {
    input: { image_url: imageUrl },
    logs: false,
  })
  // biome-ignore lint/suspicious/noExplicitAny: fal subscribe response shape isn't typed
  const data = result.data as any
  const url: string | undefined = data?.image?.url ?? data?.images?.[0]?.url
  if (!url) {
    console.error('[steal-the-look] REMBG_MODEL returned no URL:', data)
    throw new Error('background-remove returned no image URL')
  }
  return url
}

/**
 * Reverse the bg color contribution out of edge pixels. Same approach as
 * analyze-clothing.ts: solves fg = (composite − (1−α)·bg)/α per pixel,
 * sampling the deep-teal studio background from the four corners of the
 * pre-rembg image.
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

/** Find the tight RGBA bbox of non-transparent pixels. */
async function alphaBbox(
  png: Buffer,
): Promise<{ x: number; y: number; w: number; h: number } | null> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width
  const H = info.height
  let minX = W
  let minY = H
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = data[(y * W + x) * 4 + 3] ?? 0
      if (a < 8) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/** Centre the alpha-cropped item on a uniform CANVAS_W x CANVAS_H transparent
 *  canvas with a fixed margin. Footwear is anchored near the bottom; everything
 *  else is centered. Mirrors the script's Step 2c canvas-place. */
async function placeOnUniformCanvas(item: Buffer, category: ItemCategory): Promise<Buffer> {
  const PAD_X = 100
  const FOOTWEAR_FLOOR_Y = Math.round(CANVAS_H * 0.78)
  const PAD_Y_TOP = category === 'footwear' ? 150 : 100
  const PAD_Y_BOTTOM = category === 'footwear' ? CANVAS_H - FOOTWEAR_FLOOR_Y : 100
  const TARGET_W = CANVAS_W - 2 * PAD_X
  const TARGET_H = CANVAS_H - PAD_Y_TOP - PAD_Y_BOTTOM

  const bbox = await alphaBbox(item)
  if (!bbox) {
    // Item has no opaque pixels — degrade to returning a transparent canvas.
    console.warn('[steal-the-look] refine: item had no opaque pixels')
    return await sharp({
      create: {
        width: CANVAS_W,
        height: CANVAS_H,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer()
  }
  const cropped = await sharp(item)
    .extract({ left: bbox.x, top: bbox.y, width: bbox.w, height: bbox.h })
    .png()
    .toBuffer()
  const scale = Math.min(TARGET_W / bbox.w, TARGET_H / bbox.h, 1)
  const finalW = Math.max(1, Math.round(bbox.w * scale))
  const finalH = Math.max(1, Math.round(bbox.h * scale))
  const scaled = await sharp(cropped).resize(finalW, finalH, { fit: 'fill' }).png().toBuffer()

  const left = Math.round((CANVAS_W - finalW) / 2)
  const top =
    category === 'footwear' ? FOOTWEAR_FLOOR_Y - finalH : Math.round((CANVAS_H - finalH) / 2)
  return await sharp({
    create: {
      width: CANVAS_W,
      height: CANVAS_H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: scaled, left, top }])
    .png()
    .toBuffer()
}

/**
 * Refine a single extracted item:
 *   1. flux-edit composes the garment onto its hanger/headwear template
 *      (or a clean studio shot for flat categories)
 *   2. bria/background/remove strips the deep-teal studio background
 *   3. decontaminate edge pixels using the pre-rembg corner colors
 *   4. centre on a uniform CANVAS_W x CANVAS_H transparent canvas
 *
 * Returns the final fal-storage URL of the cleaned PNG.
 */
export async function refineItem(extractedBuf: Buffer, category: ItemCategory): Promise<string> {
  const mode = CATEGORY_TO_MODE[category]
  const label = CATEGORY_LABEL[category]
  const tag = `refine:${category}`
  const t0 = Date.now()

  // Upload the extracted (masked + cropped) PNG so flux-edit can reference it.
  const itemUrl = await uploadBufferToFal(extractedBuf, `extracted-${category}.png`, 'image/png')
  console.log(`[${tag}] uploaded extracted (${Date.now() - t0}ms)`)

  // Step 2a — flux-edit compose on template (or clean studio shot if flat).
  const tEdit = Date.now()
  let stagedUrl: string
  if (mode === 'hanger-top') {
    stagedUrl = await falEditCompose(buildHangerPrompt(mode, label), [
      itemUrl,
      await templateUrl(HANGER_TOP_PATH),
    ])
  } else if (mode === 'hanger-bottom') {
    stagedUrl = await falEditCompose(buildHangerPrompt(mode, label), [
      itemUrl,
      await templateUrl(HANGER_BOTTOM_PATH),
    ])
  } else if (mode === 'headwear-base') {
    stagedUrl = await falEditCompose(buildHangerPrompt(mode, label), [
      itemUrl,
      await templateUrl(HEADWEAR_BASE_PATH),
    ])
  } else {
    stagedUrl = await falEditCompose(buildFlatPrompt(category, label), [itemUrl])
  }
  const stagedBuf = await fetchToBuffer(stagedUrl)
  await devDump(`refine-staged-${category}.png`, stagedBuf)
  console.log(`[${tag}] flux-edit ${mode} (${Date.now() - tEdit}ms)`)

  // Step 2b — bg-remove + decontaminate.
  const tRembg = Date.now()
  const rembgUrl = await falRemoveBackground(stagedUrl)
  const rembgPng = await fetchToBuffer(rembgUrl)
  const decontaminated = await decontaminate(rembgPng, stagedBuf)
  await devDump(`refine-decon-${category}.png`, decontaminated)
  console.log(`[${tag}] rembg+decontam (${Date.now() - tRembg}ms)`)

  // Step 2c — uniform canvas placement.
  const finalPng = await placeOnUniformCanvas(decontaminated, category)
  await devDump(`refine-final-${category}.png`, finalPng)

  const url = await uploadBufferToFal(finalPng, `refined-${category}.png`, 'image/png')
  console.log(`[${tag}] done (${Date.now() - t0}ms)`)
  return url
}

// ──────────────────────────────────────────────────────────────────────────
// composite — two-phase avatar dressing (faithful port of dress-avatar.ts)
// ──────────────────────────────────────────────────────────────────────────

const VTON_MODEL = 'fal-ai/cat-vton'

const COMPOSITE_TIMEOUT_MS = 180_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)
    promise.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

// biome-ignore lint/suspicious/noExplicitAny: fal queue update shape varies by model
function makeQueueLogger(tag: string): (update: any) => void {
  // IN_QUEUE  = your request is queued at fal, not yet picked up by a worker.
  // IN_PROGRESS = a worker has picked it up and is generating.
  // Status changes log immediately; subsequent same-status updates throttle
  // to once per 10s so the dev terminal doesn't drown in IN_QUEUE spam.
  const HEARTBEAT_MS = 10_000
  let lastStatus: string | undefined
  let phaseStart = Date.now()
  let lastHeartbeat = 0
  return (update) => {
    const status = update?.status
    if (status !== 'IN_PROGRESS' && status !== 'IN_QUEUE') return
    if (status !== lastStatus) {
      lastStatus = status
      phaseStart = Date.now()
      lastHeartbeat = phaseStart
      console.log(
        `[fal:${tag}] ${status} ${status === 'IN_QUEUE' ? '(waiting for a worker — fal is busy)' : '(worker picked up — generating)'}`,
      )
      return
    }
    const now = Date.now()
    if (now - lastHeartbeat < HEARTBEAT_MS) return
    lastHeartbeat = now
    const elapsedSec = Math.round((now - phaseStart) / 1000)
    console.log(`[fal:${tag}] ${status} ${elapsedSec}s elapsed`)
  }
}

type CompositeSlot = 'base' | 'bottom' | 'outer' | 'footwear' | 'headwear'

const CATEGORY_TO_COMPOSITE_SLOT: Partial<Record<ItemCategory, CompositeSlot>> = {
  shirt: 'base',
  pants: 'bottom',
  jacket: 'outer',
  footwear: 'footwear',
  headwear: 'headwear',
}

const VTON_SLOT_TO_CLOTH: Partial<Record<CompositeSlot, 'upper' | 'lower' | 'overall'>> = {
  base: 'upper',
  bottom: 'lower',
}

const PHASE_A_ORDER: CompositeSlot[] = ['bottom', 'base']
const PHASE_B_SLOTS: ReadonlySet<CompositeSlot> = new Set(['outer', 'footwear', 'headwear'])

const PHASE_B_SLOT_CLAUSES: Record<CompositeSlot, (idx: number) => string> = {
  base: (i) =>
    `Image ${i} is a BASE-LAYER top garment (t-shirt, blouse, sweater, dress, etc.). REMOVE the plain white t-shirt from image 1 entirely and replace it with this garment, draped naturally on the body in three dimensions — fabric wraps around the torso, sleeves wrap around the arms, with realistic folds and shading. Match the neckline, sleeve length, hem position, and overall silhouette to what is shown in image ${i}. Do not render this garment as a flat 2D panel pasted on the body.`,
  outer: (i) =>
    `Image ${i} is an OUTER-LAYER garment (jacket, coat, cardigan, blazer, etc.). Add this garment OVER whatever upper-body garment is now present in image 1, draped naturally in three dimensions — collar, lapels, sleeves, and hem matching what is shown in image ${i}. If the outer is open in image ${i}, leave it open in the output and let the inner upper-body garment show through. Do not render this garment as a flat 2D panel.`,
  bottom: (i) =>
    `Image ${i} is a BOTTOM garment (pants, shorts, skirt, etc.). REMOVE the plain white shorts from image 1 entirely and replace them with this garment. The garment wraps fully around the lower body in three dimensions — both legs are completely covered by fabric, with no see-through. The LENGTH of the new garment must match the LENGTH shown in image ${i}.`,
  footwear: (i) =>
    `Image ${i} is FOOTWEAR (shoes, sneakers, boots, sandals, etc.). Add this footwear to the figure's bare feet in image 1, with both feet wearing the same pair, properly fitted, and rendered in three dimensions. Do not leave the feet bare.`,
  headwear: (i) =>
    `Image ${i} is HEADWEAR (hat, cap, beanie, etc.). Add this headwear to the figure's head in image 1, sitting naturally on top of the hair without crushing or removing it.`,
}

const PHASE_B_DRAPE_CLAUSE = `Render each new garment with realistic fabric drape, shadows, and folds appropriate to its shape and material as shown in its source image. Match the cut shown in each source: if the source shows a relaxed-fit garment, drape it loosely; if fitted, drape it close to the body. Do not idealize or alter the cut.`

// Single-call try-on: feed flux-edit the avatar (image 1) and the original
// inspiration photo (image 2) and have it transfer the outfit. Cheap,
// ~30-60s, no need for SAM2 / hanger renders / CatVTON. Identity is locked
// by the head-preservation clauses copied from dress-avatar.ts phase B.
// Re-export so existing imports (`from '@/.../steal-the-look-pipeline'`)
// keep working. The actual definition lives in tryon-prompt.ts so CLI
// scripts can import the prompt without pulling in this file's
// db/env-bound transitive imports.
export { TRYON_PROMPT } from './tryon-prompt'

import { TRYON_PROMPT } from './tryon-prompt'

export async function tryOnFromInspiration(
  avatarUrl: string,
  inspirationUrl: string,
): Promise<string> {
  ensureFalConfigured()
  // fal can't pull from localhost; rehost the seeded default avatar to fal
  // storage on first use. Inspiration is already a fal URL.
  const reachableAvatar = await ensureFalReachableUrl(avatarUrl)
  console.log('[steal-the-look] tryon submitting (avatar + inspiration)')
  const stepStart = Date.now()

  let result: Awaited<ReturnType<typeof fal.subscribe>>
  try {
    result = await withTimeout(
      fal.subscribe(EDIT_MODEL, {
        input: {
          prompt: TRYON_PROMPT,
          image_urls: [reachableAvatar, inspirationUrl],
          num_images: 1,
          image_size: { width: 832, height: 1248 },
          // biome-ignore lint/suspicious/noExplicitAny: type too narrow for runtime accept
          output_format: 'png' as any,
          // biome-ignore lint/suspicious/noExplicitAny: see above
        } as any,
        logs: true,
        onQueueUpdate: makeQueueLogger('flux-edit:tryon'),
      }),
      COMPOSITE_TIMEOUT_MS,
      'flux-edit:tryon',
    )
  } catch (err) {
    // Surface fal's validation detail (which is an array of {loc, msg, type}
    // objects) so we can see what was rejected.
    // biome-ignore lint/suspicious/noExplicitAny: fal error shape is loose
    const e = err as any
    if (e?.body?.detail) {
      console.error(
        '[steal-the-look] tryon fal validation detail:',
        JSON.stringify(e.body.detail, null, 2),
      )
    }
    throw err
  }

  // biome-ignore lint/suspicious/noExplicitAny: fal subscribe response shape isn't typed
  const data = result.data as any
  const stagedUrl: string | undefined = data?.images?.[0]?.url ?? data?.image?.url
  if (!stagedUrl) {
    console.error('[steal-the-look] tryon returned no URL:', data)
    throw new Error('try-on returned no image URL')
  }
  console.log(`[steal-the-look] tryon ${Date.now() - stepStart}ms`)

  // Background remove + decontaminate so the hero card doesn't carry the
  // inspiration's studio backdrop into the Try On view. Same pipeline as
  // refine: bria for the alpha cut, then reverse-blend edge pixels using
  // the corner colors of the staged image.
  const tBg = Date.now()
  const stagedBuf = await fetchToBuffer(stagedUrl)
  const rembgUrl = await falRemoveBackground(stagedUrl)
  const rembgPng = await fetchToBuffer(rembgUrl)
  const decontaminated = await decontaminate(rembgPng, stagedBuf)
  const finalUrl = await uploadBufferToFal(decontaminated, 'tryon-final.png', 'image/png')
  console.log(`[steal-the-look] tryon rembg+decontam (${Date.now() - tBg}ms)`)

  await devDump('tryon-staged.png', stagedBuf)
  await devDump('tryon-final.png', decontaminated)

  return finalUrl
}

const PHASE_B_SCENE_CLAUSE = `Preserve from image 1: pose, body orientation, contrapposto stance, camera angle, framing (full body visible head to feet), lighting, and background. Photorealistic, sharp focus, no text, no watermarks.`

/**
 * CatVTON expects a flat-background garment image. Sample the average opaque
 * luminance of the refined garment and pick a contrasting flat bg, then
 * upload the flattened version. Mirrors the script's `toFalUrlFlattened`.
 */
async function flattenForVton(refinedUrl: string): Promise<string> {
  const buf = await fetchToBuffer(refinedUrl)
  const { data } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let sumL = 0
  let count = 0
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] ?? 0) < 128) continue
    const r = data[i] ?? 0
    const g = data[i + 1] ?? 0
    const b = data[i + 2] ?? 0
    sumL += 0.299 * r + 0.587 * g + 0.114 * b
    count++
  }
  const avgL = count > 0 ? sumL / count : 128

  // garment lum > 200 (near-white) → mid-grey bg; else white bg.
  const bg = avgL > 200 ? { r: 96, g: 96, b: 96 } : { r: 255, g: 255, b: 255 }
  const flat = await sharp(buf).flatten({ background: bg }).png().toBuffer()
  return await uploadBufferToFal(flat, 'garment-flat.png', 'image/png')
}

export type CompositeInput = {
  /** Refined item URL (output of refineItem). */
  itemUrl: string
  category: ItemCategory
}

/**
 * Dress the avatar with the refined garments. Returns the final hero URL.
 *
 * Two-phase pipeline:
 *   Phase A — iterative CatVTON for base/bottom (cloth_type=upper/lower).
 *   Phase B — single flux-edit pass for outer/footwear/headwear, layering
 *             onto Phase A's output without disturbing identity.
 *
 * Items whose category does not map to a composite slot (bag, scarf,
 * accessory) are skipped.
 */
export async function compositeAvatar(avatarUrl: string, items: CompositeInput[]): Promise<string> {
  ensureFalConfigured()

  type SlottedItem = { itemUrl: string; category: ItemCategory; slot: CompositeSlot }
  const slotted: SlottedItem[] = []
  for (const it of items) {
    const slot = CATEGORY_TO_COMPOSITE_SLOT[it.category]
    if (slot) slotted.push({ ...it, slot })
  }

  const phaseA = PHASE_A_ORDER.flatMap((s) => slotted.filter((i) => i.slot === s))
  const phaseB = slotted.filter((i) => PHASE_B_SLOTS.has(i.slot))
  console.log(
    `[steal-the-look] composite start: phaseA=[${phaseA.map((i) => i.slot).join(',') || '-'}] phaseB=[${phaseB.map((i) => i.slot).join(',') || '-'}]`,
  )

  let currentPersonUrl = avatarUrl

  // ── Phase A: iterative CatVTON ────────────────────────────────────────
  for (const item of phaseA) {
    const clothType = VTON_SLOT_TO_CLOTH[item.slot]
    if (!clothType) continue
    const garmentUrl = await flattenForVton(item.itemUrl)
    const stepStart = Date.now()
    console.log(`[steal-the-look] vton:${item.slot} submitting`)
    const result = await withTimeout(
      fal.subscribe(VTON_MODEL, {
        input: {
          human_image_url: currentPersonUrl,
          garment_image_url: garmentUrl,
          cloth_type: clothType,
        },
        logs: true,
        onQueueUpdate: makeQueueLogger('cat-vton'),
      }),
      COMPOSITE_TIMEOUT_MS,
      `cat-vton:${item.slot}`,
    )
    // biome-ignore lint/suspicious/noExplicitAny: fal subscribe response shape isn't typed
    const data = result.data as any
    const url: string | undefined = data?.image?.url ?? data?.images?.[0]?.url
    if (!url) {
      console.error('[steal-the-look] CatVTON returned no URL:', data)
      throw new Error('CatVTON returned no image URL')
    }
    console.log(`[steal-the-look] vton:${item.slot} ${Date.now() - stepStart}ms`)
    currentPersonUrl = url
  }

  // ── Phase B: single flux-edit layering pass ──────────────────────────
  if (phaseB.length === 0) {
    return currentPersonUrl
  }

  const phaseBClauses = phaseB
    .map((item, idx) => PHASE_B_SLOT_CLAUSES[item.slot](idx + 2))
    .join(' ')

  const phaseBPrompt = `DO NOT TOUCH THE HEAD: the entire head region of image 1 — face, eyes, nose, mouth, jawline, cheeks, ears, hair (every strand, the full volume and shape), beard, mustache, stubble, neck — must be preserved BIT FOR BIT IDENTICAL to image 1. Copy the head region from image 1 to the output unchanged. Do NOT regenerate the face. Do NOT redraw any facial feature. Do NOT modify the hair in any way.

PRESERVE EXISTING GARMENTS: any clothing already worn by the person in image 1 (t-shirt, dress, pants, shorts, etc.) must remain UNCHANGED in color, shape, fit, and fabric. Do NOT replace, recolor, or alter any garment already present.

ONLY EDIT: add the following accessory garments ON TOP of the existing image without altering anything else. ${phaseBClauses}

${PHASE_B_DRAPE_CLAUSE}

${PHASE_B_SCENE_CLAUSE}`

  const imageUrls = [currentPersonUrl, ...phaseB.map((i) => i.itemUrl)]
  const stepStart = Date.now()
  console.log(`[steal-the-look] layer submitting (${imageUrls.length} images)`)
  const result = await withTimeout(
    fal.subscribe(EDIT_MODEL, {
      input: {
        prompt: phaseBPrompt,
        image_urls: imageUrls,
        // Lower guidance so the input image (with the user's face from Phase A)
        // dominates over the prompt — see dress-avatar.ts for rationale.
        guidance_scale: 1.5,
        num_images: 1,
        image_size: { width: 832, height: 1248 },
        // biome-ignore lint/suspicious/noExplicitAny: type too narrow for runtime accept
        output_format: 'png' as any,
        enable_safety_checker: false,
        // biome-ignore lint/suspicious/noExplicitAny: see above
      } as any,
      logs: true,
      onQueueUpdate: makeQueueLogger('flux-edit'),
    }),
    COMPOSITE_TIMEOUT_MS,
    'flux-edit:layer',
  )
  // biome-ignore lint/suspicious/noExplicitAny: fal subscribe response shape isn't typed
  const data = result.data as any
  const url: string | undefined = data?.images?.[0]?.url
  if (!url) {
    console.error('[steal-the-look] phase-B flux-edit returned no URL:', data)
    throw new Error('flux-edit returned no image URL')
  }
  console.log(`[steal-the-look] layer ${Date.now() - stepStart}ms`)
  return url
}
