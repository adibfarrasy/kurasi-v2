import { beforeEach, describe, expect, test } from 'bun:test'
import { call } from '@orpc/server'
import * as utils from '../test/utils'
import { outfitRecommendationHandlers } from './outfit-recommendation-handlers'

async function seedFiveItems() {
  for (let i = 0; i < 5; i++) await utils.seedClothingItem()
}

beforeEach(async () => {
  await utils.resetTestDb()
  await utils.seedUser()
})

describe('outfitRecommendationHandlers.request', () => {
  test('creates a pending gap_filling request', async () => {
    await seedFiveItems()
    const result = await call(
      outfitRecommendationHandlers.request,
      { kind: 'gap_filling' } as never,
      { context: utils.testContext() },
    )
    expect(result).toMatchObject({
      userId: 'user-a',
      kind: 'gap_filling',
      status: 'pending',
      basedOnOutfitId: null,
    })
  })

  test('creates a pending outfit_generation request with seed outfit', async () => {
    await seedFiveItems()
    const seed = await utils.seedOutfit()
    const result = await call(
      outfitRecommendationHandlers.request,
      { kind: 'outfit_generation', basedOnOutfitId: seed.id } as never,
      { context: utils.testContext() },
    )
    expect(result).toMatchObject({
      kind: 'outfit_generation',
      basedOnOutfitId: seed.id,
      status: 'pending',
    })
  })

  test('rejects gap_filling with basedOnOutfitId set (kind mismatch)', async () => {
    await seedFiveItems()
    const seed = await utils.seedOutfit()
    await expect(
      call(
        outfitRecommendationHandlers.request,
        { kind: 'gap_filling', basedOnOutfitId: seed.id } as never,
        { context: utils.testContext() },
      ),
    ).rejects.toThrow()
  })

  test('rejects outfit_generation without basedOnOutfitId', async () => {
    await seedFiveItems()
    await expect(
      call(outfitRecommendationHandlers.request, { kind: 'outfit_generation' } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
  })

  test('rejects outfit_generation when seed outfit is not owned by caller', async () => {
    await seedFiveItems()
    await utils.seedUser({ id: 'user-b', email: 'user-b@example.com' })
    const seed = await utils.seedOutfit({ userId: 'user-b' })
    await utils.loginAsUser('user-a')
    await expect(
      call(
        outfitRecommendationHandlers.request,
        { kind: 'outfit_generation', basedOnOutfitId: seed.id } as never,
        { context: utils.testContext() },
      ),
    ).rejects.toThrow()
  })

  test('rejects outfit_generation when seed outfit is deleted', async () => {
    await seedFiveItems()
    const seed = await utils.seedOutfit({ status: 'deleted' })
    await expect(
      call(
        outfitRecommendationHandlers.request,
        { kind: 'outfit_generation', basedOnOutfitId: seed.id } as never,
        { context: utils.testContext() },
      ),
    ).rejects.toThrow()
  })

  test('rejects when user has fewer than 5 active wardrobe items', async () => {
    for (let i = 0; i < 4; i++) await utils.seedClothingItem()
    await expect(
      call(outfitRecommendationHandlers.request, { kind: 'gap_filling' } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
  })

  test('rejects unknown kind value', async () => {
    await seedFiveItems()
    await expect(
      call(outfitRecommendationHandlers.request, { kind: 'trend_alignment' } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
  })
})

describe('outfitRecommendationHandlers.list', () => {
  test('returns only caller’s requests, ordered by requestedAt desc', async () => {
    const t1 = new Date('2024-01-01')
    const t2 = new Date('2024-02-01')
    const t3 = new Date('2024-03-01')
    await utils.seedRecommendation({ userId: 'user-a', requestedAt: t1 })
    await utils.seedRecommendation({ userId: 'user-a', requestedAt: t3 })
    await utils.seedRecommendation({ userId: 'user-a', requestedAt: t2 })
    await utils.seedUser({ id: 'user-b', email: 'user-b@example.com' })
    await utils.seedRecommendation({ userId: 'user-b', requestedAt: new Date() })
    await utils.loginAsUser('user-a')
    const result = await call(outfitRecommendationHandlers.list, undefined as never, {
      context: utils.testContext(),
    })
    expect(result).toHaveLength(3)
    expect(result[0]!.requestedAt).toEqual(t3)
    expect(result[1]!.requestedAt).toEqual(t2)
    expect(result[2]!.requestedAt).toEqual(t1)
  })

  test('returns empty list when caller has no requests', async () => {
    await utils.seedUser({ id: 'user-b', email: 'user-b@example.com' })
    await utils.seedRecommendation({ userId: 'user-b' })
    await utils.loginAsUser('user-a')
    const result = await call(outfitRecommendationHandlers.list, undefined as never, {
      context: utils.testContext(),
    })
    expect(result).toHaveLength(0)
  })

  test('throws when unauthenticated', async () => {
    utils.setTestUser(null)
    await expect(
      call(outfitRecommendationHandlers.list, undefined as never, { context: utils.testContext() }),
    ).rejects.toThrow()
  })
})
