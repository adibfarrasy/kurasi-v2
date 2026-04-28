/**
 * Tests for subscription-handlers + access-gate middleware.
 *
 * Spec: specs/payments.allium
 * Code: ./subscription-handlers.ts, ./middlewares/access-gate.ts
 *
 * Mock strategy mirrors onboarding-handlers.test.ts: in-memory store,
 * drizzle-orm predicate capture on a WeakMap, fake db with select/insert/
 * update/returning chains.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test'

// --- in-memory store ---------------------------------------------------------

type SubStatus = 'active' | 'grace' | 'cancelled' | 'lapsed'

type SubRow = {
  id: string
  userId: string
  interval: 'monthly'
  status: SubStatus
  startedAt: Date
  currentPeriodEnd: Date
  cancelledAt: Date | null
  lapsedAt: Date | null
  graceStartedAt: Date | null
  graceEndsAt: Date | null
  providerRef: string | null
  createdAt: Date
  updatedAt: Date
}

const store: { subs: SubRow[] } = { subs: [] }

function resetStore() {
  store.subs = []
}

// --- predicate extraction ----------------------------------------------------

type Predicate = { col: string; val: unknown; op: 'eq' | 'ne' | 'lt' | 'isNotNull' }

const whereMap = new WeakMap<object, Predicate[]>()

const sqlToJs: Record<string, string> = {
  id: 'id',
  user_id: 'userId',
  interval: 'interval',
  status: 'status',
  started_at: 'startedAt',
  current_period_end: 'currentPeriodEnd',
  cancelled_at: 'cancelledAt',
  lapsed_at: 'lapsedAt',
  grace_started_at: 'graceStartedAt',
  grace_ends_at: 'graceEndsAt',
  provider_ref: 'providerRef',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
}

function buildPredicate<T>(whereArg: unknown): (r: T) => boolean {
  const preds = whereMap.get(whereArg as object) ?? []
  return (r: T) =>
    preds.every((p) => {
      const key = sqlToJs[p.col] ?? p.col
      const rowVal = (r as Record<string, unknown>)[key]
      if (p.op === 'eq') return rowVal === p.val
      if (p.op === 'ne') return rowVal !== p.val
      if (p.op === 'lt') {
        if (rowVal instanceof Date && p.val instanceof Date) return rowVal < p.val
        return (rowVal as number) < (p.val as number)
      }
      if (p.op === 'isNotNull') return rowVal !== null && rowVal !== undefined
      return false
    })
}

const realDrizzle = await import('drizzle-orm')
mock.module('drizzle-orm', () => {
  const eq = (col: { name?: string } | string, val: unknown) => {
    const name = typeof col === 'string' ? col : (col?.name ?? '')
    const wrapper = { __eq: true } as object
    whereMap.set(wrapper, [{ col: name, val, op: 'eq' }])
    return wrapper
  }
  const ne = (col: { name?: string } | string, val: unknown) => {
    const name = typeof col === 'string' ? col : (col?.name ?? '')
    const wrapper = { __ne: true } as object
    whereMap.set(wrapper, [{ col: name, val, op: 'ne' }])
    return wrapper
  }
  const lt = (col: { name?: string } | string, val: unknown) => {
    const name = typeof col === 'string' ? col : (col?.name ?? '')
    const wrapper = { __lt: true } as object
    whereMap.set(wrapper, [{ col: name, val, op: 'lt' }])
    return wrapper
  }
  const and = (...args: unknown[]) => {
    const merged: Predicate[] = []
    for (const a of args) {
      const m = whereMap.get(a as object)
      if (m) merged.push(...m)
    }
    const wrapper = { __and: true } as object
    whereMap.set(wrapper, merged)
    return wrapper
  }
  const desc = (col: { name?: string } | string) => ({
    __desc: true,
    col: typeof col === 'string' ? col : (col?.name ?? ''),
  })
  const isNotNull = (col: { name?: string } | string) => {
    const name = typeof col === 'string' ? col : (col?.name ?? '')
    const wrapper = { __isNotNull: true } as object
    whereMap.set(wrapper, [{ col: name, val: null, op: 'isNotNull' }])
    return wrapper
  }
  return { ...realDrizzle, eq, ne, lt, and, desc, isNotNull }
})

// --- fake db ----------------------------------------------------------------

function makeFakeDb() {
  return {
    select() {
      const state: { where?: unknown } = {}
      const chain = {
        from(_t: unknown) {
          return chain
        },
        where(w: unknown) {
          state.where = w
          return chain
        },
        then<T>(
          onFulfilled: ((value: unknown[]) => T | PromiseLike<T>) | null | undefined,
          onRejected?: ((reason: unknown) => T | PromiseLike<T>) | null | undefined,
        ) {
          const pred = state.where ? buildPredicate<SubRow>(state.where) : () => true
          const out = store.subs.filter(pred)
          return Promise.resolve(out).then(onFulfilled, onRejected)
        },
      }
      return chain
    },
    insert(_t: unknown) {
      let pending: Partial<SubRow> = {}
      const chain = {
        values(v: Partial<SubRow>) {
          pending = v
          return chain
        },
        returning() {
          const now = new Date()
          const row: SubRow = {
            id: pending.id ?? `sub-${Math.random().toString(36).slice(2, 8)}`,
            userId: pending.userId!,
            interval: pending.interval ?? 'monthly',
            status: pending.status!,
            startedAt: pending.startedAt!,
            currentPeriodEnd: pending.currentPeriodEnd!,
            cancelledAt: pending.cancelledAt ?? null,
            lapsedAt: pending.lapsedAt ?? null,
            graceStartedAt: pending.graceStartedAt ?? null,
            graceEndsAt: pending.graceEndsAt ?? null,
            providerRef: pending.providerRef ?? null,
            createdAt: pending.createdAt ?? now,
            updatedAt: pending.updatedAt ?? now,
          }
          store.subs.push(row)
          return Promise.resolve([row])
        },
      }
      return chain
    },
    update(_t: unknown) {
      const state: { set?: Partial<SubRow>; where?: unknown } = {}
      const chain = {
        set(s: Partial<SubRow>) {
          state.set = s
          return chain
        },
        where(w: unknown) {
          state.where = w
          return chain
        },
        returning() {
          const pred = state.where ? buildPredicate<SubRow>(state.where) : () => true
          const updated: SubRow[] = []
          for (const r of store.subs) {
            if (pred(r)) {
              Object.assign(r, state.set ?? {})
              updated.push(r)
            }
          }
          return Promise.resolve(updated)
        },
      }
      return chain
    },
  }
}

const fakeDb = makeFakeDb()
mock.module('../db/db', () => ({ db: fakeDb }))

// --- auth mock --------------------------------------------------------------

let currentUser: { id: string; trialStartedAt: Date } | null = {
  id: 'user-a',
  trialStartedAt: new Date(),
}
let permissionAllowed = true

const fakeAuth = {
  api: {
    async getSession(_: unknown) {
      if (!currentUser) return null
      return { session: { id: 'sess' }, user: currentUser }
    },
    async userHasPermission(_: unknown) {
      return { success: permissionAllowed }
    },
  },
}

mock.module('../../auth', () => ({ auth: fakeAuth }))
mock.module('../auth', () => ({ auth: fakeAuth }))

const { call } = await import('@orpc/server')
const { subscriptionHandlers } = await import('./subscription-handlers')
const { accessGate, TRIAL_DURATION_DAYS } = await import('./middlewares/access-gate')

const MS_PER_DAY = 24 * 60 * 60 * 1000

function ctx() {
  return {
    db: fakeDb as unknown as never,
    auth: fakeAuth as unknown as never,
    reqHeaders: new Headers(),
  }
}

function seedSub(overrides: Partial<SubRow> = {}): SubRow {
  const now = new Date()
  const row: SubRow = {
    id: 'sub-1',
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
  }
  store.subs.push(row)
  return row
}

beforeEach(() => {
  resetStore()
  currentUser = { id: 'user-a', trialStartedAt: new Date() }
  permissionAllowed = true
})

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

describe('getSubscription', () => {
  test('returns null sub + isInTrial=true within 7-day window', async () => {
    currentUser = { id: 'user-a', trialStartedAt: new Date() }
    const result = await call(subscriptionHandlers.get, undefined as never, { context: ctx() })
    expect(result.subscription).toBeNull()
    expect(result.isInTrial).toBe(true)
    expect(result.isCurrent).toBe(false)
    expect(result.hasAccess).toBe(true)
  })

  test('returns null sub + isInTrial=false after 7-day trial', async () => {
    currentUser = {
      id: 'user-a',
      trialStartedAt: new Date(Date.now() - 8 * MS_PER_DAY),
    }
    const result = await call(subscriptionHandlers.get, undefined as never, { context: ctx() })
    expect(result.subscription).toBeNull()
    expect(result.isInTrial).toBe(false)
    expect(result.hasAccess).toBe(false)
  })

  test('returns the caller’s sub when one exists', async () => {
    seedSub({ status: 'active' })
    const result = await call(subscriptionHandlers.get, undefined as never, { context: ctx() })
    expect(result.subscription).not.toBeNull()
    expect(result.subscription!.userId).toBe('user-a')
    expect(result.isCurrent).toBe(true)
  })

  test('isInTrial=false when an active sub exists, even inside trial window', async () => {
    // Decision: once a user converts, trial concept falls away. isInTrial is
    // gated on "no active-or-current subscription" so UI doesn't have to
    // disambiguate trial vs paid.
    currentUser = { id: 'user-a', trialStartedAt: new Date() }
    seedSub({ status: 'active' })
    const result = await call(subscriptionHandlers.get, undefined as never, { context: ctx() })
    expect(result.isInTrial).toBe(false)
    expect(result.isCurrent).toBe(true)
    expect(result.hasAccess).toBe(true)
  })

  test('hasAccess=true during grace window', async () => {
    currentUser = {
      id: 'user-a',
      trialStartedAt: new Date(Date.now() - 30 * MS_PER_DAY),
    }
    seedSub({
      status: 'grace',
      graceStartedAt: new Date(),
      graceEndsAt: new Date(Date.now() + 2 * MS_PER_DAY),
    })
    const result = await call(subscriptionHandlers.get, undefined as never, { context: ctx() })
    expect(result.isCurrent).toBe(true)
    expect(result.hasAccess).toBe(true)
  })

  test('hasAccess=true for cancelled-but-still-in-period', async () => {
    currentUser = {
      id: 'user-a',
      trialStartedAt: new Date(Date.now() - 30 * MS_PER_DAY),
    }
    seedSub({
      status: 'cancelled',
      cancelledAt: new Date(),
      currentPeriodEnd: new Date(Date.now() + 10 * MS_PER_DAY),
    })
    const result = await call(subscriptionHandlers.get, undefined as never, { context: ctx() })
    expect(result.isCurrent).toBe(true)
    expect(result.hasAccess).toBe(true)
  })

  test('hasAccess=false for lapsed subscription post-trial', async () => {
    currentUser = {
      id: 'user-a',
      trialStartedAt: new Date(Date.now() - 30 * MS_PER_DAY),
    }
    seedSub({ status: 'lapsed', lapsedAt: new Date() })
    const result = await call(subscriptionHandlers.get, undefined as never, { context: ctx() })
    expect(result.isCurrent).toBe(false)
    expect(result.hasAccess).toBe(false)
  })

  test('does not leak another user’s sub', async () => {
    seedSub({ userId: 'user-b', status: 'active' })
    const result = await call(subscriptionHandlers.get, undefined as never, { context: ctx() })
    expect(result.subscription).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// start
// ---------------------------------------------------------------------------

describe('startSubscription', () => {
  test('creates active sub with currentPeriodEnd 30 days out', async () => {
    const before = Date.now()
    const result = await call(
      subscriptionHandlers.start,
      {} as never,
      { context: ctx() },
    )
    expect(result!.status).toBe('active')
    expect(result!.userId).toBe('user-a')
    const diff = result!.currentPeriodEnd.getTime() - before
    expect(diff).toBeGreaterThan(29.9 * MS_PER_DAY)
    expect(diff).toBeLessThan(30.1 * MS_PER_DAY)
  })

  test('accepts optional providerRef (for webhook seeding)', async () => {
    const result = await call(
      subscriptionHandlers.start,
      { providerRef: 'stripe_sub_123' } as never,
      { context: ctx() },
    )
    expect(result!.providerRef).toBe('stripe_sub_123')
  })

  test('rejects when subscription already exists', async () => {
    seedSub()
    await expect(
      call(subscriptionHandlers.start, {} as never, { context: ctx() }),
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// cancel
// ---------------------------------------------------------------------------

describe('cancelSubscription', () => {
  test('active → cancelled; access persists via currentPeriodEnd', async () => {
    const periodEnd = new Date(Date.now() + 15 * MS_PER_DAY)
    seedSub({ status: 'active', currentPeriodEnd: periodEnd })
    const result = await call(subscriptionHandlers.cancel, undefined as never, {
      context: ctx(),
    })
    expect(result!.status).toBe('cancelled')
    expect(result!.cancelledAt).not.toBeNull()
    expect(result!.currentPeriodEnd).toEqual(periodEnd)

    // Derived flags: isCurrent true until currentPeriodEnd
    currentUser = {
      id: 'user-a',
      trialStartedAt: new Date(Date.now() - 30 * MS_PER_DAY),
    }
    const afterGet = await call(subscriptionHandlers.get, undefined as never, {
      context: ctx(),
    })
    expect(afterGet.hasAccess).toBe(true)
  })

  test('grace → cancelled; clears grace markers', async () => {
    seedSub({
      status: 'grace',
      graceStartedAt: new Date(),
      graceEndsAt: new Date(Date.now() + 2 * MS_PER_DAY),
    })
    const result = await call(subscriptionHandlers.cancel, undefined as never, {
      context: ctx(),
    })
    expect(result!.status).toBe('cancelled')
    expect(result!.graceStartedAt).toBeNull()
    expect(result!.graceEndsAt).toBeNull()
  })

  test('rejects from cancelled', async () => {
    seedSub({ status: 'cancelled', cancelledAt: new Date() })
    await expect(
      call(subscriptionHandlers.cancel, undefined as never, { context: ctx() }),
    ).rejects.toThrow()
  })

  test('rejects from lapsed', async () => {
    seedSub({ status: 'lapsed', lapsedAt: new Date() })
    await expect(
      call(subscriptionHandlers.cancel, undefined as never, { context: ctx() }),
    ).rejects.toThrow()
  })

  test('NOT_FOUND when no subscription exists', async () => {
    await expect(
      call(subscriptionHandlers.cancel, undefined as never, { context: ctx() }),
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// renewSuccess
// ---------------------------------------------------------------------------

describe('renewSuccess', () => {
  test('active → active and extends period by 30d', async () => {
    const periodEnd = new Date(Date.now() + 1 * MS_PER_DAY)
    seedSub({ status: 'active', currentPeriodEnd: periodEnd })
    const result = await call(subscriptionHandlers.renewSuccess, undefined as never, {
      context: ctx(),
    })
    expect(result!.status).toBe('active')
    const extended = result!.currentPeriodEnd.getTime() - periodEnd.getTime()
    expect(extended).toBe(30 * MS_PER_DAY)
  })

  test('grace → active and clears grace fields', async () => {
    seedSub({
      status: 'grace',
      graceStartedAt: new Date(),
      graceEndsAt: new Date(Date.now() + 2 * MS_PER_DAY),
      currentPeriodEnd: new Date(Date.now() - 1 * MS_PER_DAY),
    })
    const result = await call(subscriptionHandlers.renewSuccess, undefined as never, {
      context: ctx(),
    })
    expect(result!.status).toBe('active')
    expect(result!.graceStartedAt).toBeNull()
    expect(result!.graceEndsAt).toBeNull()
    // Recovery: new period extends from now (past-due base).
    expect(result!.currentPeriodEnd.getTime()).toBeGreaterThan(
      Date.now() + 29 * MS_PER_DAY,
    )
  })

  test('rejects from cancelled', async () => {
    seedSub({ status: 'cancelled', cancelledAt: new Date() })
    await expect(
      call(subscriptionHandlers.renewSuccess, undefined as never, { context: ctx() }),
    ).rejects.toThrow()
  })

  test('rejects from lapsed', async () => {
    seedSub({ status: 'lapsed', lapsedAt: new Date() })
    await expect(
      call(subscriptionHandlers.renewSuccess, undefined as never, { context: ctx() }),
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// renewFailure
// ---------------------------------------------------------------------------

describe('renewFailure', () => {
  test('active → grace with graceEndsAt = now + 3d', async () => {
    seedSub({ status: 'active' })
    const before = Date.now()
    const result = await call(subscriptionHandlers.renewFailure, undefined as never, {
      context: ctx(),
    })
    expect(result!.status).toBe('grace')
    expect(result!.graceStartedAt).not.toBeNull()
    expect(result!.graceEndsAt).not.toBeNull()
    const diff = result!.graceEndsAt!.getTime() - before
    expect(diff).toBeGreaterThan(2.9 * MS_PER_DAY)
    expect(diff).toBeLessThan(3.1 * MS_PER_DAY)
  })

  test('rejects from grace', async () => {
    seedSub({
      status: 'grace',
      graceStartedAt: new Date(),
      graceEndsAt: new Date(Date.now() + 2 * MS_PER_DAY),
    })
    await expect(
      call(subscriptionHandlers.renewFailure, undefined as never, { context: ctx() }),
    ).rejects.toThrow()
  })

  test('rejects from cancelled', async () => {
    seedSub({ status: 'cancelled', cancelledAt: new Date() })
    await expect(
      call(subscriptionHandlers.renewFailure, undefined as never, { context: ctx() }),
    ).rejects.toThrow()
  })

  test('rejects from lapsed', async () => {
    seedSub({ status: 'lapsed', lapsedAt: new Date() })
    await expect(
      call(subscriptionHandlers.renewFailure, undefined as never, { context: ctx() }),
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// lapseAfterGrace
// ---------------------------------------------------------------------------

describe('lapseAfterGrace', () => {
  test('lapses grace rows whose graceEndsAt has passed', async () => {
    seedSub({
      id: 'sub-expired',
      userId: 'user-a',
      status: 'grace',
      graceStartedAt: new Date(Date.now() - 5 * MS_PER_DAY),
      graceEndsAt: new Date(Date.now() - 1 * MS_PER_DAY),
    })
    const result = await call(subscriptionHandlers.lapseAfterGrace, undefined as never, {
      context: ctx(),
    })
    expect(result.lapsedCount).toBe(1)
    expect(store.subs[0]!.status).toBe('lapsed')
    expect(store.subs[0]!.lapsedAt).not.toBeNull()
    expect(store.subs[0]!.graceStartedAt).toBeNull()
    expect(store.subs[0]!.graceEndsAt).toBeNull()
  })

  test('does not touch grace rows whose graceEndsAt is still in the future', async () => {
    seedSub({
      status: 'grace',
      graceStartedAt: new Date(),
      graceEndsAt: new Date(Date.now() + 2 * MS_PER_DAY),
    })
    const result = await call(subscriptionHandlers.lapseAfterGrace, undefined as never, {
      context: ctx(),
    })
    expect(result.lapsedCount).toBe(0)
    expect(store.subs[0]!.status).toBe('grace')
  })

  test('does not touch active rows', async () => {
    seedSub({ status: 'active' })
    const result = await call(subscriptionHandlers.lapseAfterGrace, undefined as never, {
      context: ctx(),
    })
    expect(result.lapsedCount).toBe(0)
    expect(store.subs[0]!.status).toBe('active')
  })
})

// ---------------------------------------------------------------------------
// access-gate middleware
// ---------------------------------------------------------------------------

describe('accessGate', () => {
  const gatedProbe = accessGate.handler(async ({ context }) => {
    return { ok: true, access: context.access }
  })

  test('allows when user is in trial window', async () => {
    currentUser = { id: 'user-a', trialStartedAt: new Date() }
    const result = await call(gatedProbe, undefined as never, { context: ctx() })
    expect(result.ok).toBe(true)
    expect(result.access.isInTrial).toBe(true)
    expect(result.access.hasAccess).toBe(true)
  })

  test('allows when user has current (active) subscription post-trial', async () => {
    currentUser = {
      id: 'user-a',
      trialStartedAt: new Date(Date.now() - 30 * MS_PER_DAY),
    }
    seedSub({ status: 'active' })
    const result = await call(gatedProbe, undefined as never, { context: ctx() })
    expect(result.ok).toBe(true)
    expect(result.access.isCurrent).toBe(true)
  })

  test('denies (PAYMENT_REQUIRED) when trial expired and no subscription', async () => {
    currentUser = {
      id: 'user-a',
      trialStartedAt: new Date(Date.now() - (TRIAL_DURATION_DAYS + 1) * MS_PER_DAY),
    }
    await expect(
      call(gatedProbe, undefined as never, { context: ctx() }),
    ).rejects.toThrow()
  })

  test('denies when subscription is lapsed and trial expired', async () => {
    currentUser = {
      id: 'user-a',
      trialStartedAt: new Date(Date.now() - 30 * MS_PER_DAY),
    }
    seedSub({ status: 'lapsed', lapsedAt: new Date() })
    await expect(
      call(gatedProbe, undefined as never, { context: ctx() }),
    ).rejects.toThrow()
  })
})
