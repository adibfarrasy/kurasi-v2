/**
 * Tests for style-tag-handlers.
 *
 * Spec: specs/style-board.allium
 * Code: ./style-tag-handlers.ts
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import { installStyleFakes, resetStore, seedTag, store } from './style-test-helpers'

const { fakeDb, fakeAuth, setUser, setPermissionAllowed } = installStyleFakes()

const { call } = await import('@orpc/server')
const { styleTagHandlers } = await import('./style-tag-handlers')

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

describe('styleTagHandlers.list', () => {
  test('returns all tags', async () => {
    seedTag({ label: 'zoom' })
    seedTag({ label: 'alpha' })
    const result = await call(styleTagHandlers.list, undefined as never, { context: ctx() })
    expect(result).toHaveLength(2)
  })

  test('returns empty array when no tags', async () => {
    const result = await call(styleTagHandlers.list, undefined as never, { context: ctx() })
    expect(result).toEqual([])
  })
})

describe('styleTagHandlers.create (admin)', () => {
  test('creates a tag', async () => {
    const result = await call(
      styleTagHandlers.create,
      { label: 'minimalist', category: 'aesthetic' },
      { context: ctx() },
    )
    expect(result.label).toBe('minimalist')
    expect(store.styleTags).toHaveLength(1)
  })

  test('rejects duplicate label with CONFLICT', async () => {
    seedTag({ label: 'streetwear' })
    await expect(
      call(
        styleTagHandlers.create,
        { label: 'streetwear', category: 'aesthetic' },
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('FORBIDDEN when caller lacks admin-manage', async () => {
    setPermissionAllowed(false)
    await expect(
      call(
        styleTagHandlers.create,
        { label: 'x', category: 'aesthetic' },
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })

  test('rejects invalid category', async () => {
    await expect(
      call(
        styleTagHandlers.create,
        { label: 'x', category: 'bogus' } as never,
        { context: ctx() },
      ),
    ).rejects.toThrow()
  })
})
