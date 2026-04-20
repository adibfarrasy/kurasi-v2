import type { BetterAuthClientPlugin } from 'better-auth/client'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { z } from 'zod'

const cachedSessionSchema = z.looseObject({
  session: z.looseObject({
    id: z.string(),
    userId: z.string(),
    expiresAt: z.coerce.date().refine((d) => d > new Date(), {
      message: 'Session expired',
    }),
  }),
  user: z.looseObject({
    id: z.string(),
    email: z.string(),
  }),
})

/**
 * Workaround for https://github.com/better-auth/better-auth/issues/1443
 *
 * Better Auth client plugin that pre-populates the session atom from
 * SecureStore cache on startup. This eliminates the flash of the login
 * screen on reload for already-authenticated users.
 *
 * Works because:
 * 1. The expo client already writes session data to SecureStore on every
 *    successful /get-session response, but never reads it back.
 * 2. Plugin getActions runs after the session atom is created but before
 *    React subscribes — so we can set the atom's initial value.
 * 3. The query onRequest handler in better-auth keeps isPending: false
 *    when data is already present, so the cached data stays visible while
 *    the server request validates it in the background.
 */
export function cachedSessionPlugin(opts: { storagePrefix: string }): BetterAuthClientPlugin {
  const cacheKey = `${opts.storagePrefix}_session_data`

  return {
    id: 'cached-session',
    getActions(_fetch, $store) {
      if (Platform.OS === 'web') return {}

      const sessionAtom = $store.atoms.session
      if (!sessionAtom) return {}

      const cached = SecureStore.getItem(cacheKey)
      if (!cached) return {}

      const parsed = cachedSessionSchema.safeParse(JSON.parse(cached))
      if (!parsed.success) return {}

      sessionAtom.set({
        ...sessionAtom.get(),
        data: parsed.data,
        isPending: false,
      })

      return {}
    },
  }
}
