import { beforeEach, describe, expect, test } from 'bun:test'
import { call } from '@orpc/server'
import * as utils from '../test/utils'
import { styleCardHandlers } from './style-card-handlers'

beforeEach(async () => {
  await utils.resetTestDb()
  await utils.seedUser()
})

describe('styleCardHandlers.feed', () => {
  test('returns active cards newest first', async () => {
    const old = await utils.seedStyleCard({ createdAt: new Date(2025, 0, 1) })
    const recent = await utils.seedStyleCard({ createdAt: new Date(2026, 0, 1) })
    const result = await call(styleCardHandlers.feed, {}, { context: utils.testContext() })
    expect(result.items.map((c) => c.id)).toEqual([recent.id, old.id])
  })

  test('excludes retired cards', async () => {
    const a = await utils.seedStyleCard({ status: 'active' })
    await utils.seedStyleCard({ status: 'retired', retiredAt: new Date() })
    const result = await call(styleCardHandlers.feed, {}, { context: utils.testContext() })
    expect(result.items.map((c) => c.id)).toEqual([a.id])
  })

  test('excludes cards the caller has skipped', async () => {
    const a = await utils.seedStyleCard()
    const b = await utils.seedStyleCard()
    await utils.seedStyleInteraction({ userId: 'user-a', cardId: b.id, kind: 'skipped' })
    const result = await call(styleCardHandlers.feed, {}, { context: utils.testContext() })
    expect(result.items.map((c) => c.id)).toEqual([a.id])
  })

  test('excludes cards the caller has liked', async () => {
    const a = await utils.seedStyleCard()
    const b = await utils.seedStyleCard()
    await utils.seedStyleInteraction({ userId: 'user-a', cardId: b.id, kind: 'liked' })
    const result = await call(styleCardHandlers.feed, {}, { context: utils.testContext() })
    expect(result.items.map((c) => c.id)).toEqual([a.id])
  })

  test('does not exclude cards interacted with by other users', async () => {
    const a = await utils.seedStyleCard()
    await utils.seedUser({ id: 'user-b', email: 'user-b@example.com' })
    await utils.seedStyleInteraction({ userId: 'user-b', cardId: a.id, kind: 'skipped' })
    await utils.loginAsUser('user-a')
    const result = await call(styleCardHandlers.feed, {}, { context: utils.testContext() })
    expect(result.items.map((c) => c.id)).toEqual([a.id])
  })

  test('respects limit and exposes nextCursor when more exist', async () => {
    const t0 = Date.now()
    for (let i = 0; i < 5; i++) await utils.seedStyleCard({ createdAt: new Date(t0 - i * 1000) })
    const result = await call(
      styleCardHandlers.feed,
      { limit: 2 },
      { context: utils.testContext() },
    )
    expect(result.items).toHaveLength(2)
    expect(result.nextCursor).toBeTruthy()
  })

  test('nextCursor is null when no more pages', async () => {
    await utils.seedStyleCard()
    await utils.seedStyleCard()
    const result = await call(
      styleCardHandlers.feed,
      { limit: 10 },
      { context: utils.testContext() },
    )
    expect(result.items).toHaveLength(2)
    expect(result.nextCursor).toBeNull()
  })
})

describe('styleCardHandlers.find', () => {
  test('returns an active card', async () => {
    const c = await utils.seedStyleCard()
    const result = await call(
      styleCardHandlers.find,
      { id: c.id },
      { context: utils.testContext() },
    )
    expect(result!.id).toBe(c.id)
  })

  test('returns a retired card (saved-board viewing)', async () => {
    const c = await utils.seedStyleCard({ status: 'retired', retiredAt: new Date() })
    const result = await call(
      styleCardHandlers.find,
      { id: c.id },
      { context: utils.testContext() },
    )
    expect(result!.status).toBe('retired')
  })

  test('returns null for unknown id', async () => {
    const result = await call(
      styleCardHandlers.find,
      { id: crypto.randomUUID() },
      { context: utils.testContext() },
    )
    expect(result).toBeNull()
  })
})

describe('styleCardHandlers.createCard', () => {
  test('creates an active card', async () => {
    const result = await call(
      styleCardHandlers.createCard,
      { imageUrl: 'https://img/new.jpg', sourceAttribution: 'Pinterest' },
      { context: utils.testContext() },
    )
    expect(result.status).toBe('active')
  })
})

describe('styleCardHandlers.retire', () => {
  test('sets status=retired and retiredAt', async () => {
    const c = await utils.seedStyleCard()
    const result = await call(
      styleCardHandlers.retire,
      { id: c.id },
      { context: utils.testContext() },
    )
    expect(result.status).toBe('retired')
    expect(result.retiredAt).toBeInstanceOf(Date)
  })

  test('NOT_FOUND when already retired', async () => {
    const c = await utils.seedStyleCard({ status: 'retired', retiredAt: new Date() })
    await expect(
      call(styleCardHandlers.retire, { id: c.id }, { context: utils.testContext() }),
    ).rejects.toThrow()
  })

  test('NOT_FOUND when id does not exist', async () => {
    await expect(
      call(styleCardHandlers.retire, { id: crypto.randomUUID() }, { context: utils.testContext() }),
    ).rejects.toThrow()
  })

  test('retires a card by id', async () => {
    await utils.resetTestDb()
    await utils.seedUser()
    const c = await utils.seedStyleCard()
    const result = await call(
      styleCardHandlers.retire,
      { id: c.id },
      { context: utils.testContext() },
    )
    expect(result.status).toBe('retired')
  })
})
