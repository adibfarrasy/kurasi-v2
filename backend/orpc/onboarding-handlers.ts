import { eq } from 'drizzle-orm'
import { onboardingProgress } from '../db/schema'
import { requirePermission } from './authed'

// Spec: specs/onboarding.allium — OnboardingProgress entity (lines 37-59),
// OnboardingFlow surface (lines 159-178).
//
// Every user gets an OnboardingProgress row via a databaseHooks.user.create.after
// hook in backend/auth.ts. This handler returns the caller's row with the three
// derived readiness booleans exposed by the spec surface.

const getOnboarding = requirePermission({ permission: { onboarding: ['read'] } }).handler(
  async ({ context }) => {
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
  },
)

export const onboardingHandlers = {
  get: getOnboarding,
}
