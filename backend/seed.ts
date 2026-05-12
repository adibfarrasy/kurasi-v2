/**
 * Dev seed script — tops up the dev user's AI credit balance for testing.
 *
 * Usage:
 *   bun backend/seed.ts        (or: task seed:local)
 *
 * Keyed by email. The dev user must have signed in with Google at least
 * once so better-auth has created the user row. If no row exists yet, the
 * seed prints a hint and exits without writing anything.
 *
 * Ad-hoc top-up without re-seeding:
 *   psql $DATABASE_URL -c "update credit_account set balance = balance + 100
 *     where user_id = (select id from \"user\" where email='adibfarrasy@gmail.com')"
 */

import { eq } from 'drizzle-orm'
import { db } from './db/db'
import { creditAccount, user } from './db/schema'

const userEmail = 'adibfarrasy@gmail.com'
const SEED_BALANCE = 1000
const WEEKLY_GRANT_PERIOD_MS = 7 * 24 * 60 * 60 * 1000

const existing = await db.select().from(user).where(eq(user.email, userEmail))
const seedUser = existing[0]

if (!seedUser) {
  console.log(`No user found with email ${userEmail}.`)
  console.log('Sign in with Google in the app first, then re-run the seed.')
  process.exit(0)
}

console.log(`Reusing user ${seedUser.email} (${seedUser.id})`)

// Credit account — upsert balance to SEED_BALANCE. Anchor weekly drip in
// the past so the first subscription grant (if/when they subscribe) fires
// immediately on the next eligibility check.
const weeklyAnchor = new Date(Date.now() - WEEKLY_GRANT_PERIOD_MS)
await db
  .insert(creditAccount)
  .values({
    userId: seedUser.id,
    balance: SEED_BALANCE,
    lastWeeklyGrantAt: weeklyAnchor,
  })
  .onConflictDoUpdate({
    target: creditAccount.userId,
    set: { balance: SEED_BALANCE, lastWeeklyGrantAt: weeklyAnchor },
  })

console.log(`  → credit balance set to ${SEED_BALANCE}`)
console.log('Seed complete.')
process.exit(0)
