/**
 * Tests for outfit-handlers.
 *
 * Spec: specs/wardrobe.allium
 * Code: ./outfit-handlers.ts
 *
 * Uses the same mock-module approach as clothing-item-handlers.test.ts but
 * with a two-table in-memory fake (outfit + clothing_item) so SaveOutfit's
 * slot-validation queries can be exercised.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test'

// --- in-memory store ---------------------------------------------------------

type ClothingStatus = 'active' | 'archived' | 'removed'
type OutfitStatus = 'active' | 'deleted'
type Rating = 'loved' | 'ok' | 'didnt_work'

type ClothingRow = {
  id: string
  userId: string
  imageUrl: string
  category: string
  primaryColor: string
  secondaryColor: string | null
  materials: string[]
  brand: string | null
  fit: string | null
  pattern: string | null
  occasions: string[]
  customNotes: string | null
  isFavorite: boolean
  status: ClothingStatus
  archivedAt: Date | null
  removedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

type OutfitRow = {
  id: string
  userId: string
  name: string | null
  headwearId: string | null
  baseId: string | null
  outerId: string | null
  bottomId: string | null
  footwearId: string | null
  tags: string[]
  notes: string | null
  rating: Rating | null
  wornAt: Date | null
  status: OutfitStatus
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const store: { clothing: ClothingRow[]; outfits: OutfitRow[] } = { clothing: [], outfits: [] }

function resetStore() {
  store.clothing = []
  store.outfits = []
}

// --- predicate extraction ----------------------------------------------------

type Predicate = { col: string; val: unknown; op: 'eq' | 'ne' }

const whereMap = new WeakMap<object, Predicate[]>()

// SQL column name -> JS key (merged for both tables; same keys where they overlap)
const sqlToJs: Record<string, string> = {
  id: 'id',
  user_id: 'userId',
  // clothing
  image_url: 'imageUrl',
  category: 'category',
  primary_color: 'primaryColor',
  secondary_color: 'secondaryColor',
  materials: 'materials',
  brand: 'brand',
  fit: 'fit',
  pattern: 'pattern',
  occasions: 'occasions',
  custom_notes: 'customNotes',
  is_favorite: 'isFavorite',
  archived_at: 'archivedAt',
  removed_at: 'removedAt',
  // outfit
  name: 'name',
  headwear_id: 'headwearId',
  base_id: 'baseId',
  outer_id: 'outerId',
  bottom_id: 'bottomId',
  footwear_id: 'footwearId',
  tags: 'tags',
  notes: 'notes',
  rating: 'rating',
  worn_at: 'wornAt',
  deleted_at: 'deletedAt',
  // shared
  status: 'status',
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

// Override drizzle-orm helpers.
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
  const desc = (col: { name?: string } | string) => ({
    __desc: true,
    col: typeof col === 'string' ? col : (col?.name ?? ''),
  })
  return { ...realDrizzle, eq, ne, and, desc }
})

// --- fake db ----------------------------------------------------------------

// Identify which table a drizzle pgTable instance points at by checking its
// known column names. Simpler + robust: check for a unique-to-table column.
function tableFor(t: unknown): 'clothing' | 'outfits' {
  const obj = t as Record<string, unknown> | null
  if (obj && 'headwearId' in obj) return 'outfits'
  return 'clothing'
}

function makeFakeDb() {
  return {
    select() {
      const state: { table?: 'clothing' | 'outfits'; where?: unknown } = {}
      const chain = {
        from(t: unknown) {
          state.table = tableFor(t)
          return chain
        },
        where(w: unknown) {
          state.where = w
          return chain
        },
        orderBy(_o: unknown) {
          const rows = state.table === 'outfits' ? store.outfits : store.clothing
          const pred = state.where ? buildPredicate<any>(state.where) : () => true
          const out = rows
            .filter(pred)
            .slice()
            .sort((a: any, b: any) => +b.createdAt - +a.createdAt)
          return Promise.resolve(out)
        },
        then<T>(
          onFulfilled: ((value: unknown[]) => T | PromiseLike<T>) | null | undefined,
          onRejected?: ((reason: unknown) => T | PromiseLike<T>) | null | undefined,
        ) {
          const rows = state.table === 'outfits' ? store.outfits : store.clothing
          const pred = state.where ? buildPredicate<any>(state.where) : () => true
          const out = rows.filter(pred)
          return Promise.resolve(out).then(onFulfilled, onRejected)
        },
      }
      return chain
    },
    insert(t: unknown) {
      const table = tableFor(t)
      let pending: any = {}
      const chain = {
        values(v: any) {
          pending = v
          return chain
        },
        returning() {
          const now = new Date()
          if (table === 'outfits') {
            const row: OutfitRow = {
              id: pending.id ?? crypto.randomUUID(),
              userId: pending.userId,
              name: pending.name ?? null,
              headwearId: pending.headwearId ?? null,
              baseId: pending.baseId ?? null,
              outerId: pending.outerId ?? null,
              bottomId: pending.bottomId ?? null,
              footwearId: pending.footwearId ?? null,
              tags: pending.tags ?? [],
              notes: pending.notes ?? null,
              rating: pending.rating ?? null,
              wornAt: pending.wornAt ?? null,
              status: pending.status ?? 'active',
              deletedAt: pending.deletedAt ?? null,
              createdAt: pending.createdAt ?? now,
              updatedAt: pending.updatedAt ?? now,
            }
            store.outfits.push(row)
            return Promise.resolve([row])
          } else {
            const row: ClothingRow = {
              id: pending.id ?? crypto.randomUUID(),
              userId: pending.userId,
              imageUrl: pending.imageUrl ?? '',
              category: pending.category ?? 'tee',
              primaryColor: pending.primaryColor ?? '',
              secondaryColor: pending.secondaryColor ?? null,
              materials: pending.materials ?? [],
              brand: pending.brand ?? null,
              fit: pending.fit ?? null,
              pattern: pending.pattern ?? null,
              occasions: pending.occasions ?? [],
              customNotes: pending.customNotes ?? null,
              isFavorite: pending.isFavorite ?? false,
              status: pending.status ?? 'active',
              archivedAt: pending.archivedAt ?? null,
              removedAt: pending.removedAt ?? null,
              createdAt: pending.createdAt ?? now,
              updatedAt: pending.updatedAt ?? now,
            }
            store.clothing.push(row)
            return Promise.resolve([row])
          }
        },
      }
      return chain
    },
    update(t: unknown) {
      const table = tableFor(t)
      const state: { set?: any; where?: unknown } = {}
      const chain = {
        set(s: any) {
          state.set = s
          return chain
        },
        where(w: unknown) {
          state.where = w
          return chain
        },
        returning() {
          const rows = table === 'outfits' ? store.outfits : store.clothing
          const pred = state.where ? buildPredicate<any>(state.where) : () => true
          const updated: any[] = []
          for (const r of rows) {
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
    delete(t: unknown) {
      const table = tableFor(t)
      const state: { where?: unknown } = {}
      const chain = {
        where(w: unknown) {
          state.where = w
          return chain
        },
        returning() {
          const pred = state.where ? buildPredicate<any>(state.where) : () => true
          if (table === 'outfits') {
            const removed = store.outfits.filter(pred)
            store.outfits = store.outfits.filter((r) => !pred(r))
            return Promise.resolve(removed)
          }
          const removed = store.clothing.filter(pred)
          store.clothing = store.clothing.filter((r) => !pred(r))
          return Promise.resolve(removed)
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
const { outfitHandlers } = await import('./outfit-handlers')

function ctx() {
  return {
    db: fakeDb as unknown as never,
    auth: fakeAuth as unknown as never,
    reqHeaders: new Headers(),
  }
}

function seedClothing(overrides: Partial<ClothingRow> = {}): ClothingRow {
  const row: ClothingRow = {
    id: crypto.randomUUID(),
    userId: 'user-a',
    imageUrl: 'https://example.com/a.jpg',
    category: 'tee',
    primaryColor: 'black',
    secondaryColor: null,
    materials: [],
    brand: null,
    fit: null,
    pattern: null,
    occasions: [],
    customNotes: null,
    isFavorite: false,
    status: 'active',
    archivedAt: null,
    removedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
  store.clothing.push(row)
  return row
}

function seedOutfit(overrides: Partial<OutfitRow> = {}): OutfitRow {
  const row: OutfitRow = {
    id: crypto.randomUUID(),
    userId: 'user-a',
    name: null,
    headwearId: null,
    baseId: null,
    outerId: null,
    bottomId: null,
    footwearId: null,
    tags: [],
    notes: null,
    rating: null,
    wornAt: null,
    status: 'active',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
  store.outfits.push(row)
  return row
}

beforeEach(() => {
  resetStore()
  currentUser = { id: 'user-a' }
  permissionAllowed = true
})

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe('listOutfits — ownership scoping', () => {
  test('returns only outfits belonging to the caller', async () => {
    seedOutfit({ userId: 'user-a', name: 'mine-1' })
    seedOutfit({ userId: 'user-a', name: 'mine-2' })
    seedOutfit({ userId: 'user-b', name: 'theirs' })
    const result = await call(outfitHandlers.list, undefined as never, { context: ctx() })
    expect(result).toHaveLength(2)
    for (const r of result) expect(r.userId).toBe('user-a')
  })

  test('excludes outfits with status = deleted', async () => {
    seedOutfit({ userId: 'user-a', name: 'kept', status: 'active' })
    seedOutfit({ userId: 'user-a', name: 'gone', status: 'deleted', deletedAt: new Date() })
    const result = await call(outfitHandlers.list, undefined as never, { context: ctx() })
    expect(result.map((r) => r.name)).toEqual(['kept'])
  })

  test('does not leak another user’s active outfits', async () => {
    seedOutfit({ userId: 'user-b', name: 'theirs', status: 'active' })
    const result = await call(outfitHandlers.list, undefined as never, { context: ctx() })
    expect(result).toEqual([])
  })

  test('throws UNAUTHORIZED when no session', async () => {
    currentUser = null
    await expect(
      call(outfitHandlers.list, undefined as never, { context: ctx() }),
    ).rejects.toThrow()
  })

  test('throws FORBIDDEN when permission check fails', async () => {
    permissionAllowed = false
    await expect(
      call(outfitHandlers.list, undefined as never, { context: ctx() }),
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// create (SaveOutfit)
// ---------------------------------------------------------------------------

describe('createOutfit (SaveOutfit)', () => {
  test('persists outfit with caller userId and a single slot', async () => {
    const hat = seedClothing({ userId: 'user-a', category: 'headwear' })
    const result = await call(
      outfitHandlers.create,
      { headwearId: hat.id, name: 'hat-only' } as never,
      { context: ctx() },
    )
    expect(result).toMatchObject({ userId: 'user-a', headwearId: hat.id, name: 'hat-only' })
    expect(store.outfits).toHaveLength(1)
  })

  test('accepts a full 5-slot outfit', async () => {
    const hw = seedClothing({ userId: 'user-a', category: 'headwear' })
    const base = seedClothing({ userId: 'user-a', category: 'tee' })
    const outer = seedClothing({ userId: 'user-a', category: 'outer' })
    const bottom = seedClothing({ userId: 'user-a', category: 'pants' })
    const footwear = seedClothing({ userId: 'user-a', category: 'footwear' })
    const result = await call(
      outfitHandlers.create,
      {
        headwearId: hw.id,
        baseId: base.id,
        outerId: outer.id,
        bottomId: bottom.id,
        footwearId: footwear.id,
      } as never,
      { context: ctx() },
    )
    expect(result!.headwearId).toBe(hw.id)
    expect(result!.footwearId).toBe(footwear.id)
  })

  test('derives userId from caller — cannot spoof ownership', async () => {
    const hat = seedClothing({ userId: 'user-a', category: 'headwear' })
    const result = await call(
      outfitHandlers.create,
      { headwearId: hat.id, userId: 'attacker' } as never,
      { context: ctx() },
    )
    expect(result!.userId).toBe('user-a')
  })

  test('rejects when all slots are null', async () => {
    await expect(
      call(outfitHandlers.create, { name: 'empty' } as never, { context: ctx() }),
    ).rejects.toThrow()
    expect(store.outfits).toHaveLength(0)
  })

  test('rejects slot item owned by another user', async () => {
    const theirs = seedClothing({ userId: 'user-b', category: 'tee' })
    await expect(
      call(outfitHandlers.create, { baseId: theirs.id } as never, { context: ctx() }),
    ).rejects.toThrow()
    expect(store.outfits).toHaveLength(0)
  })

  test('rejects slot item with status = removed', async () => {
    const gone = seedClothing({ userId: 'user-a', status: 'removed', removedAt: new Date() })
    await expect(
      call(outfitHandlers.create, { baseId: gone.id } as never, { context: ctx() }),
    ).rejects.toThrow()
    expect(store.outfits).toHaveLength(0)
  })

  test('rejects unknown slot item id', async () => {
    await expect(
      call(outfitHandlers.create, { baseId: crypto.randomUUID() } as never, { context: ctx() }),
    ).rejects.toThrow()
  })

  test('allows archived items in slots (archive is not removal)', async () => {
    const arc = seedClothing({ userId: 'user-a', status: 'archived', archivedAt: new Date() })
    const result = await call(
      outfitHandlers.create,
      { baseId: arc.id } as never,
      { context: ctx() },
    )
    expect(result!.baseId).toBe(arc.id)
  })
})

// ---------------------------------------------------------------------------
// update (UpdateOutfit)
// ---------------------------------------------------------------------------

describe('updateOutfit', () => {
  test('updates name, tags, notes when owner + active', async () => {
    const o = seedOutfit({ userId: 'user-a', name: 'old', tags: [], notes: null })
    const result = await call(
      outfitHandlers.update,
      { id: o.id, name: 'new', tags: ['work'], notes: 'nice' },
      { context: ctx() },
    )
    expect(result.name).toBe('new')
    expect(result.tags).toEqual(['work'])
    expect(result.notes).toBe('nice')
  })

  test('partial update — only specified fields change', async () => {
    const o = seedOutfit({ userId: 'user-a', name: 'keep', tags: ['keep-tag'] })
    await call(
      outfitHandlers.update,
      { id: o.id, notes: 'only-notes' },
      { context: ctx() },
    )
    const after = store.outfits.find((r) => r.id === o.id)!
    expect(after.name).toBe('keep')
    expect(after.tags).toEqual(['keep-tag'])
    expect(after.notes).toBe('only-notes')
  })

  test('NOT_FOUND when outfit belongs to another user', async () => {
    const o = seedOutfit({ userId: 'user-b' })
    await expect(
      call(outfitHandlers.update, { id: o.id, name: 'x' }, { context: ctx() }),
    ).rejects.toThrow()
  })

  test('NOT_FOUND when outfit is deleted', async () => {
    const o = seedOutfit({ userId: 'user-a', status: 'deleted', deletedAt: new Date() })
    await expect(
      call(outfitHandlers.update, { id: o.id, name: 'x' }, { context: ctx() }),
    ).rejects.toThrow()
  })

  test('NOT_FOUND when id does not exist', async () => {
    await expect(
      call(outfitHandlers.update, { id: crypto.randomUUID(), name: 'x' }, { context: ctx() }),
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// delete (DeleteOutfit)
// ---------------------------------------------------------------------------

describe('deleteOutfit — soft delete', () => {
  test('soft-deletes when owned + active', async () => {
    const o = seedOutfit({ userId: 'user-a' })
    const result = await call(outfitHandlers.delete, { id: o.id }, { context: ctx() })
    expect(result).toBe(true)
    const after = store.outfits.find((r) => r.id === o.id)!
    expect(after.status).toBe('deleted')
    expect(after.deletedAt).toBeInstanceOf(Date)
  })

  test('NOT_FOUND when owned by another user', async () => {
    const o = seedOutfit({ userId: 'user-b' })
    await expect(
      call(outfitHandlers.delete, { id: o.id }, { context: ctx() }),
    ).rejects.toThrow()
    expect(store.outfits.find((r) => r.id === o.id)!.status).toBe('active')
  })

  test('NOT_FOUND when id does not exist', async () => {
    await expect(
      call(outfitHandlers.delete, { id: crypto.randomUUID() }, { context: ctx() }),
    ).rejects.toThrow()
  })

  test('cannot re-delete an already-deleted outfit', async () => {
    const o = seedOutfit({ userId: 'user-a', status: 'deleted', deletedAt: new Date() })
    await expect(
      call(outfitHandlers.delete, { id: o.id }, { context: ctx() }),
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// rate (RateOutfit)
// ---------------------------------------------------------------------------

describe('rateOutfit', () => {
  test('sets rating on active outfit', async () => {
    const o = seedOutfit({ userId: 'user-a' })
    const result = await call(
      outfitHandlers.rate,
      { id: o.id, rating: 'loved' },
      { context: ctx() },
    )
    expect(result.rating).toBe('loved')
  })

  test('sets rating and wornAt together', async () => {
    const o = seedOutfit({ userId: 'user-a' })
    const when = new Date(2025, 0, 1)
    const result = await call(
      outfitHandlers.rate,
      { id: o.id, rating: 'ok', wornAt: when },
      { context: ctx() },
    )
    expect(result.rating).toBe('ok')
    expect(+result.wornAt!).toBe(+when)
  })

  test('rejects invalid rating value', async () => {
    const o = seedOutfit({ userId: 'user-a' })
    await expect(
      call(
        outfitHandlers.rate,
        { id: o.id, rating: 'awesome' } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('NOT_FOUND when outfit is deleted', async () => {
    const o = seedOutfit({ userId: 'user-a', status: 'deleted', deletedAt: new Date() })
    await expect(
      call(outfitHandlers.rate, { id: o.id, rating: 'loved' }, { context: ctx() }),
    ).rejects.toThrow()
  })

  test('NOT_FOUND when id is unknown', async () => {
    await expect(
      call(
        outfitHandlers.rate,
        { id: crypto.randomUUID(), rating: 'loved' },
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })
})
