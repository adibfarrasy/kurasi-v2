/**
 * Server-side port of backend/avatar/scripts/normalize-user.ts.
 *
 * Bakes the user's default avatar from their uploaded body photo using
 * the same pipeline as the CLI script — gemini build classification →
 * flux-edit pose normalization → bria background removal → edge
 * decontamination. Returns a fal URL pointing to the final transparent
 * PNG. Designed for the onboarding background job.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fal } from '@fal-ai/client'
import sharp from 'sharp'

// Matches dress-avatar-pipeline.ts. seedream handles multi-image edits
// (pose ref + identity ref) and identity preservation far better than
// flux-edit, which mixes attributes globally and produces "vaguely
// similar face with invented hair" outputs.
const EDIT_MODEL = 'fal-ai/bytedance/seedream/v5/lite/edit'
// Final face-swap pass. seedream produces a face similar to the
// reference but not pixel-accurate; this composits the user's actual
// face onto seedream's body. Using fal-ai/face-swap (insightface-style)
// because the previous `easel-ai/advanced-face-swap` was taking ~5min
// per image (it bundles unnecessary upscale + enhancement steps).
// Basic swap is enough — seedream already produced the final-quality
// scene; we just need pixel-accurate identity composited in.
const FACESWAP_MODEL = 'fal-ai/face-swap'
const REMBG_MODEL = 'fal-ai/bria/background/remove'
// Resolve relative to this source file (not process.cwd) so the server
// works regardless of where it was launched from. Same convention used
// by sibling pipelines (dress-avatar-pipeline.ts, steal-the-look-pipeline.ts).
const POSE_ASSET = path.join(import.meta.dir, '..', 'assets', 'default_man.png')

const BUILD_VALUES = ['lean', 'athletic', 'average', 'fuller', 'heavy'] as const
type Build = (typeof BUILD_VALUES)[number]

export type NormalizeAvatarPhase =
  | 'classify'
  | 'pass1'
  | 'pass2'
  | 'faceswap'
  | 'rembg'
  | 'finalize'

export type NormalizeAvatarInput = {
  bodyImage: Buffer
  bodyMimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  gender: 'masc' | 'femme'
  heightCm?: number
  weightKg?: number
  onPhase?: (phase: NormalizeAvatarPhase) => void
}

export type NormalizeAvatarResult = { avatarUrl: string }

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

async function decontaminate(rembgPng: Buffer, rawPng: Buffer): Promise<Buffer> {
  const raw = sharp(rawPng).ensureAlpha()
  const { data: rawData, info: rawInfo } = await raw.raw().toBuffer({ resolveWithObject: true })
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

  const matte = sharp(rembgPng).ensureAlpha()
  const { data, info } = await matte.raw().toBuffer({ resolveWithObject: true })
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

async function bufferToFalUrl(buf: Buffer, mime: string, name: string): Promise<string> {
  const file = new File([new Uint8Array(buf)], name, { type: mime })
  return await fal.storage.upload(file)
}

async function fetchToBuffer(url: string): Promise<Buffer> {
  return Buffer.from(await (await fetch(url)).arrayBuffer())
}

async function classifyBuild(
  bodyUrl: string,
  heightCm: number | undefined,
  weightKg: number | undefined,
): Promise<{ build: Build; notes: string }> {
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
notes: <one short sentence describing the specific features that drove the classification>`

  const result = await fal.subscribe('fal-ai/any-llm/vision', {
    input: { model: 'google/gemini-flash-1.5', prompt, image_url: bodyUrl },
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
  return { build: build ?? 'average', notes }
}

/**
 * Pass 1 prompt: pose + body shape + skin tone + outfit normalization.
 *
 * Inputs:
 *   - image 1 = pose template (default_man.png) — pose & framing source
 *   - image 2 = user's photo — skin tone source only
 *
 * Goal: emit a photorealistic full-body person in image 1's exact pose,
 * with the user's build & skin tone, wearing plain white tee + shorts,
 * with a NEUTRAL/PLACEHOLDER face. Identity transfer happens in Pass 2.
 *
 * Why split: trying to do pose-transfer AND identity-transfer in one
 * flux-edit call ends up doing neither well — the model can't decide
 * whether image 2 is "use the face from here" or "use the pose from
 * here" and ends up regressing toward a generic standing pose with a
 * vaguely-similar face. Splitting lets each pass have a single clear
 * job, mirroring dress-avatar's Pass 1 / Pass 2 structure.
 */
function buildPass1Prompt(
  build: Build,
  notes: string,
  heightCm: number | undefined,
  weightKg: number | undefined,
): string {
  const buildDirective = BUILD_DIRECTIVES[build]
  const buildNotesClause = notes
    ? `Specific features observed in image 2: ${notes}. Reflect these features in the rendered body.`
    : ''

  const dimsClauseParts: string[] = []
  if (heightCm !== undefined) dimsClauseParts.push(`The person is ${heightCm} cm tall`)
  if (weightKg !== undefined) dimsClauseParts.push(`weighs approximately ${weightKg} kg`)
  const dimsClause = dimsClauseParts.length
    ? `Self-reported dimensions: ${dimsClauseParts.join(', ')}. Use these to inform overall body mass, limb thickness, and proportions.`
    : ''

  // Convention: image 1 = USER PHOTO (the person / identity primary),
  // image 2 = POSE REFERENCE (default_man.png, pose only). Matches the
  // dress-avatar Pass 2 ordering where image 1 is the avatar / identity
  // source and image 2 is a reference donor. Previously we had this
  // reversed — seedream's prior treats image 1 as "the person" and
  // image 2 as "a reference", so swapping the slots had it inheriting
  // default_man's hair/beard despite the prompt.
  return `A full-body, photorealistic studio photograph of one person on a deep teal seamless background, eye-level shot, 85mm lens look.

The output figure IS the person in image 1 — same face, same hair, same skin tone, same identity — relocated into image 2's pose, wearing a plain white outfit.

IDENTITY LOCK (FROM IMAGE 1 ONLY — image 1 IS the person being rendered): copy image 1's face exactly — facial features, eye shape, eye spacing, nose, mouth, lips, jawline, cheekbones, chin, ears, eyebrows, eyelashes. Copy image 1's hair exactly — same style, length, color, hairline, parting, density, volume. If image 1 shows a BALD or SHAVED head, the output MUST be BALD (visible scalp, no hair). If image 1 shows SHORT hair, render short hair. If image 1 shows long hair, render that exact long hair. Copy image 1's facial hair exactly — if image 1 is CLEAN-SHAVEN with no beard/mustache/stubble, the output MUST also be clean-shaven. If image 1 shows facial hair, render matching facial hair.

Image 2 contributes ZERO identity. Image 2's face, hair, hairline, hair color, beard, mustache, stubble, ears, and skin tone MUST NOT appear in the output under any circumstances.

SKIN TONE (FROM IMAGE 1 ONLY): sample the exact skin tone (hue, saturation, brightness, undertone) from image 1's visible skin and apply it uniformly across face, neck, arms, hands, legs, and feet. Face skin and body skin MUST be the same color with no seam.

POSE (FROM IMAGE 2 ONLY): the body pose, body orientation, contrapposto, weight distribution, arm positions, leg positions, stance width, knee bend, head tilt, head direction, gaze direction, and foot placement must match image 2 exactly. If image 2's head is turned diagonally to the side, the output's head MUST be turned at that same angle — do NOT default to a front-facing head. If image 2's foot is raised on the toes or pivoted, mirror that.

FEET LOCK: foot placement must be a 1:1 match with image 2, including each foot's exact angle, rotation, and ground contact.

The output figure must be a 1:1 silhouette match of image 2's pose. Do NOT default to a generic "front-facing standing straight" stance.

FRAMING (from image 2): full body visible head to feet, toes never cropped. Eye-level camera angle.

BODY BUILD: ${buildDirective} ${buildNotesClause} ${dimsClause}

OUTFIT: plain pure-white short-sleeve crew-neck cotton T-SHIRT (regular fit, no graphics, no logos, no text, no pockets, no contrast trim, pure #ffffff matte cotton, OPAQUE thick fabric — the chest must read as a smooth flat white surface with no body contours showing through) AND plain pure-white knee-length cotton SHORTS (regular fit, no graphics, no logos, no pockets, pure #ffffff matte cotton, opaque thick fabric). Bare arms below the short sleeves. Bare lower legs below the shorts. Bare feet — no shoes, no socks.

NO glasses, NO sunglasses, NO earrings, NO necklaces, NO watches, NO bracelets, NO rings, NO hats, NO headbands, NO scarves, NO hair clips. If image 1 shows glasses, REMOVE them so bare eyes are fully visible.

The mouth is closed with lips pressed gently together (closed-mouth Mona Lisa smile, no teeth visible).

If image 1 shows only the upper body (half-body shot), infer the lower body's shape and skin tone from the visible upper body, and pose the legs exactly like image 2.

Photorealistic, sharp focus, no text, no watermarks. Plain seamless deep teal studio background, fully saturated solid color, evenly lit with no gradient (no floor, no horizon, no shadow).`
}

/**
 * Pass 2 prompt: identity transfer onto Pass 1's normalized body.
 *
 * Inputs:
 *   - image 1 = Pass 1 output (photorealistic body in target pose, white
 *     outfit, placeholder face)
 *   - image 2 = user's photo (face source)
 *
 * Mirrors dress-avatar's Pass 2 / TRYON_PROMPT structure exactly, except
 * we're transferring face from image 2 (rather than outfit). Pose is
 * already correct in image 1's pixels, so the model only needs to
 * preserve it — the easy direction.
 */
function buildPass2Prompt(): string {
  // Pass 2 is now identity refinement, not transplant. Pass 1 already
  // baked in image 2's face/hair/skin — Pass 2 just sharpens the match
  // and corrects drift. Critical: explicitly say "if image 2 is bald,
  // remove all hair from image 1" because seedream's default behavior
  // is to interpolate hair when both images contain a head region.
  return `IDENTITY REFINEMENT: image 1 already shows the target avatar with image 2's identity baked in. Sharpen and correct the match using image 2 as the canonical reference for face, hair, and skin tone. The output is a polished version of image 1 with any identity drift corrected to match image 2 exactly.

FACE (refine from image 2): the face in the output must precisely match image 2's facial features — eye shape, eye spacing, nose shape and size, mouth shape, lip thickness, jawline, cheekbones, chin shape, ear shape, eyebrows, eyelashes. If image 1's face differs from image 2 in any of these, correct it. The mouth is closed with lips pressed gently together (closed-mouth Mona Lisa smile, no teeth visible). NO glasses, NO sunglasses.

HAIR (canonical reference is image 2 — OVERRIDE image 1's hair): the hair in the output MUST match image 2 — same style, length, color, hairline, parting, density. CRITICAL: if image 2 shows a BALD or SHAVED head, the output MUST be BALD with visible scalp — DELETE any hair shown in image 1. If image 2 shows SHORT hair, the output MUST have short hair — DELETE any long hair from image 1. Do NOT preserve, average, or blend image 1's hair with image 2's. Image 2 is the SOLE source of hair information.

FACIAL HAIR (canonical reference is image 2): match image 2's beard, mustache, or stubble exactly. If image 2 is CLEAN-SHAVEN, the output MUST be clean-shaven — DELETE any facial hair shown in image 1.

SKIN TONE (canonical reference is image 2): the skin tone across face, neck, arms, hands, legs, and feet must match image 2's skin exactly. If image 1's skin tone drifted lighter or darker than image 2, correct it. Face skin and body skin MUST be the same color with no seam.

POSE LOCK (HEAD TO TOE — FROM IMAGE 1): preserve image 1's pose bit-for-bit. Same body orientation, contrapposto, arm positions, leg positions, stance width, knee bend, head tilt, head direction, gaze direction. The output figure must be a 1:1 silhouette match of image 1's pose.

FEET LOCK: foot placement must be a 1:1 match with image 1, including each foot's exact angle, rotation, and ground contact.

PRESERVE FROM IMAGE 1: body build, body proportions, outfit (plain white t-shirt + plain white shorts), framing (full body visible head to feet, toes never cropped), camera angle, lens, lighting, background.

NO earrings, NO necklaces, NO watches, NO bracelets, NO rings, NO hats, NO headbands, NO scarves, NO hair clips.

Photorealistic, sharp focus, no text, no watermarks.`
}

let cachedPoseUrl: string | undefined

async function getPoseUrl(): Promise<string> {
  if (cachedPoseUrl) return cachedPoseUrl
  const poseBuf = await fs.readFile(POSE_ASSET)
  cachedPoseUrl = await bufferToFalUrl(poseBuf, 'image/png', 'default_man.png')
  return cachedPoseUrl
}

export async function normalizeAvatar(input: NormalizeAvatarInput): Promise<NormalizeAvatarResult> {
  const { bodyImage, bodyMimeType, heightCm, weightKg, onPhase } = input

  // Per-phase wall-clock logging. Pipeline takes 30–60s end-to-end; this
  // breaks it down so we can see which step is the bottleneck.
  const pipelineStart = Date.now()
  function logPhase(phase: NormalizeAvatarPhase, ms: number) {
    console.log(`[normalize-avatar] ${phase} ${ms}ms`)
  }

  const uploadStart = Date.now()
  const [bodyUrl, poseUrl] = await Promise.all([
    bufferToFalUrl(bodyImage, bodyMimeType, 'body.jpg'),
    getPoseUrl(),
  ])
  console.log(`[normalize-avatar] upload-inputs ${Date.now() - uploadStart}ms`)

  onPhase?.('classify')
  const classifyStart = Date.now()
  const { build, notes } = await classifyBuild(bodyUrl, heightCm, weightKg)
  logPhase('classify', Date.now() - classifyStart)
  console.log(`[normalize-avatar] classify result: build=${build} notes=${notes || '(none)'}`)

  // ─── Pass 1: identity (from user) + pose (from reference) + outfit ─────
  // image 1 = bodyUrl (USER PHOTO = identity primary, hair, face, skin),
  // image 2 = poseUrl (pose donor only). Order matters: seedream's prior
  // treats image 1 as "the person" being rendered and image 2 as "a
  // reference donor" — matching dress-avatar's [avatar, pass1] ordering.
  onPhase?.('pass1')
  const pass1Start = Date.now()
  const pass1Result = await fal.subscribe(EDIT_MODEL, {
    input: {
      prompt: buildPass1Prompt(build, notes, heightCm, weightKg),
      image_urls: [bodyUrl, poseUrl],
      num_images: 1,
      image_size: { width: 832, height: 1248 },
    },
    logs: false,
  })
  const pass1Url = ((pass1Result.data as any)?.images?.[0]?.url ??
    (pass1Result.data as any)?.image?.url) as string | undefined
  if (!pass1Url) throw new Error('seedream pass1 returned no image url')
  logPhase('pass1', Date.now() - pass1Start)

  // ─── Pass 2: identity transfer onto the normalized body ────────────────
  // image 1 = pass1Url (everything except face), image 2 = bodyUrl (face).
  // Mirrors dress-avatar Pass 2 structure: preserve image 1 globally,
  // transplant a single attribute from image 2. seedream handles this
  // cleanly where flux-edit blended everything.
  onPhase?.('pass2')
  const pass2Start = Date.now()
  const pass2Result = await fal.subscribe(EDIT_MODEL, {
    input: {
      prompt: buildPass2Prompt(),
      image_urls: [pass1Url, bodyUrl],
      num_images: 1,
      image_size: { width: 832, height: 1248 },
    },
    logs: false,
  })
  const pass2Url = ((pass2Result.data as any)?.images?.[0]?.url ??
    (pass2Result.data as any)?.image?.url) as string | undefined
  if (!pass2Url) throw new Error('seedream pass2 returned no image url')
  logPhase('pass2', Date.now() - pass2Start)

  // ─── Face-swap pass: composite user's actual face onto the body ────────
  // seedream produces a similar-looking face but not a pixel-accurate
  // identity match. easel-faceswap takes the user's selfie as source and
  // overwrites just the face region of the seedream output. target_hair
  // mode preserves seedream's hair / outfit / scene / skin tone.
  onPhase?.('faceswap')
  const faceswapStart = Date.now()
  const swapResult = await fal.subscribe(FACESWAP_MODEL, {
    input: {
      // base_image is where the face GOES (seedream body output).
      // swap_image is the source face TO inject (user's selfie).
      base_image_url: pass2Url,
      swap_image_url: bodyUrl,
    },
    logs: false,
  })
  const baseUrl = ((swapResult.data as any)?.image?.url ??
    (swapResult.data as any)?.images?.[0]?.url) as string | undefined
  if (!baseUrl) throw new Error('faceswap returned no image url')
  logPhase('faceswap', Date.now() - faceswapStart)

  onPhase?.('rembg')
  const rembgStart = Date.now()
  const rembgResult = await fal.subscribe(REMBG_MODEL, {
    input: { image_url: baseUrl },
    logs: false,
  })
  const rembgData = rembgResult.data as any
  const cleanUrl: string | undefined = rembgData?.image?.url ?? rembgData?.images?.[0]?.url
  if (!cleanUrl) throw new Error('bria rembg returned no image url')
  logPhase('rembg', Date.now() - rembgStart)

  onPhase?.('finalize')
  const finalizeStart = Date.now()
  const [rawPng, rembgPng] = await Promise.all([fetchToBuffer(baseUrl), fetchToBuffer(cleanUrl)])
  const decontaminated = await decontaminate(rembgPng, rawPng)
  const avatarUrl = await bufferToFalUrl(decontaminated, 'image/png', 'avatar.png')
  logPhase('finalize', Date.now() - finalizeStart)

  console.log(`[normalize-avatar] total ${Date.now() - pipelineStart}ms`)
  return { avatarUrl }
}
