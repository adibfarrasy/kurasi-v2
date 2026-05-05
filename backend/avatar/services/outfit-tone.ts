/**
 * Classifies an outfit as warm / cool / neutral based on the dominant
 * primary color across its garments. Mirrors the client-side logic in
 * app/lib/outfit-tone.ts so the Try On hero gradient matches what the user
 * has been seeing in My Fit.
 */

export type Tone = 'warm' | 'cool' | 'neutral'

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
  return null
}

export function getOutfitTone(colorNames: string[]): Tone {
  let warm = 0
  let cool = 0
  for (const c of colorNames) {
    const t = classify(c)
    if (t === 'warm') warm++
    else if (t === 'cool') cool++
  }
  if (warm === 0 && cool === 0) return 'neutral'
  if (warm > cool) return 'warm'
  if (cool > warm) return 'cool'
  return 'neutral'
}
