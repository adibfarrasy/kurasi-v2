/** Namespace-style usage: import * as utils from './utils' */

import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { testAuth } from '../auth-testing'
import {
  clothingItem,
  fitAdjustment,
  onboardingProgress,
  outfit,
  outfitRecommendationRequest,
  savedStyle,
  sharedOutfit,
  styleCard,
  styleInteraction,
  type user,
} from '../db/schema'
import type { ORPCContext } from '../orpc/orpc-base'

type TestUser = typeof user.$inferSelect

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('DATABASE_URL must be set before loading test utils')
}

type BetterAuthTestHelpers = {
  createUser(overrides?: Partial<TestUser> & Record<string, unknown>): TestUser
  saveUser(user: TestUser): Promise<TestUser>
  login(opts: { userId: string }): Promise<{ headers: Headers; user: TestUser }>
  getAuthHeaders(opts: { userId: string }): Promise<Headers>
}

const authContext = (await testAuth.$context) as unknown as { test: BetterAuthTestHelpers }

export const auth = authContext.test
export const db = drizzle(databaseUrl)

function expectSeededRow<T>(row: T | undefined): T {
  if (!row) {
    throw new Error('Expected database seed to return a row')
  }
  return row
}

let currentHeaders = new Headers()

export function testContext() {
  return {
    db,
    auth: testAuth,
    reqHeaders: currentHeaders,
  } satisfies ORPCContext
}

export function setTestUser(nextUser: TestUser | null) {
  if (nextUser === null) {
    currentHeaders = new Headers()
  }
}

export async function resetTestDb() {
  await db.execute(sql`
    truncate table
      "user",
      "session",
      "account",
      "verification",
      "subscription",
      "clothing_item",
      "outfit",
      "onboarding_progress",
      "user_biometrics",
      "style_card",
      "style_interaction",
      "saved_style",
      "fit_adjustment",
      "outfit_recommendation_request",
      "shared_outfit"
    restart identity cascade
  `)
  currentHeaders = new Headers()
}

export async function seedUser(overrides: Partial<TestUser> = {}) {
  const now = new Date()
  const userToSave = auth.createUser({
    id: 'user-a',
    name: 'Test User',
    email: 'user-a@example.com',
    emailVerified: true,
    image: null,
    createdAt: now,
    updatedAt: now,
    trialStartedAt: now,
    ...overrides,
  })
  const row = await auth.saveUser(userToSave)
  currentHeaders = await auth.getAuthHeaders({ userId: row.id })

  return expectSeededRow(row)
}

export async function loginAsUser(userId: string) {
  currentHeaders = await auth.getAuthHeaders({ userId })
}

export async function seedOnboarding(
  overrides: Partial<typeof onboardingProgress.$inferInsert> = {},
) {
  const now = new Date()
  const [row] = await db
    .insert(onboardingProgress)
    .values({
      userId: 'user-a',
      status: 'in_progress',
      biometricsCompletedAt: null,
      starterWardrobeCompletedAt: null,
      startedAt: now,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .onConflictDoUpdate({
      target: onboardingProgress.userId,
      set: {
        status: overrides.status ?? 'in_progress',
        biometricsCompletedAt: overrides.biometricsCompletedAt ?? null,
        starterWardrobeCompletedAt: overrides.starterWardrobeCompletedAt ?? null,
        completedAt: overrides.completedAt ?? null,
        updatedAt: now,
      },
    })
    .returning()
  return expectSeededRow(row)
}

export async function seedClothingItem(overrides: Partial<typeof clothingItem.$inferInsert> = {}) {
  const [row] = await db
    .insert(clothingItem)
    .values({
      userId: 'user-a',
      imageUrl: 'https://example.com/item.jpg',
      category: 'shirt',
      colors: [{ name: 'black', hex: '#1a1a1a', ratio: 100 }],
      ...overrides,
    })
    .returning()
  return expectSeededRow(row)
}

export async function seedOutfit(overrides: Partial<typeof outfit.$inferInsert> = {}) {
  const [row] = await db
    .insert(outfit)
    .values({
      userId: 'user-a',
      name: null,
      notes: null,
      status: 'active',
      ...overrides,
    })
    .returning()
  return expectSeededRow(row)
}

export async function seedStyleCard(overrides: Partial<typeof styleCard.$inferInsert> = {}) {
  const [row] = await db
    .insert(styleCard)
    .values({
      imageUrl: 'https://example.com/style.jpg',
      sourceAttribution: 'test',
      status: 'active',
      ...overrides,
    })
    .returning()
  return expectSeededRow(row)
}

export async function seedStyleInteraction(
  overrides: Partial<typeof styleInteraction.$inferInsert> = {},
) {
  const cardId = overrides.cardId ?? (await seedStyleCard()).id
  const [row] = await db
    .insert(styleInteraction)
    .values({
      userId: 'user-a',
      cardId,
      kind: 'liked',
      ...overrides,
    })
    .returning()
  return expectSeededRow(row)
}

export async function seedSavedStyle(overrides: Partial<typeof savedStyle.$inferInsert> = {}) {
  const cardId = overrides.cardId ?? (await seedStyleCard()).id
  const [row] = await db
    .insert(savedStyle)
    .values({
      userId: 'user-a',
      cardId,
      ...overrides,
    })
    .returning()
  return expectSeededRow(row)
}

export async function seedFitAdjustment(
  overrides: Partial<typeof fitAdjustment.$inferInsert> = {},
) {
  const itemId = overrides.itemId ?? (await seedClothingItem()).id
  const [row] = await db
    .insert(fitAdjustment)
    .values({
      userId: 'user-a',
      itemId,
      length: 'true_to_size',
      ...overrides,
    })
    .returning()
  return expectSeededRow(row)
}

export async function seedSharedOutfit(overrides: Partial<typeof sharedOutfit.$inferInsert> = {}) {
  const outfitId = overrides.outfitId ?? (await seedOutfit()).id
  const [row] = await db
    .insert(sharedOutfit)
    .values({
      userId: 'user-a',
      outfitId,
      faceAnonymisation: 'none',
      showUsername: true,
      status: 'published',
      ...overrides,
    })
    .returning()
  return expectSeededRow(row)
}

export async function seedRecommendation(
  overrides: Partial<typeof outfitRecommendationRequest.$inferInsert> = {},
) {
  const [row] = await db
    .insert(outfitRecommendationRequest)
    .values({
      userId: 'user-a',
      kind: 'gap_filling',
      status: 'pending',
      ...overrides,
    })
    .returning()
  return expectSeededRow(row)
}
