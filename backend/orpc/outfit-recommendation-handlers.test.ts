/**
 * Tests for outfit-recommendation-handlers.
 * Spec: specs/fit-page.allium (lines 108-112, 227-244).
 * Recommendation engine is deferred (lines 300-302) — this handler only
 * writes the request row with status='pending'.
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import {
  installFitPageFakes,
  resetStore,
  seedItem,
  seedOutfit,
  seedRecommendation,
  store,
} from './fit-page-test-helpers'

const { fakeDb, fakeAuth, setUser, setPermissionAllowed } = installFitPageFakes()

const { call } = await import('@orpc/server')
const { outfitRecommendationHandlers } = await import('./outfit-recommendation-handlers')

function ctx() {
  return {
    db: fakeDb as unknown as never,
    auth: fakeAuth as unknown as never,
    reqHeaders: new Headers(),
  }
}

function seedFiveItems() {
  for (let i = 0; i < 5; i++) seedItem()
}

beforeEach(() => {
  resetStore()
  setUser({ id: 'user-a' })
  setPermissionAllowed(true)
})

describe('outfitRecommendationHandlers.request', () => {
  test('creates a pending gap_filling request', async () => {
    seedFiveItems()
    const result = await call(
      outfitRecommendationHandlers.request,
      { kind: 'gap_filling' } as never,
      { context: ctx() },
    )
    expect(result).toMatchObject({
      userId: 'user-a',
      kind: 'gap_filling',
      status: 'pending',
      basedOnOutfitId: null,
    })
    expect(store.recommendations).toHaveLength(1)
  })

  test('creates a pending outfit_generation request with seed outfit', async () => {
    seedFiveItems()
    const seed = seedOutfit()
    const result = await call(
      outfitRecommendationHandlers.request,
      { kind: 'outfit_generation', basedOnOutfitId: seed.id } as never,
      { context: ctx() },
    )
    expect(result).toMatchObject({
      kind: 'outfit_generation',
      basedOnOutfitId: seed.id,
      status: 'pending',
    })
  })

  test('rejects gap_filling with basedOnOutfitId set (kind mismatch)', async () => {
    seedFiveItems()
    const seed = seedOutfit()
    await expect(
      call(
        outfitRecommendationHandlers.request,
        { kind: 'gap_filling', basedOnOutfitId: seed.id } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('rejects outfit_generation without basedOnOutfitId', async () => {
    seedFiveItems()
    await expect(
      call(
        outfitRecommendationHandlers.request,
        { kind: 'outfit_generation' } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('rejects outfit_generation when seed outfit is not owned by caller', async () => {
    seedFiveItems()
    const seed = seedOutfit({ userId: 'user-b' })
    await expect(
      call(
        outfitRecommendationHandlers.request,
        { kind: 'outfit_generation', basedOnOutfitId: seed.id } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('rejects outfit_generation when seed outfit is deleted', async () => {
    seedFiveItems()
    const seed = seedOutfit({ status: 'deleted' })
    await expect(
      call(
        outfitRecommendationHandlers.request,
        { kind: 'outfit_generation', basedOnOutfitId: seed.id } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('rejects when user has fewer than 5 active wardrobe items', async () => {
    for (let i = 0; i < 4; i++) seedItem()
    await expect(
      call(
        outfitRecommendationHandlers.request,
        { kind: 'gap_filling' } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('archived items do not count toward the wardrobe minimum', async () => {
    // 4 active + 1 archived = 4 counted → should still reject.
    for (let i = 0; i < 4; i++) seedItem({ status: 'active' })
    seedItem({ status: 'archived' })
    await expect(
      call(
        outfitRecommendationHandlers.request,
        { kind: 'gap_filling' } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('rejects unknown kind value', async () => {
    seedFiveItems()
    await expect(
      call(
        outfitRecommendationHandlers.request,
        { kind: 'trend_alignment' } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })
})

describe('outfitRecommendationHandlers.list', () => {
  test('returns only caller’s requests, ordered by requestedAt desc', async () => {
    const t1 = new Date('2024-01-01')
    const t2 = new Date('2024-02-01')
    const t3 = new Date('2024-03-01')
    seedRecommendation({ userId: 'user-a', requestedAt: t1 })
    seedRecommendation({ userId: 'user-a', requestedAt: t3 })
    seedRecommendation({ userId: 'user-a', requestedAt: t2 })
    seedRecommendation({ userId: 'user-b', requestedAt: new Date() })
    const result = await call(outfitRecommendationHandlers.list, undefined as never, {
      context: ctx(),
    })
    expect(result).toHaveLength(3)
    expect(result[0]!.requestedAt).toEqual(t3)
    expect(result[1]!.requestedAt).toEqual(t2)
    expect(result[2]!.requestedAt).toEqual(t1)
  })

  test('returns empty list when caller has no requests', async () => {
    seedRecommendation({ userId: 'user-b' })
    const result = await call(outfitRecommendationHandlers.list, undefined as never, {
      context: ctx(),
    })
    expect(result).toHaveLength(0)
  })

  test('throws when unauthenticated', async () => {
    setUser(null)
    await expect(
      call(outfitRecommendationHandlers.list, undefined as never, { context: ctx() }),
    ).rejects.toThrow()
  })
})
