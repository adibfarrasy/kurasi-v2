import { beforeEach, describe, expect, test } from 'bun:test'
import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { clothingItem, onboardingProgress, outfit } from '../db/schema'
import * as utils from '../test/utils'
import { clothingItemHandlers } from './clothing-item-handlers'

const SCHEMA_CATEGORIES = ['headwear', 'shirt', 'jacket', 'pants', 'footwear'] as const

beforeEach(async () => {
  await utils.resetTestDb()
  await utils.seedUser()
})

describe('clothingItemHandlers.list', () => {
  test('returns only caller-owned active items with outfit counts', async () => {
    const counted = await utils.seedClothingItem({
      colors: [{ name: 'red', hex: '#c82832', ratio: 100 }],
    })
    await utils.seedClothingItem({ colors: [{ name: 'green', hex: '#3a8a3a', ratio: 100 }] })
    await utils.seedOutfit({ baseId: counted.id })
    await utils.seedOutfit({ footwearId: counted.id })
    await utils.seedUser({ id: 'user-b', email: 'user-b@example.com' })
    await utils.seedClothingItem({
      userId: 'user-b',
      colors: [{ name: 'blue', hex: '#2858b4', ratio: 100 }],
    })
    await utils.loginAsUser('user-a')

    const result = await call(clothingItemHandlers.list, undefined as never, {
      context: utils.testContext(),
    })

    expect(result).toHaveLength(2)
    expect(result.every((item) => item.userId === 'user-a')).toBe(true)
    expect(result.find((item) => item.id === counted.id)?.outfitCount).toBe(2)
  })

  test('excludes removed items', async () => {
    await utils.seedClothingItem({
      colors: [{ name: 'active', hex: '#000', ratio: 100 }],
      status: 'active',
    })
    await utils.seedClothingItem({
      colors: [{ name: 'gone', hex: '#000', ratio: 100 }],
      status: 'removed',
      removedAt: new Date(),
    })

    const result = await call(clothingItemHandlers.list, undefined as never, {
      context: utils.testContext(),
    })
    expect(result.map((item) => item.colors[0]?.name)).toEqual(['active'])
  })

  test('throws UNAUTHORIZED when no session; succeeds when authenticated', async () => {
    utils.setTestUser(null)
    await expect(
      call(clothingItemHandlers.list, undefined as never, { context: utils.testContext() }),
    ).rejects.toThrow()

    await utils.resetTestDb()
    await utils.seedUser()
    const ok = await call(clothingItemHandlers.list, undefined as never, {
      context: utils.testContext(),
    })
    expect(ok).toEqual([])
  })

  test('returns empty array when the caller has no clothing items yet', async () => {
    const result = await call(clothingItemHandlers.list, undefined as never, {
      context: utils.testContext(),
    })
    expect(result).toEqual([])
  })
})

describe('clothingItemHandlers.find', () => {
  test('find excludes removed while findIncludingRemoved can read owned history', async () => {
    const active = await utils.seedClothingItem()
    const removed = await utils.seedClothingItem({ status: 'removed', removedAt: new Date() })

    expect(
      await call(clothingItemHandlers.find, { id: active.id } as never, {
        context: utils.testContext(),
      }),
    ).toMatchObject({ id: active.id })
    expect(
      await call(clothingItemHandlers.find, { id: removed.id } as never, {
        context: utils.testContext(),
      }),
    ).toBeNull()
    expect(
      await call(clothingItemHandlers.findIncludingRemoved, { id: removed.id } as never, {
        context: utils.testContext(),
      }),
    ).toMatchObject({ id: removed.id, status: 'removed' })
  })

  test('does not leak another user’s rows', async () => {
    await utils.seedUser({ id: 'user-b', email: 'user-b@example.com' })
    const other = await utils.seedClothingItem({ userId: 'user-b' })
    await utils.loginAsUser('user-a')
    const result = await call(
      clothingItemHandlers.findIncludingRemoved,
      { id: other.id } as never,
      { context: utils.testContext() },
    )
    expect(result).toBeNull()
  })
})

describe('clothingItemHandlers.create', () => {
  test('persists caller-owned item and ignores spoofed userId', async () => {
    const result = await call(
      clothingItemHandlers.create,
      {
        imageUrl: 'https://example.com/tee.jpg',
        category: 'shirt',
        colors: [{ name: 'blue', hex: '#2858b4', ratio: 100 }],
        userId: 'attacker',
      } as never,
      { context: utils.testContext() },
    )
    expect(result).toMatchObject({
      category: 'shirt',
      colors: [{ name: 'blue', hex: '#2858b4', ratio: 100 }],
      userId: 'user-a',
    })
  })

  test('rejects invalid input', async () => {
    await expect(
      call(
        clothingItemHandlers.create,
        {
          imageUrl: 'https://example.com/x.jpg',
          category: 'jumpsuit',
          colors: [{ name: 'red', hex: '#c82832', ratio: 100 }],
        } as never,
        { context: utils.testContext() },
      ),
    ).rejects.toThrow()
    await expect(
      call(
        clothingItemHandlers.create,
        { category: 'shirt', colors: [{ name: 'black', hex: '#1a1a1a', ratio: 100 }] } as never,
        {
          context: utils.testContext(),
        },
      ),
    ).rejects.toThrow()
  })

  test('completes starter wardrobe onboarding when the fifth active item is created', async () => {
    await utils.seedOnboarding({ starterWardrobeCompletedAt: null })
    for (let i = 0; i < 4; i++) await utils.seedClothingItem()
    await call(
      clothingItemHandlers.create,
      {
        imageUrl: 'https://example.com/x.jpg',
        category: 'shirt',
        colors: [{ name: 'black', hex: '#1a1a1a', ratio: 100 }],
      } as never,
      { context: utils.testContext() },
    )
    const [progress] = await utils.db
      .select()
      .from(onboardingProgress)
      .where(eq(onboardingProgress.userId, 'user-a'))
    expect(progress!.starterWardrobeCompletedAt).not.toBeNull()
  })

  test('does not mark starter wardrobe complete before five active items', async () => {
    await utils.seedOnboarding({ starterWardrobeCompletedAt: null })
    for (let i = 0; i < 3; i++) await utils.seedClothingItem()
    await call(
      clothingItemHandlers.create,
      {
        imageUrl: 'https://example.com/a.jpg',
        category: 'shirt',
        colors: [{ name: 'silver', hex: '#c0c0c0', ratio: 100 }],
      } as never,
      { context: utils.testContext() },
    )
    const [progress] = await utils.db
      .select()
      .from(onboardingProgress)
      .where(eq(onboardingProgress.userId, 'user-a'))
    expect(progress!.starterWardrobeCompletedAt).toBeNull()
  })

  test('does not reshuffle starterWardrobeCompletedAt once set (idempotent for item six and beyond)', async () => {
    await utils.seedOnboarding({ starterWardrobeCompletedAt: null })
    for (let i = 0; i < 4; i++) await utils.seedClothingItem()
    await call(
      clothingItemHandlers.create,
      {
        imageUrl: 'https://example.com/fifth.jpg',
        category: 'shirt',
        colors: [{ name: 'black', hex: '#1a1a1a', ratio: 100 }],
      } as never,
      { context: utils.testContext() },
    )
    const [stamp] = await utils.db
      .select()
      .from(onboardingProgress)
      .where(eq(onboardingProgress.userId, 'user-a'))
    const firstTs = stamp!.starterWardrobeCompletedAt!.getTime()
    await call(
      clothingItemHandlers.create,
      {
        imageUrl: 'https://example.com/sixth.jpg',
        category: 'shirt',
        colors: [{ name: 'white', hex: '#f0eee9', ratio: 100 }],
      } as never,
      { context: utils.testContext() },
    )
    const [still] = await utils.db
      .select()
      .from(onboardingProgress)
      .where(eq(onboardingProgress.userId, 'user-a'))
    expect(still!.starterWardrobeCompletedAt!.getTime()).toBe(firstTs)
  })

  test('when biometrics is complete, fifth item completes full onboarding', async () => {
    await utils.seedOnboarding({
      biometricsCompletedAt: new Date(),
      starterWardrobeCompletedAt: null,
    })
    for (let i = 0; i < 4; i++) await utils.seedClothingItem()
    await call(
      clothingItemHandlers.create,
      {
        imageUrl: 'https://example.com/last.jpg',
        category: 'shirt',
        colors: [{ name: 'black', hex: '#1a1a1a', ratio: 100 }],
      } as never,
      { context: utils.testContext() },
    )
    const [progress] = await utils.db
      .select()
      .from(onboardingProgress)
      .where(eq(onboardingProgress.userId, 'user-a'))
    expect(progress!.status).toBe('completed')
    expect(progress!.completedAt).not.toBeNull()
  })

  test('accepts each schema category enum on create once starter wardrobe is gated off', async () => {
    await utils.seedOnboarding({
      biometricsCompletedAt: new Date(),
      starterWardrobeCompletedAt: new Date(),
      status: 'completed',
      completedAt: new Date(),
    })
    let n = 0
    for (const category of SCHEMA_CATEGORIES) {
      const result = await call(
        clothingItemHandlers.create,
        {
          imageUrl: `https://example.com/cat-${n++}.jpg`,
          category,
          colors: [{ name: 'taupe', hex: '#9a8c7a', ratio: 100 }],
        } as never,
        { context: utils.testContext() },
      )
      expect(result!.category).toBe(category)
    }
  })
})

describe('clothingItemHandlers.update', () => {
  test('updates owned rows without clobbering unrelated fields', async () => {
    const item = await utils.seedClothingItem({
      colors: [{ name: 'red', hex: '#c82832', ratio: 100 }],
      brand: 'Acme',
    })
    const result = await call(
      clothingItemHandlers.update,
      { id: item.id, colors: [{ name: 'green', hex: '#3a8a3a', ratio: 100 }] } as never,
      { context: utils.testContext() },
    )
    expect(result.colors[0]?.name).toBe('green')
    expect(result.brand).toBe('Acme')
  })

  test('throws for another user’s row or invalid id', async () => {
    await utils.seedUser({ id: 'user-b', email: 'user-b@example.com' })
    const other = await utils.seedClothingItem({ userId: 'user-b' })
    await utils.loginAsUser('user-a')
    await expect(
      call(
        clothingItemHandlers.update,
        { id: other.id, colors: [{ name: 'x', hex: '#000', ratio: 100 }] } as never,
        {
          context: utils.testContext(),
        },
      ),
    ).rejects.toThrow()
    await expect(
      call(
        clothingItemHandlers.update,
        { id: 'not-a-uuid', colors: [{ name: 'x', hex: '#000', ratio: 100 }] } as never,
        {
          context: utils.testContext(),
        },
      ),
    ).rejects.toThrow()
  })
})

describe('clothingItemHandlers removal', () => {
  test('removePreserving soft-removes item and leaves outfits intact', async () => {
    const item = await utils.seedClothingItem()
    const outfitRow = await utils.seedOutfit({ baseId: item.id })
    const result = await call(clothingItemHandlers.removePreserving, { id: item.id } as never, {
      context: utils.testContext(),
    })
    expect(result.status).toBe('removed')

    const [after] = await utils.db.select().from(outfit).where(eq(outfit.id, outfitRow.id))
    expect(after!.status).toBe('active')
    expect(after!.baseId).toBe(item.id)
  })

  test('removeAndOutfits soft-deletes active outfits that reference the item', async () => {
    const item = await utils.seedClothingItem()
    const unrelated = await utils.seedClothingItem()
    const matching = await utils.seedOutfit({ baseId: item.id })
    const untouched = await utils.seedOutfit({ baseId: unrelated.id })

    await call(clothingItemHandlers.removeAndOutfits, { id: item.id } as never, {
      context: utils.testContext(),
    })

    const rows = await utils.db.select().from(outfit)
    expect(rows.find((row) => row.id === matching.id)?.status).toBe('deleted')
    expect(rows.find((row) => row.id === untouched.id)?.status).toBe('active')
    const [removed] = await utils.db.select().from(clothingItem).where(eq(clothingItem.id, item.id))
    expect(removed!.status).toBe('removed')
  })
})
