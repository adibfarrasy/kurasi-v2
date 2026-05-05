/**
 * Compares two ratio-weighted color palettes and returns a similarity in
 * [0, 1]. Used by the steal-the-look picker to group wardrobe items into
 * "identical" (≥0.9) vs "alternative" (0.5–0.9) buckets relative to the
 * AI-generated reference item.
 *
 * Approach: convert each palette to its ratio-weighted centroid in
 * CIELAB (D65), measure CIE76 ΔE between centroids, then map to a
 * similarity score. CIELAB is roughly perceptually uniform, so ΔE
 * differences track how different two colors *look* — not just their
 * raw RGB distance. The DELTAE_MAX cutoff is calibrated so a white
 * tee vs a cream tee lands above 0.9 (identical) while white vs mid
 * grey lands in the 0.5–0.9 alternative band.
 */

export type PaletteColor = { hex: string; ratio: number }

type Lab = [number, number, number]
type Rgb = [number, number, number]

function hexToRgb(hex: string): Rgb | null {
  const h = hex.replace('#', '').trim()
  const v =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  if (v.length !== 6) return null
  const n = Number.parseInt(v, 16)
  if (Number.isNaN(n)) return null
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

function rgbToLab([r, g, b]: Rgb): Lab {
  const linear = (c: number) => {
    const x = c / 255
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  const R = linear(r)
  const G = linear(g)
  const B = linear(b)
  const X = R * 0.4124 + G * 0.3576 + B * 0.1805
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722
  const Z = R * 0.0193 + G * 0.1192 + B * 0.9505
  const Xn = 0.95047
  const Yn = 1.0
  const Zn = 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(X / Xn)
  const fy = f(Y / Yn)
  const fz = f(Z / Zn)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

function paletteCentroid(colors: PaletteColor[]): Lab | null {
  let total = 0
  let L = 0
  let a = 0
  let b = 0
  for (const c of colors) {
    const rgb = hexToRgb(c.hex)
    if (!rgb) continue
    const lab = rgbToLab(rgb)
    const w = c.ratio > 0 ? c.ratio : 0
    L += lab[0] * w
    a += lab[1] * w
    b += lab[2] * w
    total += w
  }
  if (total === 0) return null
  return [L / total, a / total, b / total]
}

function deltaE76(a: Lab, b: Lab): number {
  const dL = a[0] - b[0]
  const da = a[1] - b[1]
  const db = a[2] - b[2]
  return Math.sqrt(dL * dL + da * da + db * db)
}

// ΔE ≥ 60 → similarity 0. Calibrated against the WARM/COOL/NEUTRAL color
// names the analyzer emits: white↔cream ≈ 5 (identical), white↔grey ≈ 30
// (alternative), white↔black ≈ 100 (different).
const DELTAE_MAX = 60

export function colorPaletteSimilarity(a: PaletteColor[], b: PaletteColor[]): number {
  const la = paletteCentroid(a)
  const lb = paletteCentroid(b)
  if (!la || !lb) return 0
  const d = deltaE76(la, lb)
  return Math.max(0, 1 - d / DELTAE_MAX)
}

export const IDENTICAL_THRESHOLD = 0.9
export const ALTERNATIVE_THRESHOLD = 0.5

export type SimilarityBucket = 'identical' | 'alternative' | 'other'

export function bucketForSimilarity(s: number): SimilarityBucket {
  if (s >= IDENTICAL_THRESHOLD) return 'identical'
  if (s >= ALTERNATIVE_THRESHOLD) return 'alternative'
  return 'other'
}
