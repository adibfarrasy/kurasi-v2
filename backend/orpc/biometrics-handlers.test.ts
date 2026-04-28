/**
 * Tests for biometrics-handlers.
 *
 * Spec: specs/fit-page.allium
 * Code: ./biometrics-handlers.ts
 *
 * Mock strategy mirrors clothing-item-handlers.test.ts / outfit-handlers.test.ts:
 * in-memory store with a drizzle-orm override that records predicates on a
 * WeakMap. The upsert branch (.onConflictDoUpdate) is modelled as "if a row
 * with the same userId exists, merge `set` into it; otherwise insert `values`".
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test'

// --- in-memory store ---------------------------------------------------------

type BiometricsRow = {
  userId: string
  heightCm: number
  weightKg: number
  facePhotoUrl: string | null
  createdAt: Date
  updatedAt: Date
}

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

const store: { rows: BiometricsRow[]; onboarding: OnboardingRow[] } = {
  rows: [],
  onboarding: [],
}

function resetStore() {
  store.rows = []
  store.onboarding = []
}

// Identify which table a fake-db query is acting on by reading drizzle's
// Symbol(drizzle:Name). Avoids importing schema objects into the mock.
const DRIZZLE_NAME = Symbol.for('drizzle:Name')
function tableName(t: unknown): string {
  if (t && typeof t === 'object') {
    const v = (t as Record<symbol, unknown>)[DRIZZLE_NAME]
    if (typeof v === 'string') return v
  }
  return ''
}

// --- predicate extraction ----------------------------------------------------

type Predicate = { col: string; val: unknown; op: 'eq' | 'ne' }

const whereMap = new WeakMap<object, Predicate[]>()

const sqlToJs: Record<string, string> = {
  user_id: 'userId',
  height_cm: 'heightCm',
  weight_kg: 'weightKg',
  face_photo_url: 'facePhotoUrl',
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
  const isNotNull = (col: { name?: string } | string) => {
    const name = typeof col === 'string' ? col : (col?.name ?? '')
    const wrapper = { __isNotNull: true } as object
    whereMap.set(wrapper, [{ col: name, val: null, op: 'ne' }])
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
  return { ...realDrizzle, eq, ne, and, desc, isNotNull }
})

// --- fake db ----------------------------------------------------------------

function rowsFor(name: string): Array<Record<string, unknown>> {
  if (name === 'onboarding_progress') {
    return store.onboarding as unknown as Array<Record<string, unknown>>
  }
  return store.rows as unknown as Array<Record<string, unknown>>
}

function makeFakeDb() {
  return {
    select() {
      const state: { where?: unknown; table?: string } = {}
      const chain = {
        from(t: unknown) {
          state.table = tableName(t)
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
          const rows = rowsFor(state.table ?? '')
          const pred = state.where
            ? buildPredicate<Record<string, unknown>>(state.where)
            : () => true
          const out = rows.filter(pred)
          return Promise.resolve(out).then(onFulfilled, onRejected)
        },
      }
      return chain
    },
    insert(t: unknown) {
      const table = tableName(t)
      let pending: Partial<BiometricsRow> = {}
      let conflict: { set?: Partial<BiometricsRow> } | null = null
      const chain = {
        values(v: Partial<BiometricsRow>) {
          pending = v
          return chain
        },
        onConflictDoUpdate(opts: { target: unknown; set: Partial<BiometricsRow> }) {
          conflict = { set: opts.set }
          return chain
        },
        returning() {
          if (table !== 'user_biometrics') {
            return Promise.resolve([])
          }
          const now = new Date()
          const existing = store.rows.find((r) => r.userId === pending.userId)
          if (existing && conflict) {
            Object.assign(existing, conflict.set)
            return Promise.resolve([existing])
          }
          if (existing && !conflict) {
            return Promise.reject(new Error('duplicate key'))
          }
          const row: BiometricsRow = {
            userId: pending.userId!,
            heightCm: pending.heightCm!,
            weightKg: pending.weightKg!,
            facePhotoUrl: pending.facePhotoUrl ?? null,
            createdAt: pending.createdAt ?? now,
            updatedAt: pending.updatedAt ?? now,
          }
          store.rows.push(row)
          return Promise.resolve([row])
        },
      }
      return chain
    },
    update(t: unknown) {
      const table = tableName(t)
      const state: { set?: Record<string, unknown>; where?: unknown } = {}
      function exec() {
        const rows = rowsFor(table)
        const pred = state.where
          ? buildPredicate<Record<string, unknown>>(state.where)
          : () => true
        const updated: Array<Record<string, unknown>> = []
        for (const r of rows) {
          if (pred(r)) {
            Object.assign(r, state.set ?? {})
            updated.push(r)
          }
        }
        return updated
      }
      const chain = {
        set(s: Record<string, unknown>) {
          state.set = s
          return chain
        },
        where(w: unknown) {
          state.where = w
          return chain
        },
        returning() {
          return Promise.resolve(exec())
        },
        // Without .returning(), drizzle updates are still awaitable.
        then<T>(
          onFulfilled: ((v: unknown) => T | PromiseLike<T>) | null | undefined,
          onRejected?: ((reason: unknown) => T | PromiseLike<T>) | null | undefined,
        ) {
          return Promise.resolve(exec()).then(onFulfilled, onRejected)
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

// --- load handlers AFTER mocks ----------------------------------------------

const { call } = await import('@orpc/server')
const { biometricsHandlers } = await import('./biometrics-handlers')

function ctx() {
  return {
    db: fakeDb as unknown as never,
    auth: fakeAuth as unknown as never,
    reqHeaders: new Headers(),
  }
}

function seed(overrides: Partial<BiometricsRow> = {}): BiometricsRow {
  const row: BiometricsRow = {
    userId: 'user-a',
    heightCm: 170,
    weightKg: 65,
    facePhotoUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
  store.rows.push(row)
  return row
}

function seedOnboarding(overrides: Partial<OnboardingRow> = {}): OnboardingRow {
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
  store.onboarding.push(row)
  return row
}

beforeEach(() => {
  resetStore()
  currentUser = { id: 'user-a' }
  permissionAllowed = true
})

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

describe('getBiometrics', () => {
  test('returns caller’s row when it exists', async () => {
    seed({ userId: 'user-a', heightCm: 175, weightKg: 70 })
    const result = await call(biometricsHandlers.get, undefined as never, { context: ctx() })
    expect(result).toMatchObject({ userId: 'user-a', heightCm: 175, weightKg: 70 })
  })

  test('returns null when caller has no biometrics row', async () => {
    const result = await call(biometricsHandlers.get, undefined as never, { context: ctx() })
    expect(result).toBeNull()
  })

  test('does not leak another user’s row', async () => {
    seed({ userId: 'user-b', heightCm: 190 })
    const result = await call(biometricsHandlers.get, undefined as never, { context: ctx() })
    expect(result).toBeNull()
  })

  test('throws UNAUTHORIZED when no session', async () => {
    currentUser = null
    await expect(
      call(biometricsHandlers.get, undefined as never, { context: ctx() }),
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// set (SetBiometrics)
// ---------------------------------------------------------------------------

describe('setBiometrics — upsert', () => {
  test('creates row when none exists', async () => {
    const result = await call(
      biometricsHandlers.set,
      { heightCm: 175, weightKg: 70 } as never,
      { context: ctx() },
    )
    expect(result).toMatchObject({ userId: 'user-a', heightCm: 175, weightKg: 70 })
    expect(store.rows).toHaveLength(1)
  })

  test('updates existing row (upsert) — no duplicate created', async () => {
    seed({ userId: 'user-a', heightCm: 170, weightKg: 65 })
    const result = await call(
      biometricsHandlers.set,
      { heightCm: 180, weightKg: 75 } as never,
      { context: ctx() },
    )
    expect(result!.heightCm).toBe(180)
    expect(result!.weightKg).toBe(75)
    expect(store.rows).toHaveLength(1)
  })

  test('derives userId from caller — cannot spoof', async () => {
    const result = await call(
      biometricsHandlers.set,
      { heightCm: 170, weightKg: 65, userId: 'attacker' } as never,
      { context: ctx() },
    )
    expect(result!.userId).toBe('user-a')
  })

  test('rejects height below min (130)', async () => {
    await expect(
      call(
        biometricsHandlers.set,
        { heightCm: 129, weightKg: 65 } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('rejects height above max (220)', async () => {
    await expect(
      call(
        biometricsHandlers.set,
        { heightCm: 221, weightKg: 65 } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('rejects weight below min (30)', async () => {
    await expect(
      call(
        biometricsHandlers.set,
        { heightCm: 170, weightKg: 29 } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('rejects weight above max (200)', async () => {
    await expect(
      call(
        biometricsHandlers.set,
        { heightCm: 170, weightKg: 201 } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('rejects non-integer values', async () => {
    await expect(
      call(
        biometricsHandlers.set,
        { heightCm: 170.5, weightKg: 65 } as never,
        { context: ctx() },
      ),
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
      { context: ctx() },
    )
    expect(result!.facePhotoUrl).toBe('https://example.com/face.jpg')
  })

  test('accepts no facePhotoUrl (optional)', async () => {
    const result = await call(
      biometricsHandlers.set,
      { heightCm: 170, weightKg: 65 } as never,
      { context: ctx() },
    )
    expect(result!.facePhotoUrl).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// onboarding integration — CompleteBiometricsStep (specs/onboarding.allium)
// ---------------------------------------------------------------------------

describe('setBiometrics — onboarding step completion', () => {
  test('first set call stamps biometricsCompletedAt on OnboardingProgress', async () => {
    seedOnboarding()
    await call(
      biometricsHandlers.set,
      { heightCm: 170, weightKg: 65 } as never,
      { context: ctx() },
    )
    expect(store.onboarding[0]!.biometricsCompletedAt).not.toBeNull()
    // Only biometrics done so far → still in_progress.
    expect(store.onboarding[0]!.status).toBe('in_progress')
  })

  test('second set call does not overwrite biometricsCompletedAt', async () => {
    const firstStamp = new Date(2020, 0, 1)
    seedOnboarding({ biometricsCompletedAt: firstStamp })
    await call(
      biometricsHandlers.set,
      { heightCm: 175, weightKg: 70 } as never,
      { context: ctx() },
    )
    expect(store.onboarding[0]!.biometricsCompletedAt).toBe(firstStamp)
  })

  test('when starter wardrobe already done, first biometrics set completes onboarding', async () => {
    seedOnboarding({ starterWardrobeCompletedAt: new Date() })
    await call(
      biometricsHandlers.set,
      { heightCm: 170, weightKg: 65 } as never,
      { context: ctx() },
    )
    expect(store.onboarding[0]!.status).toBe('completed')
    expect(store.onboarding[0]!.completedAt).not.toBeNull()
  })

  test('no-op when no onboarding row exists for the user', async () => {
    // set still succeeds; onboarding hook is a best-effort no-op.
    const result = await call(
      biometricsHandlers.set,
      { heightCm: 170, weightKg: 65 } as never,
      { context: ctx() },
    )
    expect(result).toMatchObject({ userId: 'user-a', heightCm: 170 })
    expect(store.onboarding).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// removePhoto (RemoveFacePhoto)
// ---------------------------------------------------------------------------

describe('removeFacePhoto', () => {
  test('clears an existing facePhotoUrl', async () => {
    seed({ userId: 'user-a', facePhotoUrl: 'https://example.com/face.jpg' })
    const result = await call(biometricsHandlers.removePhoto, undefined as never, {
      context: ctx(),
    })
    expect(result!.facePhotoUrl).toBeNull()
    expect(store.rows[0]!.facePhotoUrl).toBeNull()
  })

  test('NOT_FOUND when no biometrics row exists for the user', async () => {
    await expect(
      call(biometricsHandlers.removePhoto, undefined as never, { context: ctx() }),
    ).rejects.toThrow()
  })

  test('BAD_REQUEST when facePhotoUrl is already null', async () => {
    seed({ userId: 'user-a', facePhotoUrl: null })
    await expect(
      call(biometricsHandlers.removePhoto, undefined as never, { context: ctx() }),
    ).rejects.toThrow()
  })
})
