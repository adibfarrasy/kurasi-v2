/**
 * Tests for shareable-card-handlers.
 * Spec: specs/social-share.allium
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import {
  installFitPageFakes,
  resetStore,
  seedItem,
  seedOutfit,
  seedShareableCard,
  store,
} from './fit-page-test-helpers'

const { fakeDb, fakeAuth, setUser, setPermissionAllowed } = installFitPageFakes()

const { call } = await import('@orpc/server')
const { shareableCardHandlers, MIN_ITEMS_TO_UNLOCK_SHARING, CARD_TTL_DAYS } =
  await import('./shareable-card-handlers')

function ctx() {
  return {
    db: fakeDb as unknown as never,
    auth: fakeAuth as unknown as never,
    reqHeaders: new Headers(),
  }
}

function seedThreshold(count = MIN_ITEMS_TO_UNLOCK_SHARING, userId = 'user-a') {
  for (let i = 0; i < count; i++) {
    seedItem({ userId, status: 'active' })
  }
}

beforeEach(() => {
  resetStore()
  setUser({ id: 'user-a' })
  setPermissionAllowed(true)
})

describe('shareableCardHandlers.generateOutfit', () => {
  test('creates an outfit card when threshold met', async () => {
    seedThreshold()
    const o = seedOutfit()
    const result = await call(
      shareableCardHandlers.generateOutfit,
      { outfitId: o.id, theme: 'light', caption: 'hi' } as never,
      { context: ctx() },
    )
    expect(result).toMatchObject({
      kind: 'outfit',
      outfitId: o.id,
      theme: 'light',
      caption: 'hi',
      status: 'active',
    })
    expect(result!.renderedImageUrl).toContain('cdn.kurasi.dev')
    expect(store.shareableCards).toHaveLength(1)
  })

  test('rejects when below threshold', async () => {
    seedThreshold(MIN_ITEMS_TO_UNLOCK_SHARING - 1)
    const o = seedOutfit()
    await expect(
      call(
        shareableCardHandlers.generateOutfit,
        { outfitId: o.id, theme: 'dark' } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('accepts exactly at threshold', async () => {
    seedThreshold(MIN_ITEMS_TO_UNLOCK_SHARING)
    const o = seedOutfit()
    const result = await call(
      shareableCardHandlers.generateOutfit,
      { outfitId: o.id, theme: 'dark' } as never,
      { context: ctx() },
    )
    expect(result!.status).toBe('active')
  })

  test('archived items do not count toward threshold', async () => {
    // 4 active + 2 archived = below threshold
    seedThreshold(4)
    seedItem({ status: 'archived' })
    seedItem({ status: 'archived' })
    const o = seedOutfit()
    await expect(
      call(
        shareableCardHandlers.generateOutfit,
        { outfitId: o.id, theme: 'light' } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('rejects when outfit not owned by caller', async () => {
    seedThreshold()
    const o = seedOutfit({ userId: 'user-b' })
    await expect(
      call(
        shareableCardHandlers.generateOutfit,
        { outfitId: o.id, theme: 'light' } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('rejects when outfit status is deleted', async () => {
    seedThreshold()
    const o = seedOutfit({ status: 'deleted' })
    await expect(
      call(
        shareableCardHandlers.generateOutfit,
        { outfitId: o.id, theme: 'light' } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('expiresAt is created_at + card_ttl days', async () => {
    seedThreshold()
    const o = seedOutfit()
    const before = Date.now()
    const result = await call(
      shareableCardHandlers.generateOutfit,
      { outfitId: o.id, theme: 'light' } as never,
      { context: ctx() },
    )
    const delta = result!.expiresAt.getTime() - result!.createdAt.getTime()
    const expected = CARD_TTL_DAYS * 24 * 60 * 60 * 1000
    expect(Math.abs(delta - expected)).toBeLessThan(1000)
    expect(result!.expiresAt.getTime()).toBeGreaterThanOrEqual(before)
  })
})

describe('shareableCardHandlers.generateWardrobeShowcase', () => {
  test('creates a wardrobe_showcase card', async () => {
    seedThreshold()
    const result = await call(
      shareableCardHandlers.generateWardrobeShowcase,
      { mode: 'by_color', theme: 'colorful' } as never,
      { context: ctx() },
    )
    expect(result).toMatchObject({
      kind: 'wardrobe_showcase',
      showcaseMode: 'by_color',
      theme: 'colorful',
      status: 'active',
    })
  })

  test('rejects below threshold', async () => {
    seedThreshold(1)
    await expect(
      call(
        shareableCardHandlers.generateWardrobeShowcase,
        { mode: 'entire_wardrobe', theme: 'light' } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })
})

describe('shareableCardHandlers.generateStyleStats', () => {
  test('creates a style_stats card', async () => {
    seedThreshold()
    const result = await call(
      shareableCardHandlers.generateStyleStats,
      { period: 'year', theme: 'dark' } as never,
      { context: ctx() },
    )
    expect(result).toMatchObject({
      kind: 'style_stats',
      statsPeriod: 'year',
    })
  })

  test('rejects below threshold', async () => {
    seedThreshold(0)
    await expect(
      call(
        shareableCardHandlers.generateStyleStats,
        { period: 'week', theme: 'light' } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })
})

describe('shareableCardHandlers.updateCaption', () => {
  test('updates caption on own active card', async () => {
    const c = seedShareableCard({ caption: 'old' })
    const result = await call(
      shareableCardHandlers.updateCaption,
      { cardId: c.id, caption: 'new' } as never,
      { context: ctx() },
    )
    expect(result!.caption).toBe('new')
  })

  test('NOT_FOUND when card is not owned by caller', async () => {
    const c = seedShareableCard({ userId: 'user-b' })
    await expect(
      call(
        shareableCardHandlers.updateCaption,
        { cardId: c.id, caption: 'x' } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('NOT_FOUND for expired card', async () => {
    const c = seedShareableCard({ status: 'expired' })
    await expect(
      call(
        shareableCardHandlers.updateCaption,
        { cardId: c.id, caption: 'x' } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('NOT_FOUND when card id does not exist', async () => {
    await expect(
      call(
        shareableCardHandlers.updateCaption,
        { cardId: crypto.randomUUID(), caption: 'x' } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })
})

describe('shareableCardHandlers.list', () => {
  test('excludes expired by default', async () => {
    seedShareableCard({ status: 'active' })
    seedShareableCard({ status: 'expired' })
    const result = await call(shareableCardHandlers.list, undefined as never, {
      context: ctx(),
    })
    expect(result).toHaveLength(1)
    expect(result[0]!.status).toBe('active')
  })

  test('includes expired when includeExpired=true', async () => {
    seedShareableCard({ status: 'active' })
    seedShareableCard({ status: 'expired' })
    const result = await call(
      shareableCardHandlers.list,
      { includeExpired: true } as never,
      { context: ctx() },
    )
    expect(result).toHaveLength(2)
  })

  test('scopes to caller', async () => {
    seedShareableCard({ userId: 'user-a' })
    seedShareableCard({ userId: 'user-b' })
    const result = await call(shareableCardHandlers.list, undefined as never, {
      context: ctx(),
    })
    expect(result).toHaveLength(1)
    expect(result[0]!.userId).toBe('user-a')
  })
})

describe('shareableCardHandlers.find', () => {
  test('returns own card with isOwner=true', async () => {
    const c = seedShareableCard()
    const result = await call(
      shareableCardHandlers.find,
      { id: c.id } as never,
      { context: ctx() },
    )
    expect(result.isOwner).toBe(true)
    expect(result.card.id).toBe(c.id)
  })

  test('returns non-owner active card with isOwner=false', async () => {
    const c = seedShareableCard({ userId: 'user-b', status: 'active' })
    const result = await call(
      shareableCardHandlers.find,
      { id: c.id } as never,
      { context: ctx() },
    )
    expect(result.isOwner).toBe(false)
  })

  test('rejects non-owner expired card (not public)', async () => {
    const c = seedShareableCard({ userId: 'user-b', status: 'expired' })
    await expect(
      call(shareableCardHandlers.find, { id: c.id } as never, { context: ctx() }),
    ).rejects.toThrow()
  })
})

describe('shareableCardHandlers.expireOldCards', () => {
  test('admin-only — non-admin rejected', async () => {
    setPermissionAllowed(false)
    await expect(
      call(shareableCardHandlers.expireOldCards, undefined as never, {
        context: ctx(),
      }),
    ).rejects.toThrow()
  })

  test('transitions active rows with expiresAt < now', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000)
    seedShareableCard({ status: 'active', expiresAt: past })
    seedShareableCard({ status: 'active', expiresAt: future })
    const result = await call(shareableCardHandlers.expireOldCards, undefined as never, {
      context: ctx(),
    })
    expect(result.expiredCount).toBe(1)
    const statuses = store.shareableCards.map((c) => c.status).sort()
    expect(statuses).toEqual(['active', 'expired'])
  })

  test('does not touch already-expired rows', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000)
    seedShareableCard({ status: 'expired', expiresAt: past })
    const result = await call(shareableCardHandlers.expireOldCards, undefined as never, {
      context: ctx(),
    })
    expect(result.expiredCount).toBe(0)
  })
})
