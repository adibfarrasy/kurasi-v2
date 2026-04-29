import { expoClient } from '@better-auth/expo/client'
import type { auth } from 'backend/auth'
import { inferAdditionalFields } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import Constants from 'expo-constants'
import * as SecureStore from 'expo-secure-store'
import { cachedSessionPlugin } from './cached-session-plugin'

const storagePrefix = Constants.expoConfig?.scheme as string

export const authClient = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  plugins: [
    inferAdditionalFields<typeof auth>(),
    expoClient({
      scheme: storagePrefix,
      storagePrefix,
      storage: SecureStore,
    }),
    cachedSessionPlugin({ storagePrefix }),
  ],
})
