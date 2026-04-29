// Spec: specs/style-board.allium
//
// StyleTag CRUD. Listing is open to every authenticated user (tags power the
// feed display); creating is admin-only. Tag retirement is not specified, so
// we don't expose delete here — admins can simply stop assigning a tag to
// new cards.

import { ORPCError } from '@orpc/server'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { styleTag } from '../db/schema'
import { requirePermission } from './authed'

const listStyleTags = requirePermission({ permission: { styleTag: ['read'] } }).handler(
  async ({ context }) => {
    const { db } = context
    return db.select().from(styleTag).orderBy(asc(styleTag.label))
  },
)

const createStyleTag = requirePermission({ permission: { styleTag: ['admin-manage'] } })
  .input(
    z.object({
      label: z.string().min(1),
      category: z.enum(['aesthetic', 'color', 'silhouette', 'occasion', 'season']),
    }),
  )
  .handler(async ({ context, input }) => {
    const { db } = context
    const existing = await db.select().from(styleTag).where(eq(styleTag.label, input.label))
    if (existing[0]) {
      throw new ORPCError('CONFLICT', { message: 'Style tag label already exists' })
    }
    const inserted = await db
      .insert(styleTag)
      .values({ label: input.label, category: input.category })
      .returning()
    const tag = inserted[0]
    if (!tag) {
      throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'Failed to create tag' })
    }
    return tag
  })

export const styleTagHandlers = {
  list: listStyleTags,
  create: createStyleTag,
}
