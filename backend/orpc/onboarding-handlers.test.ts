import { beforeEach, describe, expect, test } from 'bun:test'
import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { onboardingProgress, user } from '../db/schema'
import * as utils from '../test/utils'
import { onboardingHandlers } from './onboarding-handlers'

async function insertOnboardingRow(
  overrides: Partial<typeof onboardingProgress.$inferInsert> = {},
) {
  const now = new Date()
  const [row] = await utils
    .testContext()
    .db.insert(onboardingProgress)
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
  return row
}

beforeEach(async () => {
  await utils.resetTestDb()
  await utils.seedUser()
})

describe('getOnboarding', () => {
  test('returns caller’s row with derived booleans all false when fresh', async () => {
    await insertOnboardingRow()
    const result = await call(onboardingHandlers.get, undefined as never, {
      context: utils.testContext(),
    })
    expect(result).toMatchObject({
      userId: 'user-a',
      status: 'in_progress',
      biometricsDone: false,
      starterWardrobeDone: false,
      allStepsDone: false,
    })
  })

  test('derived booleans flip when timestamps populated', async () => {
    await insertOnboardingRow({
      biometricsCompletedAt: new Date(),
      starterWardrobeCompletedAt: null,
    })
    const result = await call(onboardingHandlers.get, undefined as never, {
      context: utils.testContext(),
    })
    expect(result!.biometricsDone).toBe(true)
    expect(result!.starterWardrobeDone).toBe(false)
    expect(result!.allStepsDone).toBe(false)
  })

  test('allStepsDone is true when both timestamps populated', async () => {
    await insertOnboardingRow({
      biometricsCompletedAt: new Date(),
      starterWardrobeCompletedAt: new Date(),
      status: 'completed',
      completedAt: new Date(),
    })
    const result = await call(onboardingHandlers.get, undefined as never, {
      context: utils.testContext(),
    })
    expect(result!.allStepsDone).toBe(true)
    expect(result!.status).toBe('completed')
  })

  test('returns null when no row exists', async () => {
    await utils
      .testContext()
      .db.delete(onboardingProgress)
      .where(eq(onboardingProgress.userId, 'user-a'))
    const result = await call(onboardingHandlers.get, undefined as never, {
      context: utils.testContext(),
    })
    expect(result).toBeNull()
  })

  test('scoped to caller — other users’ rows are not leaked', async () => {
    const now = new Date()
    await utils
      .testContext()
      .db.delete(onboardingProgress)
      .where(eq(onboardingProgress.userId, 'user-a'))
    await utils.testContext().db.insert(user).values({
      id: 'user-b',
      name: 'Other User',
      email: 'user-b@example.com',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
      trialStartedAt: now,
    })
    await insertOnboardingRow({ userId: 'user-b', biometricsCompletedAt: new Date() })
    const result = await call(onboardingHandlers.get, undefined as never, {
      context: utils.testContext(),
    })
    expect(result).toBeNull()
  })

  test('throws UNAUTHORIZED when no session', async () => {
    utils.setTestUser(null)
    await expect(
      call(onboardingHandlers.get, undefined as never, { context: utils.testContext() }),
    ).rejects.toThrow()
  })
})
