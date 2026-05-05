import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { user } from './auth-schema.gen'

// Aligned to specs/onboarding.allium OnboardingProgress entity. One row per
// user (enforced by userId as PK). Auto-created on user signup via
// databaseHooks.user.create.after in backend/auth.ts.
export const onboardingProgress = pgTable('onboarding_progress', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['in_progress', 'completed'] })
    .notNull()
    .default('in_progress'),
  biometricsCompletedAt: timestamp('biometrics_completed_at'),
  starterWardrobeCompletedAt: timestamp('starter_wardrobe_completed_at'),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .$onUpdate(() => new Date())
    .notNull()
    .defaultNow(),
})
