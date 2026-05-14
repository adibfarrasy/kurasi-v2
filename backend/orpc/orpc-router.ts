import { ORPCError, onError, ValidationError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import * as z from 'zod'
import { addClothesHandlers } from './add-clothes-handlers'
import { biometricsHandlers } from './biometrics-handlers'
import { brandHandlers } from './brand-handlers'
import { clothingItemHandlers } from './clothing-item-handlers'
import { fitAdjustmentHandlers } from './fit-adjustment-handlers'
import { normalizeAvatarHandlers } from './normalize-avatar-handlers'
import { onboardingHandlers } from './onboarding-handlers'
import { outfitHandlers } from './outfit-handlers'
import { outfitRecommendationHandlers } from './outfit-recommendation-handlers'
import { regenerateFitHandlers } from './regenerate-fit-handlers'
import { savedStyleHandlers } from './saved-style-handlers'
import { sharedOutfitHandlers } from './shared-outfit-handlers'
import { stealTheLookHandlers } from './steal-the-look-handlers'
import { styleCardHandlers } from './style-card-handlers'
import { styleInteractionHandlers } from './style-interaction-handlers'
import { subscriptionHandlers } from './subscription-handlers'

export const router = {
  clothingItem: clothingItemHandlers,
  outfit: outfitHandlers,
  biometrics: biometricsHandlers,
  onboarding: onboardingHandlers,
  subscription: subscriptionHandlers,
  styleCard: styleCardHandlers,
  styleInteraction: styleInteractionHandlers,
  savedStyle: savedStyleHandlers,
  fitAdjustment: fitAdjustmentHandlers,
  sharedOutfit: sharedOutfitHandlers,
  outfitRecommendation: outfitRecommendationHandlers,
  stealTheLook: stealTheLookHandlers,
  regenerateFit: regenerateFitHandlers,
  addClothes: addClothesHandlers,
  normalizeAvatar: normalizeAvatarHandlers,
  brand: brandHandlers,
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

      // Without this, any unhandled error becomes a generic "Internal server
      // error" on the client with no server-side trace. Also dump to a file
      // so the trace survives a hot-reload-triggered server restart.
      console.error('[orpc] handler error:', error)
      try {
        const fs = require('node:fs')
        const path = require('node:path')
        const logPath = path.resolve(import.meta.dir, '..', 'outputs', 'orpc-errors.log')
        fs.mkdirSync(path.dirname(logPath), { recursive: true })
        fs.appendFileSync(
          logPath,
          `[${new Date().toISOString()}]\n${
            error instanceof Error
              ? `${error.message}\n${error.stack ?? ''}`
              : JSON.stringify(error)
          }\n\n`,
        )
      } catch {
        // best-effort; don't crash the error handler
      }
    }),
  ],
})
