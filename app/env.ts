import { z } from 'zod'

const envSchema = z.object({
  EXPO_PUBLIC_API_URL: z.url(),
})

export const env = envSchema.parse({
  // Expo only inlines public env vars when referenced directly. Unlike the
  // backend, parsing all of process.env can leave these undefined in app bundles.
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
})
