import { createORPCClient, createSafeClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { RouterClient } from '@orpc/server'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'
import type { router } from 'backend/orpc/orpc-router'
import { env } from '@/env'

const link = new RPCLink({
  url: `${env.EXPO_PUBLIC_API_URL}/rpc`,
  fetch: (request, init) => {
    return fetch(request, { ...init, credentials: 'include' })
  },
})

export const client: RouterClient<typeof router> = createORPCClient(link)
export const safeClient = createSafeClient(client)

export const orpc = createTanstackQueryUtils(client)
