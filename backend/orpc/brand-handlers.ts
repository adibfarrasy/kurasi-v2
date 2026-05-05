import { and, eq, isNotNull } from 'drizzle-orm'
import { clothingItem } from '../db/schema'
import { authed } from './authed'

// Server-curated bundled list of common brands. These appear for every
// user. User-typed brands (saved on a clothing_item) are unioned in via
// the query below — Option A from the design discussion: no separate
// `user_brand` table, brand is just a free-text column on
// clothing_item and the picker derives the suggestion list from it.
const BUNDLED_BRANDS: readonly string[] = [
  'A.P.C.',
  'A Bathing Ape (BAPE)',
  'Acne Studio',
  'Adidas',
  'Alexander McQueen',
  'Alexander Wang',
  'Alpha Industries',
  'Ami Paris',
  'Armani',
  'ASOS',
  'Balenciaga',
  'Banana Republic',
  'Barbour',
  'Burberry',
  'Calvin Klein',
  'Carhartt',
  'Champion',
  'COS',
  'Diesel',
  'Dior',
  'Dr. Martens',
  'Fila',
  'Gucci',
  'H&M',
  'Levi’s',
  'Loewe',
  'New Balance',
  'Nike',
  'North Face',
  'Patagonia',
  'Polo Ralph Lauren',
  'Prada',
  'Puma',
  'Reebok',
  'Stone Island',
  'Stüssy',
  'Supreme',
  'Tommy Hilfiger',
  'Uniqlo',
  'Vans',
  'Versace',
  'Yves Saint Laurent',
  'Zara',
]

const list = authed.handler(async ({ context }): Promise<string[]> => {
  const { db, user } = context
  const rows = await db
    .selectDistinct({ brand: clothingItem.brand })
    .from(clothingItem)
    .where(
      and(
        eq(clothingItem.userId, user.id),
        eq(clothingItem.status, 'active'),
        isNotNull(clothingItem.brand),
      ),
    )
  // Case-insensitive dedupe — if a user typed "uniqlo" but the bundled
  // list has "Uniqlo", we don't want both to appear.
  const seen = new Set<string>()
  const out: string[] = []
  const push = (s: string) => {
    const k = s.toLowerCase()
    if (seen.has(k)) return
    seen.add(k)
    out.push(s)
  }
  for (const b of BUNDLED_BRANDS) push(b)
  for (const r of rows) {
    const b = r.brand
    if (b?.trim()) push(b.trim())
  }
  out.sort((a, b) => a.localeCompare(b))
  return out
})

export const brandHandlers = { list }
