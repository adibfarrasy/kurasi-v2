import { createORPCClient, createSafeClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { RouterClient } from '@orpc/server'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'
import type { router } from 'backend/orpc/orpc-router'
import { env } from '@/env'
import { authClient } from '@/lib/auth-client'

const link = new RPCLink({
  url: `${env.EXPO_PUBLIC_API_URL}/rpc`,
  // On React Native, better-auth's expo plugin stores the session cookie in
  // SecureStore — `credentials: 'include'` doesn't pull it onto the
  // request the way browser cookies would. Pull the cookie via
  // `authClient.getCookie()` and attach it to the `Cookie` header so the
  // backend's better-auth session middleware can resolve the user.
  fetch: (request, init) => {
    const cookie = authClient.getCookie()
    if (!cookie) return fetch(request, { ...init, credentials: 'include' })
    const headers = new Headers(request.headers)
    headers.set('Cookie', cookie)
    const authed = new Request(request, { headers })
    return fetch(authed, { ...init, credentials: 'include' })
  },
})

export const client: RouterClient<typeof router> = createORPCClient(link)
export const safeClient = createSafeClient(client)

export const orpc = createTanstackQueryUtils(client)
