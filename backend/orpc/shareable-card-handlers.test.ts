import { beforeEach, describe, expect, test } from 'bun:test'
import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { shareableCard } from '../db/schema'
import * as utils from '../test/utils'
import {
  CARD_TTL_DAYS,
  MIN_ITEMS_TO_UNLOCK_SHARING,
  shareableCardHandlers,
} from './shareable-card-handlers'

async function seedThreshold(count = MIN_ITEMS_TO_UNLOCK_SHARING, userId = 'user-a') {
  for (let i = 0; i < count; i++) {
    await utils.seedClothingItem({ userId, status: 'active' })
  }
}

beforeEach(async () => {
  await utils.resetTestDb()
  await utils.seedUser()
})

describe('shareableCardHandlers.generateOutfit', () => {
  test('creates an outfit card when threshold met', async () => {
    await seedThreshold()
    const outfit = await utils.seedOutfit()
    const result = await call(
      shareableCardHandlers.generateOutfit,
      { outfitId: outfit.id, theme: 'light', caption: 'hi' } as never,
      { context: utils.testContext() },
    )
    expect(result).toMatchObject({
      kind: 'outfit',
      outfitId: outfit.id,
      theme: 'light',
      caption: 'hi',
      status: 'active',
    })
    expect(result!.renderedImageUrl).toContain('cdn.kurasi.dev')
  })

  test('rejects when below threshold', async () => {
    await seedThreshold(MIN_ITEMS_TO_UNLOCK_SHARING - 1)
    const outfit = await utils.seedOutfit()
    await expect(
      call(shareableCardHandlers.generateOutfit, { outfitId: outfit.id, theme: 'dark' } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
  })

  test('archived items do not count toward threshold', async () => {
    await seedThreshold(4)
    await utils.seedClothingItem({ status: 'archived' })
    await utils.seedClothingItem({ status: 'archived' })
    const outfit = await utils.seedOutfit()
    await expect(
      call(shareableCardHandlers.generateOutfit, { outfitId: outfit.id, theme: 'light' } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
  })

  test('rejects when outfit not owned by caller', async () => {
    await seedThreshold()
    await utils.seedUser({ id: 'user-b', email: 'user-b@example.com' })
    const outfit = await utils.seedOutfit({ userId: 'user-b' })
    await utils.loginAsUser('user-a')
    await expect(
      call(shareableCardHandlers.generateOutfit, { outfitId: outfit.id, theme: 'light' } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
  })

  test('rejects when outfit status is deleted (not active)', async () => {
    await seedThreshold()
    const inactive = await utils.seedOutfit({ status: 'deleted', deletedAt: new Date() })
    await expect(
      call(
        shareableCardHandlers.generateOutfit,
        { outfitId: inactive.id, theme: 'light' } as never,
        {
          context: utils.testContext(),
        },
      ),
    ).rejects.toThrow()
  })

  test('expiresAt is created_at + card_ttl days', async () => {
    await seedThreshold()
    const outfit = await utils.seedOutfit()
    const result = await call(
      shareableCardHandlers.generateOutfit,
      { outfitId: outfit.id, theme: 'light' } as never,
      { context: utils.testContext() },
    )
    const delta = result!.expiresAt.getTime() - result!.createdAt.getTime()
    expect(Math.abs(delta - CARD_TTL_DAYS * 24 * 60 * 60 * 1000)).toBeLessThan(1000)
  })
})

describe('shareableCardHandlers.generateWardrobeShowcase', () => {
  test('creates a wardrobe_showcase card', async () => {
    await seedThreshold()
    const result = await call(
      shareableCardHandlers.generateWardrobeShowcase,
      { mode: 'by_color', theme: 'colorful' } as never,
      { context: utils.testContext() },
    )
    expect(result).toMatchObject({
      kind: 'wardrobe_showcase',
      showcaseMode: 'by_color',
      theme: 'colorful',
      status: 'active',
    })
  })

  test('rejects below threshold', async () => {
    await seedThreshold(1)
    await expect(
      call(
        shareableCardHandlers.generateWardrobeShowcase,
        { mode: 'entire_wardrobe', theme: 'light' } as never,
        { context: utils.testContext() },
      ),
    ).rejects.toThrow()
  })
})

describe('shareableCardHandlers.generateStyleStats', () => {
  test('creates a style_stats card', async () => {
    await seedThreshold()
    const result = await call(
      shareableCardHandlers.generateStyleStats,
      { period: 'year', theme: 'dark' } as never,
      { context: utils.testContext() },
    )
    expect(result).toMatchObject({ kind: 'style_stats', statsPeriod: 'year' })
  })
})

describe('shareableCardHandlers.updateCaption', () => {
  test('updates caption on own active card', async () => {
    const card = await utils.seedShareableCard({ caption: 'old' })
    const result = await call(
      shareableCardHandlers.updateCaption,
      { cardId: card.id, caption: 'new' } as never,
      { context: utils.testContext() },
    )
    expect(result!.caption).toBe('new')
  })

  test('NOT_FOUND when card is not owned by caller or expired', async () => {
    await utils.seedUser({ id: 'user-b', email: 'user-b@example.com' })
    const other = await utils.seedShareableCard({ userId: 'user-b' })
    const expired = await utils.seedShareableCard({ userId: 'user-a', status: 'expired' })
    await utils.loginAsUser('user-a')
    await expect(
      call(shareableCardHandlers.updateCaption, { cardId: other.id, caption: 'x' } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
    await expect(
      call(shareableCardHandlers.updateCaption, { cardId: expired.id, caption: 'x' } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
  })
})

describe('shareableCardHandlers.list', () => {
  test('excludes expired by default and scopes to caller', async () => {
    await utils.seedShareableCard({ userId: 'user-a', status: 'active' })
    await utils.seedShareableCard({ userId: 'user-a', status: 'expired' })
    await utils.seedUser({ id: 'user-b', email: 'user-b@example.com' })
    await utils.seedShareableCard({ userId: 'user-b', status: 'active' })
    await utils.loginAsUser('user-a')
    const result = await call(shareableCardHandlers.list, undefined as never, {
      context: utils.testContext(),
    })
    expect(result).toHaveLength(1)
    expect(result[0]!.userId).toBe('user-a')
  })

  test('includes expired when includeExpired=true', async () => {
    await utils.seedShareableCard({ status: 'active' })
    await utils.seedShareableCard({ status: 'expired' })
    const result = await call(shareableCardHandlers.list, { includeExpired: true } as never, {
      context: utils.testContext(),
    })
    expect(result).toHaveLength(2)
  })
})

describe('shareableCardHandlers.find', () => {
  test('returns own card with isOwner=true', async () => {
    const card = await utils.seedShareableCard()
    const result = await call(shareableCardHandlers.find, { id: card.id } as never, {
      context: utils.testContext(),
    })
    expect(result.isOwner).toBe(true)
    expect(result.card.id).toBe(card.id)
  })

  test('returns non-owner active card and rejects non-owner expired card', async () => {
    await utils.seedUser({ id: 'user-b', email: 'user-b@example.com' })
    const active = await utils.seedShareableCard({ userId: 'user-b', status: 'active' })
    const expired = await utils.seedShareableCard({ userId: 'user-b', status: 'expired' })
    await utils.loginAsUser('user-a')
    const result = await call(shareableCardHandlers.find, { id: active.id } as never, {
      context: utils.testContext(),
    })
    expect(result.isOwner).toBe(false)
    await expect(
      call(shareableCardHandlers.find, { id: expired.id } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
  })
})

describe('shareableCardHandlers.expireOldCards', () => {
  test('returns expiredCount 0 when no cards need expiring', async () => {
    await utils.resetTestDb()
    await utils.seedUser()
    const result = await call(shareableCardHandlers.expireOldCards, undefined as never, {
      context: utils.testContext(),
    })
    expect(result.expiredCount).toBe(0)
  })

  test('transitions active rows with expiresAt < now', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000)
    await utils.seedShareableCard({ status: 'active', expiresAt: past })
    await utils.seedShareableCard({ status: 'active', expiresAt: future })
    const result = await call(shareableCardHandlers.expireOldCards, undefined as never, {
      context: utils.testContext(),
    })
    expect(result.expiredCount).toBe(1)
    const rows = await utils.db
      .select()
      .from(shareableCard)
      .where(eq(shareableCard.userId, 'user-a'))
    expect(rows.map((card) => card.status).sort()).toEqual(['active', 'expired'])
  })

  test('does not touch already-expired rows', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000)
    await utils.seedShareableCard({ status: 'expired', expiresAt: past })
    const result = await call(shareableCardHandlers.expireOldCards, undefined as never, {
      context: utils.testContext(),
    })
    expect(result.expiredCount).toBe(0)
  })
})
