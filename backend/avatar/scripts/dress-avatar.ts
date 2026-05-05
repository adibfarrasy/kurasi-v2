/**
 * Dresses the user's default avatar in selected wardrobe items, producing
 * the final try-on render that the app stores as OutfitRender.rendered_url.
 *
 * Inputs:
 *   - The user's default avatar (from normalize-user.ts) — the user wearing
 *     plain white t-shirt + plain white shorts, in the canonical pose.
 *   - 1-5 cleaned garment images (from cleanup-clothing.ts) with their
 *     categories. Each garment slot maps onto the avatar's plain outfit:
 *     "base" replaces the white tee, "bottom" replaces the white shorts,
 *     "outer" layers over the base, "headwear" sits on the head, "footwear"
 *     covers the bare feet.
 *
 * Pipeline:
 *   - Single fal seedream/v5/lite/edit call with
 *     image_urls = [avatar, ...garments]. Per-image prompt clauses
 *     describe each garment's slot. No segmentation, no local
 *     compositing, no CatVTON queue.
 *
 * Usage:
 *   FAL_KEY=... bun backend/avatar/scripts/dress-avatar.ts <user-key> \
 *     --avatar <path-or-url> \
 *     --garment <path-or-url>:<slot> [--garment ...] \
 *     [--out <name>]
 *
 * <slot> is one of: headwear, base, outer, bottom, footwear.
 *
 * Example:
 *   bun backend/avatar/scripts/dress-avatar.ts adib \
 *     --avatar backend/outputs/default-avatar-adib.png \
 *     --garment "clothing articles/tees/blue-tee.png:base" \
 *     --garment "clothing articles/pants/khakis.png:bottom" \
 *     --garment "clothing articles/shoes/sneakers.png:footwear"
 *
 * Output:
 *   backend/outputs/tryon-<user-key>[-<out>].png
 */

import path from 'node:path'
import { fal } from '@fal-ai/client'
import fs from 'fs/promises'
import sharp from 'sharp'
import { SLOT_CLAUSES } from '../services/dress-avatar-pipeline'
import { TRYON_PROMPT } from '../services/tryon-prompt'

// Both passes use seedream — it preserves the requested 832x1248
// canvas (nano-banana doesn't accept image_size and the 1:1 / 3:4
// canvases it returns instead don't fit our hero crop).
const PASS1_MODEL = 'fal-ai/bytedance/seedream/v5/lite/edit'
const PASS2_MODEL = 'fal-ai/bytedance/seedream/v5/lite/edit'
const REMBG_MODEL = 'fal-ai/bria/background/remove'

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
  let br = 0,
    bg = 0,
    bb = 0
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

const SLOTS = ['headwear', 'base', 'outer', 'bottom', 'footwear'] as const
type Slot = (typeof SLOTS)[number]

const FIT_PROFILES = ['skinny', 'regular', 'relaxed', 'oversize'] as const
type FitProfile = (typeof FIT_PROFILES)[number]

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
type GarmentLength = (typeof GARMENT_LENGTHS)[number]

type Garment = {
  pathOrUrl: string
  slot: Slot
  fit: FitProfile | null
  length: GarmentLength | null
}

const args = process.argv.slice(2)
const userKey = args.find((a) => !a.startsWith('--'))

const avatarIdx = args.indexOf('--avatar')
const avatarArg = avatarIdx >= 0 ? args[avatarIdx + 1] : undefined

const outIdx = args.indexOf('--out')
const outArg = outIdx >= 0 ? args[outIdx + 1] : undefined

// --garment format: `<path-or-url>:<slot>[:<fit>][:<length>]`
//   slot   one of SLOTS (headwear / base / outer / bottom / footwear)
//   fit    one of FIT_PROFILES (skinny / regular / relaxed / oversize)
//   length one of GARMENT_LENGTHS (cropped / waist / … / full-length)
//
// Paths can contain colons (e.g. a URL with a port), so the parser
// scans from the right and uses the first known slot value as the
// pivot — anything before is the path, anything after is fit/length.
const garments: Garment[] = []
for (let i = 0; i < args.length; i++) {
  if (args[i] !== '--garment') continue
  const v = args[i + 1]
  if (!v) continue
  const parts = v.split(':')
  let slotIdx = -1
  for (let j = parts.length - 1; j >= 1; j--) {
    if (SLOTS.includes(parts[j] as Slot)) {
      slotIdx = j
      break
    }
  }
  if (slotIdx < 0) {
    console.error(
      `--garment expects "<path>:<slot>[:fit][:length]", missing slot in "${v}". Slots: ${SLOTS.join(', ')}`,
    )
    process.exit(1)
  }
  const pathOrUrl = parts.slice(0, slotIdx).join(':')
  const slot = parts[slotIdx] as Slot
  const after = parts.slice(slotIdx + 1)
  const fitArg = after[0]
  const lengthArg = after[1]
  if (fitArg && !FIT_PROFILES.includes(fitArg as FitProfile)) {
    console.error(`Invalid fit "${fitArg}". Must be one of ${FIT_PROFILES.join(', ')}.`)
    process.exit(1)
  }
  if (lengthArg && !GARMENT_LENGTHS.includes(lengthArg as GarmentLength)) {
    console.error(`Invalid length "${lengthArg}". Must be one of ${GARMENT_LENGTHS.join(', ')}.`)
    process.exit(1)
  }
  garments.push({
    pathOrUrl,
    slot,
    fit: (fitArg as FitProfile) ?? null,
    length: (lengthArg as GarmentLength) ?? null,
  })
}

if (!userKey || !avatarArg || garments.length === 0) {
  console.error(
    `Usage: bun ${process.argv[1]} <user-key> --avatar <path-or-url> --garment <path-or-url>:<slot> [--garment ...] [--out <name>]`,
  )
  process.exit(1)
}
if (garments.length > 5) {
  console.error(`At most 5 garments. Got ${garments.length}.`)
  process.exit(1)
}
// One garment per slot.
const seen = new Set<Slot>()
for (const g of garments) {
  if (seen.has(g.slot)) {
    console.error(`Duplicate slot "${g.slot}". Each slot can carry one garment.`)
    process.exit(1)
  }
  seen.add(g.slot)
}

await fs.mkdir('backend/outputs', { recursive: true })

async function fetchToBuffer(url: string): Promise<Buffer> {
  return Buffer.from(await (await fetch(url)).arrayBuffer())
}

async function toFalUrl(input: string): Promise<string> {
  if (input.startsWith('http://') || input.startsWith('https://')) return input
  const buf = await fs.readFile(input)
  const ext = input.toLowerCase().split('.').pop() ?? 'png'
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'
  const file = new File([new Uint8Array(buf)], path.basename(input), {
    type: mime,
  })
  return await fal.storage.upload(file)
}

function fmtMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s (${ms}ms)`
}

// Faceless mannequin used as Pass 1's image 1. Picked specifically so
// it looks NOTHING like the user's avatar — Pass 2's "image 2 = outfit
// only" instruction is much more reliable when image 2 doesn't depict
// a similar person to image 1.
const POSE_MANNEQUIN_PATH = path.join(import.meta.dir, '../assets/pose.png')

const totalStart = Date.now()
console.log(`Uploading avatar + mannequin + ${garments.length} garment(s)...`)
const uploadStart = Date.now()
const avatarUrl = await toFalUrl(avatarArg)
const mannequinUrl = await toFalUrl(POSE_MANNEQUIN_PATH)
// All garments uploaded with their alpha intact — seedream-edit
// handles transparent garment cutouts and benefits from clean edges.
const garmentUrls = await Promise.all(garments.map((g) => toFalUrl(g.pathOrUrl)))
console.log(`[upload] ${fmtMs(Date.now() - uploadStart)}`)

// ─── Build the prompt ─────────────────────────────────────────────────────
//
// SLOT_CLAUSES is imported from the service so the script and the
// runtime pipeline stay in lockstep. Image 1 in Pass 1 is the
// mannequin; images 2..N are garments, one per slot.

const drapeClause = `Render each new garment with realistic fabric drape, shadows, and folds appropriate to its shape and material as shown in its source image. Match the cut shown in each source: if the source shows a relaxed-fit garment, drape it loosely; if fitted, drape it close to the body. Do not idealize or alter the cut.`

// Pass 1 dresses a faceless mannequin (image 1) so Pass 2 has a clean
// outfit reference to harvest. Identity/skin-tone/pose are intentionally
// NOT locked here — Pass 2 re-anchors those from the original avatar.
const pass1SceneClause = `Preserve from image 1: camera angle, framing (full body visible head to feet), and overall figure proportions. Photorealistic, sharp focus, no text, no watermarks. Plain studio lighting.`

// Pass 2 reuses the steal-the-look TRYON_PROMPT verbatim — image 1 is
// the original avatar (identity/pose source), image 2 is Pass 1's
// output (outfit source). Single source of truth lives in
// steal-the-look-pipeline.ts; tweaking the prompt there improves both
// flows simultaneously.

// ─── Single seedream-edit call ────────────────────────────────────────────
//
// One seedream/v5/lite/edit pass with image_urls = [avatar, ...garments].
// Per-image clauses tell the model which slot each garment fills and how
// it interacts with the avatar's placeholder white tee + white shorts.
const editStart = Date.now()

const slotClauses = garments
  .map((g, idx) => SLOT_CLAUSES[g.slot](idx + 2, { fit: g.fit, length: g.length }))
  .join(' ')

// Without these "DO NOT INVENT" clauses for absent slots, the model
// reads the placeholder shoes/socks visible on the mannequin in
// pose.png as part of the outfit and adds them to the output.
const presentSlots = new Set(garments.map((g) => g.slot))
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

// ─── Pass 1: compose the outfit on the mannequin ─────────────────────────
//
// Image 1 = faceless mannequin in white tee + white shorts (pose.png).
// We use it instead of the user's avatar so Pass 2's image 2 looks
// distinctly like an outfit reference, not a near-clone of image 1.
//
// Tee-tuck guard: pose.png has hands resting at the hip / pocket area,
// which seedream interprets as "tee tucked into pants" and renders an
// asymmetric fold across the front. Explicitly force the tee untucked.
const pass1Prompt = `DRESS THE MANNEQUIN: image 1 shows a faceless mannequin wearing a plain white t-shirt and plain white shorts as placeholders. Replace those placeholders with the garments described below. If a garment slot is not provided (e.g. no base, no bottom), keep the corresponding placeholder garment as-is. The mannequin has no face — keep it that way; do not add a face. ${slotClauses}${absenceClause}

GARMENT FIT: the base-layer top hangs straight down from the shoulders to the hip, FULLY UNTUCKED, OUTSIDE the bottom garment's waistband — no tucking, no asymmetric bunching, no awkward folds at the waist. The bottom garment's waistband sits at the natural waist or hip and is COVERED by the base-layer top's hem. Any outer layer drapes naturally over the untucked base-layer.

${drapeClause}

${pass1SceneClause}`

const pass1ImageUrls = [mannequinUrl, ...garmentUrls]
console.log(
  `\n[pass1] Submitting to ${PASS1_MODEL} (${pass1ImageUrls.length} images, slots: ${garments.map((g) => g.slot).join(', ')})...`,
)
const pass1Start = Date.now()
let pass1Result
try {
  pass1Result = await fal.subscribe(PASS1_MODEL, {
    input: {
      prompt: pass1Prompt,
      image_urls: pass1ImageUrls,
      num_images: 1,
      image_size: { width: 832, height: 1248 },
    },
    logs: false,
  })
} catch (err: any) {
  console.error('[pass1] fal request failed.')
  if (err?.status) console.error(`  status: ${err.status}`)
  if (err?.body) console.error(`  body: ${JSON.stringify(err.body, null, 2)}`)
  if (err?.requestId) console.error(`  requestId: ${err.requestId}`)
  console.error(`  prompt length: ${pass1Prompt.length} chars`)
  throw err
}
const pass1Data = pass1Result.data as any
const pass1Url = (pass1Data?.images?.[0]?.url ?? pass1Data?.image?.url) as string | undefined
if (!pass1Url) {
  console.error('[pass1] No output URL', pass1Data)
  process.exit(1)
}
console.log(`[pass1] ${fmtMs(Date.now() - pass1Start)}: ${pass1Url}`)

// ─── Pass 2: lock identity / pose using the original avatar ──────────────
//
// Two-image call (avatar + Pass 1 output) — same shape as the
// steal-the-look tryOnFromInspiration. nano-banana (gemini-2.5 flash
// image edit) tends to follow identity-preservation instructions more
// literally than seedream when given two inputs.
//
// Pass 2 prompt is the shared TRYON_PROMPT — the headwear-orientation
// clause is part of it now so steal-the-look's tryOnFromInspiration
// gets the same benefit.
const pass2Prompt = TRYON_PROMPT

console.log(`\n[pass2] Submitting to ${PASS2_MODEL} (2 images, anchored on avatar)...`)
const pass2Start = Date.now()
let pass2Result
try {
  pass2Result = await fal.subscribe(PASS2_MODEL, {
    input: {
      prompt: pass2Prompt,
      image_urls: [avatarUrl, pass1Url],
      num_images: 1,
      image_size: { width: 832, height: 1248 },
    },
    logs: false,
  })
} catch (err: any) {
  console.error('[pass2] fal request failed.')
  if (err?.status) console.error(`  status: ${err.status}`)
  if (err?.body) console.error(`  body: ${JSON.stringify(err.body, null, 2)}`)
  if (err?.requestId) console.error(`  requestId: ${err.requestId}`)
  throw err
}
const pass2Data = pass2Result.data as any
const tryonUrl = (pass2Data?.images?.[0]?.url ?? pass2Data?.image?.url) as string | undefined
if (!tryonUrl) {
  console.error('[pass2] No output URL', pass2Data)
  process.exit(1)
}
console.log(`[pass2] ${fmtMs(Date.now() - pass2Start)}: ${tryonUrl}`)
console.log(`\n[tryon] Final composition complete in ${fmtMs(Date.now() - editStart)}.`)

const suffix = outArg ? `-${outArg}` : ''

// Save Pass 1's intermediate so we can inspect the outfit composition
// independently of Pass 2's identity/pose re-anchoring.
const pass1Path = `backend/outputs/tryon-${userKey}${suffix}-pass1.png`
await fs.writeFile(pass1Path, await fetchToBuffer(pass1Url))
console.log(`[tryon] Saved ${pass1Path}`)

const rawPath = `backend/outputs/tryon-${userKey}${suffix}-raw.png`
const rawBuf = await fetchToBuffer(tryonUrl)
await fs.writeFile(rawPath, rawBuf)
console.log(`[tryon] Saved ${rawPath}`)

// ─── Background removal ──────────────────────────────────────────────────
console.log(`\n[rembg] Submitting to ${REMBG_MODEL}...`)
const rembgStart = Date.now()
const rembgResult = await fal.subscribe(REMBG_MODEL, {
  input: { image_url: tryonUrl },
  logs: false,
})
const rembgData = rembgResult.data as any
const cleanUrl: string | undefined = rembgData?.image?.url ?? rembgData?.images?.[0]?.url
if (!cleanUrl) {
  console.error('[rembg] No bg-removal URL', rembgData)
  process.exit(1)
}
console.log(`[rembg] ${fmtMs(Date.now() - rembgStart)}: ${cleanUrl}`)

const rembgPng = await fetchToBuffer(cleanUrl)
const decontaminated = await decontaminate(rembgPng, rawBuf)
const outPath = `backend/outputs/tryon-${userKey}${suffix}.png`
await fs.writeFile(outPath, decontaminated)
console.log(`[rembg] Saved ${outPath} (transparent, edge-decontaminated)`)

console.log(
  `\n[total] ${fmtMs(Date.now() - totalStart)} (pass1=${PASS1_MODEL}, pass2=${PASS2_MODEL})`,
)
