/**
 * Shared in-memory fake DB for style-board handler tests.
 *
 * Multi-table store with predicate capture on a WeakMap. Handles the
 * operations the style handlers use: select (with shape projection, orderBy,
 * limit, innerJoin), insert (single + array .values), update, delete,
 * transaction (pass-through).
 *
 * Usage — each test file does:
 *     import { installStyleFakes, store, reset } from './style-test-helpers'
 *     const { fakeDb, setUser, setPermissionAllowed } = installStyleFakes()
 *
 * IMPORTANT: Call installStyleFakes() BEFORE importing the handlers under
 * test. The call chain replaces drizzle-orm and ../db/db, ../../auth,
 * ../auth via mock.module, then returns the fake db plus accessors.
 */

import { mock } from 'bun:test'

export type StyleTagRow = {
  id: string
  label: string
  category: 'aesthetic' | 'color' | 'silhouette' | 'occasion' | 'season'
  createdAt: Date
}

export type StyleCardRow = {
  id: string
  imageUrl: string
  sourceAttribution: string
  status: 'active' | 'retired'
  createdAt: Date
  retiredAt: Date | null
}

export type StyleCardTagRow = { cardId: string; tagId: string }

export type StyleInteractionRow = {
  id: string
  userId: string
  cardId: string
  kind: 'liked' | 'skipped'
  occurredAt: Date
}

export type SavedStyleRow = {
  id: string
  userId: string
  cardId: string
  savedAt: Date
}

export type Store = {
  styleTags: StyleTagRow[]
  styleCards: StyleCardRow[]
  styleCardTags: StyleCardTagRow[]
  styleInteractions: StyleInteractionRow[]
  savedStyles: SavedStyleRow[]
}

export const store: Store = {
  styleTags: [],
  styleCards: [],
  styleCardTags: [],
  styleInteractions: [],
  savedStyles: [],
}

export function resetStore() {
  store.styleTags = []
  store.styleCards = []
  store.styleCardTags = []
  store.styleInteractions = []
  store.savedStyles = []
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
  card_id: 'cardId',
  tag_id: 'tagId',
  label: 'label',
  category: 'category',
  image_url: 'imageUrl',
  source_attribution: 'sourceAttribution',
  status: 'status',
  retired_at: 'retiredAt',
  kind: 'kind',
  occurred_at: 'occurredAt',
  saved_at: 'savedAt',
  created_at: 'createdAt',
}

function evalNode(node: Node, row: Record<string, unknown>): boolean {
  if (node.kind === 'and') return node.children.every((c) => evalNode(c, row))
  if (node.kind === 'or') return node.children.some((c) => evalNode(c, row))
  const leaf = node as Exclude<Node, { kind: 'and' | 'or' }>
  const key = sqlToJs[leaf.col] ?? leaf.col
  const rowVal = row[key]
  if (node.kind === 'eq') return rowVal === node.val
  if (node.kind === 'ne') return rowVal !== node.val
  if (node.kind === 'lt') {
    if (rowVal instanceof Date && node.val instanceof Date) return rowVal < node.val
    return (rowVal as number) < (node.val as number)
  }
  if (node.kind === 'gt') {
    if (rowVal instanceof Date && node.val instanceof Date) return rowVal > node.val
    return (rowVal as number) > (node.val as number)
  }
  if (node.kind === 'in') return node.vals.includes(rowVal)
  if (node.kind === 'notIn') return !node.vals.includes(rowVal)
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
  if (name === 'style_tag') return store.styleTags as never
  if (name === 'style_card') return store.styleCards as never
  if (name === 'style_card_tag') return store.styleCardTags as never
  if (name === 'style_interaction') return store.styleInteractions as never
  if (name === 'saved_style') return store.savedStyles as never
  return []
}

function setRowsFor(name: string, rows: Array<Record<string, unknown>>) {
  if (name === 'style_tag') store.styleTags = rows as never
  else if (name === 'style_card') store.styleCards = rows as never
  else if (name === 'style_card_tag') store.styleCardTags = rows as never
  else if (name === 'style_interaction') store.styleInteractions = rows as never
  else if (name === 'saved_style') store.savedStyles = rows as never
}

export function installStyleFakes() {
  // Must be called before any handler is imported — this mocks drizzle-orm,
  // ../db/db, ../../auth, ../auth.
  mock.module('drizzle-orm', () => {
    // biome-ignore lint: intentional require for ESM interop
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
    select(shape?: Record<string, unknown>) {
      const state: {
        where?: unknown
        order?: { col: string; dir: 'asc' | 'desc' }
        limit?: number
        table?: string
        join?: { table: string }
        shape?: Record<string, unknown>
      } = { shape }
      const chain = {
        from(t: unknown) {
          state.table = tableName(t)
          return chain
        },
        innerJoin(t: unknown, _on: unknown) {
          state.join = { table: tableName(t) }
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
        let joined: Array<Record<string, unknown>> = rows
        if (state.join) {
          const otherRows = rowsFor(state.join.table)
          const joinedOut: Array<Record<string, unknown>> = []
          for (const r of rows) {
            for (const o of otherRows) {
              // Heuristic: match via cardId<->id or tagId<->id.
              const match =
                (r.cardId !== undefined && o.id === r.cardId) ||
                (r.tagId !== undefined && o.id === r.tagId)
              if (match) joinedOut.push({ ...r, __joined: o })
            }
          }
          joined = joinedOut
        }
        const pred = state.where ? buildPredicate(state.where) : () => true
        let filtered = joined.filter((r) => pred(r))
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
        if (state.shape) {
          return filtered.map((r) => {
            const o: Record<string, unknown> = {}
            for (const [key, colSpec] of Object.entries(state.shape!)) {
              const c = colSpec as { name?: string } | unknown
              if (c && typeof c === 'object' && !('name' in (c as object))) {
                // Spec is a table object -> pick joined row
                o[key] = r.__joined
              } else {
                const name = (c as { name?: string })?.name ?? ''
                o[key] = r[sqlToJs[name] ?? name]
              }
            }
            return o
          })
        }
        return filtered.map((r) => {
          const { __joined, ...rest } = r
          void __joined
          return rest
        })
      }
      return chain
    },
    insert(t: unknown) {
      const tName = tableName(t)
      let pendingRows: Array<Record<string, unknown>> = []
      const run = () => {
        const now = new Date()
        const inserted: Array<Record<string, unknown>> = []
        for (const v of pendingRows) {
          const row: Record<string, unknown> = { ...v }
          if (!row.id && tName !== 'style_card_tag') row.id = crypto.randomUUID()
          if (!row.createdAt && (tName === 'style_tag' || tName === 'style_card')) {
            row.createdAt = now
          }
          if (tName === 'style_card' && row.retiredAt === undefined) row.retiredAt = null
          if (tName === 'style_card' && !row.status) row.status = 'active'
          if (tName === 'style_interaction' && !row.occurredAt) row.occurredAt = now
          if (tName === 'saved_style' && !row.savedAt) row.savedAt = now
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
    async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      return fn(fakeDb)
    },
  }
  return fakeDb
}

// --- seeders ---------------------------------------------------------------

export function seedCard(overrides: Partial<StyleCardRow> = {}): StyleCardRow {
  const row: StyleCardRow = {
    id: crypto.randomUUID(),
    imageUrl: 'https://img/x.jpg',
    sourceAttribution: 'Unsplash',
    status: 'active',
    createdAt: new Date(),
    retiredAt: null,
    ...overrides,
  }
  store.styleCards.push(row)
  return row
}

export function seedTag(overrides: Partial<StyleTagRow> = {}): StyleTagRow {
  const row: StyleTagRow = {
    id: crypto.randomUUID(),
    label: `tag-${Math.random().toString(36).slice(2, 8)}`,
    category: 'aesthetic',
    createdAt: new Date(),
    ...overrides,
  }
  store.styleTags.push(row)
  return row
}

export function seedInteraction(
  overrides: Partial<StyleInteractionRow> = {},
): StyleInteractionRow {
  const row: StyleInteractionRow = {
    id: crypto.randomUUID(),
    userId: 'user-a',
    cardId: crypto.randomUUID(),
    kind: 'liked',
    occurredAt: new Date(),
    ...overrides,
  }
  store.styleInteractions.push(row)
  return row
}

export function seedSaved(overrides: Partial<SavedStyleRow> = {}): SavedStyleRow {
  const row: SavedStyleRow = {
    id: crypto.randomUUID(),
    userId: 'user-a',
    cardId: crypto.randomUUID(),
    savedAt: new Date(),
    ...overrides,
  }
  store.savedStyles.push(row)
  return row
}
