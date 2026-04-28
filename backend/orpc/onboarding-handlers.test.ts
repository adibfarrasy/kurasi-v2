/**
 * Tests for onboarding-handlers.
 *
 * Spec: specs/onboarding.allium
 * Code: ./onboarding-handlers.ts
 *
 * Mock strategy mirrors biometrics-handlers.test.ts.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test'

// --- in-memory store ---------------------------------------------------------

type OnboardingRow = {
  userId: string
  status: 'in_progress' | 'completed'
  biometricsCompletedAt: Date | null
  starterWardrobeCompletedAt: Date | null
  startedAt: Date
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const store: { rows: OnboardingRow[] } = { rows: [] }

function resetStore() {
  store.rows = []
}

// --- predicate extraction ----------------------------------------------------

type Predicate = { col: string; val: unknown; op: 'eq' | 'ne' }

const whereMap = new WeakMap<object, Predicate[]>()

const sqlToJs: Record<string, string> = {
  user_id: 'userId',
  status: 'status',
  biometrics_completed_at: 'biometricsCompletedAt',
  starter_wardrobe_completed_at: 'starterWardrobeCompletedAt',
  started_at: 'startedAt',
  completed_at: 'completedAt',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
}

function buildPredicate<T>(whereArg: unknown): (r: T) => boolean {
  const preds = whereMap.get(whereArg as object) ?? []
  return (r: T) =>
    preds.every((p) => {
      const key = sqlToJs[p.col] ?? p.col
      const rowVal = (r as Record<string, unknown>)[key]
      return p.op === 'eq' ? rowVal === p.val : rowVal !== p.val
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
  const isNotNull = (col: { name?: string } | string) => {
    const name = typeof col === 'string' ? col : (col?.name ?? '')
    const wrapper = { __isNotNull: true } as object
    whereMap.set(wrapper, [{ col: name, val: null, op: 'ne' }])
    return wrapper
  }
  const desc = (col: { name?: string } | string) => ({
    __desc: true,
    col: typeof col === 'string' ? col : (col?.name ?? ''),
  })
  return { ...realDrizzle, eq, ne, and, desc, isNotNull }
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
          const pred = state.where ? buildPredicate<OnboardingRow>(state.where) : () => true
          const out = store.rows.filter(pred)
          return Promise.resolve(out).then(onFulfilled, onRejected)
        },
      }
      return chain
    },
    update(_t: unknown) {
      const state: { set?: Partial<OnboardingRow>; where?: unknown } = {}
      const chain = {
        set(s: Partial<OnboardingRow>) {
          state.set = s
          return chain
        },
        where(w: unknown) {
          state.where = w
          return chain
        },
        returning() {
          const pred = state.where
            ? buildPredicate<OnboardingRow>(state.where)
            : () => true
          const updated: OnboardingRow[] = []
          for (const r of store.rows) {
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

let currentUser: { id: string } | null = { id: 'user-a' }
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
const { onboardingHandlers } = await import('./onboarding-handlers')

function ctx() {
  return {
    db: fakeDb as unknown as never,
    auth: fakeAuth as unknown as never,
    reqHeaders: new Headers(),
  }
}

function seed(overrides: Partial<OnboardingRow> = {}): OnboardingRow {
  const now = new Date()
  const row: OnboardingRow = {
    userId: 'user-a',
    status: 'in_progress',
    biometricsCompletedAt: null,
    starterWardrobeCompletedAt: null,
    startedAt: now,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
  store.rows.push(row)
  return row
}

beforeEach(() => {
  resetStore()
  currentUser = { id: 'user-a' }
  permissionAllowed = true
})

describe('getOnboarding', () => {
  test('returns caller’s row with derived booleans all false when fresh', async () => {
    seed()
    const result = await call(onboardingHandlers.get, undefined as never, { context: ctx() })
    expect(result).toMatchObject({
      userId: 'user-a',
      status: 'in_progress',
      biometricsDone: false,
      starterWardrobeDone: false,
      allStepsDone: false,
    })
  })

  test('derived booleans flip when timestamps populated', async () => {
    seed({
      biometricsCompletedAt: new Date(),
      starterWardrobeCompletedAt: null,
    })
    const result = await call(onboardingHandlers.get, undefined as never, { context: ctx() })
    expect(result!.biometricsDone).toBe(true)
    expect(result!.starterWardrobeDone).toBe(false)
    expect(result!.allStepsDone).toBe(false)
  })

  test('allStepsDone is true when both timestamps populated', async () => {
    seed({
      biometricsCompletedAt: new Date(),
      starterWardrobeCompletedAt: new Date(),
      status: 'completed',
      completedAt: new Date(),
    })
    const result = await call(onboardingHandlers.get, undefined as never, { context: ctx() })
    expect(result!.allStepsDone).toBe(true)
    expect(result!.status).toBe('completed')
  })

  test('returns null when no row exists (sensible degrade)', async () => {
    const result = await call(onboardingHandlers.get, undefined as never, { context: ctx() })
    expect(result).toBeNull()
  })

  test('scoped to caller — other users’ rows are not leaked', async () => {
    seed({ userId: 'user-b', biometricsCompletedAt: new Date() })
    const result = await call(onboardingHandlers.get, undefined as never, { context: ctx() })
    expect(result).toBeNull()
  })

  test('throws UNAUTHORIZED when no session', async () => {
    currentUser = null
    await expect(
      call(onboardingHandlers.get, undefined as never, { context: ctx() }),
    ).rejects.toThrow()
  })
})
