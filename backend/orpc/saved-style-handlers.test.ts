import { beforeEach, describe, expect, test } from 'bun:test'
import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { savedStyle, styleInteraction } from '../db/schema'
import * as utils from '../test/utils'
import { savedStyleHandlers } from './saved-style-handlers'

beforeEach(async () => {
  await utils.resetTestDb()
  await utils.seedUser()
})

describe('savedStyleHandlers.list', () => {
  test('returns only the caller’s saved rows with card + tags', async () => {
    const card = await utils.seedStyleCard()
    const tag = await utils.seedStyleTag()
    await utils.seedStyleCardTag(card.id, tag.id)
    await utils.seedSavedStyle({ userId: 'user-a', cardId: card.id })
    await utils.seedUser({ id: 'user-b', email: 'user-b@example.com' })
    await utils.seedSavedStyle({ userId: 'user-b', cardId: card.id })
    await utils.loginAsUser('user-a')
    const result = await call(savedStyleHandlers.list, undefined as never, {
      context: utils.testContext(),
    })
    expect(result).toHaveLength(1)
    expect(result[0]!.card.id).toBe(card.id)
    expect(result[0]!.card.tags).toHaveLength(1)
  })

  test('orders by savedAt desc', async () => {
    const a = await utils.seedStyleCard()
    const b = await utils.seedStyleCard()
    await utils.seedSavedStyle({ cardId: a.id, savedAt: new Date(2025, 0, 1) })
    await utils.seedSavedStyle({ cardId: b.id, savedAt: new Date(2026, 0, 1) })
    const result = await call(savedStyleHandlers.list, undefined as never, {
      context: utils.testContext(),
    })
    expect(result.map((s) => s.card.id)).toEqual([b.id, a.id])
  })

  test('returns empty array when user has no saves', async () => {
    const result = await call(savedStyleHandlers.list, undefined as never, {
      context: utils.testContext(),
    })
    expect(result).toEqual([])
  })

  test('includes retired cards in the list', async () => {
    const c = await utils.seedStyleCard({ status: 'retired', retiredAt: new Date() })
    await utils.seedSavedStyle({ cardId: c.id })
    const result = await call(savedStyleHandlers.list, undefined as never, {
      context: utils.testContext(),
    })
    expect(result).toHaveLength(1)
    expect(result[0]!.card.status).toBe('retired')
  })
})

describe('savedStyleHandlers.remove', () => {
  test('deletes only the SavedStyle; StyleInteraction(like) stays', async () => {
    const c = await utils.seedStyleCard()
    await utils.seedStyleInteraction({ userId: 'user-a', cardId: c.id, kind: 'liked' })
    await utils.seedSavedStyle({ userId: 'user-a', cardId: c.id })
    const result = await call(
      savedStyleHandlers.remove,
      { cardId: c.id },
      { context: utils.testContext() },
    )
    expect(result).toBe(true)
    const saves = await utils.db.select().from(savedStyle).where(eq(savedStyle.cardId, c.id))
    const interactions = await utils.db
      .select()
      .from(styleInteraction)
      .where(eq(styleInteraction.cardId, c.id))
    expect(saves).toHaveLength(0)
    expect(interactions).toHaveLength(1)
  })

  test('NOT_FOUND when not saved', async () => {
    const c = await utils.seedStyleCard()
    await expect(
      call(savedStyleHandlers.remove, { cardId: c.id }, { context: utils.testContext() }),
    ).rejects.toThrow()
  })

  test('does not delete another user’s save', async () => {
    const c = await utils.seedStyleCard()
    await utils.seedUser({ id: 'user-b', email: 'user-b@example.com' })
    await utils.seedSavedStyle({ userId: 'user-b', cardId: c.id })
    await utils.loginAsUser('user-a')
    await expect(
      call(savedStyleHandlers.remove, { cardId: c.id }, { context: utils.testContext() }),
    ).rejects.toThrow()
  })
})
