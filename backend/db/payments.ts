import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth-schema.gen'

// Aligned to specs/payments.allium Subscription entity.
// One row per user (enforced by userId UNIQUE). Cascade delete covers the
// CascadeUserDeletionToSubscription rule. Provider ID is opaque — Stripe
// subscription id / Apple IAP transaction id — and null in tests.
export const subscription = pgTable('subscription', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  interval: text('interval', { enum: ['monthly'] })
    .notNull()
    .default('monthly'),
  status: text('status', { enum: ['active', 'grace', 'cancelled', 'lapsed'] }).notNull(),
  startedAt: timestamp('started_at').notNull(),
  currentPeriodEnd: timestamp('current_period_end').notNull(),
  cancelledAt: timestamp('cancelled_at'),
  lapsedAt: timestamp('lapsed_at'),
  graceStartedAt: timestamp('grace_started_at'),
  graceEndsAt: timestamp('grace_ends_at'),
  providerRef: text('provider_ref'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .$onUpdate(() => new Date())
    .notNull()
    .defaultNow(),
})
