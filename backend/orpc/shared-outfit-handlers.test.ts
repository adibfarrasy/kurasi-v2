/**
 * Tests for shared-outfit-handlers.
 * Spec: specs/fit-page.allium (lines 92-106, 201-223).
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import {
  installFitPageFakes,
  resetStore,
  seedOutfit,
  seedSharedOutfit,
  seedUser,
  store,
} from './fit-page-test-helpers'

const { fakeDb, fakeAuth, setUser, setPermissionAllowed } = installFitPageFakes()

const { call } = await import('@orpc/server')
const { sharedOutfitHandlers } = await import('./shared-outfit-handlers')

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

describe('sharedOutfitHandlers.discover', () => {
  test('excludes caller’s own published outfits', async () => {
    const myOutfit = seedOutfit({ userId: 'user-a' })
    seedSharedOutfit({ userId: 'user-a', outfitId: myOutfit.id })
    const result = await call(sharedOutfitHandlers.discover, undefined as never, {
      context: ctx(),
    })
    expect(result).toHaveLength(0)
  })

  test('excludes unpublished entries', async () => {
    const otherOutfit = seedOutfit({ userId: 'user-b' })
    seedSharedOutfit({
      userId: 'user-b',
      outfitId: otherOutfit.id,
      status: 'unpublished',
      unpublishedAt: new Date(),
    })
    const result = await call(sharedOutfitHandlers.discover, undefined as never, {
      context: ctx(),
    })
    expect(result).toHaveLength(0)
  })

  test('includes active published outfits from other users', async () => {
    seedUser({ id: 'user-b', name: 'Bea' })
    const outfitB = seedOutfit({ userId: 'user-b' })
    seedSharedOutfit({
      userId: 'user-b',
      outfitId: outfitB.id,
      showUsername: true,
    })
    const result = await call(sharedOutfitHandlers.discover, undefined as never, {
      context: ctx(),
    })
    expect(result).toHaveLength(1)
    expect(result[0]!.publisherUsername).toBe('Bea')
  })

  test('masks username when showUsername=false', async () => {
    seedUser({ id: 'user-b', name: 'Bea' })
    const outfitB = seedOutfit({ userId: 'user-b' })
    seedSharedOutfit({
      userId: 'user-b',
      outfitId: outfitB.id,
      showUsername: false,
    })
    const result = await call(sharedOutfitHandlers.discover, undefined as never, {
      context: ctx(),
    })
    expect(result[0]!.publisherUsername).toBeNull()
  })
})

describe('sharedOutfitHandlers.findByOutfit', () => {
  test('returns caller’s SharedOutfit for the given outfit', async () => {
    const o = seedOutfit()
    seedSharedOutfit({ outfitId: o.id })
    const result = await call(
      sharedOutfitHandlers.findByOutfit,
      { outfitId: o.id } as never,
      { context: ctx() },
    )
    expect(result).not.toBeNull()
    expect(result!.outfitId).toBe(o.id)
  })

  test('returns null for outfit belonging to another user', async () => {
    const o = seedOutfit({ userId: 'user-b' })
    seedSharedOutfit({ userId: 'user-b', outfitId: o.id })
    const result = await call(
      sharedOutfitHandlers.findByOutfit,
      { outfitId: o.id } as never,
      { context: ctx() },
    )
    expect(result).toBeNull()
  })
})

describe('sharedOutfitHandlers.publish', () => {
  test('creates active row for caller’s outfit', async () => {
    const o = seedOutfit()
    const result = await call(
      sharedOutfitHandlers.publish,
      { outfitId: o.id, faceAnonymisation: 'blur_face', showUsername: true } as never,
      { context: ctx() },
    )
    expect(result).toMatchObject({
      outfitId: o.id,
      status: 'published',
      faceAnonymisation: 'blur_face',
      showUsername: true,
    })
    expect(store.sharedOutfits).toHaveLength(1)
  })

  test('re-enables an unpublished singleton (singleton per outfit)', async () => {
    const o = seedOutfit()
    seedSharedOutfit({
      outfitId: o.id,
      status: 'unpublished',
      unpublishedAt: new Date(),
      faceAnonymisation: 'none',
    })
    const result = await call(
      sharedOutfitHandlers.publish,
      { outfitId: o.id, faceAnonymisation: 'block_eyes', showUsername: false } as never,
      { context: ctx() },
    )
    expect(result!.status).toBe('published')
    expect(result!.faceAnonymisation).toBe('block_eyes')
    expect(result!.unpublishedAt).toBeNull()
    expect(store.sharedOutfits).toHaveLength(1)
  })

  test('rejects when outfit not owned by caller', async () => {
    const o = seedOutfit({ userId: 'user-b' })
    await expect(
      call(
        sharedOutfitHandlers.publish,
        { outfitId: o.id, faceAnonymisation: 'none', showUsername: true } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('rejects when outfit status is deleted', async () => {
    const o = seedOutfit({ status: 'deleted' })
    await expect(
      call(
        sharedOutfitHandlers.publish,
        { outfitId: o.id, faceAnonymisation: 'none', showUsername: true } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })
})

describe('sharedOutfitHandlers.unpublish', () => {
  test('sets status to unpublished and stamps unpublishedAt', async () => {
    const o = seedOutfit()
    seedSharedOutfit({ outfitId: o.id, status: 'published' })
    const result = await call(
      sharedOutfitHandlers.unpublish,
      { outfitId: o.id } as never,
      { context: ctx() },
    )
    expect(result!.status).toBe('unpublished')
    expect(result!.unpublishedAt).toBeInstanceOf(Date)
  })

  test('NOT_FOUND when no SharedOutfit exists', async () => {
    const o = seedOutfit()
    await expect(
      call(sharedOutfitHandlers.unpublish, { outfitId: o.id } as never, {
        context: ctx(),
      }),
    ).rejects.toThrow()
  })

  test('rejects double-unpublish (row already unpublished)', async () => {
    const o = seedOutfit()
    seedSharedOutfit({
      outfitId: o.id,
      status: 'unpublished',
      unpublishedAt: new Date(),
    })
    await expect(
      call(sharedOutfitHandlers.unpublish, { outfitId: o.id } as never, {
        context: ctx(),
      }),
    ).rejects.toThrow()
  })

  test('rejects when caller does not own the SharedOutfit', async () => {
    const o = seedOutfit({ userId: 'user-b' })
    seedSharedOutfit({ userId: 'user-b', outfitId: o.id })
    await expect(
      call(sharedOutfitHandlers.unpublish, { outfitId: o.id } as never, {
        context: ctx(),
      }),
    ).rejects.toThrow()
  })
})
