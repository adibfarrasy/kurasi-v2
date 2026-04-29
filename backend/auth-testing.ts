import { betterAuth } from 'better-auth'
import { testUtils } from 'better-auth/plugins'
import { createAuthOptions } from './auth'

export const testAuth = betterAuth(
  createAuthOptions({
    extraPlugins: [testUtils()],
    rateLimit: { enabled: false },
  }),
)
