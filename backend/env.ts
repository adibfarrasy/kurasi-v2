import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.url().default('postgresql://postgres:postgres@127.0.0.1:5437/postgres'),
  BETTER_AUTH_SECRET: z.string().default('pjYoNyLj24cwwpr2ybnZem6OVcnGUwDk'),
  BETTER_AUTH_URL: z.url().default('http://localhost:8989'),
  GOOGLE_CLIENT_ID: z.string().default(''), // web client ID (used server-side for OAuth)
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_IOS_CLIENT_ID: z.string().default(''),
  GOOGLE_ANDROID_CLIENT_ID: z.string().default(''),
  APPLE_CLIENT_ID: z.string().default(''),
  APPLE_CLIENT_SECRET: z.string().default(''),
  GEMINI_API_KEY: z.string().default(''),
  FIREMOON_API_KEY: z.string().default(''),
  FAL_KEY: z.string().default(''),
  // Gate for all dev-only conveniences in one place. When 'dev':
  //   - localhost / LAN URLs are re-uploaded to fal storage so models can
  //     fetch them (in prod, those URLs would already be public)
  //   - pipeline intermediates (extracts, refine stages, tryon staged) are
  //     dumped to backend/outputs/ for inspection
  //   - any other "verbose & filesystem-heavy" debug helpers we add later
  // Default to 'production' so a missing env var fails closed.
  ENVIRONMENT: z.enum(['dev', 'production']).default('production'),
})

// Validate server environment
export const env = envSchema.parse(process.env)

export const isDevMode = env.ENVIRONMENT === 'dev'
