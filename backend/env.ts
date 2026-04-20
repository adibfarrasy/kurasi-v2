import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string(),
  BETTER_AUTH_URL: z.url(),
  GOOGLE_CLIENT_ID: z.string().default(''), // web client ID (used server-side for OAuth)
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_IOS_CLIENT_ID: z.string().default(''),
  GOOGLE_ANDROID_CLIENT_ID: z.string().default(''),
  APPLE_CLIENT_ID: z.string().default(''),
  APPLE_CLIENT_SECRET: z.string().default(''),
  GEMINI_API_KEY: z.string().default(''),
  FIREMOON_API_KEY: z.string().default(''),
})

// Validate server environment
export const env = envSchema.parse(process.env)
