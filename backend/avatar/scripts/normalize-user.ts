/**
 * Bakes a user's default avatar from their uploaded body photo.
 *
 * The default avatar is the canonical "this is you" image: the user in a
 * fixed pose, wearing a plain white t-shirt and plain white shorts, on a
 * neutral studio background. It is shown on the try-on page in the empty
 * state and on the user's profile, and it is the base image fed into the
 * try-on render (dress-avatar.ts) where the white plain outfit is swapped
 * for the user's selected wardrobe items.
 *
 * Pipeline:
 *   1. fal flux-2/flash/edit on (user body photo, gender-specific pose
 *      reference). The pose ref dictates pose/framing/lighting only — the
 *      output figure must match the user's face, hair, skin tone, and body
 *      build from the body photo, dressed in plain white tee + white shorts.
 *   2. fal bria background/remove + edge decontamination, producing a
 *      transparent PNG that the rest of the pipeline can compose against
 *      any background.
 *
 * Two fal calls per user. Re-runnable: re-uploading a body photo just
 * runs this script again.
 *
 * Usage:
 *   FAL_KEY=... bun backend/avatar/scripts/normalize-user.ts <user-key> \
 *     --body <path-or-url> --gender masc|femme
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fal } from '@fal-ai/client'
import sharp from 'sharp'

/**
 * Removes light-bg color contamination from a matte's edge pixels.
 * Most rembg models (birefnet, bria) produce correct alpha but leave the
 * source background color baked into the RGB of semi-transparent edge
 * pixels. Composited on white, that bleeds as a light halo (very visible
 * on dark hair).
 *
 * For each pixel with α < 1, we recover the true foreground RGB by
 * subtracting the known background contribution:
 *   composite = α·fg + (1−α)·bg   ⇒   fg = (composite − (1−α)·bg) / α
 *
 * `bg` is sampled from the corners of the raw (pre-removal) image.
 */
async function decontaminate(rembgPng: Buffer, rawPng: Buffer): Promise<Buffer> {
  const raw = sharp(rawPng).ensureAlpha()
  const { data: rawData, info: rawInfo } = await raw.raw().toBuffer({ resolveWithObject: true })
  // Average the four corners (a few pixels in) for a robust bg sample.
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

  const matte = sharp(rembgPng).ensureAlpha()
  const { data, info } = await matte.raw().toBuffer({ resolveWithObject: true })
  const out = Buffer.from(data) // copy
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

const EDIT_MODEL = 'fal-ai/flux-2/flash/edit'
const REMBG_MODEL = 'fal-ai/bria/background/remove'

const args = process.argv.slice(2)
const userKey = args.find((a) => !a.startsWith('--'))
const bodyIdx = args.indexOf('--body')
const bodyArg = bodyIdx >= 0 ? args[bodyIdx + 1] : undefined
const genderIdx = args.indexOf('--gender')
const genderArg = genderIdx >= 0 ? args[genderIdx + 1] : undefined
const heightIdx = args.indexOf('--height-cm')
const heightArg = heightIdx >= 0 ? args[heightIdx + 1] : undefined
const weightIdx = args.indexOf('--weight-kg')
const weightArg = weightIdx >= 0 ? args[weightIdx + 1] : undefined

if (!userKey || !bodyArg || (genderArg !== 'masc' && genderArg !== 'femme')) {
  console.error(
    `Usage: bun ${process.argv[1]} <user-key> --body <path-or-url> --gender masc|femme [--height-cm <int>] [--weight-kg <int>]`,
  )
  process.exit(1)
}
const gender = genderArg as 'masc' | 'femme'

let heightCm: number | undefined
if (heightArg !== undefined) {
  const parsed = Number.parseInt(heightArg, 10)
  if (!Number.isFinite(parsed) || parsed < 130 || parsed > 220) {
    console.error(`--height-cm must be an integer between 130 and 220.`)
    process.exit(1)
  }
  heightCm = parsed
}

let weightKg: number | undefined
if (weightArg !== undefined) {
  const parsed = Number.parseInt(weightArg, 10)
  if (!Number.isFinite(parsed) || parsed < 30 || parsed > 200) {
    console.error(`--weight-kg must be an integer between 30 and 200.`)
    process.exit(1)
  }
  weightKg = parsed
}

const posePath = `backend/avatar/assets/pose-${gender}.png`
try {
  await fs.access(posePath)
} catch {
  console.error(`Pose reference not found at ${posePath}.`)
  process.exit(1)
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

const totalStart = Date.now()
console.log(`Loading body (${bodyArg}) and pose reference (${posePath})...`)
const [bodyUrl, poseUrl] = await Promise.all([toFalUrl(bodyArg), toFalUrl(posePath)])

// ─── Step 0: classify build from body photo ───────────────────────────────
//
// flux-2/flash/edit reliably regresses toward an average athletic build
// regardless of how strongly the build clause asserts otherwise. Running a
// quick vision-LLM classifier on the body photo first lets us inject an
// explicit build label into the prompt, which empirically cuts the
// regression noticeably. Cheap one-off call (gemini-flash via fal).

const BUILD_VALUES = ['lean', 'athletic', 'average', 'fuller', 'heavy'] as const
type Build = (typeof BUILD_VALUES)[number]

async function classifyBuild(): Promise<{ build: Build; notes: string }> {
  const dimsContext =
    heightCm !== undefined || weightKg !== undefined
      ? `Self-reported dimensions: ${heightCm !== undefined ? `${heightCm} cm tall` : ''}${heightCm !== undefined && weightKg !== undefined ? ', ' : ''}${weightKg !== undefined ? `${weightKg} kg` : ''}. Use these as a tiebreaker when the image is ambiguous, but do not let them override what is clearly visible.`
      : ''

  const prompt = `You are a body-build classifier. Classify the person in this photo on the lean–heavy spectrum, focusing on body fat distribution and overall mass (NOT clothing).

Categories:
- lean: low body fat, minimal soft tissue, narrow frame, no significant muscle bulk.
- athletic: low-to-moderate body fat with visible muscle definition, toned, V-taper or hourglass.
- average: typical adult build, neither lean nor heavy, soft tissue present but no obvious excess.
- fuller: carries noticeable extra weight, soft tissue clearly visible (belly, arms, thighs, face), no defined musculature.
- heavy: significantly higher body mass, pronounced soft tissue across torso and limbs.

${dimsContext}

If the photo is half-body, classify based on what's visible (torso, arms, face shape) and say so in your notes.

Reply in EXACTLY this format, no commentary:
build: <lean|athletic|average|fuller|heavy>
notes: <one short sentence describing the specific features that drove the classification — e.g. "visible belly, fuller arms, soft jawline" or "narrow shoulders, low body fat, defined collarbones">`

  const result = await fal.subscribe('fal-ai/any-llm/vision', {
    input: {
      model: 'google/gemini-flash-1.5',
      prompt,
      image_url: bodyUrl,
    },
    logs: false,
  })
  const text = String((result.data as any)?.output ?? '').trim()
  const buildLine = /build\s*:\s*(\w+)/i.exec(text)
  const notesLine = /notes\s*:\s*(.+)$/im.exec(text)
  const buildKeyword = buildLine?.[1]
  const build =
    buildKeyword !== undefined
      ? BUILD_VALUES.find((b) => buildKeyword.toLowerCase().includes(b))
      : undefined
  const notes = notesLine ? (notesLine[1]?.trim() ?? '') : ''
  if (!build) {
    console.warn(`[classify] couldn't parse build, defaulting to "average". Raw:\n${text}`)
  }
  return { build: build ?? 'average', notes }
}

console.log(`\n[classify] Submitting body photo to gemini-flash...`)
const classifyStart = Date.now()
const { build, notes } = await classifyBuild()
console.log(
  `[classify] (${Date.now() - classifyStart}ms) build=${build}${notes ? ` — ${notes}` : ''}`,
)

const BUILD_DIRECTIVES: Record<Build, string> = {
  lean: 'The person has a LEAN build: low body fat, minimal soft tissue, narrow frame, no significant muscle bulk. Render with narrow shoulders, slim limbs, flat abdomen, and visible bone structure (collarbones, jawline). Do NOT add muscle definition or athletic shaping.',
  athletic:
    'The person has an ATHLETIC build: low-to-moderate body fat with visible muscle definition. Render with toned arms, defined shoulders, slight V-taper (or hourglass for femme), and a flat abdomen. Muscle definition is appropriate but not exaggerated.',
  average:
    'The person has an AVERAGE build: typical adult, neither lean nor heavy, with soft tissue present but no obvious excess and no defined musculature. Render with a relaxed silhouette, no abs visible, no visible muscle striation, slight softness around the abdomen and arms.',
  fuller:
    'The person carries a FULLER build: noticeable extra weight, with soft tissue clearly visible across the belly, arms, thighs, and face. Render with a rounded abdomen (NOT flat), fuller arms, fuller thighs, softer jawline, and possibly a double chin or fuller cheeks. Do NOT slim, do NOT athleticize, do NOT add muscle definition. Preserve every roll and curve.',
  heavy:
    'The person has a HEAVY build: significantly higher body mass with pronounced soft tissue across torso and limbs. Render with a clearly rounded abdomen, fuller chest, fuller arms (visible upper-arm softness), fuller thighs, fuller face (double chin, fuller cheeks, softer jawline), and a wider overall silhouette. Do NOT slim under any circumstances.',
}
const buildDirective = BUILD_DIRECTIVES[build]
const buildNotesClause = notes
  ? `Specific features observed in image 1: ${notes}. Preserve these features in the output.`
  : ''

// ─── Step 1: bake the default avatar (pose-normalized, white plain outfit) ─
const sharedSkin = `CRITICAL skin tone consistency: sample the exact skin tone (hue, saturation, brightness, undertone) from the visible skin in image 1, then apply that EXACT same skin tone uniformly across all visible skin — face, neck, arms, hands, legs, and feet. The face skin and the body skin MUST be the SAME color, with no perceptible difference in warmth, saturation, or brightness. There must be no contrast or seam between the face and the body skin tone.`

const halfBodyClause = `If image 1 shows only the upper body (half-body shot), infer the lower body's shape and skin tone from the visible upper body — proportions consistent with the visible build — and pose the legs exactly like image 2.`

const sharedSuffix = `Photorealistic, sharp focus, no text, no watermarks. Plain seamless deep teal studio background, fully saturated solid color, distinct from any skin or hair tone, evenly lit with no gradient (no floor, no horizon, no shadow).`

// Optional self-reported dimensions help disambiguate build when image 1
// is a half-body shot or has ambiguous framing — flux otherwise tends to
// regress toward an average build. Image 1 stays authoritative for the
// shape it visibly shows; the dimensions only constrain the parts flux
// has to infer.
const dimsClauseParts: string[] = []
if (heightCm !== undefined) {
  dimsClauseParts.push(`The person is ${heightCm} cm tall`)
}
if (weightKg !== undefined) {
  dimsClauseParts.push(`weighs approximately ${weightKg} kg`)
}
const dimsClause = dimsClauseParts.length
  ? `Self-reported dimensions: ${dimsClauseParts.join(', ')}. Use these to inform overall body mass, limb thickness, and proportions where image 1 leaves them ambiguous (e.g. half-body shots, loose clothing). Image 1 remains authoritative for any build feature it visibly shows; do not contradict what is visible in image 1.`
  : ''

// Prompt structure note: flux-edit is heavily anchored by its input images,
// especially clothing. Long stacked negatives ("do not copy", "remove the
// blazer") are unreliable. The reliable lever is to lead with the target
// outfit as the PRIMARY subject of the description, with negatives placed
// directly adjacent to the positive specification (proximity matters).
// Identity and pose are described as constraints AFTER the outfit, not
// before.
const outfitClause = `OUTFIT (this is the most important part — override anything visible in either input image): the person is wearing ONLY a plain pure-white short-sleeve crew-neck cotton T-SHIRT (regular fit, hem at the hip, no graphics, no logos, no text, no pockets, no contrast trim, pure #ffffff matte cotton, OPAQUE thick fabric — the chest must read as a smooth flat white surface with no body contours showing through, NO nipple outline visible, NO see-through fabric, NO clinging, NO transparency) AND plain pure-white knee-length cotton SHORTS (regular fit, no graphics, no logos, no pockets, no contrast trim, pure #ffffff matte cotton, opaque thick fabric). Bare arms below the short sleeves. Bare lower legs below the shorts. Bare feet — no shoes, no socks. NO blazer. NO jacket. NO coat. NO sweater. NO hoodie. NO cardigan. NO long pants. NO jeans. NO trousers. If the input image 1 shows the person in a blazer, jacket, dark tee, or jeans, REMOVE every one of those garments and replace them with the plain white t-shirt and white shorts described above.`

const identityClause = `IDENTITY (from image 1): same face, same facial features, same skin tone, same hair (preserve original volume, length, style, color, hairline, parting), same eyebrows, same eyelashes, same facial hair (beard, mustache, stubble), same ears. The eyes are visible and unobstructed — NO glasses, NO sunglasses, NO eyewear of any kind on the face. If image 1 shows the person wearing glasses, REMOVE the glasses entirely so the bare eyes, eyebrows, and bridge of the nose are fully visible. NO earrings, NO necklaces, NO watches, NO bracelets, NO rings, NO hats, NO headbands, NO scarves, NO hair clips. Body build: ${buildDirective} ${buildNotesClause} ${dimsClause} The mouth is closed with lips pressed gently together (closed-mouth Mona Lisa smile, no teeth visible).`

const poseClause = `POSE & FRAMING (from image 2 only): same pose, same body orientation, same contrapposto stance, same camera angle, same lens, same framing (full body visible head to feet), same lighting. Do NOT copy image 2's clothing, build, face, or hair — those come from image 1.`

const prompt = `A full-body, photorealistic studio photograph of one person standing on a deep teal seamless background, eye-level shot, 85mm lens look.

${outfitClause}

${identityClause}

${poseClause}

${sharedSkin}

${halfBodyClause}

${sharedSuffix}`

console.log(`\n[base] Submitting to ${EDIT_MODEL}...`)
const editStart = Date.now()
const editResult = await fal.subscribe(EDIT_MODEL, {
  input: {
    prompt,
    guidance_scale: 2.5,
    image_size: { width: 832, height: 1248 },
    num_images: 1,
    enable_safety_checker: false,
    output_format: 'png',
    image_urls: [bodyUrl, poseUrl],
  },
  logs: false,
})
const editData = editResult.data as any
const baseUrl = editData?.images?.[0]?.url as string | undefined
if (!baseUrl) {
  console.error('[base] No output URL', editData)
  process.exit(1)
}
if (editData?.has_nsfw_concepts?.[0] === true) {
  console.warn(
    '[base] fal flagged this as NSFW. The image may be black; retry or rephrase the clothing clause.',
  )
}
console.log(`[base] generated (${Date.now() - editStart}ms): ${baseUrl}`)
const rawPath = `backend/outputs/default-avatar-raw-${userKey}.png`
await fs.writeFile(rawPath, await fetchToBuffer(baseUrl))
console.log(`[base] Saved ${rawPath}`)

// ─── Step 2: background removal ──────────────────────────────────────────
console.log(`\n[rembg] Submitting to ${REMBG_MODEL}...`)
const rembgResult = await fal.subscribe(REMBG_MODEL, {
  input: { image_url: baseUrl },
  logs: false,
})
const rembgData = rembgResult.data as any
const cleanUrl: string | undefined = rembgData?.image?.url ?? rembgData?.images?.[0]?.url
if (!cleanUrl) {
  console.error('[rembg] No bg-removal URL', rembgData)
  process.exit(1)
}
const cleanPath = `backend/outputs/default-avatar-${userKey}.png`
const rawPng = await fs.readFile(rawPath)
const rembgPng = await fetchToBuffer(cleanUrl)
const decontaminated = await decontaminate(rembgPng, rawPng)
await fs.writeFile(cleanPath, decontaminated)
console.log(`[rembg] Saved ${cleanPath} (with edge decontamination)`)

console.log(`\nTotal: ${Date.now() - totalStart}ms`)
