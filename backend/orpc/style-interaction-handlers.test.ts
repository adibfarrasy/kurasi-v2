import { beforeEach, describe, expect, test } from 'bun:test'
import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { savedStyle, styleInteraction } from '../db/schema'
import * as utils from '../test/utils'
import { styleInteractionHandlers } from './style-interaction-handlers'

beforeEach(async () => {
  await utils.resetTestDb()
  await utils.seedUser()
})

describe('styleInteractionHandlers.like', () => {
  test('creates interaction(liked) + saved rows atomically', async () => {
    const c = await utils.seedStyleCard()
    const result = await call(
      styleInteractionHandlers.like,
      { cardId: c.id },
      { context: utils.testContext() },
    )
    expect(result.interaction.kind).toBe('liked')
    expect(result.saved!.cardId).toBe(c.id)
    const interactions = await utils.db.select().from(styleInteraction)
    const saves = await utils.db.select().from(savedStyle)
    expect(interactions).toHaveLength(1)
    expect(saves).toHaveLength(1)
  })

  test('idempotent: liking an already-liked card returns existing rows', async () => {
    const c = await utils.seedStyleCard()
    await call(styleInteractionHandlers.like, { cardId: c.id }, { context: utils.testContext() })
    const second = await call(
      styleInteractionHandlers.like,
      { cardId: c.id },
      { context: utils.testContext() },
    )
    expect(second.interaction.kind).toBe('liked')
    expect(await utils.db.select().from(styleInteraction)).toHaveLength(1)
    expect(await utils.db.select().from(savedStyle)).toHaveLength(1)
  })

  test('liking after skipping is rejected (interactions are permanent)', async () => {
    const c = await utils.seedStyleCard()
    await utils.seedStyleInteraction({ userId: 'user-a', cardId: c.id, kind: 'skipped' })
    await expect(
      call(styleInteractionHandlers.like, { cardId: c.id }, { context: utils.testContext() }),
    ).rejects.toThrow()
  })

  test('rejects liking a retired card', async () => {
    const c = await utils.seedStyleCard({ status: 'retired', retiredAt: new Date() })
    await expect(
      call(styleInteractionHandlers.like, { cardId: c.id }, { context: utils.testContext() }),
    ).rejects.toThrow()
  })

  test('NOT_FOUND for unknown cardId', async () => {
    await expect(
      call(
        styleInteractionHandlers.like,
        { cardId: crypto.randomUUID() },
        { context: utils.testContext() },
      ),
    ).rejects.toThrow()
  })

  test('scopes the save to the caller', async () => {
    const c = await utils.seedStyleCard()
    await utils.seedUser({ id: 'user-b', email: 'user-b@example.com' })
    await call(styleInteractionHandlers.like, { cardId: c.id }, { context: utils.testContext() })
    const [row] = await utils.db.select().from(savedStyle).where(eq(savedStyle.cardId, c.id))
    expect(row!.userId).toBe('user-b')
    await utils.loginAsUser('user-a')
  })
})

describe('styleInteractionHandlers.skip', () => {
  test('creates interaction(skipped) row', async () => {
    const c = await utils.seedStyleCard()
    const result = await call(
      styleInteractionHandlers.skip,
      { cardId: c.id },
      { context: utils.testContext() },
    )
    expect(result.kind).toBe('skipped')
    expect(await utils.db.select().from(styleInteraction)).toHaveLength(1)
    expect(await utils.db.select().from(savedStyle)).toHaveLength(0)
  })

  test('idempotent: double-skip is a no-op', async () => {
    const c = await utils.seedStyleCard()
    await call(styleInteractionHandlers.skip, { cardId: c.id }, { context: utils.testContext() })
    await call(styleInteractionHandlers.skip, { cardId: c.id }, { context: utils.testContext() })
    expect(await utils.db.select().from(styleInteraction)).toHaveLength(1)
  })

  test('skipping after liking is rejected', async () => {
    const c = await utils.seedStyleCard()
    await call(styleInteractionHandlers.like, { cardId: c.id }, { context: utils.testContext() })
    await expect(
      call(styleInteractionHandlers.skip, { cardId: c.id }, { context: utils.testContext() }),
    ).rejects.toThrow()
  })

  test('rejects skipping a retired card', async () => {
    const c = await utils.seedStyleCard({ status: 'retired', retiredAt: new Date() })
    await expect(
      call(styleInteractionHandlers.skip, { cardId: c.id }, { context: utils.testContext() }),
    ).rejects.toThrow()
  })

  test('NOT_FOUND for unknown cardId', async () => {
    await expect(
      call(
        styleInteractionHandlers.skip,
        { cardId: crypto.randomUUID() },
        { context: utils.testContext() },
      ),
    ).rejects.toThrow()
  })
})
