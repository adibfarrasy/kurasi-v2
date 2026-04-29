import { beforeEach, describe, expect, test } from 'bun:test'
import { call } from '@orpc/server'
import * as utils from '../test/utils'
import { fitAdjustmentHandlers } from './fit-adjustment-handlers'

beforeEach(async () => {
  await utils.resetTestDb()
  await utils.seedUser()
})

describe('fitAdjustmentHandlers.getForItem', () => {
  test('returns null when no adjustment exists', async () => {
    const item = await utils.seedClothingItem()
    const result = await call(fitAdjustmentHandlers.getForItem, { itemId: item.id } as never, {
      context: utils.testContext(),
    })
    expect(result).toBeNull()
  })

  test('returns caller’s adjustment row', async () => {
    const item = await utils.seedClothingItem()
    await call(fitAdjustmentHandlers.upsert, { itemId: item.id, length: 'longer' } as never, {
      context: utils.testContext(),
    })
    const result = await call(fitAdjustmentHandlers.getForItem, { itemId: item.id } as never, {
      context: utils.testContext(),
    })
    expect(result).toMatchObject({ itemId: item.id, length: 'longer' })
  })

  test('scoped to caller — does not leak another user’s adjustment', async () => {
    await utils.seedUser({ id: 'user-b', email: 'user-b@example.com' })
    await utils.loginAsUser('user-a')
    const item = await utils.seedClothingItem({ userId: 'user-b' })
    await utils.seedFitAdjustment({ userId: 'user-b', itemId: item.id, length: 'longer' })
    const result = await call(fitAdjustmentHandlers.getForItem, { itemId: item.id } as never, {
      context: utils.testContext(),
    })
    expect(result).toBeNull()
  })
})

describe('fitAdjustmentHandlers.upsert', () => {
  test('creates a new adjustment row', async () => {
    const item = await utils.seedClothingItem()
    const result = await call(
      fitAdjustmentHandlers.upsert,
      {
        itemId: item.id,
        length: 'shorter',
        width: 'looser',
        sleeve: 'too_long',
        rise: 'high_rise',
        customNotes: 'runs big',
      } as never,
      { context: utils.testContext() },
    )
    expect(result).toMatchObject({
      userId: 'user-a',
      itemId: item.id,
      length: 'shorter',
      width: 'looser',
      sleeve: 'too_long',
      rise: 'high_rise',
      customNotes: 'runs big',
    })
  })

  test('second upsert updates the same row (unique on userId,itemId)', async () => {
    const item = await utils.seedClothingItem()
    await call(fitAdjustmentHandlers.upsert, { itemId: item.id, length: 'shorter' } as never, {
      context: utils.testContext(),
    })
    const result = await call(
      fitAdjustmentHandlers.upsert,
      { itemId: item.id, length: 'longer', width: 'tighter' } as never,
      { context: utils.testContext() },
    )
    expect(result).toMatchObject({ length: 'longer', width: 'tighter' })
  })

  test('rejects when the item is not owned by the caller', async () => {
    await utils.seedUser({ id: 'user-b', email: 'user-b@example.com' })
    await utils.loginAsUser('user-a')
    const item = await utils.seedClothingItem({ userId: 'user-b' })
    await expect(
      call(fitAdjustmentHandlers.upsert, { itemId: item.id, length: 'longer' } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
  })

  test('rejects when the item is removed', async () => {
    const item = await utils.seedClothingItem({ status: 'removed' })
    await expect(
      call(fitAdjustmentHandlers.upsert, { itemId: item.id, length: 'longer' } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
  })

  test('rejects invalid enum values', async () => {
    const item = await utils.seedClothingItem()
    await expect(
      call(fitAdjustmentHandlers.upsert, { itemId: item.id, length: 'snug' } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
  })
})

describe('fitAdjustmentHandlers.remove', () => {
  test('deletes the adjustment for caller + itemId', async () => {
    const item = await utils.seedClothingItem()
    await call(fitAdjustmentHandlers.upsert, { itemId: item.id, length: 'longer' } as never, {
      context: utils.testContext(),
    })
    const result = await call(fitAdjustmentHandlers.remove, { itemId: item.id } as never, {
      context: utils.testContext(),
    })
    expect(result).toBe(true)
  })

  test('NOT_FOUND when no adjustment exists', async () => {
    const item = await utils.seedClothingItem()
    await expect(
      call(fitAdjustmentHandlers.remove, { itemId: item.id } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
  })
})
