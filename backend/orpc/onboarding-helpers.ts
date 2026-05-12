/**
 * Onboarding helpers.
 *
 * Spec: specs/onboarding.allium — CompleteBiometricsStep, CompleteStarterWardrobeStep,
 * CompleteOnboarding rules.
 * Spec: specs/credits.allium — GrantSignupCredits rule (fires on onboarding
 * completion, not user activation).
 *
 * We fold the spec's event-driven rules directly into the relevant mutation
 * handlers (biometrics.set, clothingItem.create) rather than wiring an event
 * bus. This file exposes:
 *   - STARTER_WARDROBE_THRESHOLD: the min wardrobe size gating step 2.
 *     Spec config (`min_starter_items`) is 3; the product decision (from the
 *     task spec) is 5 — we hardcode 5 here pending a config system.
 *   - maybeCompleteOnboarding(userId): flips status to 'completed' when both
 *     step timestamps are populated AND grants the one-shot 15-credit signup
 *     reward, idempotent via the source='signup' guard.
 */

import { and, eq, isNotNull, sql } from 'drizzle-orm'
import type { db as realDb } from '../db/db'
import { creditAccount, creditGrant, onboardingProgress } from '../db/schema'

export const STARTER_WARDROBE_THRESHOLD = 5

// Spec: specs/credits.allium config.signup_grant. Kept in sync with the
// "15 free AI credits" welcome screen copy.
const SIGNUP_GRANT_AMOUNT = 15

export async function maybeCompleteOnboarding(db: typeof realDb, userId: string): Promise<void> {
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
  if (updated.length === 0) return

  console.log(`[OnboardingCompleted] user=${userId}`)

  // GrantSignupCredits (specs/credits.allium). Idempotent on the (user,
  // source='signup') uniqueness — if a signup grant already exists, the
  // insert is skipped and the balance is unchanged.
  try {
    const existing = await db
      .select({ id: creditGrant.id })
      .from(creditGrant)
      .where(and(eq(creditGrant.userId, userId), eq(creditGrant.source, 'signup')))
      .limit(1)
    if (existing.length > 0) return

    await db.transaction(async (tx) => {
      await tx
        .update(creditAccount)
        .set({ balance: sql`${creditAccount.balance} + ${SIGNUP_GRANT_AMOUNT}` })
        .where(eq(creditAccount.userId, userId))
      await tx.insert(creditGrant).values({
        userId,
        amount: SIGNUP_GRANT_AMOUNT,
        source: 'signup',
      })
    })
    console.log(`[GrantSignupCredits] user=${userId} amount=${SIGNUP_GRANT_AMOUNT}`)
  } catch (e) {
    console.error(`[GrantSignupCredits] failed for user=${userId}`, e)
  }
}
