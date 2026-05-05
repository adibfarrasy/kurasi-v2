/**
 * Cleans up a raw clothing-item photo into a catalog-ready transparent PNG
 * on a fixed canvas, AND extracts wardrobe metadata (title, category,
 * dominant colors, fit) suitable for pre-filling the wardrobe-item form.
 * Brand and free-text description stay user-entered; the script does NOT
 * try to read brand off the photo (logo recognition is unreliable and
 * the user can pick from a known brand list in the UI).
 *
 * Pipeline:
 *   1. analyzeClothing — fal-ai/any-llm/vision (default: claude-3.5-sonnet)
 *      classifies the original photo into the spec's ItemCategory + FitProfile,
 *      extracts up to 3 dominant colors with hex + ratio, and proposes
 *      a short descriptive title.
 *   2. cleanup — flux/edit either composes the garment onto the matching
 *      base asset (hanger-top for tops, hanger-bottom for bottoms,
 *      headwear-base for hats) or, for flat items (footwear, bag, scarf,
 *      accessory), renders a clean studio shot. bria/background/remove
 *      then strips the teal studio bg, leaving a transparent PNG.
 *
 * Outputs:
 *   backend/outputs/<basename>.png   — cleaned transparent PNG.
 *   Metadata (title, category, fit, colors) is logged to stdout.
 *
 * Usage:
 *   FAL_KEY=... bun backend/avatar/scripts/analyze-clothing.ts \
 *     --input <path-or-url> [--category <ItemCategory>] [--out <name>]*
 * --category is optional; the analyzer auto-detects it. Pass it to override.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fal } from '@fal-ai/client'
import sharp from 'sharp'

type FalSubscribePayload = Awaited<ReturnType<typeof fal.subscribe>>

const EDIT_MODEL = 'fal-ai/bytedance/seedream/v5/lite/edit'
const VISION_MODEL = 'google/gemini-2.5-flash'
const REMBG_MODEL = 'fal-ai/bria/background/remove'

const HANGER_TOP_PATH = 'backend/avatar/assets/hanger-top.png'
const HANGER_BOTTOM_PATH = 'backend/avatar/assets/hanger-bottom.png'
const HEADWEAR_BASE_PATH = 'backend/avatar/assets/headwear-base.png'

// Fixed output canvas. Same aspect ratio as the rest of the avatar
// pipeline so wardrobe-grid thumbnails compose cleanly with try-on art.
const CANVAS_W = 832
const CANVAS_H = 1248

// ─── Spec-aligned enums (match wardrobe.allium) ──────────────────────────

const ITEM_CATEGORIES = [
  'tee',
  'collared_shirt',
  'outer',
  'pants',
  'shorts',
  'headwear',
  'footwear',
  'bag',
  'scarf',
  'accessory',
  'dress',
  'skirt',
] as const
type ItemCategory = (typeof ITEM_CATEGORIES)[number]

const FIT_PROFILES = ['skinny', 'regular', 'relaxed', 'oversize'] as const
type FitProfile = (typeof FIT_PROFILES)[number]

// fit only applies to garments worn on the body. Footwear, headwear, bags,
// scarves and accessories don't carry a FitProfile (left null in metadata).
const FITTABLE_CATEGORIES = new Set<ItemCategory>([
  'tee',
  'collared_shirt',
  'outer',
  'pants',
  'shorts',
  'dress',
  'skirt',
])

// Map spec ItemCategory → cleanup pipeline mode. Try-on modes composite
// the garment onto a base asset; flat mode just renders + bg-removes.
type Mode = 'hanger-top' | 'hanger-bottom' | 'headwear' | 'flat'
const CATEGORY_TO_MODE: Record<ItemCategory, Mode> = {
  tee: 'hanger-top',
  collared_shirt: 'hanger-top',
  outer: 'hanger-top',
  dress: 'hanger-top',
  pants: 'hanger-bottom',
  shorts: 'hanger-bottom',
  skirt: 'hanger-bottom',
  headwear: 'headwear',
  footwear: 'flat',
  bag: 'flat',
  scarf: 'flat',
  accessory: 'flat',
}

// Try-on base asset per mode. The asset is the second image fed to
// flux/edit and dictates where/how the garment lands on the canvas.
const TRYON_BASE: Record<Exclude<Mode, 'flat'>, string> = {
  'hanger-top': HANGER_TOP_PATH,
  'hanger-bottom': HANGER_BOTTOM_PATH,
  headwear: HEADWEAR_BASE_PATH,
}

// Humanized labels used inside cleanup-step prompts. Anchors flux to the
// right garment vocabulary without leaking the underscored enum form.
const CATEGORY_LABEL: Record<ItemCategory, string> = {
  tee: 't-shirt',
  collared_shirt: 'collared shirt',
  outer: 'jacket',
  pants: 'pair of pants',
  shorts: 'pair of shorts',
  skirt: 'skirt',
  dress: 'dress',
  footwear: 'shoe',
  headwear: 'hat',
  bag: 'bag',
  scarf: 'scarf',
  accessory: 'accessory',
}

const args = process.argv.slice(2)
const inputIdx = args.indexOf('--input')
const inputArg = inputIdx >= 0 ? args[inputIdx + 1] : undefined
const categoryIdx = args.indexOf('--category')
const categoryArg = categoryIdx >= 0 ? args[categoryIdx + 1] : undefined
const outIdx = args.indexOf('--out')
const outOverride = outIdx >= 0 ? args[outIdx + 1] : undefined

if (!inputArg) {
  console.error(
    `Usage: bun ${process.argv[1]} --input <path-or-url> [--category <ItemCategory>] [--out <name>]`,
  )
  process.exit(1)
}

if (categoryArg && !ITEM_CATEGORIES.includes(categoryArg as ItemCategory)) {
  console.error(
    `Invalid --category "${categoryArg}". Must be one of: ${ITEM_CATEGORIES.join(', ')}.`,
  )
  process.exit(1)
}
const overrideCategory = categoryArg as ItemCategory | undefined

const baseName =
  outOverride ??
  path
    .basename(inputArg)
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9-]/gi, '-')
    .toLowerCase()

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

/** Reverse the bg color contribution out of edge pixels. Same approach as
 * normalize-user.ts — solves fg = (composite − (1−α)·bg)/α per pixel. */
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

/** Count opaque pixels in row `y` of an RGBA PNG. */
async function opaqueWidthAtRow(png: Buffer, y: number): Promise<number> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width
  let count = 0
  for (let x = 0; x < W; x++) {
    if ((data[(y * W + x) * 4 + 3] ?? 0) >= 128) count++
  }
  return count
}

/** Count non-teal pixels in row `y` of a teal-bg asset (RGB or RGBA). */
async function nonTealWidthAtRow(png: Buffer, y: number): Promise<number> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width
  const TR = 0,
    TG = 90,
    TB = 100
  const TOL_SQ = 35 * 35
  let count = 0
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3
    const dr = (data[i] ?? 0) - TR
    const dg = (data[i + 1] ?? 0) - TG
    const db = (data[i + 2] ?? 0) - TB
    if (dr * dr + dg * dg + db * db > TOL_SQ) count++
  }
  return count
}

/** Find the bottom-most non-teal row in a teal-bg asset. */
async function nonTealBottomY(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width
  const H = info.height
  const TOL_SQ = 35 * 35
  for (let y = H - 1; y >= 0; y--) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3
      const dr = (data[i] ?? 0) - 0
      const dg = (data[i + 1] ?? 0) - 90
      const db = (data[i + 2] ?? 0) - 100
      if (dr * dr + dg * dg + db * db > TOL_SQ) return y
    }
  }
  return H - 1
}

/** Find the top-most non-teal row in a teal-bg asset. */
async function nonTealTopY(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width
  const H = info.height
  const TOL_SQ = 35 * 35
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3
      const dr = (data[i] ?? 0) - 0
      const dg = (data[i + 1] ?? 0) - 90
      const db = (data[i + 2] ?? 0) - 100
      if (dr * dr + dg * dg + db * db > TOL_SQ) return y
    }
  }
  return 0
}

/** Find the hanger hook center — the centroid X of opaque pixels in the
 * top few rows of the image. Used to anchor the result so every garment's
 * hook lands at the same canvas X coordinate. */
async function findHookCenterX(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width
  const H = info.height
  let topY = -1
  outer: for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if ((data[(y * W + x) * 4 + 3] ?? 0) >= 128) {
        topY = y
        break outer
      }
    }
  }
  if (topY < 0) return Math.round(W / 2)
  // Average X across the top ~12 rows to smooth out single-pixel jitter at the hook tip.
  let sumX = 0
  let count = 0
  const sampleRows = Math.min(12, H - topY)
  for (let y = topY; y < topY + sampleRows; y++) {
    for (let x = 0; x < W; x++) {
      if ((data[(y * W + x) * 4 + 3] ?? 0) >= 128) {
        sumX += x
        count += 1
      }
    }
  }
  return count > 0 ? Math.round(sumX / count) : Math.round(W / 2)
}

/** Find the tight RGBA bbox of non-transparent pixels. */
async function alphaBbox(
  png: Buffer,
): Promise<{ x: number; y: number; w: number; h: number } | null> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width
  const H = info.height
  let minX = W,
    minY = H,
    maxX = -1,
    maxY = -1
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

// ─── Deterministic color extraction (k-means in Lab + named-palette snap)

type Rgb = [number, number, number]
type Lab = [number, number, number]

const COLOR_PALETTE: { name: string; rgb: Rgb }[] = [
  { name: 'Black', rgb: [20, 20, 20] },
  { name: 'Charcoal', rgb: [54, 56, 60] },
  { name: 'Slate', rgb: [80, 95, 110] },
  { name: 'Gray', rgb: [128, 128, 128] },
  { name: 'Silver', rgb: [192, 192, 192] },
  { name: 'White', rgb: [245, 245, 245] },
  { name: 'Cream', rgb: [240, 230, 210] },
  { name: 'Beige', rgb: [220, 200, 175] },
  { name: 'Tan', rgb: [200, 165, 130] },
  { name: 'Sand', rgb: [205, 185, 145] },
  { name: 'Camel', rgb: [180, 140, 95] },
  { name: 'Brown', rgb: [120, 80, 50] },
  { name: 'Chocolate', rgb: [80, 50, 30] },
  { name: 'Khaki', rgb: [165, 145, 100] },
  { name: 'Olive', rgb: [110, 110, 60] },
  { name: 'Forest', rgb: [40, 80, 50] },
  { name: 'Sage', rgb: [150, 175, 145] },
  { name: 'Mint', rgb: [180, 220, 195] },
  { name: 'Teal', rgb: [40, 110, 120] },
  { name: 'Navy', rgb: [25, 40, 75] },
  { name: 'Blue', rgb: [40, 90, 180] },
  { name: 'Sky', rgb: [140, 195, 230] },
  { name: 'Indigo', rgb: [60, 60, 120] },
  { name: 'Purple', rgb: [120, 80, 160] },
  { name: 'Lavender', rgb: [200, 180, 215] },
  { name: 'Lilac', rgb: [195, 165, 210] },
  { name: 'Mauve', rgb: [180, 130, 165] },
  { name: 'Pink', rgb: [240, 175, 200] },
  { name: 'Rose', rgb: [220, 130, 145] },
  { name: 'Red', rgb: [200, 40, 50] },
  { name: 'Burgundy', rgb: [110, 30, 50] },
  { name: 'Maroon', rgb: [110, 40, 50] },
  { name: 'Coral', rgb: [240, 130, 110] },
  { name: 'Orange', rgb: [235, 130, 50] },
  { name: 'Rust', rgb: [165, 80, 50] },
  { name: 'Mustard', rgb: [205, 165, 50] },
  { name: 'Yellow', rgb: [240, 215, 70] },
  { name: 'Gold', rgb: [200, 165, 80] },
  { name: 'Green', rgb: [70, 150, 70] },
]

function rgbToLab([r, g, b]: Rgb): Lab {
  const lin = (c: number) => {
    c /= 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const R = lin(r),
    G = lin(g),
    B = lin(b)
  const X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375
  const Y = R * 0.2126729 + G * 0.7151522 + B * 0.072175
  const Z = R * 0.0193339 + G * 0.119192 + B * 0.9503041
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(X / 0.95047),
    fy = f(Y / 1.0),
    fz = f(Z / 1.08883)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

function labDist(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

const PALETTE_LAB: { name: string; lab: Lab }[] = COLOR_PALETTE.map((p) => ({
  name: p.name,
  lab: rgbToLab(p.rgb),
}))

function nearestColorName(rgb: Rgb): string {
  const lab = rgbToLab(rgb)
  const first = PALETTE_LAB[0]
  if (!first) return 'Gray'
  let best = first.name
  let bestD = Infinity
  for (const p of PALETTE_LAB) {
    const d = labDist(lab, p.lab)
    if (d < bestD) {
      bestD = d
      best = p.name
    }
  }
  return best
}

function rgbToHex([r, g, b]: Rgb): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/** Lloyd's k-means in Lab space, centroids tracked in RGB for output. */
function kmeans(points: Rgb[], k: number, maxIter = 25): { centroid: Rgb; count: number }[] {
  if (points.length === 0) return []
  k = Math.min(k, points.length)
  const labs = points.map(rgbToLab)
  const centroidsRgb: Rgb[] = []
  const used = new Set<number>()
  while (centroidsRgb.length < k) {
    const idx = Math.floor(Math.random() * points.length)
    if (used.has(idx)) continue
    used.add(idx)
    centroidsRgb.push([...points[idx]!] as Rgb)
  }
  const centroidsLab = centroidsRgb.map(rgbToLab)
  const assign = new Array<number>(points.length).fill(0)
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false
    for (let i = 0; i < points.length; i++) {
      let best = 0
      let bestD = Infinity
      for (let j = 0; j < k; j++) {
        const d = labDist(labs[i]!, centroidsLab[j]!)
        if (d < bestD) {
          bestD = d
          best = j
        }
      }
      if (assign[i] !== best) {
        assign[i] = best
        changed = true
      }
    }
    if (!changed && iter > 0) break
    const sums: [number, number, number, number][] = Array.from({ length: k }, () => [0, 0, 0, 0])
    for (let i = 0; i < points.length; i++) {
      const s = sums[assign[i]!]!
      const pt = points[i]!
      s[0] += pt[0]
      s[1] += pt[1]
      s[2] += pt[2]
      s[3] += 1
    }
    for (let j = 0; j < k; j++) {
      const s = sums[j]!
      if (s[3] > 0) {
        centroidsRgb[j] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]
        centroidsLab[j] = rgbToLab(centroidsRgb[j]!)
      }
    }
  }
  const counts = new Array<number>(k).fill(0)
  for (const a of assign) counts[a]! += 1
  return centroidsRgb.map((c, i) => ({ centroid: c, count: counts[i]! })).filter((c) => c.count > 0)
}

async function extractColors(rgbaPng: Buffer): Promise<ColorEntry[]> {
  const { data } = await sharp(rgbaPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const points: Rgb[] = []
  // Stride-sample opaque pixels. Skip soft alpha edges to avoid contaminated mid-tones.
  const stride = 4
  for (let i = 0; i < data.length; i += 4 * stride) {
    const a = data[i + 3]!
    if (a < 200) continue
    points.push([data[i]!, data[i + 1]!, data[i + 2]!])
  }
  if (points.length === 0) return []

  let clusters = kmeans(points, 5)

  // Agglomerative merge: collapse clusters whose Lab centroids are within
  // MERGE_THRESHOLD ΔE — these are lighting variants of the same fabric
  // (e.g., a "white" shirt's highlight + midtone + shadow shouldn't split
  // into White / Cream / Silver). A two-tone garment's clusters sit far
  // apart in Lab space and won't merge.
  const MERGE_THRESHOLD = 25
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let bestI = -1
    let bestJ = -1
    let bestD = MERGE_THRESHOLD
    const labs = clusters.map((c) => rgbToLab(c.centroid))
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = labDist(labs[i]!, labs[j]!)
        if (d < bestD) {
          bestD = d
          bestI = i
          bestJ = j
        }
      }
    }
    if (bestI < 0) break
    const a = clusters[bestI]!
    const b = clusters[bestJ]!
    const total = a.count + b.count
    const merged: { centroid: Rgb; count: number } = {
      centroid: [
        (a.centroid[0] * a.count + b.centroid[0] * b.count) / total,
        (a.centroid[1] * a.count + b.centroid[1] * b.count) / total,
        (a.centroid[2] * a.count + b.centroid[2] * b.count) / total,
      ],
      count: total,
    }
    clusters = clusters.filter((_, idx) => idx !== bestI && idx !== bestJ)
    clusters.push(merged)
  }

  const totalCount = points.length
  const byName = new Map<string, { count: number; rgbSum: [number, number, number] }>()
  for (const c of clusters) {
    const name = nearestColorName(c.centroid)
    const e = byName.get(name) ?? { count: 0, rgbSum: [0, 0, 0] }
    e.count += c.count
    e.rgbSum[0] += c.centroid[0] * c.count
    e.rgbSum[1] += c.centroid[1] * c.count
    e.rgbSum[2] += c.centroid[2] * c.count
    byName.set(name, e)
  }
  const merged = Array.from(byName, ([name, v]) => ({
    name,
    rgb: [v.rgbSum[0] / v.count, v.rgbSum[1] / v.count, v.rgbSum[2] / v.count] as Rgb,
    count: v.count,
  }))
    .filter((c) => c.count / totalCount >= 0.05) // drop sub-5% clusters (logos, small accents)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
  if (merged.length === 0) return []

  const sumKept = merged.reduce((a, c) => a + c.count, 0)
  const out: ColorEntry[] = merged.map((c) => ({
    name: c.name,
    hex: rgbToHex(c.rgb),
    ratio: Math.round((c.count / sumKept) * 100),
  }))
  const drift = 100 - out.reduce((a, c) => a + c.ratio, 0)
  if (drift !== 0 && out[0]) out[0].ratio += drift
  return out
}

const t0 = Date.now()
const inputUrl = await toFalUrl(inputArg)

// ─── Step 1: analyze the original photo ──────────────────────────────────

type ColorEntry = { name: string; hex: string; ratio: number }
type Analysis = {
  title: string
  category: ItemCategory
  fit: FitProfile | null
}

async function analyzeClothing(): Promise<Analysis> {
  const overrideClause = overrideCategory
    ? `The user has already selected category "${overrideCategory}". Use that as the category in your output. Still produce all other fields.`
    : ''

  const prompt = `You are a wardrobe metadata extractor. Look at the clothing item in this photo (it may be a flat-lay product shot, on a hanger, on a model, or worn). Extract structured metadata. Ignore any background, person, or surroundings — describe the GARMENT only.

(1) CATEGORY — pick exactly ONE of:
- tee: t-shirt, tank top, plain shirt without a collar, henley
- collared_shirt: button-down, polo, oxford, any shirt with a collar
- outer: jacket, coat, hoodie, sweater, cardigan, blazer, vest, parka
- pants: full-length trousers, jeans, leggings, chinos, joggers
- shorts: any shorts (above the knee or knee-length)
- skirt: skirt of any length
- dress: dress, jumpsuit, romper
- footwear: shoes, sneakers, boots, sandals, heels, slippers
- headwear: hat, cap, beanie, headband
- bag: backpack, tote, purse, messenger, duffel
- scarf: scarf, shawl, neckerchief
- accessory: belt, watch, jewelry, glasses, sunglasses, tie, gloves

${overrideClause}

(2) FIT — only for body-worn garments (tee, collared_shirt, outer, pants, shorts, skirt, dress). For others, output "fit: null".
- tight: skin-tight, compression, no airspace (e.g. compression tee, leggings, bodycon dress)
- slim: close to body but not skin-tight, light tapering (slim-fit shirt, skinny jeans)
- standard: standard cut, light ease, follows body shape (regular tee, regular trousers)
- relaxed: clearly loose with visible airspace, but not boxy
- oversize: deliberately boxy/baggy, dropped shoulders, significant slack

(3) TITLE — a concise descriptive title for the item, 3 to 7 words, plain English, no marketing fluff, no brand names, no years, no edition labels. Examples: "Tan leather lace-up boots", "Black ribbed cotton tank top", "Faded blue straight-leg jeans".

Reply in EXACTLY this format, no extra lines, no commentary:
title: <text>
category: <category-value>
fit: <fit-value-or-null>`

  let result: FalSubscribePayload
  try {
    result = await fal.subscribe('fal-ai/any-llm/vision', {
      input: {
        model: VISION_MODEL as any,
        prompt,
        image_url: inputUrl,
      },
      logs: false,
    })
  } catch (e: any) {
    console.error(
      `[analyze] vision model "${VISION_MODEL}" rejected. fal validation detail:`,
      JSON.stringify(e?.body ?? e, null, 2),
    )
    throw e
  }
  const text = String((result.data as any)?.output ?? '').trim()

  const titleLine = /^\s*title\s*:\s*(.+?)\s*$/im.exec(text)
  const categoryLine = /^\s*category\s*:\s*([a-z_]+)\s*$/im.exec(text)
  const fitLine = /^\s*fit\s*:\s*(\w+)\s*$/im.exec(text)

  const title = titleLine?.[1]?.trim() ?? 'Wardrobe item'
  const category: ItemCategory =
    overrideCategory ??
    (categoryLine && (ITEM_CATEGORIES as readonly string[]).includes(categoryLine[1]!)
      ? (categoryLine[1] as ItemCategory)
      : 'accessory')

  let fit: FitProfile | null = null
  if (FITTABLE_CATEGORIES.has(category) && fitLine?.[1]) {
    const v = fitLine[1].toLowerCase()
    fit = (FIT_PROFILES as readonly string[]).includes(v) ? (v as FitProfile) : null
  }

  if (!categoryLine && !overrideCategory) {
    console.warn(`[analyze] couldn't parse category. Defaulting to "accessory". Raw:\n${text}`)
  }
  if (FITTABLE_CATEGORIES.has(category) && !fit) {
    console.warn(`[analyze] couldn't parse fit for fittable category "${category}".`)
  }

  return { title, category, fit }
}

console.log(`[analyze] submitting to ${VISION_MODEL}...`)
const analyzeStart = Date.now()
const analysis = await analyzeClothing()
const finalCategory = analysis.category
const mode: Mode = CATEGORY_TO_MODE[finalCategory]
const categoryLabel = CATEGORY_LABEL[finalCategory]
console.log(
  `[analyze] (${Date.now() - analyzeStart}ms) category=${finalCategory} fit=${analysis.fit ?? 'null'} mode=${mode}`,
)

// ─── Step 1b: deterministic color extraction ─────────────────────────────
// Bg-remove the original input image, then k-means on opaque pixels.
// Mode-agnostic so try-on results don't get hanger / mannequin pixels mixed in.
console.log(`[colors] bg-removing input for color extraction...`)
const colorsRembg = await fal.subscribe(REMBG_MODEL, {
  input: { image_url: inputUrl },
  logs: false,
})
const colorsRembgUrl: string | undefined =
  (colorsRembg.data as any)?.image?.url ?? (colorsRembg.data as any)?.images?.[0]?.url
let extractedColors: ColorEntry[] = []
if (colorsRembgUrl) {
  const colorsPng = await fetchToBuffer(colorsRembgUrl)
  extractedColors = await extractColors(colorsPng)
} else {
  console.warn('[colors] bg-removal returned no URL; colors will be empty')
}
console.log(
  `[colors] ${extractedColors.map((c) => `${c.name}(${c.ratio}%)`).join(', ') || '(none)'}`,
)

// ─── Step 2a: render staged shot via the chosen edit model ───────────────

const sharedSuffix = `Photorealistic, sharp focus, even soft studio lighting, no text, no watermarks, no tags.`

function buildEditInput(prompt: string, imageUrls: string[]): any {
  return {
    prompt,
    image_urls: imageUrls,
    num_images: 1,
    output_format: 'png',
    image_size: { width: CANVAS_W, height: CANVAS_H },
  }
}

let stagedUrl: string

if (mode !== 'flat') {
  const baseUrl = await toFalUrl(TRYON_BASE[mode])
  const tryonPrompt =
    mode === 'hanger-top'
      ? `Place the garment from image 1 (a ${categoryLabel}) onto the EXACT wooden clothes hanger shown in image 2. The garment hangs naturally from the hanger's shoulders, fabric falling straight down with subtle natural folds. Front-facing view, garment fully visible. CRITICAL: the hanger in the result MUST be the same matte WHITE-PAINTED wooden hanger as in image 2 — same white color, same shape, same size, same hook (chrome metal), same position. Do NOT change the hanger to a darker wood, stained wood, plastic, or wire hanger. Do NOT alter the hanger's color, finish, or proportions in any way. Keep the deep teal background from image 2 unchanged — same color, no gradient, no shadow. Preserve the garment's exact color, pattern, fabric texture, print, logos, and proportions from image 1 — do not invent or alter any design detail. Do not add any human figure. ${sharedSuffix}`
      : mode === 'hanger-bottom'
        ? `Place the bottoms from image 1 (a ${categoryLabel}) onto the EXACT clip hanger shown in image 2. The waistband is held by the hanger's clips with the legs hanging straight down naturally with gravity. Front-facing view, garment fully visible. CRITICAL: the hanger in the result MUST be the same matte WHITE plastic clip hanger as in image 2 — same white color, same shape, same size, same chrome hook, same clips. Do NOT change the hanger to a darker color, different style, wooden, or wire hanger. Do NOT alter the hanger's color, finish, or proportions in any way. Keep the deep teal background from image 2 unchanged — same color, no gradient, no shadow. Preserve the garment's exact color, pattern, fabric texture, and proportions from image 1 — do not invent or alter any design detail. Do not add any human figure. ${sharedSuffix}`
        : `A photograph of the white mannequin head from image 2 wearing the EXACT headwear shown in image 1.

CRITICAL — interpret the 3D shape correctly: image 1 may be a top-down, flat-lay, or angled product shot. You must infer the actual 3D form of the headwear and render it as worn, NOT replicate the camera angle of image 1. A baseball cap has a brim ONLY at the front (a short curved bill); it does NOT have brim all the way around — even if the top-down product photo only shows the front bill, the result must remain a front-only brim, not a sun hat or bucket hat. A beanie has no brim. A bucket hat has a short downward brim all around. A wide-brim sun hat has a wide flat brim all around. Identify the type from image 1 and PRESERVE that exact silhouette — do NOT morph it into a different category of hat.

CRITICAL — image 2 is the canonical scene; do NOT modify it: image 2 (the mannequin head on a deep teal background) defines the EXACT scene. You may NOT flip, mirror, rotate, re-angle, re-pose, scale, or reposition the mannequin head. Every pixel of the mannequin and the teal background that is not occluded by the new headwear must be IDENTICAL to image 2. The mannequin's facial orientation (which direction its face is pointing) is fixed by image 2 and must not change.

CRITICAL — rotate the HEADWEAR (not the head) to fit: identify the front of the headwear from image 1, then rotate/orient the headwear in 3D so its front aligns with the direction the mannequin's face is pointing in image 2. The mannequin stays still; the headwear is what gets oriented to match. Do NOT flip the mannequin to match the headwear's orientation in image 1.

CRITICAL — sizing must be SNUG, not loose: the headwear is sized for THIS specific head. The inner band (the part that wraps around the wearer's head) hugs the head's circumference at the brow line — same width as the head, NOT larger, NOT floating. Looking at the head and cap from the front, the visible width of the cap's CROWN (excluding any brim) must NOT exceed the visible width of the head at the temples — the crown should look the SAME WIDTH as the head, or marginally narrower. If anything, render the headwear slightly UNDERSIZED rather than oversized — a snug fit that hugs the skull is the goal. Do NOT add airspace, slack, or extra volume around the crown. The bottom edge of the crown wraps the head at the brow just above the eyes; small overhang for a cap brim is fine, but the crown itself must NOT be wider than the head. Keep the mannequin's exact position, size, and appearance from image 2 unchanged. Keep the deep teal background from image 2 unchanged — same color, no gradient, no shadow. Preserve the headwear's exact color, material, pattern, branding, stitching, and proportions from image 1 — do not invent or alter any design detail. Do not add any human figure. ${sharedSuffix}`

  console.log(`[edit] mode=${mode}, submitting to ${EDIT_MODEL}...`)
  let editResult: FalSubscribePayload
  try {
    editResult = await fal.subscribe(EDIT_MODEL, {
      input: buildEditInput(tryonPrompt, [inputUrl, baseUrl]),
      logs: false,
    })
  } catch (e: any) {
    console.error(
      `[edit] "${EDIT_MODEL}" rejected. fal validation detail:`,
      JSON.stringify(e?.body ?? e, null, 2),
    )
    throw e
  }
  const url = (editResult.data as any)?.images?.[0]?.url as string | undefined
  if (!url) {
    console.error('[edit] No output URL', editResult.data)
    process.exit(1)
  }
  stagedUrl = url
} else {
  const flatSuffix = `${sharedSuffix} Plain seamless deep teal studio background, fully saturated solid color, no gradient, no shadow.`
  const FLAT_PROMPTS: Partial<Record<ItemCategory, string>> = {
    footwear: `Clean studio product shot of the footwear from image 1 (a ${categoryLabel}). Show a PAIR of shoes (left and right) sitting side by side, both in a clear THREE-QUARTER ANGLED view — the camera looks down at the shoes from roughly 30 degrees above eye-level and 30 degrees off the side, so BOTH the side profile (full length, heel to toe) AND the top of each shoe (laces, tongue, vamp) are clearly visible at the same time. Both shoes sit level on an invisible flat ground, with toes pointing to the right and slightly toward the camera. The two shoes are placed close to each other but NOT overlapping, with a small gap between them. Do NOT render the shoes in pure profile (perfect side view) or pure top-down. Preserve the exact color, material, pattern, laces, sole, branding, and proportions from image 1. Do not add any human figure or feet. ${flatSuffix}`,
    bag: `Clean studio product shot of the bag from image 1 (a ${categoryLabel}). Show the bag front-facing, sitting upright with straps or handles arranged naturally. Preserve the exact color, material, pattern, hardware, and proportions from image 1. Do not add any human figure. ${flatSuffix}`,
    scarf: `Clean studio product shot of the scarf from image 1. Show it laid flat or loosely folded so the pattern, color, and material are clearly visible. Preserve the exact color, pattern, material, and proportions from image 1. Do not add any human figure. ${flatSuffix}`,
    accessory: `Clean studio product shot of the accessory from image 1 (a ${categoryLabel}). Show it front-facing in a natural orientation, fully visible. Preserve the exact color, material, hardware, and proportions from image 1. Do not add any human figure. ${flatSuffix}`,
  }
  const prompt = FLAT_PROMPTS[finalCategory] ?? FLAT_PROMPTS.accessory!

  console.log(`[edit] mode=${mode}, submitting to ${EDIT_MODEL}...`)
  let editResult: FalSubscribePayload
  try {
    editResult = await fal.subscribe(EDIT_MODEL, {
      input: buildEditInput(prompt, [inputUrl]),
      logs: false,
    })
  } catch (e: any) {
    console.error(
      `[edit] "${EDIT_MODEL}" rejected. fal validation detail:`,
      JSON.stringify(e?.body ?? e, null, 2),
    )
    throw e
  }
  const url = (editResult.data as any)?.images?.[0]?.url as string | undefined
  if (!url) {
    console.error('[edit] No output URL', editResult.data)
    process.exit(1)
  }
  stagedUrl = url
}

const stagedBuf = await fetchToBuffer(stagedUrl)
await fs.writeFile(`backend/outputs/cleanup-${baseName}-raw.png`, stagedBuf)
console.log(`[edit] generated (${Date.now() - t0}ms)`)

// ─── Step 2b: bg-remove + decontaminate ──────────────────────────────────

console.log(`[rembg] submitting to ${REMBG_MODEL}...`)
const rembgResult = await fal.subscribe(REMBG_MODEL, {
  input: { image_url: stagedUrl },
  logs: false,
})
const rembgUrl: string | undefined =
  (rembgResult.data as any)?.image?.url ?? (rembgResult.data as any)?.images?.[0]?.url
if (!rembgUrl) {
  console.error('[rembg] No bg-removal URL', rembgResult.data)
  process.exit(1)
}
const rembgPng = await fetchToBuffer(rembgUrl)
const decontaminated = await decontaminate(rembgPng, stagedBuf)

// ─── Step 2c: place on final canvas ──────────────────────────────────────

let finalPng: Buffer

if (mode === 'flat') {
  // Per-category padding: footwear is anchored at the bottom (shoes "rest"
  // on a ground line); bag/scarf/accessory stay centered. The padding
  // numbers define how much transparent margin surrounds the bbox.
  const PAD_X = 100
  // For footwear: "floor" line at ~75% down the canvas — shoes sit with
  // their soles at FOOTWEAR_FLOOR_Y. Most of the canvas is above the floor
  // so the shoes have room; transparent margin below.
  const FOOTWEAR_FLOOR_Y = Math.round(CANVAS_H * 0.78)
  const PAD_Y_TOP = finalCategory === 'footwear' ? 150 : 100
  const PAD_Y_BOTTOM = finalCategory === 'footwear' ? CANVAS_H - FOOTWEAR_FLOOR_Y : 100
  const TARGET_W = CANVAS_W - 2 * PAD_X
  const TARGET_H = CANVAS_H - PAD_Y_TOP - PAD_Y_BOTTOM

  const bbox = await alphaBbox(decontaminated)
  if (!bbox) {
    console.error('[center] cutout has no opaque pixels.')
    process.exit(1)
  }
  const cropped = await sharp(decontaminated)
    .extract({ left: bbox.x, top: bbox.y, width: bbox.w, height: bbox.h })
    .png()
    .toBuffer()
  const scale = Math.min(TARGET_W / bbox.w, TARGET_H / bbox.h, 1)
  const finalW = Math.round(bbox.w * scale)
  const finalH = Math.round(bbox.h * scale)
  const scaled = await sharp(cropped).resize(finalW, finalH, { fit: 'fill' }).png().toBuffer()

  const left = Math.round((CANVAS_W - finalW) / 2)
  const top =
    finalCategory === 'footwear' ? FOOTWEAR_FLOOR_Y - finalH : Math.round((CANVAS_H - finalH) / 2)
  finalPng = await sharp({
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
} else if (mode === 'hanger-top' || mode === 'hanger-bottom') {
  // Model rendered garment + hanger together. Normalize so the hook tip
  // always lands at canvas (CANVAS_W/2, HOOK_Y). The app animates from
  // that fixed anchor point.
  // Place the hook *tip* at HOOK_TIP_Y; the curl center (where the railing
  // would pass through during the slide-off animation) sits HOOK_CURL_OFFSET
  // below that. App can use (CANVAS_W/2, HOOK_TIP_Y + HOOK_CURL_OFFSET) as
  // the railing anchor.
  const HOOK_TIP_Y = 30
  const HOOK_CURL_OFFSET = 30
  const MAX_W = 700
  const MAX_H = 1180

  const bbox = await alphaBbox(decontaminated)
  if (!bbox) {
    console.error('[hanger] result has no opaque pixels.')
    process.exit(1)
  }
  const cropped = await sharp(decontaminated)
    .extract({ left: bbox.x, top: bbox.y, width: bbox.w, height: bbox.h })
    .png()
    .toBuffer()
  const scale = Math.min(MAX_W / bbox.w, MAX_H / bbox.h, 1)
  const finalW = Math.round(bbox.w * scale)
  const finalH = Math.round(bbox.h * scale)
  const scaled = await sharp(cropped).resize(finalW, finalH, { fit: 'fill' }).png().toBuffer()

  const hookCenterX = await findHookCenterX(scaled)
  const left = Math.round(CANVAS_W / 2 - hookCenterX)
  const top = HOOK_TIP_Y

  // Debug marker: red dot at the detected hook center.
  const DOT = 16
  const dot = await sharp({
    create: { width: DOT, height: DOT, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
  })
    .png()
    .toBuffer()

  finalPng = await sharp({
    create: {
      width: CANVAS_W,
      height: CANVAS_H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: scaled, left, top },
      {
        input: dot,
        left: Math.round(CANVAS_W / 2 - DOT / 2),
        top: HOOK_TIP_Y + HOOK_CURL_OFFSET - Math.round(DOT / 2),
      },
    ])
    .png()
    .toBuffer()
  console.log(`[anchor] hook curl at (${CANVAS_W / 2}, ${HOOK_TIP_Y + HOOK_CURL_OFFSET})`)
} else {
  // headwear: scale generated so the head width matches the reference's
  // head width. Sample widths 250px above each bbox's bottom — that's
  // mid-face in both (well below the cap brim, so the ratio reflects head
  // width only). Then anchor the bottom of the bbox to the reference's.
  const refBuf = await fs.readFile(HEADWEAR_BASE_PATH)
  const refTopY = await nonTealTopY(refBuf)
  const refBottomY = await nonTealBottomY(refBuf)

  const bbox = await alphaBbox(decontaminated)
  if (!bbox) {
    console.error('[headwear] result has no opaque pixels.')
    process.exit(1)
  }

  const SAMPLE_OFFSET = 250 // px above bottom — lands mid-face on the mannequin
  const yRef = refBottomY - SAMPLE_OFFSET
  const yGen = bbox.y + bbox.h - 1 - SAMPLE_OFFSET
  const refWidth = await nonTealWidthAtRow(refBuf, yRef)
  const genWidth = await opaqueWidthAtRow(decontaminated, yGen)

  if (refWidth === 0 || genWidth === 0) {
    console.error(
      `[headwear] couldn't measure widths (ref@y=${yRef}: ${refWidth}, gen@y=${yGen}: ${genWidth})`,
    )
    process.exit(1)
  }
  const scale = refWidth / genWidth
  console.log(
    `[headwear] ref_w=${refWidth}@y${yRef} gen_w=${genWidth}@y${yGen} → scale=${scale.toFixed(3)} ref_top=${refTopY} ref_bottom=${refBottomY}`,
  )
  const cropped = await sharp(decontaminated)
    .extract({ left: bbox.x, top: bbox.y, width: bbox.w, height: bbox.h })
    .png()
    .toBuffer()
  const finalW = Math.round(bbox.w * scale)
  const finalH = Math.round(bbox.h * scale)
  const scaled = await sharp(cropped).resize(finalW, finalH, { fit: 'fill' }).png().toBuffer()

  const left = Math.round((CANVAS_W - finalW) / 2)
  const top = refBottomY - finalH

  finalPng = await sharp({
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

// Pad final output to 836×1248 (2px transparent margin on each side)
// — required output frame size.
const FRAME_W = 836
const FRAME_H = 1248
const padLeft = Math.round((FRAME_W - CANVAS_W) / 2)
const framed = await sharp({
  create: {
    width: FRAME_W,
    height: FRAME_H,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: finalPng, left: padLeft, top: 0 }])
  .png()
  .toBuffer()

const outPath = `backend/outputs/${baseName}.png`
await fs.writeFile(outPath, framed)
console.log(`Saved ${outPath} (${FRAME_W}×${FRAME_H}, mode=${mode})`)
console.log(`Total: ${Date.now() - t0}ms`)

// ─── metadata (logged for inspection) ────────────────────────────────────
const metadata = {
  title: analysis.title,
  category: finalCategory,
  fit: analysis.fit,
  colors: extractedColors,
}
console.log(`[meta] ${JSON.stringify(metadata, null, 2)}`)
