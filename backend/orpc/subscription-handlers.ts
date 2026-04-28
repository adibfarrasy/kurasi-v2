// Spec: specs/payments.allium
//
// Provider-agnostic. No Stripe / Apple IAP SDK. `providerRef` is an opaque
// column to be filled in by a future webhook handler.
//
// In production, renewSuccess / renewFailure are called from the payment
// provider webhook after signature verification. For now they're oRPC
// handlers for testing. lapseAfterGrace is cron-like: production runs it on
// a schedule; it's exposed here as an admin-only handler.

import { ORPCError } from '@orpc/server'
import { and, eq, lt } from 'drizzle-orm'
import { z } from 'zod'
import { subscription } from '../db/schema'
import { requirePermission } from './authed'
import { computeAccess } from './middlewares/access-gate'

const BILLING_PERIOD_DAYS = 30
const GRACE_PERIOD_DAYS = 3
const MS_PER_DAY = 24 * 60 * 60 * 1000

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_PER_DAY)
}

const getSubscription = requirePermission({ permission: { subscription: ['read'] } }).handler(
  async ({ context }) => {
    const { db, user } = context
    const rows = await db
      .select()
      .from(subscription)
      .where(eq(subscription.userId, user.id))
    const sub = rows[0] ?? null
    const access = computeAccess(user as { trialStartedAt: Date | null }, sub)
    return {
      subscription: sub,
      isInTrial: access.isInTrial,
      isCurrent: access.isCurrent,
      hasAccess: access.hasAccess,
    }
  },
)

// StartSubscription (rule, specs/payments.allium lines 88-100).
// Requires: no existing subscription for the user.
// Ensures: new active row, current_period_end = now + 30d.
// providerRef optional so a future webhook path can seed it.
const startSubscription = requirePermission({ permission: { subscription: ['start'] } })
  .input(z.object({ providerRef: z.string().optional() }).optional())
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const existing = await db
      .select()
      .from(subscription)
      .where(eq(subscription.userId, user.id))
    if (existing[0]) {
      throw new ORPCError('CONFLICT', {
        message: 'Subscription already exists for user',
      })
    }
    const now = new Date()
    const result = await db
      .insert(subscription)
      .values({
        userId: user.id,
        interval: 'monthly',
        status: 'active',
        startedAt: now,
        currentPeriodEnd: addDays(now, BILLING_PERIOD_DAYS),
        providerRef: input?.providerRef ?? null,
      })
      .returning()
    return result[0]
  })

// CancelSubscription (rule, specs/payments.allium lines 159-172).
// Requires: status in {active, grace}. Access persists until current_period_end
// per spec comment (lines 156-158).
const cancelSubscription = requirePermission({ permission: { subscription: ['cancel'] } }).handler(
  async ({ context }) => {
    const { db, user } = context
    const existing = await db
      .select()
      .from(subscription)
      .where(eq(subscription.userId, user.id))
    const sub = existing[0]
    if (!sub) {
      throw new ORPCError('NOT_FOUND', { message: 'No subscription to cancel' })
    }
    if (sub.status !== 'active' && sub.status !== 'grace') {
      throw new ORPCError('BAD_REQUEST', {
        message: `Cannot cancel subscription in status ${sub.status}`,
      })
    }
    const now = new Date()
    const result = await db
      .update(subscription)
      .set({
        status: 'cancelled',
        cancelledAt: now,
        // If cancelling from grace, clear grace markers (RecoverFromGrace
        // parallel: we're exiting the grace window either way).
        graceStartedAt: null,
        graceEndsAt: null,
        updatedAt: now,
      })
      .where(eq(subscription.userId, user.id))
      .returning()
    return result[0]
  },
)

// RenewSubscription (rule, specs/payments.allium lines 103-109) and
// RecoverFromGrace (rule, lines 125-133) collapsed into one "renewal payment
// succeeded" webhook path. Extends period, and if we were in grace, moves
// back to active and nulls grace fields.
const renewSuccess = requirePermission({ permission: { subscription: ['renew'] } }).handler(
  async ({ context }) => {
    const { db, user } = context
    const existing = await db
      .select()
      .from(subscription)
      .where(eq(subscription.userId, user.id))
    const sub = existing[0]
    if (!sub) {
      throw new ORPCError('NOT_FOUND', { message: 'No subscription' })
    }
    if (sub.status !== 'active' && sub.status !== 'grace') {
      throw new ORPCError('BAD_REQUEST', {
        message: `Cannot renew subscription in status ${sub.status}`,
      })
    }
    const now = new Date()
    // Spec for renewal: current_period_end += billing_period.
    // Spec for recovery: current_period_end = now + billing_period.
    // For renewals coming in before the period end (usually they arrive
    // exactly at the boundary), extending from the existing end avoids
    // silently shortening a user's paid window.
    const base = sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now
    const newEnd = addDays(base, BILLING_PERIOD_DAYS)
    const result = await db
      .update(subscription)
      .set({
        status: 'active',
        currentPeriodEnd: newEnd,
        graceStartedAt: null,
        graceEndsAt: null,
        updatedAt: now,
      })
      .where(eq(subscription.userId, user.id))
      .returning()
    return result[0]
  },
)

// EnterGraceOnFailedRenewal (rule, specs/payments.allium lines 114-122).
const renewFailure = requirePermission({ permission: { subscription: ['renew'] } }).handler(
  async ({ context }) => {
    const { db, user } = context
    const existing = await db
      .select()
      .from(subscription)
      .where(eq(subscription.userId, user.id))
    const sub = existing[0]
    if (!sub) {
      throw new ORPCError('NOT_FOUND', { message: 'No subscription' })
    }
    if (sub.status !== 'active') {
      throw new ORPCError('BAD_REQUEST', {
        message: `Cannot enter grace from status ${sub.status}`,
      })
    }
    const now = new Date()
    const result = await db
      .update(subscription)
      .set({
        status: 'grace',
        graceStartedAt: now,
        graceEndsAt: addDays(now, GRACE_PERIOD_DAYS),
        updatedAt: now,
      })
      .where(eq(subscription.userId, user.id))
      .returning()
    return result[0]
  },
)

// LapseAfterGrace (rule, specs/payments.allium lines 136-144).
// In production this runs on a cron. Exposed here as an admin-only handler
// for testability. Admin/owner only via subscription.admin-lapse.
const lapseAfterGrace = requirePermission({
  permission: { subscription: ['admin-lapse'] },
}).handler(async ({ context }) => {
  const { db } = context
  const now = new Date()
  const result = await db
    .update(subscription)
    .set({
      status: 'lapsed',
      lapsedAt: now,
      graceStartedAt: null,
      graceEndsAt: null,
      updatedAt: now,
    })
    .where(and(eq(subscription.status, 'grace'), lt(subscription.graceEndsAt, now)))
    .returning()
  return { lapsedCount: result.length }
})

export const subscriptionHandlers = {
  get: getSubscription,
  start: startSubscription,
  cancel: cancelSubscription,
  renewSuccess,
  renewFailure,
  lapseAfterGrace,
}
