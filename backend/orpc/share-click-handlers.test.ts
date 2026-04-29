import { beforeEach, describe, expect, test } from 'bun:test'
import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { shareClick } from '../db/schema'
import * as utils from '../test/utils'
import { attributeClickToUser, shareClickHandlers } from './share-click-handlers'

beforeEach(async () => {
  await utils.resetTestDb()
  await utils.seedUser()
})

describe('shareClickHandlers.record (public endpoint)', () => {
  test('inserts a click with referredUserId=null on active card', async () => {
    utils.setTestUser(null)
    const c = await utils.seedShareableCard()
    const result = await call(
      shareClickHandlers.record,
      { cardId: c.id, platform: 'instagram_story' } as never,
      { context: utils.testContext() },
    )
    expect(result.click).toMatchObject({
      cardId: c.id,
      platform: 'instagram_story',
      referredUserId: null,
    })
    expect(result.card.id).toBe(c.id)
  })

  test('rejects on expired card', async () => {
    utils.setTestUser(null)
    const c = await utils.seedShareableCard({ status: 'expired' })
    await expect(
      call(shareClickHandlers.record, { cardId: c.id, platform: 'twitter' } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
  })

  test('NOT_FOUND on unknown card', async () => {
    utils.setTestUser(null)
    await expect(
      call(
        shareClickHandlers.record,
        { cardId: crypto.randomUUID(), platform: 'clipboard' } as never,
        { context: utils.testContext() },
      ),
    ).rejects.toThrow()
  })

  test('works even when user session is present (still public)', async () => {
    await utils.seedUser({ id: 'user-b', email: 'user-b@example.com' })
    const c = await utils.seedShareableCard({ userId: 'user-b' })
    await utils.loginAsUser('user-a')
    const result = await call(
      shareClickHandlers.record,
      { cardId: c.id, platform: 'snapchat' } as never,
      { context: utils.testContext() },
    )
    expect(result.click!.platform).toBe('snapchat')
  })
})

describe('shareClickHandlers.analytics', () => {
  test('aggregates click counts per platform for caller-owned card', async () => {
    const c = await utils.seedShareableCard()
    await utils.seedShareClick({ cardId: c.id, platform: 'tiktok' })
    await utils.seedShareClick({ cardId: c.id, platform: 'tiktok' })
    await utils.seedShareClick({ cardId: c.id, platform: 'twitter' })
    const result = await call(shareClickHandlers.analytics, { cardId: c.id } as never, {
      context: utils.testContext(),
    })
    expect(result.total).toBe(3)
    expect(result.byPlatform.tiktok).toBe(2)
    expect(result.byPlatform.twitter).toBe(1)
    expect(result.byPlatform.snapchat).toBe(0)
  })

  test('rejects when card not owned by caller', async () => {
    await utils.seedUser({ id: 'user-b', email: 'user-b@example.com' })
    const c = await utils.seedShareableCard({ userId: 'user-b' })
    await utils.seedShareClick({ cardId: c.id })
    await utils.loginAsUser('user-a')
    await expect(
      call(shareClickHandlers.analytics, { cardId: c.id } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
  })

  test('returns zeros for card with no clicks', async () => {
    const c = await utils.seedShareableCard()
    const result = await call(shareClickHandlers.analytics, { cardId: c.id } as never, {
      context: utils.testContext(),
    })
    expect(result.total).toBe(0)
    expect(result.byPlatform.tiktok).toBe(0)
  })
})

describe('attributeClickToUser helper', () => {
  test('sets referredUserId on the given click', async () => {
    const click = await utils.seedShareClick({ referredUserId: null })
    await attributeClickToUser(click.id, 'user-a', utils.db as never)
    const [row] = await utils.db.select().from(shareClick).where(eq(shareClick.id, click.id))
    expect(row!.referredUserId).toBe('user-a')
  })

  test('no-op when click id does not exist', async () => {
    await attributeClickToUser(crypto.randomUUID(), 'user-a', utils.db as never)
    const rows = await utils.db.select().from(shareClick)
    expect(rows).toEqual([])
  })
})
