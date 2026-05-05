/**
 * Classifies an outfit (or a list of clothing items) as warm / cool / neutral
 * based on the dominant primary color, and exposes the matching gradient
 * stops. Used by both the saved-outfits detail page and the try-on page, so
 * the logic is intentionally decoupled from any UI component.
 */

export type Tone = 'warm' | 'cool' | 'neutral'

export const TONE_GRADIENTS: Record<Tone, [string, string]> = {
  warm: ['#AAA7A1', '#CAC7BE'],
  cool: ['#9BABBF', '#C9D7E8'],
  neutral: ['#E5E5E5', '#E5E5E5'],
}

// Darker shade per tone, used for accent text and tinted icons (e.g.
// the "✓ My Fit" indicator on the Try On page when the current
// combination is already saved). Calibrated to read clearly against
// the corresponding gradient background.
export const TONE_ACCENTS: Record<Tone, string> = {
  warm: '#977153',
  cool: '#4879B4',
  neutral: '#000000',
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
