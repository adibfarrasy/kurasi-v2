import { ORPCError, onError, ValidationError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import * as z from 'zod'
import { biometricsHandlers } from './biometrics-handlers'
import { clothingItemHandlers } from './clothing-item-handlers'
import { fitAdjustmentHandlers } from './fit-adjustment-handlers'
import { onboardingHandlers } from './onboarding-handlers'
import { outfitHandlers } from './outfit-handlers'
import { outfitRecommendationHandlers } from './outfit-recommendation-handlers'
import { savedStyleHandlers } from './saved-style-handlers'
import { shareClickHandlers } from './share-click-handlers'
import { shareEventHandlers } from './share-event-handlers'
import { shareableCardHandlers } from './shareable-card-handlers'
import { sharedOutfitHandlers } from './shared-outfit-handlers'
import { styleCardHandlers } from './style-card-handlers'
import { styleInteractionHandlers } from './style-interaction-handlers'
import { styleTagHandlers } from './style-tag-handlers'
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
  styleTag: styleTagHandlers,
  fitAdjustment: fitAdjustmentHandlers,
  sharedOutfit: sharedOutfitHandlers,
  outfitRecommendation: outfitRecommendationHandlers,
  shareableCard: shareableCardHandlers,
  shareEvent: shareEventHandlers,
  shareClick: shareClickHandlers,
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
