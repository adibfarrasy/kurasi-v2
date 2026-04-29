import { ORPCError } from '@orpc/server'
import z from 'zod'
import type { PermissionStatement } from '../permissions'
import { authMiddleware } from './middlewares/auth'
import { base } from './orpc-base'

export const authed = base.use(authMiddleware)

type PermissionBody = Partial<{
  [K in keyof PermissionStatement]: Array<PermissionStatement[K][number]>
}>
type PermissionArg = { permission: PermissionBody } | { permissions: PermissionBody }

export const requirePermission = (arg: PermissionArg) =>
  authed
    .errors({
      FORBIDDEN: {
        status: 403,
        data: z.any(),
      },
    })
    .use(async ({ context, next }) => {
      const { auth, user } = context
      const permissions = 'permission' in arg ? arg.permission : arg.permissions

      const result = await auth.api.userHasPermission({
        body: {
          permissions,
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
