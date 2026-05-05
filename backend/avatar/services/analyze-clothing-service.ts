/**
 * Server-side port of analyze-clothing.ts (the CLI script). Exposes
 * `analyzeSingleClothing(buf, mime)` which:
 *
 *   1. Uploads the photo to fal.
 *   2. Runs ONE vision call with a single-item prompt that handles
 *      flat-lay, hanger, and on-model photos. Returns
 *      title / category / fit / length aligned with the app's enums.
 *   3. Background-removes the original photo via bria, then runs the
 *      deterministic k-means + named-palette color extractor on the
 *      transparent PNG.
 *
 * The cleanup pipeline (compose-on-hanger / canvas-place) from the CLI
 * script is intentionally NOT ported here — Add Clothes only needs the
 * metadata to pre-fill the review form. We can add the cleaned PNG
 * later when we wire the create-item submit.
 */

import { fal } from '@fal-ai/client'
import sharp from 'sharp'
import { env } from '../../env'
import { refineItem } from './steal-the-look-pipeline'

const VISION_MODEL = 'google/gemini-2.5-flash'

export const ITEM_CATEGORIES = ['headwear', 'shirt', 'jacket', 'pants', 'footwear'] as const
export type ItemCategory = (typeof ITEM_CATEGORIES)[number]

export const FIT_PROFILES = ['skinny', 'regular', 'relaxed', 'oversize'] as const
export type FitProfile = (typeof FIT_PROFILES)[number]

export const JACKET_LENGTHS = ['cropped', 'waist', 'hip', 'thigh', 'knee', 'full-length'] as const
export const PANTS_LENGTHS = ['thigh-shorts', 'knee-shorts', 'ankle-length', 'full-length'] as const
export const GARMENT_LENGTHS = [...JACKET_LENGTHS, ...PANTS_LENGTHS] as const
export type GarmentLength = (typeof GARMENT_LENGTHS)[number]

const FITTABLE: ReadonlySet<ItemCategory> = new Set<ItemCategory>(['shirt', 'jacket', 'pants'])
const LENGTHS_BY_CATEGORY: Partial<Record<ItemCategory, ReadonlySet<GarmentLength>>> = {
  jacket: new Set(JACKET_LENGTHS),
  pants: new Set(PANTS_LENGTHS),
}

export type AnalyzedColor = { name: string; hex: string; ratio: number }

export type AnalyzedItem = {
  title: string
  category: ItemCategory
  fit: FitProfile | null
  length: GarmentLength | null
  colors: AnalyzedColor[]
}

let configured = false
function ensureFalConfigured(): void {
  if (configured) return
  if (!env.FAL_KEY) throw new Error('FAL_KEY is not configured')
  fal.config({ credentials: env.FAL_KEY })
  configured = true
}

async function uploadBuf(buf: Buffer, name: string, mime: string): Promise<string> {
  ensureFalConfigured()
  const file = new File([new Uint8Array(buf)], name, { type: mime })
  return await fal.storage.upload(file)
}

async function fetchToBuffer(url: string): Promise<Buffer> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`fetch ${url} → ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
}

// ─── Vision: single-item analyzer ────────────────────────────────────────

const ANALYZE_PROMPT = `You are a wardrobe metadata extractor. The photo contains EXACTLY ONE clothing item the user wants to add to their wardrobe. The item may be shown flat-lay (laid on a surface), on a hanger, on a mannequin, or worn by a person. Identify the GARMENT or accessory only — ignore any background, surface, person, body part, mannequin, hanger, or props.

DO NOT INVENT items. If the photo shows a boot, the answer is footwear — do NOT mention shirts. If the photo shows a pair of jeans, the answer is pants — do NOT mention shirts.

(1) CATEGORY — pick exactly ONE of:
- headwear: hat, cap, beanie, headband, bucket hat, sun hat
- shirt: any top worn on the torso — t-shirt, tank, henley, button-down, polo, oxford, blouse, hoodie that is a pull-over without an outer shell
- jacket: any outer-layer garment — jacket, coat, hooded jacket, parka, cardigan, blazer, vest, sweater
- pants: any full-length lower garment — trousers, jeans, leggings, chinos, joggers
- footwear: any shoes, boots, sandals, heels, sneakers, slippers

If the photo's MAIN subject does not fit one of the five categories above (e.g. a bag, scarf, dress, skirt, shorts, glasses, jewelry), respond with exactly:
unsupported

(2) FIT — only for shirt / jacket / pants. For headwear / footwear, output "fit: null".
- skinny: skin-tight or close to body, light tapering
- regular: standard cut, light ease, follows body shape
- relaxed: clearly loose with visible airspace, but not boxy
- oversize: deliberately boxy/baggy, dropped shoulders, significant slack

(3) LENGTH — only for jacket and pants; for the rest, output "length: null".
- jacket lengths (hem position): cropped, waist, hip, thigh, knee, full-length
- pants lengths (inseam): thigh-shorts, knee-shorts, ankle-length, full-length

(4) TITLE — a concise descriptive title for the GARMENT shown, 3 to 7 words, plain English, no marketing fluff, no brand names. Examples: "Tan leather lace-up boots", "Black ribbed cotton tank top", "Faded blue straight-leg jeans".

Reply in EXACTLY this format, no extra lines, no commentary:
title: <text>
category: <category-value>
fit: <fit-value-or-null>
length: <length-value-or-null>`

async function visionAnalyze(imageUrl: string): Promise<{
  title: string
  category: ItemCategory
  fit: FitProfile | null
  length: GarmentLength | null
} | null> {
  ensureFalConfigured()
  const result = await fal.subscribe('fal-ai/any-llm/vision', {
    // biome-ignore lint/suspicious/noExplicitAny: fal's union is too narrow for any-llm/vision model strings
    input: { model: VISION_MODEL as any, prompt: ANALYZE_PROMPT, image_url: imageUrl },
    logs: false,
  })
  // biome-ignore lint/suspicious/noExplicitAny: fal subscribe response shape isn't typed
  const text = String((result.data as any)?.output ?? '').trim()
  if (/^\s*unsupported\s*$/im.test(text)) return null

  const titleLine = /^\s*title\s*:\s*(.+?)\s*$/im.exec(text)
  const categoryLine = /^\s*category\s*:\s*([a-z_-]+)\s*$/im.exec(text)
  const fitLine = /^\s*fit\s*:\s*([a-z_-]+|null)\s*$/im.exec(text)
  const lengthLine = /^\s*length\s*:\s*([a-z_-]+|null)\s*$/im.exec(text)

  if (!categoryLine) {
    console.warn('[analyze-clothing] could not parse category. Raw:', text)
    return null
  }
  const cat = categoryLine[1] as string
  if (!(ITEM_CATEGORIES as readonly string[]).includes(cat)) return null
  const category = cat as ItemCategory

  const title = titleLine ? titleLine[1]!.trim() : 'Wardrobe item'

  let fit: FitProfile | null = null
  if (FITTABLE.has(category) && fitLine) {
    const v = fitLine[1]!.toLowerCase()
    if ((FIT_PROFILES as readonly string[]).includes(v)) fit = v as FitProfile
  }

  let length: GarmentLength | null = null
  const allowed = LENGTHS_BY_CATEGORY[category]
  if (allowed && lengthLine) {
    const v = lengthLine[1]!.toLowerCase()
    if (allowed.has(v as GarmentLength)) length = v as GarmentLength
  }

  return { title, category, fit, length }
}

// ─── Deterministic color extraction (k-means in Lab + named-palette snap)
// Faithful port of analyze-clothing.ts.

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
  let best = PALETTE_LAB[0]!.name
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
      s[0] += points[i]![0]
      s[1] += points[i]![1]
      s[2] += points[i]![2]
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

async function extractColors(rgbaPng: Buffer): Promise<AnalyzedColor[]> {
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

  // Agglomerative merge: collapse clusters within MERGE_THRESHOLD ΔE.
  // Lighting variants of the same fabric collapse; a two-tone garment's
  // clusters sit far apart in Lab and won't merge.
  const MERGE_THRESHOLD = 25
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
    const merged = {
      centroid: [
        (a.centroid[0] * a.count + b.centroid[0] * b.count) / total,
        (a.centroid[1] * a.count + b.centroid[1] * b.count) / total,
        (a.centroid[2] * a.count + b.centroid[2] * b.count) / total,
      ] as Rgb,
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
    .filter((c) => c.count / totalCount >= 0.05)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
  if (merged.length === 0) return []

  const sumKept = merged.reduce((a, c) => a + c.count, 0)
  const out: AnalyzedColor[] = merged.map((c) => ({
    name: c.name,
    hex: rgbToHex(c.rgb),
    // Ratios returned on a 0..1 scale, summing to ~1, matching the
    // shape the Add Clothes review form expects.
    ratio: c.count / sumKept,
  }))
  const drift = 1 - out.reduce((a, c) => a + c.ratio, 0)
  if (Math.abs(drift) > 1e-9 && out[0]) out[0].ratio += drift
  return out
}

// ─── Public entry point ──────────────────────────────────────────────────

export type AnalyzeResult =
  | {
      kind: 'ok'
      /** Raw fal URL of the user's uploaded photo. Stored as
       *  `originalImageUrl` so the source is preserved. */
      originalImageUrl: string
      /** fal URL of the cleaned-up, canvas-anchored transparent PNG
       *  (compose-on-template + bg-remove + decontaminate + place on
       *  832×1248 canvas). Stored as the wardrobe item's `imageUrl`. */
      processedImageUrl: string
      item: AnalyzedItem
    }
  | { kind: 'unsupported' }

export async function analyzeSingleClothing(
  imageBuf: Buffer,
  mime: 'image/jpeg' | 'image/png' | 'image/webp',
): Promise<AnalyzeResult> {
  ensureFalConfigured()
  const originalImageUrl = await uploadBuf(imageBuf, 'add-clothes', mime)

  const meta = await visionAnalyze(originalImageUrl)
  if (!meta) return { kind: 'unsupported' }

  // Run the heavy cleanup pipeline (compose-on-template + bg-remove +
  // decontaminate + canvas-place) — this is the same `refineItem` the
  // steal-the-look flow uses. Its output is the canonical processed
  // image stored as the wardrobe item's `imageUrl`.
  const processedImageUrl = await refineItem(imageBuf, meta.category)

  // Color extraction runs on the PROCESSED image rather than a raw
  // bg-remove of the original. The processed PNG is canvas-anchored
  // with only the garment opaque (transparent everywhere else) and
  // edges decontaminated, so k-means only sees real garment pixels.
  // This eliminates the bg-leak we saw on near-tone backgrounds (e.g.
  // the boot photo with an off-white wall + cream pedestal that bria
  // wasn't fully removing).
  const processedPng = await fetchToBuffer(processedImageUrl)
  const colors = await extractColors(processedPng)

  return {
    kind: 'ok',
    originalImageUrl,
    processedImageUrl,
    item: {
      title: meta.title,
      category: meta.category,
      fit: meta.fit,
      length: meta.length,
      colors,
    },
  }
}
