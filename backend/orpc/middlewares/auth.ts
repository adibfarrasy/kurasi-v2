import { ORPCError } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { user as userTable } from '../../db/schema'
import { base } from '../orpc-base'

export const authMiddleware = base
  .errors({
    UNAUTHORIZED: {
      status: 401,
    },
  })
  .middleware(async ({ context, next }) => {
    // Dev bypass: when DEV_USER_ID is set, skip session lookup and resolve
    // the user directly by id. Used by `bun backend/seed.ts` workflows so
    // frontend slicing doesn't require an OAuth round-trip.
    const devUserId = process.env.DEV_USER_ID
    if (devUserId) {
      const rows = await context.db.select().from(userTable).where(eq(userTable.id, devUserId))
      const devUser = rows[0]
      if (!devUser) {
        throw new ORPCError('UNAUTHORIZED', {
          message: `DEV_USER_ID=${devUserId} but no such user. Run bun backend/seed.ts.`,
        })
      }
      return next({
        context: {
          session: { id: 'dev-session', userId: devUser.id } as never,
          user: devUser as never,
        },
      })
    }

    const sessionData = await context.auth.api.getSession({ headers: context.reqHeaders })

    if (!sessionData?.session || !sessionData?.user) {
      throw new ORPCError('UNAUTHORIZED', { message: 'You need to be logged in.' })
    }

    return next({
      context: {
        session: sessionData.session,
        user: sessionData.user,
      },
    })
  })
