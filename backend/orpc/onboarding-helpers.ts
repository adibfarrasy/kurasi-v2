/**
 * Onboarding helpers.
 *
 * Spec: specs/onboarding.allium — CompleteBiometricsStep, CompleteStarterWardrobeStep,
 * CompleteOnboarding rules.
 *
 * We fold the spec's event-driven rules directly into the relevant mutation
 * handlers (biometrics.set, clothingItem.create) rather than wiring an event
 * bus. This file exposes:
 *   - STARTER_WARDROBE_THRESHOLD: the min wardrobe size gating step 2.
 *     Spec config (`min_starter_items`) is 3; the product decision (from the
 *     task spec) is 5 — we hardcode 5 here pending a config system.
 *   - maybeCompleteOnboarding(userId): flips status to 'completed' when both
 *     step timestamps are populated.
 */

import { and, eq, isNotNull } from 'drizzle-orm'
import type { db as realDb } from '../db/db'
import { onboardingProgress } from '../db/schema'

export const STARTER_WARDROBE_THRESHOLD = 5

export async function maybeCompleteOnboarding(
  db: typeof realDb,
  userId: string,
): Promise<void> {
  const now = new Date()
  const updated = await db
    .update(onboardingProgress)
    .set({ status: 'completed', completedAt: now, updatedAt: now })
    .where(
      and(
        eq(onboardingProgress.userId, userId),
        eq(onboardingProgress.status, 'in_progress'),
        isNotNull(onboardingProgress.biometricsCompletedAt),
        isNotNull(onboardingProgress.starterWardrobeCompletedAt),
      ),
    )
    .returning()
  if (updated.length > 0) {
    // Placeholder event emission — spec rule CompleteOnboarding fires
    // OnboardingCompleted(user) downstream. Replace with real event bus later.
    console.log(`[OnboardingCompleted] user=${userId}`)
  }
}
