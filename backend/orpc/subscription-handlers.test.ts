import { beforeEach, describe, expect, test } from 'bun:test'
import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { subscription, user } from '../db/schema'
import * as utils from '../test/utils'
import { accessGate, TRIAL_DURATION_DAYS } from './middlewares/access-gate'
import { subscriptionHandlers } from './subscription-handlers'

type SubRow = typeof subscription.$inferSelect

const MS_PER_DAY = 24 * 60 * 60 * 1000

async function seedCurrentUser(trialStartedAt = new Date()) {
  return utils.seedUser({ trialStartedAt })
}

async function setCurrentUserTrial(trialStartedAt: Date) {
  const [row] = await utils
    .testContext()
    .db.update(user)
    .set({ trialStartedAt, updatedAt: new Date() })
    .where(eq(user.id, 'user-a'))
    .returning()
  utils.setTestUser(row ?? null)
  return row!
}

async function seedSub(overrides: Partial<typeof subscription.$inferInsert> = {}) {
  const now = new Date()
  const [row] = await utils
    .testContext()
    .db.insert(subscription)
    .values({
      id: '00000000-0000-4000-8000-000000000001',
      userId: 'user-a',
      interval: 'monthly',
      status: 'active',
      startedAt: now,
      currentPeriodEnd: new Date(now.getTime() + 30 * MS_PER_DAY),
      cancelledAt: null,
      lapsedAt: null,
      graceStartedAt: null,
      graceEndsAt: null,
      providerRef: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .returning()
  return row
}

async function currentSub() {
  const [row] = await utils
    .testContext()
    .db.select()
    .from(subscription)
    .where(eq(subscription.userId, 'user-a'))
  return row as SubRow | undefined
}

beforeEach(async () => {
  await utils.resetTestDb()
  await seedCurrentUser()
})

describe('getSubscription', () => {
  test('returns null sub + isInTrial=true within 7-day window', async () => {
    await setCurrentUserTrial(new Date())
    const result = await call(subscriptionHandlers.get, undefined as never, {
      context: utils.testContext(),
    })
    expect(result.subscription).toBeNull()
    expect(result.isInTrial).toBe(true)
    expect(result.isCurrent).toBe(false)
    expect(result.hasAccess).toBe(true)
  })

  test('returns null sub + isInTrial=false after 7-day trial', async () => {
    await setCurrentUserTrial(new Date(Date.now() - 8 * MS_PER_DAY))
    const result = await call(subscriptionHandlers.get, undefined as never, {
      context: utils.testContext(),
    })
    expect(result.subscription).toBeNull()
    expect(result.isInTrial).toBe(false)
    expect(result.hasAccess).toBe(false)
  })

  test('returns the caller’s sub when one exists', async () => {
    await seedSub({ status: 'active' })
    const result = await call(subscriptionHandlers.get, undefined as never, {
      context: utils.testContext(),
    })
    expect(result.subscription).not.toBeNull()
    expect(result.subscription!.userId).toBe('user-a')
    expect(result.isCurrent).toBe(true)
  })

  test('isInTrial=false when an active sub exists, even inside trial window', async () => {
    await setCurrentUserTrial(new Date())
    await seedSub({ status: 'active' })
    const result = await call(subscriptionHandlers.get, undefined as never, {
      context: utils.testContext(),
    })
    expect(result.isInTrial).toBe(false)
    expect(result.isCurrent).toBe(true)
    expect(result.hasAccess).toBe(true)
  })

  test('hasAccess=true during grace window', async () => {
    await setCurrentUserTrial(new Date(Date.now() - 30 * MS_PER_DAY))
    await seedSub({
      status: 'grace',
      graceStartedAt: new Date(),
      graceEndsAt: new Date(Date.now() + 2 * MS_PER_DAY),
    })
    const result = await call(subscriptionHandlers.get, undefined as never, {
      context: utils.testContext(),
    })
    expect(result.isCurrent).toBe(true)
    expect(result.hasAccess).toBe(true)
  })

  test('hasAccess=true for cancelled-but-still-in-period', async () => {
    await setCurrentUserTrial(new Date(Date.now() - 30 * MS_PER_DAY))
    await seedSub({
      status: 'cancelled',
      cancelledAt: new Date(),
      currentPeriodEnd: new Date(Date.now() + 10 * MS_PER_DAY),
    })
    const result = await call(subscriptionHandlers.get, undefined as never, {
      context: utils.testContext(),
    })
    expect(result.isCurrent).toBe(true)
    expect(result.hasAccess).toBe(true)
  })

  test('hasAccess=false for lapsed subscription post-trial', async () => {
    await setCurrentUserTrial(new Date(Date.now() - 30 * MS_PER_DAY))
    await seedSub({ status: 'lapsed', lapsedAt: new Date() })
    const result = await call(subscriptionHandlers.get, undefined as never, {
      context: utils.testContext(),
    })
    expect(result.isCurrent).toBe(false)
    expect(result.hasAccess).toBe(false)
  })

  test('does not leak another user’s sub', async () => {
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
    await seedSub({ userId: 'user-b', status: 'active' })
    const result = await call(subscriptionHandlers.get, undefined as never, {
      context: utils.testContext(),
    })
    expect(result.subscription).toBeNull()
  })
})

describe('startSubscription', () => {
  test('creates active sub with currentPeriodEnd 30 days out', async () => {
    const before = Date.now()
    const result = await call(subscriptionHandlers.start, {} as never, {
      context: utils.testContext(),
    })
    expect(result!.status).toBe('active')
    expect(result!.userId).toBe('user-a')
    const diff = result!.currentPeriodEnd.getTime() - before
    expect(diff).toBeGreaterThan(29.9 * MS_PER_DAY)
    expect(diff).toBeLessThan(30.1 * MS_PER_DAY)
  })

  test('accepts optional providerRef', async () => {
    const result = await call(
      subscriptionHandlers.start,
      { providerRef: 'stripe_sub_123' } as never,
      { context: utils.testContext() },
    )
    expect(result!.providerRef).toBe('stripe_sub_123')
  })

  test('rejects when subscription already exists', async () => {
    await seedSub()
    await expect(
      call(subscriptionHandlers.start, {} as never, { context: utils.testContext() }),
    ).rejects.toThrow()
  })
})

describe('cancelSubscription', () => {
  test('active → cancelled; access persists via currentPeriodEnd', async () => {
    const periodEnd = new Date(Date.now() + 15 * MS_PER_DAY)
    await seedSub({ status: 'active', currentPeriodEnd: periodEnd })
    const result = await call(subscriptionHandlers.cancel, undefined as never, {
      context: utils.testContext(),
    })
    expect(result!.status).toBe('cancelled')
    expect(result!.cancelledAt).not.toBeNull()
    expect(result!.currentPeriodEnd).toEqual(periodEnd)

    await setCurrentUserTrial(new Date(Date.now() - 30 * MS_PER_DAY))
    const afterGet = await call(subscriptionHandlers.get, undefined as never, {
      context: utils.testContext(),
    })
    expect(afterGet.hasAccess).toBe(true)
  })

  test('grace → cancelled; clears grace markers', async () => {
    await seedSub({
      status: 'grace',
      graceStartedAt: new Date(),
      graceEndsAt: new Date(Date.now() + 2 * MS_PER_DAY),
    })
    const result = await call(subscriptionHandlers.cancel, undefined as never, {
      context: utils.testContext(),
    })
    expect(result!.status).toBe('cancelled')
    expect(result!.graceStartedAt).toBeNull()
    expect(result!.graceEndsAt).toBeNull()
  })

  test('rejects from cancelled, lapsed, or missing subscription', async () => {
    await seedSub({ status: 'cancelled', cancelledAt: new Date() })
    await expect(
      call(subscriptionHandlers.cancel, undefined as never, { context: utils.testContext() }),
    ).rejects.toThrow()

    await utils.resetTestDb()
    await seedCurrentUser()
    await seedSub({ status: 'lapsed', lapsedAt: new Date() })
    await expect(
      call(subscriptionHandlers.cancel, undefined as never, { context: utils.testContext() }),
    ).rejects.toThrow()

    await utils.resetTestDb()
    await seedCurrentUser()
    await expect(
      call(subscriptionHandlers.cancel, undefined as never, { context: utils.testContext() }),
    ).rejects.toThrow()
  })
})

describe('renewSuccess', () => {
  test('active → active and extends period by 30d', async () => {
    const periodEnd = new Date(Date.now() + 1 * MS_PER_DAY)
    await seedSub({ status: 'active', currentPeriodEnd: periodEnd })
    const result = await call(subscriptionHandlers.renewSuccess, undefined as never, {
      context: utils.testContext(),
    })
    expect(result!.status).toBe('active')
    const extended = result!.currentPeriodEnd.getTime() - periodEnd.getTime()
    expect(extended).toBe(30 * MS_PER_DAY)
  })

  test('grace → active and clears grace fields', async () => {
    await seedSub({
      status: 'grace',
      graceStartedAt: new Date(),
      graceEndsAt: new Date(Date.now() + 2 * MS_PER_DAY),
      currentPeriodEnd: new Date(Date.now() - 1 * MS_PER_DAY),
    })
    const result = await call(subscriptionHandlers.renewSuccess, undefined as never, {
      context: utils.testContext(),
    })
    expect(result!.status).toBe('active')
    expect(result!.graceStartedAt).toBeNull()
    expect(result!.graceEndsAt).toBeNull()
    expect(result!.currentPeriodEnd.getTime()).toBeGreaterThan(Date.now() + 29 * MS_PER_DAY)
  })

  test('rejects from cancelled or lapsed', async () => {
    await seedSub({ status: 'cancelled', cancelledAt: new Date() })
    await expect(
      call(subscriptionHandlers.renewSuccess, undefined as never, { context: utils.testContext() }),
    ).rejects.toThrow()

    await utils.resetTestDb()
    await seedCurrentUser()
    await seedSub({ status: 'lapsed', lapsedAt: new Date() })
    await expect(
      call(subscriptionHandlers.renewSuccess, undefined as never, { context: utils.testContext() }),
    ).rejects.toThrow()
  })
})

describe('renewFailure', () => {
  test('active → grace with graceEndsAt = now + 3d', async () => {
    await seedSub({ status: 'active' })
    const before = Date.now()
    const result = await call(subscriptionHandlers.renewFailure, undefined as never, {
      context: utils.testContext(),
    })
    expect(result!.status).toBe('grace')
    expect(result!.graceStartedAt).not.toBeNull()
    expect(result!.graceEndsAt).not.toBeNull()
    const diff = result!.graceEndsAt!.getTime() - before
    expect(diff).toBeGreaterThan(2.9 * MS_PER_DAY)
    expect(diff).toBeLessThan(3.1 * MS_PER_DAY)
  })

  test('rejects from grace, cancelled, or lapsed', async () => {
    await seedSub({
      status: 'grace',
      graceStartedAt: new Date(),
      graceEndsAt: new Date(Date.now() + 2 * MS_PER_DAY),
    })
    await expect(
      call(subscriptionHandlers.renewFailure, undefined as never, { context: utils.testContext() }),
    ).rejects.toThrow()

    await utils.resetTestDb()
    await seedCurrentUser()
    await seedSub({ status: 'cancelled', cancelledAt: new Date() })
    await expect(
      call(subscriptionHandlers.renewFailure, undefined as never, { context: utils.testContext() }),
    ).rejects.toThrow()

    await utils.resetTestDb()
    await seedCurrentUser()
    await seedSub({ status: 'lapsed', lapsedAt: new Date() })
    await expect(
      call(subscriptionHandlers.renewFailure, undefined as never, { context: utils.testContext() }),
    ).rejects.toThrow()
  })
})

describe('lapseAfterGrace', () => {
  test('lapses grace rows whose graceEndsAt has passed', async () => {
    await seedSub({
      id: '00000000-0000-4000-8000-000000000002',
      userId: 'user-a',
      status: 'grace',
      graceStartedAt: new Date(Date.now() - 5 * MS_PER_DAY),
      graceEndsAt: new Date(Date.now() - 1 * MS_PER_DAY),
    })
    const result = await call(subscriptionHandlers.lapseAfterGrace, undefined as never, {
      context: utils.testContext(),
    })
    const sub = await currentSub()
    expect(result.lapsedCount).toBe(1)
    expect(sub!.status).toBe('lapsed')
    expect(sub!.lapsedAt).not.toBeNull()
    expect(sub!.graceStartedAt).toBeNull()
    expect(sub!.graceEndsAt).toBeNull()
  })

  test('does not touch grace rows whose graceEndsAt is still in the future', async () => {
    await seedSub({
      status: 'grace',
      graceStartedAt: new Date(),
      graceEndsAt: new Date(Date.now() + 2 * MS_PER_DAY),
    })
    const result = await call(subscriptionHandlers.lapseAfterGrace, undefined as never, {
      context: utils.testContext(),
    })
    const sub = await currentSub()
    expect(result.lapsedCount).toBe(0)
    expect(sub!.status).toBe('grace')
  })

  test('does not touch active rows', async () => {
    await seedSub({ status: 'active' })
    const result = await call(subscriptionHandlers.lapseAfterGrace, undefined as never, {
      context: utils.testContext(),
    })
    const sub = await currentSub()
    expect(result.lapsedCount).toBe(0)
    expect(sub!.status).toBe('active')
  })
})

describe('accessGate', () => {
  const gatedProbe = accessGate.handler(async ({ context }) => {
    return { ok: true, access: context.access }
  })

  test('allows when user is in trial window', async () => {
    await setCurrentUserTrial(new Date())
    const result = await call(gatedProbe, undefined as never, { context: utils.testContext() })
    expect(result.ok).toBe(true)
    expect(result.access.isInTrial).toBe(true)
    expect(result.access.hasAccess).toBe(true)
  })

  test('allows when user has current active subscription post-trial', async () => {
    await setCurrentUserTrial(new Date(Date.now() - 30 * MS_PER_DAY))
    await seedSub({ status: 'active' })
    const result = await call(gatedProbe, undefined as never, { context: utils.testContext() })
    expect(result.ok).toBe(true)
    expect(result.access.isCurrent).toBe(true)
  })

  test('denies when trial expired and no subscription', async () => {
    await setCurrentUserTrial(new Date(Date.now() - (TRIAL_DURATION_DAYS + 1) * MS_PER_DAY))
    await expect(
      call(gatedProbe, undefined as never, { context: utils.testContext() }),
    ).rejects.toThrow()
  })

  test('denies when subscription is lapsed and trial expired', async () => {
    await setCurrentUserTrial(new Date(Date.now() - 30 * MS_PER_DAY))
    await seedSub({ status: 'lapsed', lapsedAt: new Date() })
    await expect(
      call(gatedProbe, undefined as never, { context: utils.testContext() }),
    ).rejects.toThrow()
  })
})
