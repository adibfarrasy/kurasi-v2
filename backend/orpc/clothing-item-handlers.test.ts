import { beforeEach, describe, expect, test } from 'bun:test'
import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { clothingItem, onboardingProgress, outfit } from '../db/schema'
import * as utils from '../test/utils'
import { clothingItemHandlers } from './clothing-item-handlers'

const SCHEMA_CATEGORIES = [
  'tee',
  'collared_shirt',
  'outer',
  'pants',
  'shorts',
  'headwear',
  'footwear',
  'bag',
  'scarf',
  'accessory',
  'dress',
  'skirt',
] as const

beforeEach(async () => {
  await utils.resetTestDb()
  await utils.seedUser()
})

describe('clothingItemHandlers.list', () => {
  test('returns only caller-owned active items with outfit counts', async () => {
    const counted = await utils.seedClothingItem({ primaryColor: 'red' })
    await utils.seedClothingItem({ primaryColor: 'green' })
    await utils.seedOutfit({ baseId: counted.id })
    await utils.seedOutfit({ footwearId: counted.id })
    await utils.seedUser({ id: 'user-b', email: 'user-b@example.com' })
    await utils.seedClothingItem({ userId: 'user-b', primaryColor: 'blue' })
    await utils.loginAsUser('user-a')

    const result = await call(clothingItemHandlers.list, undefined as never, {
      context: utils.testContext(),
    })

    expect(result).toHaveLength(2)
    expect(result.every((item) => item.userId === 'user-a')).toBe(true)
    expect(result.find((item) => item.id === counted.id)?.outfitCount).toBe(2)
  })

  test('excludes archived by default, includes archived when requested, never includes removed', async () => {
    await utils.seedClothingItem({ primaryColor: 'active', status: 'active' })
    await utils.seedClothingItem({
      primaryColor: 'archived',
      status: 'archived',
      archivedAt: new Date(),
    })
    await utils.seedClothingItem({ primaryColor: 'gone', status: 'removed', removedAt: new Date() })

    const activeOnly = await call(clothingItemHandlers.list, undefined as never, {
      context: utils.testContext(),
    })
    expect(activeOnly.map((item) => item.primaryColor)).toEqual(['active'])

    const withArchived = await call(clothingItemHandlers.list, { includeArchived: true } as never, {
      context: utils.testContext(),
    })
    expect(withArchived.map((item) => item.primaryColor).sort()).toEqual(['active', 'archived'])
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
        category: 'tee',
        primaryColor: 'blue',
        userId: 'attacker',
      } as never,
      { context: utils.testContext() },
    )
    expect(result).toMatchObject({ category: 'tee', primaryColor: 'blue', userId: 'user-a' })
  })

  test('rejects invalid input', async () => {
    await expect(
      call(
        clothingItemHandlers.create,
        {
          imageUrl: 'https://example.com/x.jpg',
          category: 'jumpsuit',
          primaryColor: 'red',
        } as never,
        { context: utils.testContext() },
      ),
    ).rejects.toThrow()
    await expect(
      call(clothingItemHandlers.create, { category: 'tee', primaryColor: 'black' } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
  })

  test('completes starter wardrobe onboarding when the fifth active item is created', async () => {
    await utils.seedOnboarding({ starterWardrobeCompletedAt: null })
    for (let i = 0; i < 4; i++) await utils.seedClothingItem()
    await call(
      clothingItemHandlers.create,
      { imageUrl: 'https://example.com/x.jpg', category: 'tee', primaryColor: 'black' } as never,
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
        category: 'tee',
        primaryColor: 'silver',
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
        category: 'tee',
        primaryColor: 'black',
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
        category: 'tee',
        primaryColor: 'white',
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
      { imageUrl: 'https://example.com/last.jpg', category: 'tee', primaryColor: 'black' } as never,
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
          primaryColor: 'taupe',
        } as never,
        { context: utils.testContext() },
      )
      expect(result!.category).toBe(category)
    }
  })
})

describe('clothingItemHandlers.update', () => {
  test('updates owned rows without clobbering unrelated fields', async () => {
    const item = await utils.seedClothingItem({ primaryColor: 'red', brand: 'Acme', fit: 'slim' })
    const result = await call(
      clothingItemHandlers.update,
      { id: item.id, primaryColor: 'green' } as never,
      { context: utils.testContext() },
    )
    expect(result.primaryColor).toBe('green')
    expect(result.brand).toBe('Acme')
    expect(result.fit).toBe('slim')
  })

  test('throws for another user’s row or invalid id', async () => {
    await utils.seedUser({ id: 'user-b', email: 'user-b@example.com' })
    const other = await utils.seedClothingItem({ userId: 'user-b' })
    await utils.loginAsUser('user-a')
    await expect(
      call(clothingItemHandlers.update, { id: other.id, primaryColor: 'x' } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
    await expect(
      call(clothingItemHandlers.update, { id: 'not-a-uuid', primaryColor: 'x' } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
  })
})

describe('clothingItemHandlers status mutations', () => {
  test('archives and unarchives an item', async () => {
    const item = await utils.seedClothingItem()
    const archived = await call(clothingItemHandlers.archive, { id: item.id } as never, {
      context: utils.testContext(),
    })
    expect(archived.status).toBe('archived')
    expect(archived.archivedAt).not.toBeNull()

    const active = await call(clothingItemHandlers.unarchive, { id: item.id } as never, {
      context: utils.testContext(),
    })
    expect(active.status).toBe('active')
    expect(active.archivedAt).toBeNull()
  })

  test('toggles favorite only on active caller-owned items', async () => {
    const item = await utils.seedClothingItem({ isFavorite: false })
    const result = await call(clothingItemHandlers.toggleFavorite, { id: item.id } as never, {
      context: utils.testContext(),
    })
    expect(result!.isFavorite).toBe(true)

    const archived = await utils.seedClothingItem({ status: 'archived', archivedAt: new Date() })
    await expect(
      call(clothingItemHandlers.toggleFavorite, { id: archived.id } as never, {
        context: utils.testContext(),
      }),
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
