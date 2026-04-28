/**
 * Classifies an outfit (or a list of clothing items) as warm / cool / neutral
 * based on the dominant primary color, and exposes the matching gradient
 * stops. Used by both the saved-outfits detail page and the try-on page, so
 * the logic is intentionally decoupled from any UI component.
 */

export type Tone = 'warm' | 'cool' | 'neutral'

export const TONE_GRADIENTS: Record<Tone, [string, string]> = {
  warm: ['#8B867E', '#B3AFA2'],
  cool: ['#86A0C1', '#C0D6F2'],
  neutral: ['#BDC4CB', '#D3D7DB'],
}

const WARM = new Set([
  'red',
  'orange',
  'yellow',
  'brown',
  'tan',
  'rust',
  'beige',
  'cream',
  'khaki',
  'gold',
  'pink',
  'coral',
  'maroon',
  'burgundy',
])

const COOL = new Set([
  'blue',
  'navy',
  'indigo',
  'teal',
  'cyan',
  'purple',
  'violet',
  'green',
  'mint',
  'turquoise',
])

function classify(color: string): Tone | null {
  const c = color.toLowerCase().trim()
  if (WARM.has(c)) return 'warm'
  if (COOL.has(c)) return 'cool'
  // black/white/grey/olive/silver → neutral (explicit fallthrough)
  return null
}

export function getOutfitTone(colors: string[]): Tone {
  let warm = 0
  let cool = 0
  for (const c of colors) {
    const t = classify(c)
    if (t === 'warm') warm++
    else if (t === 'cool') cool++
  }
  if (warm === 0 && cool === 0) return 'neutral'
  if (warm > cool) return 'warm'
  if (cool > warm) return 'cool'
  return 'neutral'
}
