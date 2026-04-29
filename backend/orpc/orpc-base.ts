import { os } from '@orpc/server'
import z from 'zod'
import type { auth } from '../auth'
import type { db } from '../db/db'

export interface ORPCContext {
  db: typeof db
  auth: typeof auth
  reqHeaders: Headers
}

export const base = os.$context<ORPCContext>().errors({
  // Input validation is Zod like
  INPUT_VALIDATION_FAILED: {
    status: 422,
    data: z.object({
      formErrors: z.array(z.string()),
      fieldErrors: z.record(z.string(), z.array(z.string()).optional()),
    }),
  },
})
