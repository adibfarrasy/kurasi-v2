import { beforeEach, describe, expect, test } from 'bun:test'
import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { onboardingProgress, user, userBiometrics } from '../db/schema'
import * as utils from '../test/utils'
import { biometricsHandlers } from './biometrics-handlers'

async function insertBiometricsRow(overrides: Partial<typeof userBiometrics.$inferInsert> = {}) {
  const [row] = await utils
    .testContext()
    .db.insert(userBiometrics)
    .values({
      userId: 'user-a',
      heightCm: 170,
      weightKg: 65,
      facePhotoUrl: null,
      ...overrides,
    })
    .returning()
  return row
}

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

describe('getBiometrics', () => {
  test('returns caller’s row when it exists', async () => {
    await insertBiometricsRow({ userId: 'user-a', heightCm: 175, weightKg: 70 })
    const result = await call(biometricsHandlers.get, undefined as never, {
      context: utils.testContext(),
    })
    expect(result).toMatchObject({ userId: 'user-a', heightCm: 175, weightKg: 70 })
  })

  test('returns null when caller has no biometrics row', async () => {
    const result = await call(biometricsHandlers.get, undefined as never, {
      context: utils.testContext(),
    })
    expect(result).toBeNull()
  })

  test('does not leak another user’s row', async () => {
    const now = new Date()
    await utils.testContext().db.insert(user).values({
      id: 'user-b',
      name: 'Other User',
      email: 'user-b@example.com',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
      trialStartedAt: now,
    })
    await insertBiometricsRow({ userId: 'user-b', heightCm: 190 })
    const result = await call(biometricsHandlers.get, undefined as never, {
      context: utils.testContext(),
    })
    expect(result).toBeNull()
  })

  test('throws UNAUTHORIZED when no session', async () => {
    utils.setTestUser(null)
    await expect(
      call(biometricsHandlers.get, undefined as never, { context: utils.testContext() }),
    ).rejects.toThrow()
  })
})

describe('setBiometrics — upsert', () => {
  test('creates row when none exists', async () => {
    const result = await call(biometricsHandlers.set, { heightCm: 175, weightKg: 70 } as never, {
      context: utils.testContext(),
    })
    const rows = await utils.testContext().db.select().from(userBiometrics)
    expect(result).toMatchObject({ userId: 'user-a', heightCm: 175, weightKg: 70 })
    expect(rows).toHaveLength(1)
  })

  test('updates existing row (upsert) — no duplicate created', async () => {
    await insertBiometricsRow({ userId: 'user-a', heightCm: 170, weightKg: 65 })
    const result = await call(biometricsHandlers.set, { heightCm: 180, weightKg: 75 } as never, {
      context: utils.testContext(),
    })
    const rows = await utils.testContext().db.select().from(userBiometrics)
    expect(result!.heightCm).toBe(180)
    expect(result!.weightKg).toBe(75)
    expect(rows).toHaveLength(1)
  })

  test('derives userId from caller — cannot spoof', async () => {
    const result = await call(
      biometricsHandlers.set,
      { heightCm: 170, weightKg: 65, userId: 'attacker' } as never,
      { context: utils.testContext() },
    )
    expect(result!.userId).toBe('user-a')
  })

  test('rejects invalid measurements', async () => {
    await expect(
      call(biometricsHandlers.set, { heightCm: 129, weightKg: 65 } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
    await expect(
      call(biometricsHandlers.set, { heightCm: 221, weightKg: 65 } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
    await expect(
      call(biometricsHandlers.set, { heightCm: 170, weightKg: 29 } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
    await expect(
      call(biometricsHandlers.set, { heightCm: 170, weightKg: 201 } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
    await expect(
      call(biometricsHandlers.set, { heightCm: 170.5, weightKg: 65 } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
  })

  test('accepts valid facePhotoUrl', async () => {
    const result = await call(
      biometricsHandlers.set,
      {
        heightCm: 170,
        weightKg: 65,
        facePhotoUrl: 'https://example.com/face.jpg',
      } as never,
      { context: utils.testContext() },
    )
    expect(result!.facePhotoUrl).toBe('https://example.com/face.jpg')
  })

  test('accepts no facePhotoUrl', async () => {
    const result = await call(biometricsHandlers.set, { heightCm: 170, weightKg: 65 } as never, {
      context: utils.testContext(),
    })
    expect(result!.facePhotoUrl).toBeNull()
  })
})

describe('setBiometrics — onboarding step completion', () => {
  test('first set call stamps biometricsCompletedAt on OnboardingProgress', async () => {
    await insertOnboardingRow()
    await call(biometricsHandlers.set, { heightCm: 170, weightKg: 65 } as never, {
      context: utils.testContext(),
    })
    const [progress] = await utils
      .testContext()
      .db.select()
      .from(onboardingProgress)
      .where(eq(onboardingProgress.userId, 'user-a'))
    expect(progress!.biometricsCompletedAt).not.toBeNull()
    expect(progress!.status).toBe('in_progress')
  })

  test('second set call does not overwrite biometricsCompletedAt', async () => {
    const firstStamp = new Date(2020, 0, 1)
    await insertOnboardingRow({ biometricsCompletedAt: firstStamp })
    await call(biometricsHandlers.set, { heightCm: 175, weightKg: 70 } as never, {
      context: utils.testContext(),
    })
    const [progress] = await utils
      .testContext()
      .db.select()
      .from(onboardingProgress)
      .where(eq(onboardingProgress.userId, 'user-a'))
    expect(progress!.biometricsCompletedAt).toEqual(firstStamp)
  })

  test('when starter wardrobe already done, first biometrics set completes onboarding', async () => {
    await insertOnboardingRow({ starterWardrobeCompletedAt: new Date() })
    await call(biometricsHandlers.set, { heightCm: 170, weightKg: 65 } as never, {
      context: utils.testContext(),
    })
    const [progress] = await utils
      .testContext()
      .db.select()
      .from(onboardingProgress)
      .where(eq(onboardingProgress.userId, 'user-a'))
    expect(progress!.status).toBe('completed')
    expect(progress!.completedAt).not.toBeNull()
  })

  test('no-op when no onboarding row exists for the user', async () => {
    await utils
      .testContext()
      .db.delete(onboardingProgress)
      .where(eq(onboardingProgress.userId, 'user-a'))
    const result = await call(biometricsHandlers.set, { heightCm: 170, weightKg: 65 } as never, {
      context: utils.testContext(),
    })
    const progress = await utils.testContext().db.select().from(onboardingProgress)
    expect(result).toMatchObject({ userId: 'user-a', heightCm: 170 })
    expect(progress).toHaveLength(0)
  })
})

describe('removeFacePhoto', () => {
  test('clears an existing facePhotoUrl', async () => {
    await insertBiometricsRow({ userId: 'user-a', facePhotoUrl: 'https://example.com/face.jpg' })
    const result = await call(biometricsHandlers.removePhoto, undefined as never, {
      context: utils.testContext(),
    })
    const [row] = await utils
      .testContext()
      .db.select()
      .from(userBiometrics)
      .where(eq(userBiometrics.userId, 'user-a'))
    expect(result!.facePhotoUrl).toBeNull()
    expect(row!.facePhotoUrl).toBeNull()
  })

  test('NOT_FOUND when no biometrics row exists for the user', async () => {
    await expect(
      call(biometricsHandlers.removePhoto, undefined as never, { context: utils.testContext() }),
    ).rejects.toThrow()
  })

  test('BAD_REQUEST when facePhotoUrl is already null', async () => {
    await insertBiometricsRow({ userId: 'user-a', facePhotoUrl: null })
    await expect(
      call(biometricsHandlers.removePhoto, undefined as never, { context: utils.testContext() }),
    ).rejects.toThrow()
  })
})
