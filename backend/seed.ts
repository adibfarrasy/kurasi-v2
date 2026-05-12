/**
 * Dev seed script — currently a no-op stub for the dev user.
 *
 * Usage:
 *   bun backend/seed.ts        (or: task seed:local)
 *
 * The user row is created by better-auth on first Google sign-in (the
 * `user.create.after` hook also creates the onboarding_progress and
 * credit_account rows). Credits are now acquired through the in-app
 * purchase flow (mocked via credit.purchase) or the 15-credit signup
 * grant fired by onboarding.complete — no need to seed a starting
 * balance.
 *
 * Keeping the script (and the task entry) so we have a place to add
 * future per-user fixture setup. To reset onboarding state, see
 * `task reset-onboarding:local`. To zero out credits, see
 * `task reset-credits:local`.
 */

import { eq } from 'drizzle-orm'
import { db } from './db/db'
import { user } from './db/schema'

const userEmail = 'adibfarrasy@gmail.com'

const existing = await db.select().from(user).where(eq(user.email, userEmail))
const seedUser = existing[0]

if (!seedUser) {
  console.log(`No user found with email ${userEmail}.`)
  console.log('Sign in with Google in the app first.')
  process.exit(0)
}

console.log(`User ${seedUser.email} (${seedUser.id}) exists — nothing to seed.`)
process.exit(0)
