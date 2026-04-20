import { ORPCError, onError, ValidationError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import * as z from 'zod'
import { clothingItemHandlers } from './clothing-item-handlers'
import { base } from './orpc-base'

export const router = {
  clothingItem: clothingItemHandlers,
  helloWorld: base.handler(async () => {
    return 'Hello World'
  }),
  createCatImage: base.handler(async () => {}),
}

export const handler = new RPCHandler(router, {
  clientInterceptors: [
    onError((error) => {
      if (
        error instanceof ORPCError &&
        error.code === 'BAD_REQUEST' &&
        error.cause instanceof ValidationError
      ) {
        // If you only use Zod you can safely cast to ZodIssue[]
        const zodError = new z.ZodError(error.cause.issues as z.core.$ZodIssue[])

        throw new ORPCError('INPUT_VALIDATION_FAILED', {
          status: 422,
          message: z.prettifyError(zodError),
          data: z.flattenError(zodError),
          cause: error.cause,
        })
      }
    }),
  ],
})
