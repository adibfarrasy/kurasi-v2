import { beforeEach, describe, expect, test } from 'bun:test'
import { call } from '@orpc/server'
import * as utils from '../test/utils'
import { sharedOutfitHandlers } from './shared-outfit-handlers'

beforeEach(async () => {
  await utils.resetTestDb()
  await utils.seedUser()
})

async function seedOtherUser() {
  await utils.seedUser({ id: 'user-b', email: 'user-b@example.com', name: 'Bea' })
}

describe('sharedOutfitHandlers.discover', () => {
  test('excludes caller’s own published outfits and unpublished entries', async () => {
    const mine = await utils.seedOutfit({ userId: 'user-a' })
    await utils.seedSharedOutfit({ userId: 'user-a', outfitId: mine.id })
    await seedOtherUser()
    const hidden = await utils.seedOutfit({ userId: 'user-b' })
    await utils.seedSharedOutfit({
      userId: 'user-b',
      outfitId: hidden.id,
      status: 'unpublished',
      unpublishedAt: new Date(),
    })
    await utils.loginAsUser('user-a')
    const result = await call(sharedOutfitHandlers.discover, undefined as never, {
      context: utils.testContext(),
    })
    expect(result).toHaveLength(0)
  })

  test('includes published outfits from other users and respects username visibility', async () => {
    await seedOtherUser()
    const namedOutfit = await utils.seedOutfit({ userId: 'user-b' })
    await utils.seedSharedOutfit({ userId: 'user-b', outfitId: namedOutfit.id, showUsername: true })
    const anonymousOutfit = await utils.seedOutfit({ userId: 'user-b' })
    await utils.seedSharedOutfit({
      userId: 'user-b',
      outfitId: anonymousOutfit.id,
      showUsername: false,
    })
    await utils.loginAsUser('user-a')
    const result = await call(sharedOutfitHandlers.discover, undefined as never, {
      context: utils.testContext(),
    })
    expect(result).toHaveLength(2)
    expect(result.some((row) => row.publisherUsername === 'Bea')).toBe(true)
    expect(result.some((row) => row.publisherUsername === null)).toBe(true)
  })
})

describe('sharedOutfitHandlers.findByOutfit', () => {
  test('returns caller’s SharedOutfit for the given outfit', async () => {
    const outfit = await utils.seedOutfit()
    await utils.seedSharedOutfit({ outfitId: outfit.id })
    const result = await call(sharedOutfitHandlers.findByOutfit, { outfitId: outfit.id } as never, {
      context: utils.testContext(),
    })
    expect(result?.outfitId).toBe(outfit.id)
  })

  test('returns null for outfit belonging to another user', async () => {
    await seedOtherUser()
    const outfit = await utils.seedOutfit({ userId: 'user-b' })
    await utils.seedSharedOutfit({ userId: 'user-b', outfitId: outfit.id })
    await utils.loginAsUser('user-a')
    const result = await call(sharedOutfitHandlers.findByOutfit, { outfitId: outfit.id } as never, {
      context: utils.testContext(),
    })
    expect(result).toBeNull()
  })
})

describe('sharedOutfitHandlers.publish', () => {
  test('creates a published row for caller’s active outfit', async () => {
    const outfit = await utils.seedOutfit()
    const result = await call(
      sharedOutfitHandlers.publish,
      { outfitId: outfit.id, faceAnonymisation: 'blur_face', showUsername: true } as never,
      { context: utils.testContext() },
    )
    expect(result).toMatchObject({
      outfitId: outfit.id,
      status: 'published',
      faceAnonymisation: 'blur_face',
      showUsername: true,
    })
  })

  test('re-enables an unpublished singleton', async () => {
    const outfit = await utils.seedOutfit()
    await utils.seedSharedOutfit({
      outfitId: outfit.id,
      status: 'unpublished',
      unpublishedAt: new Date(),
      faceAnonymisation: 'none',
    })
    const result = await call(
      sharedOutfitHandlers.publish,
      { outfitId: outfit.id, faceAnonymisation: 'block_eyes', showUsername: false } as never,
      { context: utils.testContext() },
    )
    expect(result?.status).toBe('published')
    expect(result?.faceAnonymisation).toBe('block_eyes')
    expect(result?.unpublishedAt).toBeNull()
  })

  test('rejects when outfit is not caller-owned or is deleted', async () => {
    await seedOtherUser()
    const other = await utils.seedOutfit({ userId: 'user-b' })
    await utils.loginAsUser('user-a')
    await expect(
      call(
        sharedOutfitHandlers.publish,
        { outfitId: other.id, faceAnonymisation: 'none', showUsername: true } as never,
        { context: utils.testContext() },
      ),
    ).rejects.toThrow()

    const deleted = await utils.seedOutfit({ userId: 'user-a', status: 'deleted' })
    await expect(
      call(
        sharedOutfitHandlers.publish,
        { outfitId: deleted.id, faceAnonymisation: 'none', showUsername: true } as never,
        { context: utils.testContext() },
      ),
    ).rejects.toThrow()
  })
})

describe('sharedOutfitHandlers.unpublish', () => {
  test('sets status to unpublished and stamps unpublishedAt', async () => {
    const outfit = await utils.seedOutfit()
    await utils.seedSharedOutfit({ outfitId: outfit.id, status: 'published' })
    const result = await call(sharedOutfitHandlers.unpublish, { outfitId: outfit.id } as never, {
      context: utils.testContext(),
    })
    expect(result?.status).toBe('unpublished')
    expect(result?.unpublishedAt).toBeInstanceOf(Date)
  })

  test('NOT_FOUND when no active caller-owned SharedOutfit exists', async () => {
    const outfit = await utils.seedOutfit()
    await expect(
      call(sharedOutfitHandlers.unpublish, { outfitId: outfit.id } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()

    await utils.seedSharedOutfit({
      outfitId: outfit.id,
      status: 'unpublished',
      unpublishedAt: new Date(),
    })
    await expect(
      call(sharedOutfitHandlers.unpublish, { outfitId: outfit.id } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
  })
})
