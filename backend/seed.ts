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

await db.insert(userBiometrics).values({
  userId,
  heightCm: 178,
  weightKg: 72,
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
    category: 'tee' as const,
    primaryColor: 'white',
    brand: 'Uniqlo',
    fit: 'standard' as const,
    materials: ['cotton'],
    customNotes: 'Uniqlo-U White',
  },
  {
    file: img('tees', 'tee-2.png'),
    category: 'tee' as const,
    primaryColor: 'white',
    brand: 'Uniqlo',
    fit: 'standard' as const,
    materials: ['cotton'],
    customNotes: 'Airism Crewneck',
  },
  {
    file: img('tees', 'tee-3.png'),
    category: 'tee' as const,
    primaryColor: 'grey',
    brand: 'Uniqlo',
    fit: 'oversize' as const,
    materials: ['cotton'],
    customNotes: 'U Oversized Grey',
  },
  {
    file: img('tees', 'tee-4.png'),
    category: 'tee' as const,
    primaryColor: 'white',
    brand: 'Tiny Wisdom',
    fit: 'standard' as const,
    materials: ['cotton'],
    customNotes: 'White Tee',
  },
  {
    file: img('tees', 'tee-5.png'),
    category: 'tee' as const,
    primaryColor: 'white',
    brand: 'Puma',
    fit: 'oversize' as const,
    materials: ['cotton'],
    customNotes: 'Hyrox Yokohama 2025',
  },
  {
    file: img('tees', 'tee-6.png'),
    category: 'tee' as const,
    primaryColor: 'black',
    brand: 'Cannibal Corpse',
    fit: 'standard' as const,
    materials: ['cotton'],
    customNotes: 'Official Merch',
  },
  {
    file: img('tees', 'tee-7.png'),
    category: 'tee' as const,
    primaryColor: 'grey',
    brand: 'Uniqlo',
    fit: 'slim' as const,
    materials: ['cotton'],
    customNotes: 'U Charcoal Slim',
  },
  {
    file: img('tees', 'tee-8.png'),
    category: 'tee' as const,
    primaryColor: 'navy',
    brand: 'Timberland',
    fit: 'standard' as const,
    materials: ['cotton'],
    customNotes: 'Pocket Tee Navy',
  },
  // collared shirts
  {
    file: img('collared shirt', 'collared-shirt-1.png'),
    category: 'collared_shirt' as const,
    primaryColor: 'cream',
    brand: 'COS',
    fit: 'standard' as const,
    materials: ['linen'],
    customNotes: 'Linen Camp Collar',
  },
  {
    file: img('collared shirt', 'collared-shirt-2.png'),
    category: 'collared_shirt' as const,
    primaryColor: 'cream',
    brand: 'Arket',
    fit: 'standard' as const,
    materials: ['linen'],
    customNotes: 'Floral Resort',
  },
  {
    file: img('collared shirt', 'collared-shirt-3.png'),
    category: 'collared_shirt' as const,
    primaryColor: 'navy',
    brand: 'Uniqlo',
    fit: 'slim' as const,
    materials: ['cotton'],
    customNotes: 'Dry Polo Navy',
  },
  {
    file: img('collared shirt', 'collared-shirt-4.png'),
    category: 'collared_shirt' as const,
    primaryColor: 'red',
    brand: 'Geekoutfit',
    fit: 'relaxed' as const,
    materials: ['cotton'],
    customNotes: 'PowerPoint Print',
  },
  // outerwear
  {
    file: img('outer', 'outer-1.png'),
    category: 'outer' as const,
    primaryColor: 'red',
    brand: 'Champion',
    fit: 'oversize' as const,
    materials: ['cotton', 'fleece'],
    customNotes: 'Reverse Weave Hoodie',
  },
  {
    file: img('outer', 'outer-2.png'),
    category: 'outer' as const,
    primaryColor: 'brown',
    brand: 'Louis Vuitton',
    fit: 'relaxed' as const,
    materials: ['leather'],
    customNotes: 'Distressed Bomber',
  },
  {
    file: img('outer', 'outer-3.png'),
    category: 'outer' as const,
    primaryColor: 'grey',
    brand: 'Patagonia x Supreme',
    fit: 'standard' as const,
    materials: ['wool'],
    customNotes: 'Wool Puffer',
  },
  {
    file: img('outer', 'outer-4.png'),
    category: 'outer' as const,
    primaryColor: 'navy',
    brand: 'LA Dodgers',
    fit: 'oversize' as const,
    materials: ['polyester'],
    customNotes: 'WS 2024 Varsity',
  },
  {
    file: img('outer', 'outer-5.png'),
    category: 'outer' as const,
    primaryColor: 'grey',
    brand: 'Stüssy',
    fit: 'oversize' as const,
    materials: ['cotton'],
    customNotes: 'Skull Distressed Knit',
  },
  {
    file: img('outer', 'outer-6.png'),
    category: 'outer' as const,
    primaryColor: 'blue',
    brand: 'Jerarch Studios',
    fit: 'relaxed' as const,
    materials: ['cotton', 'wool'],
    customNotes: 'Studio Knit Pullover',
  },
  // pants
  {
    file: img('pants', 'pants-1.png'),
    category: 'pants' as const,
    primaryColor: 'white',
    brand: 'Uniqlo',
    fit: 'standard' as const,
    materials: ['cotton'],
    customNotes: 'Off-White Chino',
  },
  {
    file: img('pants', 'pants-2.png'),
    category: 'pants' as const,
    primaryColor: 'black',
    brand: 'Acne',
    fit: 'slim' as const,
    materials: ['cotton'],
    customNotes: 'Black Sweatpant',
  },
  {
    file: img('pants', 'pants-3.png'),
    category: 'pants' as const,
    primaryColor: 'black',
    brand: 'Dickies',
    fit: 'relaxed' as const,
    materials: ['cotton'],
    customNotes: 'Pleated Trouser',
  },
  {
    file: img('pants', 'pants-4.png'),
    category: 'pants' as const,
    primaryColor: 'brown',
    brand: 'Cibaduyut',
    fit: 'standard' as const,
    materials: ['cotton'],
    customNotes: 'Brown Pleated',
  },
  {
    file: img('pants', 'pants-5.png'),
    category: 'pants' as const,
    primaryColor: 'olive',
    brand: 'Carhartt',
    fit: 'relaxed' as const,
    materials: ['cotton'],
    customNotes: 'Olive Carpenter',
  },
  // shorts
  {
    file: img('shorts', 'shorts-1.png'),
    category: 'shorts' as const,
    primaryColor: 'khaki',
    brand: 'Patagonia',
    fit: 'standard' as const,
    materials: ['nylon'],
  },
  {
    file: img('shorts', 'shorts-2.png'),
    category: 'shorts' as const,
    primaryColor: 'black',
    brand: 'Nike',
    fit: 'standard' as const,
    materials: ['polyester'],
  },
  // headwear
  {
    file: img('headwear', 'headwear-1.png'),
    category: 'headwear' as const,
    primaryColor: 'black',
    brand: 'Carhartt',
    fit: null,
    materials: ['acrylic'],
  },
  {
    file: img('headwear', 'headwear-2.png'),
    category: 'headwear' as const,
    primaryColor: 'tan',
    brand: 'New Era',
    fit: null,
    materials: ['cotton'],
  },
  {
    file: img('headwear', 'headwear-3.png'),
    category: 'headwear' as const,
    primaryColor: 'cream',
    brand: 'Uniqlo',
    fit: null,
    materials: ['cotton'],
  },
  // bags
  {
    file: img('bags', 'bag-1.png'),
    category: 'bag' as const,
    primaryColor: 'olive',
    brand: 'Goldwin',
    fit: null,
    materials: ['nylon'],
  },
  {
    file: img('bags', 'bag-2.png'),
    category: 'bag' as const,
    primaryColor: 'black',
    brand: 'Porter',
    fit: null,
    materials: ['nylon'],
  },
  // scarf
  {
    file: img('scarf', 'scarf-1.png'),
    category: 'scarf' as const,
    primaryColor: 'cream',
    brand: 'Acne',
    fit: null,
    materials: ['wool'],
  },
]

const itemRows = await db
  .insert(clothingItem)
  .values(
    itemSeeds.map((s, i) => ({
      userId,
      imageUrl: s.file,
      category: s.category,
      primaryColor: s.primaryColor,
      materials: s.materials,
      brand: s.brand,
      fit: s.fit ?? null,
      occasions: ['casual'],
      isFavorite: i < 4,
      customNotes:
        'customNotes' in s ? ((s as { customNotes?: string }).customNotes ?? null) : null,
    })),
  )
  .returning()

console.log(`  → ${itemRows.length} clothing items`)

// --- outfits --------------------------------------------------------------

const tee = (color: string) =>
  itemRows.find((r) => r.category === 'tee' && r.primaryColor === color)
const pants = (color: string) =>
  itemRows.find((r) => r.category === 'pants' && r.primaryColor === color)
const outer = (color: string) =>
  itemRows.find((r) => r.category === 'outer' && r.primaryColor === color)
const shoes = (color: string) =>
  itemRows.find((r) => r.category === 'footwear' && r.primaryColor === color)

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
]

await db.insert(outfit).values(
  outfitSeeds.map((o) => ({
    userId,
    name: o.name,
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
