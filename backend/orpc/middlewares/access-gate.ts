import { ORPCError, os } from '@orpc/server'
import { eq } from 'drizzle-orm'
import type { auth } from '../../auth'
import type { db as dbType } from '../../db/db'
import { subscription } from '../../db/schema'
import { authMiddleware } from './auth'

// TRIAL_DURATION_DAYS mirrors specs/auth.allium config.trial_duration and
// specs/payments.allium config.trial_duration.
export const TRIAL_DURATION_DAYS = 7
const MS_PER_DAY = 24 * 60 * 60 * 1000

// computeAccess derives (isInTrial, isCurrent, hasAccess) from a user and
// their (optional) subscription row. Shared between the subscription.get
// handler and the access-gate middleware so they never disagree.
//
// Decision: `isInTrial` is "within 7 days of trialStartedAt AND no
// active-or-current subscription". Once a user converts, the trial concept
// falls away — they're either current or not. This avoids a weird edge where
// a freshly-subscribed user in day 3 would show both flags true and the UI
// would have to disambiguate.
export function computeAccess(
  user: { trialStartedAt: Date | null | undefined },
  sub: typeof subscription.$inferSelect | null,
  now: Date = new Date(),
): { isInTrial: boolean; isCurrent: boolean; hasAccess: boolean } {
  const isCurrent = sub ? isSubscriptionCurrent(sub, now) : false
  const hasActiveOrCurrent = sub
    ? sub.status === 'active' || sub.status === 'grace' || isCurrent
    : false
  const trialStart = user.trialStartedAt
  const trialEnd = trialStart
    ? new Date(trialStart.getTime() + TRIAL_DURATION_DAYS * MS_PER_DAY)
    : null
  const inTrialWindow = !!trialEnd && now < trialEnd
  const isInTrial = inTrialWindow && !hasActiveOrCurrent
  return { isInTrial, isCurrent, hasAccess: isInTrial || isCurrent }
}

// is_current formula (specs/payments.allium lines 61-64).
export function isSubscriptionCurrent(
  sub: typeof subscription.$inferSelect,
  now: Date = new Date(),
): boolean {
  if (sub.status === 'active' && now < sub.currentPeriodEnd) return true
  if (sub.status === 'cancelled' && now < sub.currentPeriodEnd) return true
  if (sub.status === 'grace' && sub.graceEndsAt && now < sub.graceEndsAt) return true
  return false
}

// Access gate: authenticated user must be in trial or hold a current
// subscription. Throws PAYMENT_REQUIRED (402) otherwise.
//
// NOT applied to existing handlers — opt-in from per-feature `authed` chains:
//   const gated = authed.use(accessGateMiddleware)
//
// Applying globally would break ongoing dev/tests for users past the trial
// window; wire it per-feature when the paywall is ready.
// Gate is exposed as a fully-chained builder (auth + payment-required error +
// access check) so consumers just do:
//   const gated = accessGate.handler(async ({ context }) => { ... })
// This keeps the middleware self-contained and avoids re-plumbing the auth
// chain at each call site.
interface GateContext {
  db: typeof dbType
  auth: typeof auth
  reqHeaders: Headers
}

export const accessGate = os
  .$context<GateContext>()
  .use(authMiddleware)
  .errors({
    PAYMENT_REQUIRED: { status: 402 },
  })
  .use(async ({ context, next }) => {
    const { db, user } = context
    const rows = await db
      .select()
      .from(subscription)
      .where(eq(subscription.userId, user.id))
    const sub = rows[0] ?? null
    const access = computeAccess(user as { trialStartedAt: Date | null }, sub)
    if (!access.hasAccess) {
      throw new ORPCError('PAYMENT_REQUIRED', {
        message: 'Trial expired and no active subscription.',
      })
    }
    return next({ context: { access } })
  })
