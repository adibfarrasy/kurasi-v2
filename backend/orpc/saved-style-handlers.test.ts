/**
 * Tests for saved-style-handlers.
 *
 * Spec: specs/style-board.allium
 * Code: ./saved-style-handlers.ts
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import {
  installStyleFakes,
  resetStore,
  seedCard,
  seedInteraction,
  seedSaved,
  seedTag,
  store,
} from './style-test-helpers'

const { fakeDb, fakeAuth, setUser, setPermissionAllowed } = installStyleFakes()

const { call } = await import('@orpc/server')
const { savedStyleHandlers } = await import('./saved-style-handlers')

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

describe('savedStyleHandlers.list', () => {
  test('returns only the caller’s saved rows with card + tags', async () => {
    const card = seedCard()
    const t = seedTag()
    store.styleCardTags.push({ cardId: card.id, tagId: t.id })
    seedSaved({ userId: 'user-a', cardId: card.id })
    seedSaved({ userId: 'user-b', cardId: card.id })
    const result = await call(savedStyleHandlers.list, undefined as never, { context: ctx() })
    expect(result).toHaveLength(1)
    expect(result[0]!.card.id).toBe(card.id)
    expect(result[0]!.card.tags).toHaveLength(1)
  })

  test('orders by savedAt desc', async () => {
    const a = seedCard()
    const b = seedCard()
    seedSaved({ cardId: a.id, savedAt: new Date(2025, 0, 1) })
    seedSaved({ cardId: b.id, savedAt: new Date(2026, 0, 1) })
    const result = await call(savedStyleHandlers.list, undefined as never, { context: ctx() })
    expect(result.map((s) => s.card.id)).toEqual([b.id, a.id])
  })

  test('returns empty array when user has no saves', async () => {
    const result = await call(savedStyleHandlers.list, undefined as never, { context: ctx() })
    expect(result).toEqual([])
  })

  test('includes retired cards in the list', async () => {
    const c = seedCard({ status: 'retired', retiredAt: new Date() })
    seedSaved({ cardId: c.id })
    const result = await call(savedStyleHandlers.list, undefined as never, { context: ctx() })
    expect(result).toHaveLength(1)
    expect(result[0]!.card.status).toBe('retired')
  })
})

describe('savedStyleHandlers.remove', () => {
  test('deletes only the SavedStyle; StyleInteraction(like) stays', async () => {
    const c = seedCard()
    seedInteraction({ userId: 'user-a', cardId: c.id, kind: 'liked' })
    seedSaved({ userId: 'user-a', cardId: c.id })
    const result = await call(savedStyleHandlers.remove, { cardId: c.id }, { context: ctx() })
    expect(result).toBe(true)
    expect(store.savedStyles).toHaveLength(0)
    expect(store.styleInteractions).toHaveLength(1)
  })

  test('NOT_FOUND when not saved', async () => {
    const c = seedCard()
    await expect(
      call(savedStyleHandlers.remove, { cardId: c.id }, { context: ctx() }),
    ).rejects.toThrow()
  })

  test('does not delete another user’s save', async () => {
    const c = seedCard()
    seedSaved({ userId: 'user-b', cardId: c.id })
    await expect(
      call(savedStyleHandlers.remove, { cardId: c.id }, { context: ctx() }),
    ).rejects.toThrow()
    expect(store.savedStyles).toHaveLength(1)
  })

  test('FORBIDDEN when permission denied', async () => {
    setPermissionAllowed(false)
    const c = seedCard()
    seedSaved({ cardId: c.id })
    await expect(
      call(savedStyleHandlers.remove, { cardId: c.id }, { context: ctx() }),
    ).rejects.toThrow()
  })
})
