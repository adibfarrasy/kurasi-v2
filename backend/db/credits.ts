import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth-schema.gen'

// Aligned to specs/credits.allium.

// CreditAccount — one row per user (userId UNIQUE). Cascade delete via the
// CascadeUserDeletionToCredits rule.
export const creditAccount = pgTable('credit_account', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  balance: integer('balance').notNull().default(0),
  // Anchor for the weekly subscription drip rule (see
  // GrantWeeklySubscriptionCredits). Initialised to
  // (now - weekly_grant_period) on account creation so the first eligible
  // grant fires immediately on subscription.
  lastWeeklyGrantAt: timestamp('last_weekly_grant_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .$onUpdate(() => new Date())
    .notNull()
    .defaultNow(),
})

// CreditGrant — append-only audit log of every grant (signup, subscription
// drip, purchase). Source is queryable so support can answer "where did
// these credits come from?".
export const creditGrant = pgTable(
  'credit_grant',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    source: text('source', {
      enum: ['signup', 'weekly_subscription', 'purchase'],
    }).notNull(),
    grantedAt: timestamp('granted_at').notNull().defaultNow(),
  },
  (table) => [index('credit_grant_userId_idx').on(table.userId)],
)

// CreditHold — reserve-then-debit lifecycle. ReserveCredits decrements the
// account balance and inserts a row with status='held'. CommitHold flips
// to 'committed' (debit is permanent). ReleaseHold flips to 'released' and
// restores the held amount to the account balance.
//
// Held holds are the only ones the system acts on; committed/released rows
// are retained for audit.
export const creditHold = pgTable(
  'credit_hold',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    operation: text('operation', {
      enum: ['steal_the_look', 'upload_wardrobe_image'],
    }).notNull(),
    status: text('status', {
      enum: ['held', 'committed', 'released'],
    })
      .notNull()
      .default('held'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    committedAt: timestamp('committed_at'),
    releasedAt: timestamp('released_at'),
  },
  (table) => [index('credit_hold_userId_idx').on(table.userId)],
)
