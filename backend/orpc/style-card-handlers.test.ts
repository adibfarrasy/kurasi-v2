/**
 * Tests for style-card-handlers.
 *
 * Spec: specs/style-board.allium
 * Code: ./style-card-handlers.ts
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import {
  installStyleFakes,
  resetStore,
  seedCard,
  seedInteraction,
  seedTag,
  store,
  type StyleTagRow,
} from './style-test-helpers'

const { fakeDb, fakeAuth, setUser, setPermissionAllowed } = installStyleFakes()

const { call } = await import('@orpc/server')
const { styleCardHandlers } = await import('./style-card-handlers')

function ctx() {
  return {
    db: fakeDb as unknown as never,
    auth: fakeAuth as unknown as never,
    reqHeaders: new Headers(),
  }
}

beforeEach(() => {
  resetStore()
  setUser({ id: 'user-a' })
  setPermissionAllowed(true)
})

describe('styleCardHandlers.feed', () => {
  test('returns active cards newest first', async () => {
    const old = seedCard({ createdAt: new Date(2025, 0, 1) })
    const recent = seedCard({ createdAt: new Date(2026, 0, 1) })
    const result = await call(styleCardHandlers.feed, {}, { context: ctx() })
    expect(result.items.map((c) => c.id)).toEqual([recent.id, old.id])
  })

  test('excludes retired cards', async () => {
    const a = seedCard({ status: 'active' })
    seedCard({ status: 'retired', retiredAt: new Date() })
    const result = await call(styleCardHandlers.feed, {}, { context: ctx() })
    expect(result.items.map((c) => c.id)).toEqual([a.id])
  })

  test('excludes cards the caller has skipped', async () => {
    const a = seedCard()
    const b = seedCard()
    seedInteraction({ userId: 'user-a', cardId: b.id, kind: 'skipped' })
    const result = await call(styleCardHandlers.feed, {}, { context: ctx() })
    expect(result.items.map((c) => c.id)).toEqual([a.id])
  })

  test('excludes cards the caller has liked', async () => {
    const a = seedCard()
    const b = seedCard()
    seedInteraction({ userId: 'user-a', cardId: b.id, kind: 'liked' })
    const result = await call(styleCardHandlers.feed, {}, { context: ctx() })
    expect(result.items.map((c) => c.id)).toEqual([a.id])
  })

  test('does not exclude cards interacted with by other users', async () => {
    const a = seedCard()
    seedInteraction({ userId: 'user-b', cardId: a.id, kind: 'skipped' })
    const result = await call(styleCardHandlers.feed, {}, { context: ctx() })
    expect(result.items.map((c) => c.id)).toEqual([a.id])
  })

  test('respects limit and exposes nextCursor when more exist', async () => {
    const t0 = Date.now()
    for (let i = 0; i < 5; i++) seedCard({ createdAt: new Date(t0 - i * 1000) })
    const result = await call(styleCardHandlers.feed, { limit: 2 }, { context: ctx() })
    expect(result.items).toHaveLength(2)
    expect(result.nextCursor).toBeTruthy()
  })

  test('nextCursor is null when no more pages', async () => {
    seedCard()
    seedCard()
    const result = await call(styleCardHandlers.feed, { limit: 10 }, { context: ctx() })
    expect(result.items).toHaveLength(2)
    expect(result.nextCursor).toBeNull()
  })

  test('includes tags for each card', async () => {
    const c = seedCard()
    const t1 = seedTag({ label: 'minimalist' })
    store.styleCardTags.push({ cardId: c.id, tagId: t1.id })
    const result = await call(styleCardHandlers.feed, {}, { context: ctx() })
    expect((result.items[0]!.tags[0] as StyleTagRow).label).toBe('minimalist')
  })

  test('FORBIDDEN when permission denied', async () => {
    setPermissionAllowed(false)
    await expect(
      call(styleCardHandlers.feed, {}, { context: ctx() }),
    ).rejects.toThrow()
  })
})

describe('styleCardHandlers.find', () => {
  test('returns card + tags for an active card', async () => {
    const c = seedCard()
    const t = seedTag()
    store.styleCardTags.push({ cardId: c.id, tagId: t.id })
    const result = await call(styleCardHandlers.find, { id: c.id }, { context: ctx() })
    expect(result!.id).toBe(c.id)
    expect(result!.tags).toHaveLength(1)
  })

  test('returns a retired card (saved-board viewing)', async () => {
    const c = seedCard({ status: 'retired', retiredAt: new Date() })
    const result = await call(styleCardHandlers.find, { id: c.id }, { context: ctx() })
    expect(result!.status).toBe('retired')
  })

  test('returns null for unknown id', async () => {
    const result = await call(
      styleCardHandlers.find,
      { id: crypto.randomUUID() },
      { context: ctx() },
    )
    expect(result).toBeNull()
  })
})

describe('styleCardHandlers.createCard (admin)', () => {
  test('creates an active card with tags', async () => {
    const t1 = seedTag({ label: 'streetwear' })
    const t2 = seedTag({ label: 'oversize' })
    const result = await call(
      styleCardHandlers.createCard,
      { imageUrl: 'https://img/new.jpg', sourceAttribution: 'Pinterest', tagIds: [t1.id, t2.id] },
      { context: ctx() },
    )
    expect(result.status).toBe('active')
    expect(result.tags).toHaveLength(2)
    expect(store.styleCardTags).toHaveLength(2)
  })

  test('FORBIDDEN when caller lacks admin-manage', async () => {
    setPermissionAllowed(false)
    await expect(
      call(
        styleCardHandlers.createCard,
        { imageUrl: 'x', sourceAttribution: 'y', tagIds: [] },
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('rejects unknown tag id', async () => {
    await expect(
      call(
        styleCardHandlers.createCard,
        { imageUrl: 'x', sourceAttribution: 'y', tagIds: [crypto.randomUUID()] },
        { context: ctx() },
      ),
    ).rejects.toThrow()
    expect(store.styleCards).toHaveLength(0)
  })
})

describe('styleCardHandlers.retire (admin)', () => {
  test('sets status=retired and retiredAt', async () => {
    const c = seedCard()
    const result = await call(styleCardHandlers.retire, { id: c.id }, { context: ctx() })
    expect(result.status).toBe('retired')
    expect(result.retiredAt).toBeInstanceOf(Date)
  })

  test('NOT_FOUND when already retired', async () => {
    const c = seedCard({ status: 'retired', retiredAt: new Date() })
    await expect(
      call(styleCardHandlers.retire, { id: c.id }, { context: ctx() }),
    ).rejects.toThrow()
  })

  test('NOT_FOUND when id does not exist', async () => {
    await expect(
      call(styleCardHandlers.retire, { id: crypto.randomUUID() }, { context: ctx() }),
    ).rejects.toThrow()
  })

  test('FORBIDDEN when permission denied', async () => {
    setPermissionAllowed(false)
    const c = seedCard()
    await expect(
      call(styleCardHandlers.retire, { id: c.id }, { context: ctx() }),
    ).rejects.toThrow()
  })
})
