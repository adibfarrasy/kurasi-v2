import { ORPCError } from '@orpc/server'
import z from 'zod'
import type { auth } from '../auth'
import { authMiddleware } from './middlewares/auth'
import { base } from './orpc-base'

export const authed = base.use(authMiddleware)

type UserHasPermissionBody = NonNullable<Parameters<typeof auth.api.userHasPermission>[0]>['body']

export const requirePermission = (arg: UserHasPermissionBody) =>
  authed
    .errors({
      FORBIDDEN: {
        status: 403,
        data: z.any(),
      },
    })
    .use(async ({ context, next }) => {
      const { auth, user } = context

      const result = await auth.api.userHasPermission({
        body: {
          ...arg,
          userId: user.id,
        },
      })

      if (!result.success) {
        throw new ORPCError('FORBIDDEN', {
          message: 'You don’t have the permission to access this resource.',
          data: arg,
        })
      }

      return next()
    })
