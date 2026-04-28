/**
 * Tests for clothing-item-handlers.
 *
 * Spec: specs/wardrobe.allium
 * Code: ./clothing-item-handlers.ts
 *
 * Aligned to the widened schema: category (12 values), primaryColor,
 * secondaryColor, materials[], brand, fit, pattern, occasions[],
 * customNotes, isFavorite, status, archivedAt, removedAt.
 *
 * Mocking strategy: drizzle's `db` is a chainable query builder. We swap the
 * whole `../db/db` module with an in-memory fake that mimics the chain signatures
 * used by the handlers (select/insert/update/delete + where/orderBy/returning).
 * `../../auth` is likewise mocked so authMiddleware + requirePermission do not
 * hit Better Auth. Handlers are invoked via oRPC's `call()` helper.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test'

// --- in-memory store ---------------------------------------------------------

type Category =
  | 'tee'
  | 'collared_shirt'
  | 'outer'
  | 'pants'
  | 'shorts'
  | 'headwear'
  | 'footwear'
  | 'bag'
  | 'scarf'
  | 'accessory'
  | 'dress'
  | 'skirt'

type Fit = 'tight' | 'slim' | 'standard' | 'relaxed' | 'oversize'

type Status = 'active' | 'archived' | 'removed'

type Row = {
  id: string
  userId: string
  imageUrl: string
  category: Category
  primaryColor: string
  secondaryColor: string | null
  materials: string[]
  brand: string | null
  fit: Fit | null
  pattern: string | null
  occasions: string[]
  customNotes: string | null
  isFavorite: boolean
  status: Status
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
  rating: 'loved' | 'ok' | 'didnt_work' | null
  wornAt: Date | null
  status: 'active' | 'deleted'
  deletedAt: Date | null
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

const store: { rows: Row[]; outfits: OutfitRow[]; onboarding: OnboardingRow[] } = {
  rows: [],
  outfits: [],
  onboarding: [],
}

function resetStore() {
  store.rows = []
  store.outfits = []
  store.onboarding = []
}

// Identify which table a fake-db query is acting on via drizzle's internal
// Symbol(drizzle:Name). Lets the fake route between clothing_item, outfit, and
// onboarding_progress without importing the schema objects.
const DRIZZLE_NAME = Symbol.for('drizzle:Name')
function tableName(t: unknown): string {
  if (t && typeof t === 'object') {
    const v = (t as Record<symbol, unknown>)[DRIZZLE_NAME]
    if (typeof v === 'string') return v
  }
  return ''
}

// --- predicate tree ---------------------------------------------------------
//
// drizzle's `eq/ne/and/or` return opaque SQL AST nodes. Our fake tags each
// returned object with a node in whereMap; `and`/`or` compose subtrees. Row
// evaluation walks the tree.

type Node =
  | { kind: 'eq' | 'ne'; col: string; val: unknown }
  | { kind: 'and' | 'or'; children: Node[] }

const whereMap = new WeakMap<object, Node>()

function evalNode(node: Node, row: Record<string, unknown>): boolean {
  if (node.kind === 'eq' || node.kind === 'ne') {
    const key = (sqlToJs[node.col] as string | undefined) ?? node.col
    const rowVal = row[key]
    return node.kind === 'eq' ? rowVal === node.val : rowVal !== node.val
  }
  if (node.kind === 'and') return node.children.every((c) => evalNode(c, row))
  return node.children.some((c) => evalNode(c, row))
}

function buildPredicate(whereArg: unknown): (r: Record<string, unknown>) => boolean {
  const node = whereMap.get(whereArg as object)
  if (!node) return () => true
  return (r) => evalNode(node, r)
}

// drizzle column.name is the sql column name (e.g. 'user_id'); Row keys are camelCase.
const sqlToJs: Record<string, string> = {
  id: 'id',
  user_id: 'userId',
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
  status: 'status',
  archived_at: 'archivedAt',
  removed_at: 'removedAt',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  biometrics_completed_at: 'biometricsCompletedAt',
  starter_wardrobe_completed_at: 'starterWardrobeCompletedAt',
  started_at: 'startedAt',
  completed_at: 'completedAt',
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
}

// Override drizzle-orm's `eq`, `and`, `desc`, `ne`, `or` with fakes that record predicates
// we can read back. Keep all other exports (relations, etc.) intact so the
// schema + drizzle-zod still load.
const realDrizzle = await import('drizzle-orm')
mock.module('drizzle-orm', () => {
  const eq = (col: { name?: string } | string, val: unknown) => {
    const name = typeof col === 'string' ? col : (col?.name ?? '')
    const wrapper = { __eq: true } as object
    whereMap.set(wrapper, { kind: 'eq', col: name, val })
    return wrapper
  }
  const ne = (col: { name?: string } | string, val: unknown) => {
    const name = typeof col === 'string' ? col : (col?.name ?? '')
    const wrapper = { __ne: true } as object
    whereMap.set(wrapper, { kind: 'ne', col: name, val })
    return wrapper
  }
  const compose = (kind: 'and' | 'or') =>
    (...args: unknown[]) => {
      const children: Node[] = []
      for (const a of args) {
        const m = whereMap.get(a as object)
        if (m) children.push(m)
      }
      const wrapper = { [`__${kind}`]: true } as object
      whereMap.set(wrapper, { kind, children })
      return wrapper
    }
  const and = compose('and')
  const or = compose('or')
  const isNotNull = (col: { name?: string } | string) => {
    const name = typeof col === 'string' ? col : (col?.name ?? '')
    const wrapper = { __isNotNull: true } as object
    whereMap.set(wrapper, { kind: 'ne', col: name, val: null })
    return wrapper
  }
  const desc = (col: { name?: string } | string) => ({
    __desc: true,
    col: typeof col === 'string' ? col : (col?.name ?? ''),
  })
  return { ...realDrizzle, eq, ne, and, or, desc, isNotNull }
})

// --- fake db ----------------------------------------------------------------

function rowsFor(name: string): Array<Record<string, unknown>> {
  if (name === 'onboarding_progress') {
    return store.onboarding as unknown as Array<Record<string, unknown>>
  }
  if (name === 'outfit') {
    return store.outfits as unknown as Array<Record<string, unknown>>
  }
  return store.rows as unknown as Array<Record<string, unknown>>
}

function makeFakeDb() {
  const fakeDb: Record<string, unknown> = {
    select() {
      const state: { where?: unknown; order?: unknown; table?: string } = {}
      const chain = {
        from(table: unknown) {
          state.table = tableName(table)
          return chain
        },
        where(w: unknown) {
          state.where = w
          return chain
        },
        orderBy(_o: unknown) {
          const rows = rowsFor(state.table ?? '') as unknown as Row[]
          const pred = state.where ? buildPredicate(state.where) : () => true
          const out = rows
            .filter(pred as (r: Row) => boolean)
            .slice()
            .sort((a, b) => +b.createdAt - +a.createdAt)
          return Promise.resolve(out)
        },
        then<T>(
          onFulfilled: ((value: unknown[]) => T | PromiseLike<T>) | null | undefined,
          onRejected?: ((reason: unknown) => T | PromiseLike<T>) | null | undefined,
        ) {
          const rows = rowsFor(state.table ?? '')
          const pred = state.where ? buildPredicate(state.where) : () => true
          const out = rows.filter(pred)
          return Promise.resolve(out).then(onFulfilled, onRejected)
        },
      }
      return chain
    },
    insert(_table: unknown) {
      let pending: Partial<Row> = {}
      const chain = {
        values(v: Partial<Row>) {
          pending = v
          return chain
        },
        returning() {
          const now = new Date()
          const row: Row = {
            id: pending.id ?? crypto.randomUUID(),
            userId: pending.userId!,
            imageUrl: pending.imageUrl ?? '',
            category: (pending.category ?? 'tee') as Category,
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
          store.rows.push(row)
          return Promise.resolve([row])
        },
      }
      return chain
    },
    update(table: unknown) {
      const tName = tableName(table)
      const state: { set?: Record<string, unknown>; where?: unknown } = {}
      function exec() {
        const rows = rowsFor(tName)
        const pred = state.where ? buildPredicate(state.where) : () => true
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
        then<T>(
          onFulfilled: ((v: unknown) => T | PromiseLike<T>) | null | undefined,
          onRejected?: ((reason: unknown) => T | PromiseLike<T>) | null | undefined,
        ) {
          return Promise.resolve(exec()).then(onFulfilled, onRejected)
        },
      }
      return chain
    },
    delete(_table: unknown) {
      const state: { where?: unknown } = {}
      const chain = {
        where(w: unknown) {
          state.where = w
          return chain
        },
        returning() {
          const pred = state.where ? buildPredicate(state.where) : () => true
          const removed = store.rows.filter(pred as (r: Row) => boolean)
          store.rows = store.rows.filter((r) => !(pred as (r: Row) => boolean)(r))
          return Promise.resolve(removed)
        },
      }
      return chain
    },
    // Transaction is a pass-through on the fake — the in-memory store has no
    // rollback semantics, but the handler just sees the same chainable API.
    async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      return fn(fakeDb)
    },
  }
  return fakeDb
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
const { clothingItemHandlers } = await import('./clothing-item-handlers')

function ctx() {
  return {
    db: fakeDb as unknown as never,
    auth: fakeAuth as unknown as never,
    reqHeaders: new Headers(),
  }
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

function seedRow(overrides: Partial<Row> = {}): Row {
  const row: Row = {
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
  store.rows.push(row)
  return row
}

function seedOutfit(overrides: Partial<OutfitRow> = {}): OutfitRow {
  const now = new Date()
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
    createdAt: now,
    updatedAt: now,
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
// listClothingItems
// ---------------------------------------------------------------------------

describe('listClothingItems — ownership scoping (wardrobe.allium: owner invariant)', () => {
  test('returns only items belonging to the caller', async () => {
    seedRow({ userId: 'user-a', primaryColor: 'red' })
    seedRow({ userId: 'user-a', primaryColor: 'green' })
    seedRow({ userId: 'user-b', primaryColor: 'blue' })

    const result = await call(clothingItemHandlers.list, undefined as never, { context: ctx() })
    expect(result).toHaveLength(2)
    for (const r of result) expect(r.userId).toBe('user-a')
  })

  test('returns empty array for user with no items', async () => {
    seedRow({ userId: 'user-b' })
    const result = await call(clothingItemHandlers.list, undefined as never, { context: ctx() })
    expect(result).toEqual([])
  })

  test('different users see their own items, never each other', async () => {
    seedRow({ userId: 'user-a', primaryColor: 'A1' })
    seedRow({ userId: 'user-b', primaryColor: 'B1' })
    seedRow({ userId: 'user-b', primaryColor: 'B2' })

    const aResult = await call(clothingItemHandlers.list, undefined as never, { context: ctx() })
    expect(aResult.map((r) => r.primaryColor).sort()).toEqual(['A1'])

    currentUser = { id: 'user-b' }
    const bResult = await call(clothingItemHandlers.list, undefined as never, { context: ctx() })
    expect(bResult.map((r) => r.primaryColor).sort()).toEqual(['B1', 'B2'])
  })

  test('excludes items with status = removed', async () => {
    seedRow({ userId: 'user-a', primaryColor: 'kept', status: 'active' })
    seedRow({ userId: 'user-a', primaryColor: 'gone', status: 'removed', removedAt: new Date() })
    const result = await call(clothingItemHandlers.list, undefined as never, { context: ctx() })
    expect(result.map((r) => r.primaryColor)).toEqual(['kept'])
  })

  test('excludes archived items by default (includeArchived=false)', async () => {
    seedRow({ userId: 'user-a', primaryColor: 'active' })
    seedRow({
      userId: 'user-a',
      primaryColor: 'archived',
      status: 'archived',
      archivedAt: new Date(),
    })
    const result = await call(clothingItemHandlers.list, undefined as never, { context: ctx() })
    expect(result).toHaveLength(1)
    expect(result[0]!.primaryColor).toBe('active')
  })

  test('includes archived items when includeArchived=true (still excludes removed)', async () => {
    seedRow({ userId: 'user-a', primaryColor: 'active' })
    seedRow({
      userId: 'user-a',
      primaryColor: 'archived',
      status: 'archived',
      archivedAt: new Date(),
    })
    seedRow({
      userId: 'user-a',
      primaryColor: 'gone',
      status: 'removed',
      removedAt: new Date(),
    })
    const result = await call(clothingItemHandlers.list, { includeArchived: true }, {
      context: ctx(),
    })
    expect(result.map((r) => r.primaryColor).sort()).toEqual(['active', 'archived'])
  })

  test('throws UNAUTHORIZED when no session', async () => {
    currentUser = null
    await expect(
      call(clothingItemHandlers.list, undefined as never, { context: ctx() }),
    ).rejects.toThrow()
  })

  test('throws FORBIDDEN when permission check fails', async () => {
    permissionAllowed = false
    await expect(
      call(clothingItemHandlers.list, undefined as never, { context: ctx() }),
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// findClothingItem / findIncludingRemoved
// ---------------------------------------------------------------------------

describe('findClothingItem — excludes removed; findIncludingRemoved — historical lookup', () => {
  test('find returns an active item the caller owns', async () => {
    const row = seedRow({ userId: 'user-a', primaryColor: 'red' })
    const result = await call(clothingItemHandlers.find, { id: row.id }, { context: ctx() })
    expect(result?.id).toBe(row.id)
  })

  test('find returns null for a removed item (even if owned)', async () => {
    const row = seedRow({ userId: 'user-a', status: 'removed', removedAt: new Date() })
    const result = await call(clothingItemHandlers.find, { id: row.id }, { context: ctx() })
    expect(result).toBeNull()
  })

  test('findIncludingRemoved returns a removed item (owner scope)', async () => {
    const row = seedRow({ userId: 'user-a', status: 'removed', removedAt: new Date() })
    const result = await call(
      clothingItemHandlers.findIncludingRemoved,
      { id: row.id },
      { context: ctx() },
    )
    expect(result?.id).toBe(row.id)
    expect(result?.status).toBe('removed')
  })

  test("findIncludingRemoved does not leak other users' rows", async () => {
    const row = seedRow({ userId: 'user-b', status: 'removed', removedAt: new Date() })
    const result = await call(
      clothingItemHandlers.findIncludingRemoved,
      { id: row.id },
      { context: ctx() },
    )
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// createClothingItem
// ---------------------------------------------------------------------------

describe('createClothingItem', () => {
  test('persists the row with caller-supplied fields', async () => {
    const input = {
      imageUrl: 'https://example.com/tee.jpg',
      category: 'tee' as const,
      primaryColor: 'blue',
      fit: 'slim' as const,
      materials: ['cotton'],
      occasions: ['casual'],
    }
    const result = await call(clothingItemHandlers.create, input, { context: ctx() })
    expect(result).toMatchObject({
      category: 'tee',
      primaryColor: 'blue',
      fit: 'slim',
      materials: ['cotton'],
      occasions: ['casual'],
    })
    expect(store.rows).toHaveLength(1)
  })

  test('derives userId from the authenticated caller (ownership invariant)', async () => {
    const result = await call(
      clothingItemHandlers.create,
      {
        imageUrl: 'https://example.com/p.jpg',
        category: 'pants' as const,
        primaryColor: 'khaki',
      },
      { context: ctx() },
    )
    expect(result!.userId).toBe('user-a')
  })

  test('ignores any userId supplied in the input — cannot spoof ownership', async () => {
    const result = await call(
      clothingItemHandlers.create,
      {
        imageUrl: 'https://example.com/x.jpg',
        category: 'tee' as const,
        primaryColor: 'black',
        userId: 'attacker',
      } as never,
      { context: ctx() },
    )
    expect(result!.userId).toBe('user-a')
  })

  test('rejects invalid `category` enum values', async () => {
    await expect(
      call(
        clothingItemHandlers.create,
        {
          imageUrl: 'https://example.com/x.jpg',
          category: 'jumpsuit',
          primaryColor: 'red',
        } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('rejects missing required imageUrl', async () => {
    await expect(
      call(
        clothingItemHandlers.create,
        // @ts-expect-error
        { category: 'tee' as const, primaryColor: 'black' },
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('rejects missing required primaryColor', async () => {
    await expect(
      call(
        clothingItemHandlers.create,
        // @ts-expect-error
        { imageUrl: 'https://example.com/x.jpg', category: 'tee' as const },
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('accepts all 12 category enum values', async () => {
    const categories: Category[] = [
      'tee',
      'collared_shirt',
      'outer',
      'pants',
      'shorts',
      'headwear',
      'footwear',
      'bag',
      'scarf',
      'accessory',
      'dress',
      'skirt',
    ]
    for (const c of categories) {
      await call(
        clothingItemHandlers.create,
        { imageUrl: 'https://example.com/x.jpg', category: c, primaryColor: 'black' },
        { context: ctx() },
      )
    }
    expect(store.rows).toHaveLength(categories.length)
  })
})

// ---------------------------------------------------------------------------
// updateClothingItem
// ---------------------------------------------------------------------------

describe('updateClothingItem — ownership invariant on mutation', () => {
  test('updates when caller owns the row', async () => {
    const row = seedRow({ userId: 'user-a', primaryColor: 'old' })
    const updated = await call(
      clothingItemHandlers.update,
      { id: row.id, primaryColor: 'new' },
      { context: ctx() },
    )
    expect(updated.primaryColor).toBe('new')
    expect(store.rows.find((r) => r.id === row.id)?.primaryColor).toBe('new')
  })

  test('applies partial fields only (does not clobber unrelated columns)', async () => {
    const row = seedRow({
      userId: 'user-a',
      primaryColor: 'red',
      brand: 'Acme',
      fit: 'slim',
    })
    await call(
      clothingItemHandlers.update,
      { id: row.id, primaryColor: 'green' },
      { context: ctx() },
    )
    const after = store.rows.find((r) => r.id === row.id)!
    expect(after.primaryColor).toBe('green')
    expect(after.brand).toBe('Acme')
    expect(after.fit).toBe('slim')
  })

  test('throws NOT_FOUND when updating a row owned by a different user', async () => {
    const row = seedRow({ userId: 'user-b', primaryColor: 'theirs' })
    await expect(
      call(
        clothingItemHandlers.update,
        { id: row.id, primaryColor: 'hacked' },
        { context: ctx() },
      ),
    ).rejects.toThrow()
    expect(store.rows.find((r) => r.id === row.id)?.primaryColor).toBe('theirs')
  })

  test('throws NOT_FOUND when id does not exist', async () => {
    await expect(
      call(
        clothingItemHandlers.update,
        { id: crypto.randomUUID(), primaryColor: 'x' },
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('rejects invalid id (non-uuid)', async () => {
    await expect(
      call(
        clothingItemHandlers.update,
        { id: 'not-a-uuid', primaryColor: 'x' },
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('bumps updatedAt', async () => {
    const row = seedRow({ userId: 'user-a', updatedAt: new Date(2020, 0, 1) })
    await call(
      clothingItemHandlers.update,
      { id: row.id, primaryColor: 'touched' },
      { context: ctx() },
    )
    const after = store.rows.find((r) => r.id === row.id)!
    expect(+after.updatedAt).toBeGreaterThan(+new Date(2020, 0, 1))
  })
})

// ---------------------------------------------------------------------------
// archiveClothingItem (wardrobe.allium: ArchiveItem, 215-221)
// ---------------------------------------------------------------------------

describe('archiveClothingItem', () => {
  test('archives an active item: status=archived, archivedAt set', async () => {
    const row = seedRow({ userId: 'user-a' })
    const result = await call(clothingItemHandlers.archive, { id: row.id }, { context: ctx() })
    expect(result.status).toBe('archived')
    expect(result.archivedAt).not.toBeNull()
    const stored = store.rows.find((r) => r.id === row.id)!
    expect(stored.status).toBe('archived')
  })

  test('throws NOT_FOUND when item is already archived (precondition: status=active)', async () => {
    const row = seedRow({ userId: 'user-a', status: 'archived', archivedAt: new Date() })
    await expect(
      call(clothingItemHandlers.archive, { id: row.id }, { context: ctx() }),
    ).rejects.toThrow()
  })

  test('throws NOT_FOUND when item is removed', async () => {
    const row = seedRow({ userId: 'user-a', status: 'removed', removedAt: new Date() })
    await expect(
      call(clothingItemHandlers.archive, { id: row.id }, { context: ctx() }),
    ).rejects.toThrow()
  })

  test("throws NOT_FOUND on another user's item (ownership)", async () => {
    const row = seedRow({ userId: 'user-b' })
    await expect(
      call(clothingItemHandlers.archive, { id: row.id }, { context: ctx() }),
    ).rejects.toThrow()
    expect(store.rows.find((r) => r.id === row.id)?.status).toBe('active')
  })
})

// ---------------------------------------------------------------------------
// unarchiveClothingItem (wardrobe.allium: UnarchiveItem, 223-229)
// ---------------------------------------------------------------------------

describe('unarchiveClothingItem', () => {
  test('unarchives an archived item: status=active, archivedAt cleared', async () => {
    const row = seedRow({ userId: 'user-a', status: 'archived', archivedAt: new Date() })
    const result = await call(clothingItemHandlers.unarchive, { id: row.id }, { context: ctx() })
    expect(result.status).toBe('active')
    expect(result.archivedAt).toBeNull()
  })

  test('throws NOT_FOUND when item is active (precondition: status=archived)', async () => {
    const row = seedRow({ userId: 'user-a' })
    await expect(
      call(clothingItemHandlers.unarchive, { id: row.id }, { context: ctx() }),
    ).rejects.toThrow()
  })

  test("throws NOT_FOUND on another user's item", async () => {
    const row = seedRow({ userId: 'user-b', status: 'archived', archivedAt: new Date() })
    await expect(
      call(clothingItemHandlers.unarchive, { id: row.id }, { context: ctx() }),
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// toggleFavoriteClothingItem (wardrobe.allium: ToggleFavorite, 207-211)
// ---------------------------------------------------------------------------

describe('toggleFavoriteClothingItem', () => {
  test('false -> true on an active item', async () => {
    const row = seedRow({ userId: 'user-a', isFavorite: false })
    const result = await call(
      clothingItemHandlers.toggleFavorite,
      { id: row.id },
      { context: ctx() },
    )
    expect(result.isFavorite).toBe(true)
  })

  test('true -> false flips back', async () => {
    const row = seedRow({ userId: 'user-a', isFavorite: true })
    const result = await call(
      clothingItemHandlers.toggleFavorite,
      { id: row.id },
      { context: ctx() },
    )
    expect(result.isFavorite).toBe(false)
  })

  test('throws NOT_FOUND when item is archived (precondition: status=active)', async () => {
    const row = seedRow({ userId: 'user-a', status: 'archived', archivedAt: new Date() })
    await expect(
      call(clothingItemHandlers.toggleFavorite, { id: row.id }, { context: ctx() }),
    ).rejects.toThrow()
  })

  test("throws NOT_FOUND on another user's item", async () => {
    const row = seedRow({ userId: 'user-b' })
    await expect(
      call(clothingItemHandlers.toggleFavorite, { id: row.id }, { context: ctx() }),
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// removeItemPreserving (wardrobe.allium: RemoveItemPreservingOutfits, 234-240)
// ---------------------------------------------------------------------------

describe('removeItemPreserving — soft remove, outfits untouched', () => {
  test('sets status=removed and removedAt on an active item', async () => {
    const row = seedRow({ userId: 'user-a' })
    const result = await call(
      clothingItemHandlers.removePreserving,
      { id: row.id },
      { context: ctx() },
    )
    expect(result.status).toBe('removed')
    expect(result.removedAt).not.toBeNull()
  })

  test('also works on an archived item (precondition: status != removed)', async () => {
    const row = seedRow({ userId: 'user-a', status: 'archived', archivedAt: new Date() })
    const result = await call(
      clothingItemHandlers.removePreserving,
      { id: row.id },
      { context: ctx() },
    )
    expect(result.status).toBe('removed')
  })

  test('leaves referencing outfits alone (history preserved)', async () => {
    const item = seedRow({ userId: 'user-a' })
    const outfitRow = seedOutfit({ userId: 'user-a', baseId: item.id })
    await call(clothingItemHandlers.removePreserving, { id: item.id }, { context: ctx() })
    const after = store.outfits.find((o) => o.id === outfitRow.id)!
    expect(after.status).toBe('active')
    expect(after.baseId).toBe(item.id)
  })

  test('throws NOT_FOUND when already removed', async () => {
    const row = seedRow({ userId: 'user-a', status: 'removed', removedAt: new Date() })
    await expect(
      call(clothingItemHandlers.removePreserving, { id: row.id }, { context: ctx() }),
    ).rejects.toThrow()
  })

  test("throws NOT_FOUND on another user's item", async () => {
    const row = seedRow({ userId: 'user-b' })
    await expect(
      call(clothingItemHandlers.removePreserving, { id: row.id }, { context: ctx() }),
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// removeItemAndOutfits (wardrobe.allium: RemoveItemAndOutfits, 243-252)
// ---------------------------------------------------------------------------

describe('removeItemAndOutfits — cascades soft-delete to referencing outfits', () => {
  test('soft-deletes every outfit referencing the item in any slot; item becomes removed', async () => {
    const item = seedRow({ userId: 'user-a' })
    const unrelated = seedRow({ userId: 'user-a' })
    const o1 = seedOutfit({ userId: 'user-a', baseId: item.id })
    const o2 = seedOutfit({ userId: 'user-a', footwearId: item.id })
    const o3 = seedOutfit({ userId: 'user-a', baseId: unrelated.id })

    await call(clothingItemHandlers.removeAndOutfits, { id: item.id }, { context: ctx() })

    const after1 = store.outfits.find((o) => o.id === o1.id)!
    const after2 = store.outfits.find((o) => o.id === o2.id)!
    const after3 = store.outfits.find((o) => o.id === o3.id)!
    expect(after1.status).toBe('deleted')
    expect(after1.deletedAt).not.toBeNull()
    expect(after2.status).toBe('deleted')
    expect(after3.status).toBe('active') // unrelated outfit untouched

    const itemAfter = store.rows.find((r) => r.id === item.id)!
    expect(itemAfter.status).toBe('removed')
    expect(itemAfter.removedAt).not.toBeNull()
  })

  test('works when no outfits reference the item', async () => {
    const item = seedRow({ userId: 'user-a' })
    await call(clothingItemHandlers.removeAndOutfits, { id: item.id }, { context: ctx() })
    const after = store.rows.find((r) => r.id === item.id)!
    expect(after.status).toBe('removed')
  })

  test('throws NOT_FOUND when item is already removed', async () => {
    const row = seedRow({ userId: 'user-a', status: 'removed', removedAt: new Date() })
    await expect(
      call(clothingItemHandlers.removeAndOutfits, { id: row.id }, { context: ctx() }),
    ).rejects.toThrow()
  })

  test("throws NOT_FOUND on another user's item (ownership)", async () => {
    const row = seedRow({ userId: 'user-b' })
    await expect(
      call(clothingItemHandlers.removeAndOutfits, { id: row.id }, { context: ctx() }),
    ).rejects.toThrow()
    expect(store.rows.find((r) => r.id === row.id)?.status).toBe('active')
  })

  test("never soft-deletes another user's outfit even if slot id matches (scoped to user)", async () => {
    const item = seedRow({ userId: 'user-a' })
    // Pathological: another user happens to reference the same id (won't happen
    // in real FK-enforced DB, but we assert the query's user scoping).
    const foreign = seedOutfit({ userId: 'user-b', baseId: item.id })
    await call(clothingItemHandlers.removeAndOutfits, { id: item.id }, { context: ctx() })
    const after = store.outfits.find((o) => o.id === foreign.id)!
    expect(after.status).toBe('active')
  })
})

// ---------------------------------------------------------------------------
// onboarding integration — CompleteStarterWardrobeStep (specs/onboarding.allium)
// Threshold hardcoded at 5 in onboarding-helpers.ts.
// ---------------------------------------------------------------------------

describe('createClothingItem — starter wardrobe step completion', () => {
  async function createItem() {
    return call(
      clothingItemHandlers.create,
      {
        imageUrl: 'https://example.com/x.jpg',
        category: 'tee' as const,
        primaryColor: 'black',
      },
      { context: ctx() },
    )
  }

  test('creating the 4th item does NOT complete starter wardrobe step', async () => {
    seedOnboarding()
    // Seed 3 existing active items.
    for (let i = 0; i < 3; i++) seedRow({ userId: 'user-a' })
    await createItem() // 4th item
    expect(store.onboarding[0]!.starterWardrobeCompletedAt).toBeNull()
    expect(store.onboarding[0]!.status).toBe('in_progress')
  })

  test('creating the 5th item completes starter wardrobe step', async () => {
    seedOnboarding()
    for (let i = 0; i < 4; i++) seedRow({ userId: 'user-a' })
    await createItem() // 5th item crosses threshold
    expect(store.onboarding[0]!.starterWardrobeCompletedAt).not.toBeNull()
  })

  test('creating the 6th item does NOT re-complete (idempotent)', async () => {
    const originalStamp = new Date(2020, 0, 1)
    seedOnboarding({ starterWardrobeCompletedAt: originalStamp })
    for (let i = 0; i < 5; i++) seedRow({ userId: 'user-a' })
    await createItem() // 6th item
    expect(store.onboarding[0]!.starterWardrobeCompletedAt).toBe(originalStamp)
  })

  test('when biometrics already done, 5th item completes onboarding entirely', async () => {
    seedOnboarding({ biometricsCompletedAt: new Date() })
    for (let i = 0; i < 4; i++) seedRow({ userId: 'user-a' })
    await createItem()
    expect(store.onboarding[0]!.status).toBe('completed')
    expect(store.onboarding[0]!.completedAt).not.toBeNull()
  })
})
