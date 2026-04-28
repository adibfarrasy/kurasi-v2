/**
 * Shared in-memory fake DB for fit-page handler tests
 * (fit-adjustment, shared-outfit, outfit-recommendation).
 *
 * Same shape as style-test-helpers.ts but tracks the fit-page tables plus
 * clothing_item, outfit, and user (for hydration). Call installFitPageFakes()
 * BEFORE importing the handler under test.
 */

import { mock } from 'bun:test'

export type ClothingItemRow = {
  id: string
  userId: string
  status: 'active' | 'archived' | 'removed'
  category?: string
  imageUrl?: string
  primaryColor?: string
  materials?: string[]
  occasions?: string[]
  isFavorite?: boolean
  createdAt?: Date
  updatedAt?: Date
}

export type OutfitRow = {
  id: string
  userId: string
  status: 'active' | 'deleted'
  name?: string | null
  createdAt?: Date
  updatedAt?: Date
  deletedAt?: Date | null
}

export type UserRow = { id: string; name: string | null; email?: string }

export type FitAdjustmentRow = {
  id: string
  userId: string
  itemId: string
  length: string | null
  width: string | null
  sleeve: string | null
  rise: string | null
  customNotes: string | null
  createdAt: Date
  updatedAt: Date
}

export type SharedOutfitRow = {
  id: string
  userId: string
  outfitId: string
  faceAnonymisation: 'none' | 'blur_face' | 'block_eyes'
  showUsername: boolean
  status: 'published' | 'unpublished'
  sharedAt: Date
  unpublishedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type RecommendationRow = {
  id: string
  userId: string
  kind: 'gap_filling' | 'outfit_generation'
  basedOnOutfitId: string | null
  status: 'pending' | 'computed' | 'failed'
  requestedAt: Date
  computedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type ShareableCardRow = {
  id: string
  userId: string
  kind: 'outfit' | 'wardrobe_showcase' | 'style_stats'
  caption: string | null
  theme: 'light' | 'dark' | 'colorful'
  renderedImageUrl: string
  status: 'active' | 'expired'
  createdAt: Date
  expiresAt: Date
  outfitId: string | null
  showcaseMode: 'by_category' | 'by_color' | 'by_style' | 'entire_wardrobe' | null
  statsPeriod: 'week' | 'month' | 'year' | null
}

export type ShareEventRow = {
  id: string
  cardId: string
  platform: 'instagram_story' | 'snapchat' | 'tiktok' | 'twitter' | 'clipboard'
  occurredAt: Date
}

export type ShareClickRow = {
  id: string
  cardId: string
  platform: 'instagram_story' | 'snapchat' | 'tiktok' | 'twitter' | 'clipboard'
  referredUserId: string | null
  occurredAt: Date
}

export type Store = {
  users: UserRow[]
  clothingItems: ClothingItemRow[]
  outfits: OutfitRow[]
  fitAdjustments: FitAdjustmentRow[]
  sharedOutfits: SharedOutfitRow[]
  recommendations: RecommendationRow[]
  shareableCards: ShareableCardRow[]
  shareEvents: ShareEventRow[]
  shareClicks: ShareClickRow[]
}

export const store: Store = {
  users: [],
  clothingItems: [],
  outfits: [],
  fitAdjustments: [],
  sharedOutfits: [],
  recommendations: [],
  shareableCards: [],
  shareEvents: [],
  shareClicks: [],
}

export function resetStore() {
  store.users = []
  store.clothingItems = []
  store.outfits = []
  store.fitAdjustments = []
  store.sharedOutfits = []
  store.recommendations = []
  store.shareableCards = []
  store.shareEvents = []
  store.shareClicks = []
}

// --- predicate tree --------------------------------------------------------

type Node =
  | { kind: 'eq' | 'ne'; col: string; val: unknown }
  | { kind: 'lt' | 'gt'; col: string; val: unknown }
  | { kind: 'in' | 'notIn'; col: string; vals: unknown[] }
  | { kind: 'and' | 'or'; children: Node[] }

const whereMap = new WeakMap<object, Node>()

const sqlToJs: Record<string, string> = {
  id: 'id',
  user_id: 'userId',
  item_id: 'itemId',
  outfit_id: 'outfitId',
  based_on_outfit_id: 'basedOnOutfitId',
  status: 'status',
  kind: 'kind',
  length: 'length',
  width: 'width',
  sleeve: 'sleeve',
  rise: 'rise',
  custom_notes: 'customNotes',
  face_anonymisation: 'faceAnonymisation',
  show_username: 'showUsername',
  shared_at: 'sharedAt',
  unpublished_at: 'unpublishedAt',
  requested_at: 'requestedAt',
  computed_at: 'computedAt',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  name: 'name',
  email: 'email',
  card_id: 'cardId',
  caption: 'caption',
  theme: 'theme',
  rendered_image_url: 'renderedImageUrl',
  expires_at: 'expiresAt',
  showcase_mode: 'showcaseMode',
  stats_period: 'statsPeriod',
  platform: 'platform',
  occurred_at: 'occurredAt',
  referred_user_id: 'referredUserId',
}

function evalNode(node: Node, row: Record<string, unknown>): boolean {
  if (node.kind === 'and') return node.children.every((c) => evalNode(c, row))
  if (node.kind === 'or') return node.children.some((c) => evalNode(c, row))
  const leaf = node as Exclude<Node, { kind: 'and' | 'or' }>
  const key = sqlToJs[leaf.col] ?? leaf.col
  const rowVal = row[key]
  if (node.kind === 'eq') return rowVal === node.val
  if (node.kind === 'ne') return rowVal !== node.val
  if (node.kind === 'in') return node.vals.includes(rowVal)
  if (node.kind === 'notIn') return !node.vals.includes(rowVal)
  if (node.kind === 'lt') {
    if (rowVal instanceof Date && node.val instanceof Date) return rowVal < node.val
    return (rowVal as number) < (node.val as number)
  }
  if (node.kind === 'gt') {
    if (rowVal instanceof Date && node.val instanceof Date) return rowVal > node.val
    return (rowVal as number) > (node.val as number)
  }
  return false
}

function buildPredicate(whereArg: unknown): (r: Record<string, unknown>) => boolean {
  const n = whereMap.get(whereArg as object)
  if (!n) return () => true
  return (r) => evalNode(n, r)
}

const DRIZZLE_NAME = Symbol.for('drizzle:Name')
function tableName(t: unknown): string {
  if (t && typeof t === 'object') {
    const v = (t as Record<symbol, unknown>)[DRIZZLE_NAME]
    if (typeof v === 'string') return v
  }
  return ''
}

function rowsFor(name: string): Array<Record<string, unknown>> {
  if (name === 'user') return store.users as never
  if (name === 'clothing_item') return store.clothingItems as never
  if (name === 'outfit') return store.outfits as never
  if (name === 'fit_adjustment') return store.fitAdjustments as never
  if (name === 'shared_outfit') return store.sharedOutfits as never
  if (name === 'outfit_recommendation_request') return store.recommendations as never
  if (name === 'shareable_card') return store.shareableCards as never
  if (name === 'share_event') return store.shareEvents as never
  if (name === 'share_click') return store.shareClicks as never
  return []
}

function setRowsFor(name: string, rows: Array<Record<string, unknown>>) {
  if (name === 'fit_adjustment') store.fitAdjustments = rows as never
  else if (name === 'shared_outfit') store.sharedOutfits = rows as never
  else if (name === 'outfit_recommendation_request') store.recommendations = rows as never
  else if (name === 'clothing_item') store.clothingItems = rows as never
  else if (name === 'outfit') store.outfits = rows as never
  else if (name === 'shareable_card') store.shareableCards = rows as never
  else if (name === 'share_event') store.shareEvents = rows as never
  else if (name === 'share_click') store.shareClicks = rows as never
}

export function installFitPageFakes() {
  mock.module('drizzle-orm', () => {
    // biome-ignore lint: intentional require
    const real = require('drizzle-orm') // eslint-disable-line @typescript-eslint/no-require-imports
    const tag = (n: Node) => {
      const w = { __n: true } as object
      whereMap.set(w, n)
      return w
    }
    const colName = (c: { name?: string } | string) =>
      typeof c === 'string' ? c : (c?.name ?? '')
    return {
      ...real,
      eq: (c: unknown, v: unknown) => tag({ kind: 'eq', col: colName(c as never), val: v }),
      ne: (c: unknown, v: unknown) => tag({ kind: 'ne', col: colName(c as never), val: v }),
      lt: (c: unknown, v: unknown) => tag({ kind: 'lt', col: colName(c as never), val: v }),
      gt: (c: unknown, v: unknown) => tag({ kind: 'gt', col: colName(c as never), val: v }),
      inArray: (c: unknown, vs: unknown[]) =>
        tag({ kind: 'in', col: colName(c as never), vals: vs }),
      notInArray: (c: unknown, vs: unknown[]) =>
        tag({ kind: 'notIn', col: colName(c as never), vals: vs }),
      and: (...args: unknown[]) => {
        const children: Node[] = []
        for (const a of args) {
          const n = whereMap.get(a as object)
          if (n) children.push(n)
        }
        return tag({ kind: 'and', children })
      },
      or: (...args: unknown[]) => {
        const children: Node[] = []
        for (const a of args) {
          const n = whereMap.get(a as object)
          if (n) children.push(n)
        }
        return tag({ kind: 'or', children })
      },
      desc: (c: unknown) => ({ __desc: true, col: colName(c as never) }),
      asc: (c: unknown) => ({ __asc: true, col: colName(c as never) }),
      isNotNull: (c: unknown) => tag({ kind: 'ne', col: colName(c as never), val: null }),
    }
  })

  const fakeDb = makeFakeDb()
  mock.module('../db/db', () => ({ db: fakeDb }))

  const authState: {
    user: { id: string } | null
    permissionAllowed: boolean
  } = { user: { id: 'user-a' }, permissionAllowed: true }

  const fakeAuth = {
    api: {
      async getSession(_: unknown) {
        if (!authState.user) return null
        return { session: { id: 'sess' }, user: authState.user }
      },
      async userHasPermission(_: unknown) {
        return { success: authState.permissionAllowed }
      },
    },
  }
  mock.module('../../auth', () => ({ auth: fakeAuth }))
  mock.module('../auth', () => ({ auth: fakeAuth }))

  return {
    fakeDb,
    fakeAuth,
    setUser(u: { id: string } | null) {
      authState.user = u
    },
    setPermissionAllowed(v: boolean) {
      authState.permissionAllowed = v
    },
  }
}

function makeFakeDb() {
  const fakeDb: Record<string, unknown> = {
    select(_shape?: Record<string, unknown>) {
      const state: {
        where?: unknown
        order?: { col: string; dir: 'asc' | 'desc' }
        limit?: number
        table?: string
      } = {}
      const chain = {
        from(t: unknown) {
          state.table = tableName(t)
          return chain
        },
        where(w: unknown) {
          state.where = w
          return chain
        },
        orderBy(o: unknown) {
          const ord = o as { __desc?: boolean; __asc?: boolean; col: string }
          state.order = {
            col: sqlToJs[ord.col] ?? ord.col,
            dir: ord.__desc ? 'desc' : 'asc',
          }
          return chain
        },
        limit(n: number) {
          state.limit = n
          return chain
        },
        then<T>(
          onFulfilled: ((value: unknown[]) => T | PromiseLike<T>) | null | undefined,
          onRejected?: ((reason: unknown) => T | PromiseLike<T>) | null | undefined,
        ) {
          return Promise.resolve(execute()).then(onFulfilled, onRejected)
        },
      }
      function execute(): unknown[] {
        const rows = rowsFor(state.table ?? '').slice()
        const pred = state.where ? buildPredicate(state.where) : () => true
        let filtered = rows.filter((r) => pred(r))
        if (state.order) {
          const { col, dir } = state.order
          filtered = filtered.slice().sort((a, b) => {
            const av = a[col] as unknown
            const bv = b[col] as unknown
            if (av === bv) return 0
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cmp = (av as any) < (bv as any) ? -1 : 1
            return dir === 'desc' ? -cmp : cmp
          })
        }
        if (state.limit !== undefined) filtered = filtered.slice(0, state.limit)
        return filtered
      }
      return chain
    },
    insert(t: unknown) {
      const tName = tableName(t)
      let pendingRows: Array<Record<string, unknown>> = []
      let conflict: { set?: Record<string, unknown>; targetCols?: string[] } | null = null
      const run = () => {
        const now = new Date()
        const inserted: Array<Record<string, unknown>> = []
        for (const v of pendingRows) {
          // Handle conflict: match on target columns.
          if (conflict && tName === 'fit_adjustment') {
            const existing = store.fitAdjustments.find(
              (r) => r.userId === v.userId && r.itemId === v.itemId,
            )
            if (existing) {
              Object.assign(existing, conflict.set ?? {})
              inserted.push(existing as unknown as Record<string, unknown>)
              continue
            }
          }
          const row: Record<string, unknown> = { ...v }
          if (!row.id) row.id = crypto.randomUUID()
          if (!row.createdAt) row.createdAt = now
          if (!row.updatedAt) row.updatedAt = now
          rowsFor(tName).push(row)
          inserted.push(row)
        }
        return inserted
      }
      const chain = {
        values(v: Record<string, unknown> | Array<Record<string, unknown>>) {
          pendingRows = Array.isArray(v) ? v : [v]
          return chain
        },
        onConflictDoUpdate(opts: { target: unknown; set: Record<string, unknown> }) {
          conflict = { set: opts.set }
          return chain
        },
        returning() {
          return Promise.resolve(run())
        },
        then<T>(
          onFulfilled: ((value: unknown[]) => T | PromiseLike<T>) | null | undefined,
          onRejected?: ((reason: unknown) => T | PromiseLike<T>) | null | undefined,
        ) {
          return Promise.resolve(run()).then(onFulfilled, onRejected)
        },
      }
      return chain
    },
    update(t: unknown) {
      const tName = tableName(t)
      const state: { set?: Record<string, unknown>; where?: unknown } = {}
      const exec = () => {
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
    delete(t: unknown) {
      const tName = tableName(t)
      const state: { where?: unknown } = {}
      const chain = {
        where(w: unknown) {
          state.where = w
          return chain
        },
        returning() {
          const pred = state.where ? buildPredicate(state.where) : () => true
          const rows = rowsFor(tName)
          const removed = rows.filter(pred)
          setRowsFor(
            tName,
            rows.filter((r) => !pred(r)),
          )
          return Promise.resolve(removed)
        },
      }
      return chain
    },
  }
  return fakeDb
}

// --- seeders ---------------------------------------------------------------

export function seedItem(overrides: Partial<ClothingItemRow> = {}): ClothingItemRow {
  const row: ClothingItemRow = {
    id: crypto.randomUUID(),
    userId: 'user-a',
    status: 'active',
    ...overrides,
  }
  store.clothingItems.push(row)
  return row
}

export function seedOutfit(overrides: Partial<OutfitRow> = {}): OutfitRow {
  const row: OutfitRow = {
    id: crypto.randomUUID(),
    userId: 'user-a',
    status: 'active',
    ...overrides,
  }
  store.outfits.push(row)
  return row
}

export function seedUser(overrides: Partial<UserRow> = {}): UserRow {
  const row: UserRow = {
    id: 'user-a',
    name: 'Ada',
    ...overrides,
  }
  store.users.push(row)
  return row
}

export function seedSharedOutfit(
  overrides: Partial<SharedOutfitRow> = {},
): SharedOutfitRow {
  const now = new Date()
  const row: SharedOutfitRow = {
    id: crypto.randomUUID(),
    userId: 'user-a',
    outfitId: crypto.randomUUID(),
    faceAnonymisation: 'none',
    showUsername: true,
    status: 'published',
    sharedAt: now,
    unpublishedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
  store.sharedOutfits.push(row)
  return row
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function seedShareableCard(
  overrides: Partial<ShareableCardRow> = {},
): ShareableCardRow {
  const now = new Date()
  const row: ShareableCardRow = {
    id: crypto.randomUUID(),
    userId: 'user-a',
    kind: 'outfit',
    caption: null,
    theme: 'light',
    renderedImageUrl: 'https://cdn.kurasi.dev/cards/stub.png',
    status: 'active',
    createdAt: now,
    expiresAt: new Date(now.getTime() + 90 * MS_PER_DAY),
    outfitId: null,
    showcaseMode: null,
    statsPeriod: null,
    ...overrides,
  }
  store.shareableCards.push(row)
  return row
}

export function seedShareEvent(overrides: Partial<ShareEventRow> = {}): ShareEventRow {
  const row: ShareEventRow = {
    id: crypto.randomUUID(),
    cardId: crypto.randomUUID(),
    platform: 'instagram_story',
    occurredAt: new Date(),
    ...overrides,
  }
  store.shareEvents.push(row)
  return row
}

export function seedShareClick(overrides: Partial<ShareClickRow> = {}): ShareClickRow {
  const row: ShareClickRow = {
    id: crypto.randomUUID(),
    cardId: crypto.randomUUID(),
    platform: 'instagram_story',
    referredUserId: null,
    occurredAt: new Date(),
    ...overrides,
  }
  store.shareClicks.push(row)
  return row
}

export function seedRecommendation(
  overrides: Partial<RecommendationRow> = {},
): RecommendationRow {
  const now = new Date()
  const row: RecommendationRow = {
    id: crypto.randomUUID(),
    userId: 'user-a',
    kind: 'gap_filling',
    basedOnOutfitId: null,
    status: 'pending',
    requestedAt: now,
    computedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
  store.recommendations.push(row)
  return row
}
