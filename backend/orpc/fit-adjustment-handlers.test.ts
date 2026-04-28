/**
 * Tests for fit-adjustment-handlers.
 * Spec: specs/fit-page.allium (lines 81-90, 165-198).
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import {
  installFitPageFakes,
  resetStore,
  seedItem,
  store,
} from './fit-page-test-helpers'

const { fakeDb, fakeAuth, setUser, setPermissionAllowed } = installFitPageFakes()

const { call } = await import('@orpc/server')
const { fitAdjustmentHandlers } = await import('./fit-adjustment-handlers')

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

describe('fitAdjustmentHandlers.getForItem', () => {
  test('returns null when no adjustment exists', async () => {
    const item = seedItem()
    const result = await call(
      fitAdjustmentHandlers.getForItem,
      { itemId: item.id } as never,
      { context: ctx() },
    )
    expect(result).toBeNull()
  })

  test('returns caller’s adjustment row', async () => {
    const item = seedItem()
    await call(
      fitAdjustmentHandlers.upsert,
      { itemId: item.id, length: 'longer' } as never,
      { context: ctx() },
    )
    const result = await call(
      fitAdjustmentHandlers.getForItem,
      { itemId: item.id } as never,
      { context: ctx() },
    )
    expect(result).toMatchObject({ itemId: item.id, length: 'longer' })
  })

  test('scoped to caller — does not leak another user’s adjustment', async () => {
    const item = seedItem({ userId: 'user-b' })
    store.fitAdjustments.push({
      id: crypto.randomUUID(),
      userId: 'user-b',
      itemId: item.id,
      length: 'longer',
      width: null,
      sleeve: null,
      rise: null,
      customNotes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const result = await call(
      fitAdjustmentHandlers.getForItem,
      { itemId: item.id } as never,
      { context: ctx() },
    )
    expect(result).toBeNull()
  })
})

describe('fitAdjustmentHandlers.upsert', () => {
  test('creates a new adjustment row', async () => {
    const item = seedItem()
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
      { context: ctx() },
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
    expect(store.fitAdjustments).toHaveLength(1)
  })

  test('second upsert updates the same row (unique on userId,itemId)', async () => {
    const item = seedItem()
    await call(
      fitAdjustmentHandlers.upsert,
      { itemId: item.id, length: 'shorter' } as never,
      { context: ctx() },
    )
    await call(
      fitAdjustmentHandlers.upsert,
      { itemId: item.id, length: 'longer', width: 'tighter' } as never,
      { context: ctx() },
    )
    expect(store.fitAdjustments).toHaveLength(1)
    expect(store.fitAdjustments[0]!.length).toBe('longer')
    expect(store.fitAdjustments[0]!.width).toBe('tighter')
  })

  test('rejects when the item is not owned by the caller', async () => {
    const item = seedItem({ userId: 'user-b' })
    await expect(
      call(
        fitAdjustmentHandlers.upsert,
        { itemId: item.id, length: 'longer' } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('rejects when the item is removed', async () => {
    const item = seedItem({ status: 'removed' })
    await expect(
      call(
        fitAdjustmentHandlers.upsert,
        { itemId: item.id, length: 'longer' } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('rejects invalid enum values', async () => {
    const item = seedItem()
    await expect(
      call(
        fitAdjustmentHandlers.upsert,
        { itemId: item.id, length: 'snug' } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })
})

describe('fitAdjustmentHandlers.remove', () => {
  test('deletes the adjustment for caller + itemId', async () => {
    const item = seedItem()
    await call(
      fitAdjustmentHandlers.upsert,
      { itemId: item.id, length: 'longer' } as never,
      { context: ctx() },
    )
    expect(store.fitAdjustments).toHaveLength(1)
    const result = await call(
      fitAdjustmentHandlers.remove,
      { itemId: item.id } as never,
      { context: ctx() },
    )
    expect(result).toBe(true)
    expect(store.fitAdjustments).toHaveLength(0)
  })

  test('NOT_FOUND when no adjustment exists', async () => {
    const item = seedItem()
    await expect(
      call(fitAdjustmentHandlers.remove, { itemId: item.id } as never, {
        context: ctx(),
      }),
    ).rejects.toThrow()
  })
})
