import { and, eq, sql } from 'drizzle-orm'
import { creditAccount, creditGrant, onboardingProgress } from '../db/schema'
import { authed } from './authed'

// Spec: specs/onboarding.allium — OnboardingProgress entity (lines 37-59),
// OnboardingFlow surface (lines 159-178).
// Spec: specs/credits.allium — GrantSignupCredits rule fires when
// onboarding completes.
//
// Every user gets an OnboardingProgress row via a databaseHooks.user.create.after
// hook in backend/auth.ts. This handler returns the caller's row with the three
// derived readiness booleans exposed by the spec surface.

const SIGNUP_GRANT_AMOUNT = 15

const getOnboarding = authed.handler(async ({ context }) => {
  const { db, user } = context
  const rows = await db
    .select()
    .from(onboardingProgress)
    .where(eq(onboardingProgress.userId, user.id))
  const row = rows[0]
  if (!row) {
    // Spec invariant: every active user has exactly one OnboardingProgress.
    // In practice this shouldn't happen post-signup, but we return null
    // rather than throw so clients can degrade gracefully.
    return null
  }
  const biometricsDone = row.biometricsCompletedAt !== null
  const starterWardrobeDone = row.starterWardrobeCompletedAt !== null
  const allStepsDone = biometricsDone && starterWardrobeDone
  return {
    ...row,
    biometricsDone,
    starterWardrobeDone,
    allStepsDone,
  }
})

// Explicit completion — called by the onboarding flow's terminal screen
// ("Sweet! Let's go!") to declare the user has finished, regardless of
// whether biometrics/wardrobe handlers happened to fire along the way.
// Idempotent: re-calling on an already-completed row is a no-op, and the
// signup credit grant is guarded by source='signup' uniqueness per user.
const completeOnboarding = authed.handler(async ({ context }) => {
  const { db, user } = context
  const now = new Date()

  // Flip status. Stamp the step timestamps too so the row reads as
  // intuitively-complete to anyone querying it later, even though we
  // don't enforce the underlying data here.
  await db
    .update(onboardingProgress)
    .set({
      status: 'completed',
      biometricsCompletedAt: sql`coalesce(${onboardingProgress.biometricsCompletedAt}, ${now})`,
      starterWardrobeCompletedAt: sql`coalesce(${onboardingProgress.starterWardrobeCompletedAt}, ${now})`,
      completedAt: sql`coalesce(${onboardingProgress.completedAt}, ${now})`,
      updatedAt: now,
    })
    .where(eq(onboardingProgress.userId, user.id))

  // GrantSignupCredits — idempotent on (user_id, source='signup').
  const existing = await db
    .select({ id: creditGrant.id })
    .from(creditGrant)
    .where(and(eq(creditGrant.userId, user.id), eq(creditGrant.source, 'signup')))
    .limit(1)
  if (existing.length === 0) {
    await db.transaction(async (tx) => {
      await tx
        .update(creditAccount)
        .set({ balance: sql`${creditAccount.balance} + ${SIGNUP_GRANT_AMOUNT}` })
        .where(eq(creditAccount.userId, user.id))
      await tx.insert(creditGrant).values({
        userId: user.id,
        amount: SIGNUP_GRANT_AMOUNT,
        source: 'signup',
      })
    })
    console.log(`[GrantSignupCredits] user=${user.id} amount=${SIGNUP_GRANT_AMOUNT}`)
  }

  return { ok: true }
})

export const onboardingHandlers = {
  get: getOnboarding,
  complete: completeOnboarding,
}
