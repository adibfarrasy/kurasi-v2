/**
 * Tests for share-click-handlers.
 * Spec: specs/social-share.allium
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import {
  installFitPageFakes,
  resetStore,
  seedShareClick,
  seedShareableCard,
  store,
} from './fit-page-test-helpers'

const { fakeDb, fakeAuth, setUser, setPermissionAllowed } = installFitPageFakes()

const { call } = await import('@orpc/server')
const { shareClickHandlers, attributeClickToUser } = await import('./share-click-handlers')

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

describe('shareClickHandlers.record (public endpoint)', () => {
  test('inserts a click with referredUserId=null on active card', async () => {
    setUser(null) // public — no session required
    const c = seedShareableCard()
    const result = await call(
      shareClickHandlers.record,
      { cardId: c.id, platform: 'instagram_story' } as never,
      { context: ctx() },
    )
    expect(result.click).toMatchObject({
      cardId: c.id,
      platform: 'instagram_story',
      referredUserId: null,
    })
    expect(result.card.id).toBe(c.id)
    expect(store.shareClicks).toHaveLength(1)
  })

  test('rejects on expired card', async () => {
    setUser(null)
    const c = seedShareableCard({ status: 'expired' })
    await expect(
      call(
        shareClickHandlers.record,
        { cardId: c.id, platform: 'twitter' } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('NOT_FOUND on unknown card', async () => {
    setUser(null)
    await expect(
      call(
        shareClickHandlers.record,
        { cardId: crypto.randomUUID(), platform: 'clipboard' } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('works even when user session is present (still public)', async () => {
    const c = seedShareableCard({ userId: 'user-b' })
    const result = await call(
      shareClickHandlers.record,
      { cardId: c.id, platform: 'snapchat' } as never,
      { context: ctx() },
    )
    expect(result.click!.platform).toBe('snapchat')
  })
})

describe('shareClickHandlers.analytics', () => {
  test('aggregates click counts per platform for caller-owned card', async () => {
    const c = seedShareableCard()
    seedShareClick({ cardId: c.id, platform: 'tiktok' })
    seedShareClick({ cardId: c.id, platform: 'tiktok' })
    seedShareClick({ cardId: c.id, platform: 'twitter' })
    const result = await call(
      shareClickHandlers.analytics,
      { cardId: c.id } as never,
      { context: ctx() },
    )
    expect(result.total).toBe(3)
    expect(result.byPlatform.tiktok).toBe(2)
    expect(result.byPlatform.twitter).toBe(1)
    expect(result.byPlatform.snapchat).toBe(0)
  })

  test('rejects when card not owned by caller', async () => {
    const c = seedShareableCard({ userId: 'user-b' })
    seedShareClick({ cardId: c.id })
    await expect(
      call(
        shareClickHandlers.analytics,
        { cardId: c.id } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('returns zeros for card with no clicks', async () => {
    const c = seedShareableCard()
    const result = await call(
      shareClickHandlers.analytics,
      { cardId: c.id } as never,
      { context: ctx() },
    )
    expect(result.total).toBe(0)
    expect(result.byPlatform.tiktok).toBe(0)
  })
})

describe('attributeClickToUser helper', () => {
  test('sets referredUserId on the given click', async () => {
    const click = seedShareClick({ referredUserId: null })
    await attributeClickToUser(click.id, 'user-a', fakeDb as never)
    expect(store.shareClicks[0]!.referredUserId).toBe('user-a')
  })

  test('no-op when click id does not exist', async () => {
    await attributeClickToUser(crypto.randomUUID(), 'user-a', fakeDb as never)
    expect(store.shareClicks).toEqual([])
  })
})
