import { ORPCError } from '@orpc/server'
import { auth } from '../../auth'
import { base } from '../orpc-base'

export const authMiddleware = base
  .errors({
    UNAUTHORIZED: {
      status: 401,
    },
  })
  .middleware(async ({ context, next }) => {
    const sessionData = await auth.api.getSession({ headers: context.reqHeaders })

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
