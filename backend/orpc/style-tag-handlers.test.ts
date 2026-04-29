import { beforeEach, describe, expect, test } from 'bun:test'
import { call } from '@orpc/server'
import * as utils from '../test/utils'
import { styleTagHandlers } from './style-tag-handlers'

beforeEach(async () => {
  await utils.resetTestDb()
  await utils.seedUser()
})

describe('styleTagHandlers.list', () => {
  test('returns all tags', async () => {
    await utils.seedStyleTag({ label: 'zoom' })
    await utils.seedStyleTag({ label: 'alpha' })
    const result = await call(styleTagHandlers.list, undefined as never, {
      context: utils.testContext(),
    })
    expect(result).toHaveLength(2)
    expect(result.map((tag) => tag.label)).toEqual(['alpha', 'zoom'])
  })

  test('returns empty array when no tags', async () => {
    const result = await call(styleTagHandlers.list, undefined as never, {
      context: utils.testContext(),
    })
    expect(result).toEqual([])
  })
})

describe('styleTagHandlers.create', () => {
  test('creates a tag', async () => {
    const result = await call(
      styleTagHandlers.create,
      { label: 'minimalist', category: 'aesthetic' },
      { context: utils.testContext() },
    )
    expect(result.label).toBe('minimalist')
  })

  test('rejects duplicate label with CONFLICT', async () => {
    await utils.seedStyleTag({ label: 'streetwear' })
    await expect(
      call(
        styleTagHandlers.create,
        { label: 'streetwear', category: 'aesthetic' },
        { context: utils.testContext() },
      ),
    ).rejects.toThrow()
  })

  test('creates a tag with a unique label', async () => {
    await utils.resetTestDb()
    await utils.seedUser()
    const result = await call(
      styleTagHandlers.create,
      { label: `tag-${crypto.randomUUID()}`, category: 'aesthetic' },
      { context: utils.testContext() },
    )
    expect(result.category).toBe('aesthetic')
  })

  test('rejects invalid category', async () => {
    await expect(
      call(styleTagHandlers.create, { label: 'x', category: 'bogus' } as never, {
        context: utils.testContext(),
      }),
    ).rejects.toThrow()
  })
})
