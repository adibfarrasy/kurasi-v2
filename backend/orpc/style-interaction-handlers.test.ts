/**
 * Tests for style-interaction-handlers.
 *
 * Spec: specs/style-board.allium
 * Code: ./style-interaction-handlers.ts
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import {
  installStyleFakes,
  resetStore,
  seedCard,
  seedInteraction,
  store,
} from './style-test-helpers'

const { fakeDb, fakeAuth, setUser, setPermissionAllowed } = installStyleFakes()

const { call } = await import('@orpc/server')
const { styleInteractionHandlers } = await import('./style-interaction-handlers')

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

describe('styleInteractionHandlers.like', () => {
  test('creates interaction(liked) + saved rows atomically', async () => {
    const c = seedCard()
    const result = await call(
      styleInteractionHandlers.like,
      { cardId: c.id },
      { context: ctx() },
    )
    expect(result.interaction.kind).toBe('liked')
    expect(result.saved!.cardId).toBe(c.id)
    expect(store.styleInteractions).toHaveLength(1)
    expect(store.savedStyles).toHaveLength(1)
  })

  test('idempotent: liking an already-liked card returns existing rows', async () => {
    const c = seedCard()
    await call(styleInteractionHandlers.like, { cardId: c.id }, { context: ctx() })
    const second = await call(
      styleInteractionHandlers.like,
      { cardId: c.id },
      { context: ctx() },
    )
    expect(second.interaction.kind).toBe('liked')
    expect(store.styleInteractions).toHaveLength(1)
    expect(store.savedStyles).toHaveLength(1)
  })

  test('liking after skipping is rejected (interactions are permanent)', async () => {
    const c = seedCard()
    seedInteraction({ userId: 'user-a', cardId: c.id, kind: 'skipped' })
    await expect(
      call(styleInteractionHandlers.like, { cardId: c.id }, { context: ctx() }),
    ).rejects.toThrow()
  })

  test('rejects liking a retired card', async () => {
    const c = seedCard({ status: 'retired', retiredAt: new Date() })
    await expect(
      call(styleInteractionHandlers.like, { cardId: c.id }, { context: ctx() }),
    ).rejects.toThrow()
  })

  test('NOT_FOUND for unknown cardId', async () => {
    await expect(
      call(
        styleInteractionHandlers.like,
        { cardId: crypto.randomUUID() },
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('scopes the save to the caller', async () => {
    const c = seedCard()
    setUser({ id: 'user-b' })
    await call(styleInteractionHandlers.like, { cardId: c.id }, { context: ctx() })
    expect(store.savedStyles[0]!.userId).toBe('user-b')
  })
})

describe('styleInteractionHandlers.skip', () => {
  test('creates interaction(skipped) row', async () => {
    const c = seedCard()
    const result = await call(
      styleInteractionHandlers.skip,
      { cardId: c.id },
      { context: ctx() },
    )
    expect(result.kind).toBe('skipped')
    expect(store.styleInteractions).toHaveLength(1)
    expect(store.savedStyles).toHaveLength(0)
  })

  test('idempotent: double-skip is a no-op', async () => {
    const c = seedCard()
    await call(styleInteractionHandlers.skip, { cardId: c.id }, { context: ctx() })
    await call(styleInteractionHandlers.skip, { cardId: c.id }, { context: ctx() })
    expect(store.styleInteractions).toHaveLength(1)
  })

  test('skipping after liking is rejected', async () => {
    const c = seedCard()
    await call(styleInteractionHandlers.like, { cardId: c.id }, { context: ctx() })
    await expect(
      call(styleInteractionHandlers.skip, { cardId: c.id }, { context: ctx() }),
    ).rejects.toThrow()
  })

  test('rejects skipping a retired card', async () => {
    const c = seedCard({ status: 'retired', retiredAt: new Date() })
    await expect(
      call(styleInteractionHandlers.skip, { cardId: c.id }, { context: ctx() }),
    ).rejects.toThrow()
  })

  test('NOT_FOUND for unknown cardId', async () => {
    await expect(
      call(
        styleInteractionHandlers.skip,
        { cardId: crypto.randomUUID() },
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })
})
