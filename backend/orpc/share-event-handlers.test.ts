/**
 * Tests for share-event-handlers.
 * Spec: specs/social-share.allium
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import {
  installFitPageFakes,
  resetStore,
  seedShareEvent,
  seedShareableCard,
  store,
} from './fit-page-test-helpers'

const { fakeDb, fakeAuth, setUser, setPermissionAllowed } = installFitPageFakes()

const { call } = await import('@orpc/server')
const { shareEventHandlers } = await import('./share-event-handlers')

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

describe('shareEventHandlers.record', () => {
  test('records a ShareEvent for caller-owned active card', async () => {
    const c = seedShareableCard()
    const result = await call(
      shareEventHandlers.record,
      { cardId: c.id, platform: 'tiktok' } as never,
      { context: ctx() },
    )
    expect(result).toMatchObject({ cardId: c.id, platform: 'tiktok' })
    expect(store.shareEvents).toHaveLength(1)
  })

  test('rejects when card not owned by caller', async () => {
    const c = seedShareableCard({ userId: 'user-b' })
    await expect(
      call(
        shareEventHandlers.record,
        { cardId: c.id, platform: 'twitter' } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('rejects when card is expired', async () => {
    const c = seedShareableCard({ status: 'expired' })
    await expect(
      call(
        shareEventHandlers.record,
        { cardId: c.id, platform: 'snapchat' } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('NOT_FOUND when card does not exist', async () => {
    await expect(
      call(
        shareEventHandlers.record,
        { cardId: crypto.randomUUID(), platform: 'clipboard' } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('allows multiple platforms for the same card', async () => {
    const c = seedShareableCard()
    await call(
      shareEventHandlers.record,
      { cardId: c.id, platform: 'tiktok' } as never,
      { context: ctx() },
    )
    await call(
      shareEventHandlers.record,
      { cardId: c.id, platform: 'instagram_story' } as never,
      { context: ctx() },
    )
    expect(store.shareEvents).toHaveLength(2)
  })
})

describe('shareEventHandlers.listForCard', () => {
  test('returns events for caller-owned card', async () => {
    const c = seedShareableCard()
    seedShareEvent({ cardId: c.id, platform: 'tiktok' })
    seedShareEvent({ cardId: c.id, platform: 'twitter' })
    const result = await call(
      shareEventHandlers.listForCard,
      { cardId: c.id } as never,
      { context: ctx() },
    )
    expect(result).toHaveLength(2)
  })

  test('rejects when card is not owned by caller', async () => {
    const c = seedShareableCard({ userId: 'user-b' })
    seedShareEvent({ cardId: c.id })
    await expect(
      call(
        shareEventHandlers.listForCard,
        { cardId: c.id } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('returns empty list when no events', async () => {
    const c = seedShareableCard()
    const result = await call(
      shareEventHandlers.listForCard,
      { cardId: c.id } as never,
      { context: ctx() },
    )
    expect(result).toEqual([])
  })

  test('unauthenticated call rejected', async () => {
    const c = seedShareableCard()
    setPermissionAllowed(false)
    await expect(
      call(
        shareEventHandlers.listForCard,
        { cardId: c.id } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })
})
