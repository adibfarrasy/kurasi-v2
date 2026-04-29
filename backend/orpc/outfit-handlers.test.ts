import { beforeEach, describe, expect, test } from 'bun:test'
import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { outfit } from '../db/schema'
import * as utils from '../test/utils'
import { outfitHandlers } from './outfit-handlers'

beforeEach(async () => {
  await utils.resetTestDb()
  await utils.seedUser()
})

describe('outfitHandlers.list', () => {
  test('returns only caller-owned active outfits', async () => {
    await utils.seedOutfit({ userId: 'user-a', name: 'mine' })
    await utils.seedOutfit({
      userId: 'user-a',
      name: 'deleted',
      status: 'deleted',
      deletedAt: new Date(),
    })
    await utils.seedUser({ id: 'user-b', email: 'user-b@example.com' })
    await utils.seedOutfit({ userId: 'user-b', name: 'theirs' })
    await utils.loginAsUser('user-a')

    const result = await call(outfitHandlers.list, undefined as never, {
      context: utils.testContext(),
    })
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('mine')
  })

  test('throws UNAUTHORIZED when no session; succeeds when authenticated', async () => {
    utils.setTestUser(null)
    await expect(
      call(outfitHandlers.list, undefined as never, { context: utils.testContext() }),
    ).rejects.toThrow()

    await utils.resetTestDb()
    await utils.seedUser()
    const ok = await call(outfitHandlers.list, undefined as never, {
      context: utils.testContext(),
    })
    expect(ok).toEqual([])
  })
})

describe('outfitHandlers.create', () => {
  test('persists a caller-owned outfit filling all worn slots when items exist', async () => {
    const headwear = await utils.seedClothingItem({ category: 'headwear' })
    const base = await utils.seedClothingItem({ category: 'tee' })
    const outer = await utils.seedClothingItem({ category: 'outer' })
    const bottom = await utils.seedClothingItem({ category: 'pants' })
    const footwear = await utils.seedClothingItem({ category: 'footwear' })
    const result = await call(
      outfitHandlers.create,
      {
        name: 'full fit',
        headwearId: headwear.id,
        baseId: base.id,
        outerId: outer.id,
        bottomId: bottom.id,
        footwearId: footwear.id,
      } as never,
      { context: utils.testContext() },
    )
    expect(result).toMatchObject({
      headwearId: headwear.id,
      baseId: base.id,
      outerId: outer.id,
      bottomId: bottom.id,
      footwearId: footwear.id,
      userId: 'user-a',
    })
  })

  test('persists a caller-owned outfit with one or more slots', async () => {
    const base = await utils.seedClothingItem({ category: 'tee' })
    const footwear = await utils.seedClothingItem({ category: 'footwear' })
    const result = await call(
      outfitHandlers.create,
      { name: 'fit', baseId: base.id, footwearId: footwear.id, tags: ['casual'] } as never,
      { context: utils.testContext() },
    )
    expect(result).toMatchObject({
      userId: 'user-a',
      name: 'fit',
      baseId: base.id,
      footwearId: footwear.id,
      tags: ['casual'],
    })
  })

  test('rejects empty outfits and unavailable slot items', async () => {
    await expect(
      call(outfitHandlers.create, { name: 'empty' } as never, { context: utils.testContext() }),
    ).rejects.toThrow()

    await utils.seedUser({ id: 'user-b', email: 'user-b@example.com' })
    const other = await utils.seedClothingItem({ userId: 'user-b' })
    await utils.loginAsUser('user-a')
    await expect(
      call(outfitHandlers.create, { baseId: other.id } as never, { context: utils.testContext() }),
    ).rejects.toThrow()

    const removed = await utils.seedClothingItem({ status: 'removed', removedAt: new Date() })
    await expect(
      call(outfitHandlers.create, { baseId: removed.id } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
  })

  test('allows archived items in outfit history', async () => {
    const archived = await utils.seedClothingItem({ status: 'archived', archivedAt: new Date() })
    const result = await call(outfitHandlers.create, { baseId: archived.id } as never, {
      context: utils.testContext(),
    })
    expect(result!.baseId).toBe(archived.id)
  })
})

describe('outfitHandlers.find', () => {
  test('returns caller-owned outfit and does not leak another user’s outfit', async () => {
    const mine = await utils.seedOutfit({ name: 'mine' })
    await utils.seedUser({ id: 'user-b', email: 'user-b@example.com' })
    const other = await utils.seedOutfit({ userId: 'user-b', name: 'theirs' })
    await utils.loginAsUser('user-a')

    expect(
      await call(outfitHandlers.find, { id: mine.id } as never, { context: utils.testContext() }),
    ).toMatchObject({ id: mine.id })
    expect(
      await call(outfitHandlers.find, { id: other.id } as never, { context: utils.testContext() }),
    ).toBeNull()
  })
})

describe('outfitHandlers.update', () => {
  test('updates only supplied fields — partial patches leave other editable columns intact', async () => {
    const row = await utils.seedOutfit({ name: 'orig', tags: ['a', 'b'], notes: 'sticky' })
    const result = await call(outfitHandlers.update, { id: row.id, tags: ['c'] } as never, {
      context: utils.testContext(),
    })
    expect(result.tags).toEqual(['c'])
    expect(result.name).toBe('orig')
    expect(result.notes).toBe('sticky')
  })

  test('updates editable fields on active caller-owned outfit', async () => {
    const row = await utils.seedOutfit({ name: 'old', tags: ['daily'], notes: 'old note' })
    const result = await call(
      outfitHandlers.update,
      { id: row.id, name: 'new', tags: ['date'], notes: 'new note' } as never,
      { context: utils.testContext() },
    )
    expect(result).toMatchObject({ name: 'new', tags: ['date'], notes: 'new note' })
  })

  test('NOT_FOUND for deleted or another user’s outfit', async () => {
    const deleted = await utils.seedOutfit({ status: 'deleted', deletedAt: new Date() })
    await expect(
      call(outfitHandlers.update, { id: deleted.id, name: 'x' } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()

    await utils.seedUser({ id: 'user-b', email: 'user-b@example.com' })
    const other = await utils.seedOutfit({ userId: 'user-b' })
    await utils.loginAsUser('user-a')
    await expect(
      call(outfitHandlers.update, { id: other.id, name: 'x' } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
  })
})

describe('outfitHandlers.delete', () => {
  test('soft-deletes active caller-owned outfit', async () => {
    const row = await utils.seedOutfit()
    const result = await call(outfitHandlers.delete, { id: row.id } as never, {
      context: utils.testContext(),
    })
    expect(result).toBe(true)
    const [after] = await utils.db.select().from(outfit).where(eq(outfit.id, row.id))
    expect(after!.status).toBe('deleted')
    expect(after!.deletedAt).not.toBeNull()
  })

  test('cannot delete missing, already-deleted, or foreign outfit', async () => {
    await expect(
      call(outfitHandlers.delete, { id: crypto.randomUUID() } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()

    const deleted = await utils.seedOutfit({ status: 'deleted', deletedAt: new Date() })
    await expect(
      call(outfitHandlers.delete, { id: deleted.id } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()

    await utils.seedUser({ id: 'user-b', email: 'user-b@example.com' })
    const other = await utils.seedOutfit({ userId: 'user-b' })
    await utils.loginAsUser('user-a')
    await expect(
      call(outfitHandlers.delete, { id: other.id } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
  })
})

describe('outfitHandlers.rate', () => {
  test('sets rating and optional wornAt on active outfit', async () => {
    const row = await utils.seedOutfit()
    const wornAt = new Date('2025-01-01T00:00:00Z')
    const result = await call(
      outfitHandlers.rate,
      { id: row.id, rating: 'loved', wornAt } as never,
      { context: utils.testContext() },
    )
    expect(result.rating).toBe('loved')
    expect(result.wornAt).toEqual(wornAt)
  })

  test('rejects invalid rating and deleted outfit', async () => {
    const row = await utils.seedOutfit()
    await expect(
      call(outfitHandlers.rate, { id: row.id, rating: 'great' } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()

    const deleted = await utils.seedOutfit({ status: 'deleted', deletedAt: new Date() })
    await expect(
      call(outfitHandlers.rate, { id: deleted.id, rating: 'ok' } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
  })
})
