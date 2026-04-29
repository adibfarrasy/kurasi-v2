import { beforeEach, describe, expect, test } from 'bun:test'
import { call } from '@orpc/server'
import * as utils from '../test/utils'
import { shareEventHandlers } from './share-event-handlers'

beforeEach(async () => {
  await utils.resetTestDb()
  await utils.seedUser()
})

describe('shareEventHandlers.record', () => {
  test('records a ShareEvent for caller-owned active card', async () => {
    const c = await utils.seedShareableCard()
    const result = await call(
      shareEventHandlers.record,
      { cardId: c.id, platform: 'tiktok' } as never,
      { context: utils.testContext() },
    )
    expect(result).toMatchObject({ cardId: c.id, platform: 'tiktok' })
  })

  test('rejects when card not owned by caller', async () => {
    await utils.seedUser({ id: 'user-b', email: 'user-b@example.com' })
    const c = await utils.seedShareableCard({ userId: 'user-b' })
    await utils.loginAsUser('user-a')
    await expect(
      call(shareEventHandlers.record, { cardId: c.id, platform: 'twitter' } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
  })

  test('rejects when card is expired', async () => {
    const c = await utils.seedShareableCard({ status: 'expired' })
    await expect(
      call(shareEventHandlers.record, { cardId: c.id, platform: 'snapchat' } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
  })

  test('NOT_FOUND when card does not exist', async () => {
    await expect(
      call(
        shareEventHandlers.record,
        { cardId: crypto.randomUUID(), platform: 'clipboard' } as never,
        { context: utils.testContext() },
      ),
    ).rejects.toThrow()
  })

  test('allows multiple platforms for the same card', async () => {
    const c = await utils.seedShareableCard()
    await call(shareEventHandlers.record, { cardId: c.id, platform: 'tiktok' } as never, {
      context: utils.testContext(),
    })
    await call(shareEventHandlers.record, { cardId: c.id, platform: 'instagram_story' } as never, {
      context: utils.testContext(),
    })
    const result = await call(shareEventHandlers.listForCard, { cardId: c.id } as never, {
      context: utils.testContext(),
    })
    expect(result).toHaveLength(2)
  })
})

describe('shareEventHandlers.listForCard', () => {
  test('returns events for caller-owned card', async () => {
    const c = await utils.seedShareableCard()
    await utils.seedShareEvent({ cardId: c.id, platform: 'tiktok' })
    await utils.seedShareEvent({ cardId: c.id, platform: 'twitter' })
    const result = await call(shareEventHandlers.listForCard, { cardId: c.id } as never, {
      context: utils.testContext(),
    })
    expect(result).toHaveLength(2)
  })

  test('rejects when card is not owned by caller', async () => {
    await utils.seedUser({ id: 'user-b', email: 'user-b@example.com' })
    const c = await utils.seedShareableCard({ userId: 'user-b' })
    await utils.seedShareEvent({ cardId: c.id })
    await utils.loginAsUser('user-a')
    await expect(
      call(shareEventHandlers.listForCard, { cardId: c.id } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
  })

  test('returns empty list when no events', async () => {
    const c = await utils.seedShareableCard()
    const result = await call(shareEventHandlers.listForCard, { cardId: c.id } as never, {
      context: utils.testContext(),
    })
    expect(result).toEqual([])
  })

  test('unauthenticated call rejected', async () => {
    const c = await utils.seedShareableCard()
    utils.setTestUser(null)
    await expect(
      call(shareEventHandlers.listForCard, { cardId: c.id } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
  })
})
