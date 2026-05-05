/**
 * Dev seed script — creates a deterministic dev user and populates realistic
 * fixture data for frontend slicing. No OAuth required.
 *
 * Usage:
 *   bun backend/seed.ts
 *
 * Then start the backend with:
 *   DEV_USER_ID=dev-user bun run dev
 *
 * Every authed oRPC call will resolve to this user (see authMiddleware).
 * Idempotent: deletes prior seed rows before re-inserting.
 */

import { eq } from 'drizzle-orm'
import { db } from './db/db'
import {
  clothingItem,
  fitAdjustment,
  onboardingProgress,
  outfit,
  savedStyle,
  styleCard,
  styleCardTag,
  styleInteraction,
  styleTag,
  subscription,
  user,
  userBiometrics,
} from './db/schema'

const userId = 'dev-user'
const userEmail = 'dev@kurasi.local'

const existing = await db.select().from(user).where(eq(user.id, userId))
if (existing.length === 0) {
  await db.insert(user).values({
    id: userId,
    name: 'Dev User',
    email: userEmail,
    emailVerified: true,
    image: null,
    trialStartedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  console.log(`Created user ${userEmail} (${userId})`)
} else {
  console.log(`Reusing user ${existing[0]?.email} (${userId})`)
}

// --- wipe prior seed for this user ----------------------------------------

await db.delete(fitAdjustment).where(eq(fitAdjustment.userId, userId))
await db.delete(outfit).where(eq(outfit.userId, userId))
await db.delete(clothingItem).where(eq(clothingItem.userId, userId))
await db.delete(savedStyle).where(eq(savedStyle.userId, userId))
await db.delete(styleInteraction).where(eq(styleInteraction.userId, userId))
await db.delete(userBiometrics).where(eq(userBiometrics.userId, userId))
await db.delete(subscription).where(eq(subscription.userId, userId))

// --- onboarding + biometrics ---------------------------------------------

await db
  .insert(onboardingProgress)
  .values({
    userId,
    status: 'completed',
    biometricsCompletedAt: new Date(),
    starterWardrobeCompletedAt: new Date(),
    completedAt: new Date(),
  })
  .onConflictDoUpdate({
    target: onboardingProgress.userId,
    set: {
      status: 'completed',
      biometricsCompletedAt: new Date(),
      starterWardrobeCompletedAt: new Date(),
      completedAt: new Date(),
    },
  })

// Default avatar comes from the bundled `default_man.png`, served from the
// `/static/avatar-assets/` route (see backend/index.ts). Until normalize-user
// is wired up to produce a real per-user avatar, every seeded user gets the
// same placeholder.
const DEFAULT_AVATAR_URL = `${process.env.BETTER_AUTH_URL ?? 'http://localhost:8989'}/static/avatar-assets/default_man.png`

await db.insert(userBiometrics).values({
  userId,
  heightCm: 178,
  weightKg: 72,
  defaultAvatarUrl: DEFAULT_AVATAR_URL,
})

// --- subscription ---------------------------------------------------------

const now = new Date()
const monthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
await db.insert(subscription).values({
  userId,
  interval: 'monthly',
  status: 'active',
  startedAt: now,
  currentPeriodEnd: monthFromNow,
})

// --- clothing items -------------------------------------------------------
//
// Image URLs point at the backend's /static/clothing/<category>/<file> route
// (see backend/index.ts), which serves the repo-root `clothing articles/`
// directory. STATIC_BASE defaults to BETTER_AUTH_URL since that's already the
// backend's public URL; override via STATIC_BASE for tunnels/devices.

const STATIC_BASE =
  process.env.STATIC_BASE ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:8989'
const img = (cat: string, file: string) => `${STATIC_BASE}/static/clothing/${cat}/${file}`

const itemSeeds = [
  // tees — colors verified against actual images
  {
    file: img('tees', 'tee-1.png'),
    category: 'shirt' as const,
    colors: [{ name: 'white', hex: '#f0eee9', ratio: 100 }],
    brand: 'Uniqlo',
    fit: 'regular' as const,
    materials: ['cotton'],
    name: 'Uniqlo-U White',
    customNotes: 'Goes with everything. Slightly boxy fit, looks great untucked.',
  },
  {
    file: img('tees', 'tee-2.png'),
    category: 'shirt' as const,
    colors: [{ name: 'white', hex: '#f0eee9', ratio: 100 }],
    brand: 'Uniqlo',
    fit: 'regular' as const,
    materials: ['cotton'],
    name: 'Airism Crewneck',
    customNotes: 'Sweat-wicking. Daily summer rotation, especially under heavier shirts.',
  },
  {
    file: img('tees', 'tee-3.png'),
    category: 'shirt' as const,
    colors: [{ name: 'grey', hex: '#808080', ratio: 100 }],
    brand: 'Uniqlo',
    fit: 'oversize' as const,
    materials: ['cotton'],
    name: 'U Oversized Grey',
    customNotes: 'Heavy cotton, drops past the hip. Pair with slim bottoms for balance.',
  },
  {
    file: img('tees', 'tee-4.png'),
    category: 'shirt' as const,
    colors: [{ name: 'white', hex: '#f0eee9', ratio: 100 }],
    brand: 'Tiny Wisdom',
    fit: 'regular' as const,
    materials: ['cotton'],
    name: 'White Tee',
  },
  {
    file: img('tees', 'tee-5.png'),
    category: 'shirt' as const,
    colors: [{ name: 'white', hex: '#f0eee9', ratio: 100 }],
    brand: 'Puma',
    fit: 'oversize' as const,
    materials: ['cotton'],
    name: 'Hyrox Yokohama 2025',
    customNotes: 'Race tee. Sentimental — only worn on rest days.',
  },
  {
    file: img('tees', 'tee-6.png'),
    category: 'shirt' as const,
    colors: [{ name: 'black', hex: '#1a1a1a', ratio: 100 }],
    brand: 'Cannibal Corpse',
    fit: 'regular' as const,
    materials: ['cotton'],
    name: 'Official Merch',
    customNotes: 'I got burnhole in my hoodie, all my homies think it’s stank. I need a cocoa butter kisses.',
  },
  {
    file: img('tees', 'tee-7.png'),
    category: 'shirt' as const,
    colors: [{ name: 'grey', hex: '#808080', ratio: 100 }],
    brand: 'Uniqlo',
    fit: 'skinny' as const,
    materials: ['cotton'],
    name: 'U Charcoal Slim',
  },
  {
    file: img('tees', 'tee-8.png'),
    category: 'shirt' as const,
    colors: [{ name: 'navy', hex: '#1c2c4a', ratio: 100 }],
    brand: 'Timberland',
    fit: 'regular' as const,
    materials: ['cotton'],
    name: 'Pocket Tee Navy',
  },
  // collared shirts
  {
    file: img('collared shirt', 'collared-shirt-1.png'),
    category: 'shirt' as const,
    colors: [{ name: 'cream', hex: '#efe6d3', ratio: 100 }],
    brand: 'COS',
    fit: 'regular' as const,
    materials: ['linen'],
    name: 'Linen Camp Collar',
    customNotes: 'Linen wrinkles fast — embrace it. Wash cold, hang dry.',
  },
  {
    file: img('collared shirt', 'collared-shirt-2.png'),
    category: 'shirt' as const,
    colors: [{ name: 'cream', hex: '#efe6d3', ratio: 100 }],
    brand: 'Arket',
    fit: 'regular' as const,
    materials: ['linen'],
    name: 'Floral Resort',
  },
  {
    file: img('collared shirt', 'collared-shirt-3.png'),
    category: 'shirt' as const,
    colors: [{ name: 'navy', hex: '#1c2c4a', ratio: 100 }],
    brand: 'Uniqlo',
    fit: 'skinny' as const,
    materials: ['cotton'],
    name: 'Dry Polo Navy',
  },
  {
    file: img('collared shirt', 'collared-shirt-4.png'),
    category: 'shirt' as const,
    colors: [{ name: 'red', hex: '#c82832', ratio: 100 }],
    brand: 'Geekoutfit',
    fit: 'relaxed' as const,
    materials: ['cotton'],
    name: 'PowerPoint Print',
  },
  // outerwear
  {
    file: img('outer', 'outer-1.png'),
    category: 'jacket' as const,
    colors: [{ name: 'red', hex: '#c82832', ratio: 100 }],
    brand: 'Champion',
    fit: 'oversize' as const,
    length: 'hip' as const,
    materials: ['cotton', 'fleece'],
    name: 'Reverse Weave Hoodie',
    customNotes: 'Heavyweight, takes a while to break in. Worth it.',
  },
  {
    file: img('outer', 'outer-2.png'),
    category: 'jacket' as const,
    colors: [{ name: 'brown', hex: '#785032', ratio: 100 }],
    brand: 'Louis Vuitton',
    fit: 'relaxed' as const,
    length: 'hip' as const,
    materials: ['leather'],
    name: 'Distressed Bomber',
    customNotes: 'Real leather. Dry-clean only. Statement piece for cooler nights.',
  },
  {
    file: img('outer', 'outer-3.png'),
    category: 'jacket' as const,
    colors: [{ name: 'grey', hex: '#808080', ratio: 100 }],
    brand: 'Patagonia x Supreme',
    fit: 'regular' as const,
    length: 'hip' as const,
    materials: ['wool'],
    name: 'Wool Puffer',
    customNotes: 'Warm without the bulk. Spot-clean stains, full clean once a season.',
  },
  {
    file: img('outer', 'outer-4.png'),
    category: 'jacket' as const,
    colors: [{ name: 'navy', hex: '#1c2c4a', ratio: 100 }],
    brand: 'LA Dodgers',
    fit: 'oversize' as const,
    length: 'hip' as const,
    materials: ['polyester'],
    name: 'WS 2024 Varsity',
  },
  {
    file: img('outer', 'outer-5.png'),
    category: 'jacket' as const,
    colors: [{ name: 'grey', hex: '#808080', ratio: 100 }],
    brand: 'Stüssy',
    fit: 'oversize' as const,
    length: 'thigh' as const,
    materials: ['cotton'],
    name: 'Skull Distressed Knit',
  },
  {
    file: img('outer', 'outer-6.png'),
    category: 'jacket' as const,
    colors: [{ name: 'blue', hex: '#2858b4', ratio: 100 }],
    brand: 'Jerarch Studios',
    fit: 'relaxed' as const,
    length: 'hip' as const,
    materials: ['cotton', 'wool'],
    name: 'Studio Knit Pullover',
  },
  // pants
  {
    file: img('pants', 'pants-1.png'),
    category: 'pants' as const,
    colors: [{ name: 'white', hex: '#f0eee9', ratio: 100 }],
    brand: 'Uniqlo',
    fit: 'regular' as const,
    length: 'full-length' as const,
    materials: ['cotton'],
    name: 'Off-White Chino',
    customNotes: 'Workhorse pant. Stains love it though — careful around coffee.',
  },
  {
    file: img('pants', 'pants-2.png'),
    category: 'pants' as const,
    colors: [{ name: 'black', hex: '#1a1a1a', ratio: 100 }],
    brand: 'Acne',
    fit: 'skinny' as const,
    length: 'ankle-length' as const,
    materials: ['cotton'],
    name: 'Black Sweatpant',
  },
  {
    file: img('pants', 'pants-3.png'),
    category: 'pants' as const,
    colors: [{ name: 'black', hex: '#1a1a1a', ratio: 100 }],
    brand: 'Dickies',
    fit: 'relaxed' as const,
    length: 'full-length' as const,
    materials: ['cotton'],
    name: 'Pleated Trouser',
  },
  {
    file: img('pants', 'pants-4.png'),
    category: 'pants' as const,
    colors: [{ name: 'brown', hex: '#785032', ratio: 100 }],
    brand: 'Cibaduyut',
    fit: 'regular' as const,
    length: 'full-length' as const,
    materials: ['cotton'],
    name: 'Brown Pleated',
  },
  {
    file: img('pants', 'pants-5.png'),
    category: 'pants' as const,
    colors: [{ name: 'olive', hex: '#6e6e3c', ratio: 100 }],
    brand: 'Carhartt',
    fit: 'relaxed' as const,
    length: 'full-length' as const,
    materials: ['cotton'],
    name: 'Olive Carpenter',
  },
  // headwear
  {
    file: img('headwear', 'headwear-1.png'),
    category: 'headwear' as const,
    colors: [{ name: 'black', hex: '#1a1a1a', ratio: 100 }],
    brand: 'Carhartt',
    fit: null,
    materials: ['acrylic'],
    name: 'Acrylic Watch Beanie',
    customNotes: 'Stretches out over time. Throw in a delicates bag when washing.',
  },
  {
    file: img('headwear', 'headwear-2.png'),
    category: 'headwear' as const,
    colors: [{ name: 'tan', hex: '#c8a582', ratio: 100 }],
    brand: 'New Era',
    fit: null,
    materials: ['cotton'],
    name: 'Tan Dad Cap',
  },
  {
    file: img('headwear', 'headwear-3.png'),
    category: 'headwear' as const,
    colors: [{ name: 'cream', hex: '#efe6d3', ratio: 100 }],
    brand: 'Uniqlo',
    fit: null,
    materials: ['cotton'],
    name: 'Corduroy Cap',
  },
  // --- AI / wishlist items: items the user saved from a Steal-the-Look
  // analysis but does NOT own yet. owned:false flags them as wishlist;
  // the saved-outfit detail surfaces an "AI-generated" badge with the
  // not-yet-owned count.
  {
    file: img('outer', 'outer-5.png'),
    category: 'jacket' as const,
    colors: [{ name: 'multi', hex: '#9466b8', ratio: 100 }],
    brand: null,
    fit: 'oversize' as const,
    length: 'hip' as const,
    materials: ['cotton'],
    name: 'Patchwork Trucker (AI)',
    owned: false,
  },
  {
    file: img('pants', 'pants-3.png'),
    category: 'pants' as const,
    colors: [{ name: 'multi', hex: '#5a4a3a', ratio: 100 }],
    brand: null,
    fit: 'relaxed' as const,
    length: 'full-length' as const,
    materials: ['cotton'],
    name: 'Cargo Wide-leg (AI)',
    owned: false,
  },
  {
    file: img('headwear', 'headwear-3.png'),
    category: 'headwear' as const,
    colors: [{ name: 'multi', hex: '#7a8b6a', ratio: 100 }],
    brand: null,
    fit: null,
    materials: ['cotton'],
    name: 'Bucket Hat (AI)',
    owned: false,
  },
]

const itemRows = await db
  .insert(clothingItem)
  .values(
    itemSeeds.map((s) => ({
      userId,
      imageUrl: s.file,
      category: s.category,
      colors: s.colors,
      brand: s.brand,
      fit: s.fit ?? null,
      length: 'length' in s ? ((s as { length?: typeof s.length }).length ?? null) : null,
      name: 'name' in s ? ((s as { name?: string }).name ?? null) : null,
      customNotes:
        'customNotes' in s ? ((s as { customNotes?: string }).customNotes ?? null) : null,
      owned: 'owned' in s ? ((s as { owned?: boolean }).owned ?? true) : true,
    })),
  )
  .returning()

console.log(`  → ${itemRows.length} clothing items`)

// --- outfits --------------------------------------------------------------

const tee = (color: string) =>
  itemRows.find((r) => r.category === 'shirt' && r.colors[0]?.name === color)
const pants = (color: string) =>
  itemRows.find((r) => r.category === 'pants' && r.colors[0]?.name === color)
const outer = (color: string) =>
  itemRows.find((r) => r.category === 'jacket' && r.colors[0]?.name === color)
const shoes = (color: string) =>
  itemRows.find((r) => r.category === 'footwear' && r.colors[0]?.name === color)

const outfitSeeds = [
  {
    name: 'Nongki dulu',
    baseId: tee('white')?.id,
    outerId: outer('brown')?.id,
    bottomId: pants('white')?.id,
    footwearId: shoes('white')?.id,
    tags: ['streetwear', 'warm', 'spring', 'fall', 'earth-tone'],
    rating: 'loved' as const,
  },
  {
    name: 'Aduh Gantengnya',
    baseId: tee('navy')?.id,
    outerId: outer('navy')?.id,
    bottomId: pants('black')?.id,
    footwearId: shoes('white')?.id,
    tags: ['cool'],
    rating: 'loved' as const,
  },
  {
    name: 'All grey',
    baseId: tee('grey')?.id,
    outerId: outer('grey')?.id,
    bottomId: pants('black')?.id,
    footwearId: shoes('black')?.id,
    tags: ['evening', 'minimal', 'date-night'],
    rating: 'loved' as const,
  },
  {
    name: 'Linen day',
    baseId: tee('white')?.id,
    bottomId: pants('black')?.id,
    footwearId: shoes('white')?.id,
    tags: ['summer', 'casual'],
    rating: null,
  },
  {
    name: 'Sunday errands',
    baseId: tee('grey')?.id,
    bottomId: pants('olive')?.id,
    footwearId: shoes('white')?.id,
    tags: ['casual'],
    rating: 'ok' as const,
  },
  // Steal-the-Look save: user kept a stylist-generated fit. The slot
  // items reference the owned:false rows above so the saved-outfit card
  // can surface "AI-generated · N items" indicating they're wishlisted.
  {
    name: 'Siap Menjadi Badutmu, Sayang',
    baseId: tee('grey')?.id,
    headwearId: itemRows.find((r) => r.name === 'Bucket Hat (AI)')?.id,
    outerId: itemRows.find((r) => r.name === 'Patchwork Trucker (AI)')?.id,
    bottomId: itemRows.find((r) => r.name === 'Cargo Wide-leg (AI)')?.id,
    footwearId: shoes('white')?.id,
    tags: ['streetwear', 'warm'],
    rating: null,
  },
]

await db.insert(outfit).values(
  outfitSeeds.map((o) => ({
    userId,
    name: o.name,
    headwearId: 'headwearId' in o ? (o.headwearId ?? null) : null,
    baseId: o.baseId ?? null,
    outerId: o.outerId ?? null,
    bottomId: o.bottomId ?? null,
    footwearId: o.footwearId ?? null,
    tags: o.tags,
    rating: o.rating,
    wornAt: o.rating ? new Date() : null,
  })),
)
console.log(`  → ${outfitSeeds.length} outfits`)

// --- style board: tags + cards + saves -----------------------------------

const tagLabels: Array<{
  label: string
  category: 'aesthetic' | 'color' | 'silhouette' | 'occasion' | 'season'
}> = [
  { label: 'minimalist', category: 'aesthetic' },
  { label: 'streetwear', category: 'aesthetic' },
  { label: 'workwear', category: 'aesthetic' },
  { label: 'oversize', category: 'silhouette' },
  { label: 'tailored', category: 'silhouette' },
  { label: 'neutral', category: 'color' },
]

const tagRows = await db.insert(styleTag).values(tagLabels).onConflictDoNothing().returning()

const allTags = tagRows.length > 0 ? tagRows : await db.select().from(styleTag)

const cardRows = await db
  .insert(styleCard)
  .values(
    Array.from({ length: 6 }).map((_, i) => ({
      imageUrl: `https://picsum.photos/seed/kurasi-style-${i}/800/1200`,
      sourceAttribution: `seed-${i}`,
    })),
  )
  .returning()

await db.insert(styleCardTag).values(
  cardRows.flatMap((c, i) => {
    // biome-ignore lint/style/noNonNullAssertion: it's fine
    const t1 = allTags[i % allTags.length]!
    // biome-ignore lint/style/noNonNullAssertion: it's fine
    const t2 = allTags[(i + 2) % allTags.length]!
    return [
      { cardId: c.id, tagId: t1.id },
      { cardId: c.id, tagId: t2.id },
    ]
  }),
)

await db.insert(savedStyle).values(cardRows.slice(0, 3).map((c) => ({ userId, cardId: c.id })))

await db.insert(styleInteraction).values(
  cardRows.slice(0, 4).map((c, i) => ({
    userId,
    cardId: c.id,
    kind: i < 3 ? ('liked' as const) : ('skipped' as const),
  })),
)

console.log(`  → ${cardRows.length} style cards, 3 saved`)
console.log('Seed complete.')
process.exit(0)
