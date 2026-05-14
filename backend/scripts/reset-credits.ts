/**
 * Reset a user's credit balance to 0 (or a custom amount) for testing
 * the insufficient-balance state in the app.
 *
 * Usage:
 *   bun --env-file=.env.development.local backend/scripts/reset-credits.ts
 *   bun --env-file=.env.development.local backend/scripts/reset-credits.ts 5
 *   bun --env-file=.env.development.local backend/scripts/reset-credits.ts other@example.com
 *   bun --env-file=.env.development.local backend/scripts/reset-credits.ts other@example.com 5
 *   (or: task reset-credits:local -- 5)
 *   (or: task reset-credits:local -- other@example.com 5)
 *
 * The first positional arg is either an email or a number. If both are
 * provided, email comes first and amount second. Defaults: dev email, 0.
 */

import { eq } from 'drizzle-orm'
import { db } from '../db/db'
import { creditAccount, user } from '../db/schema'

const DEFAULT_EMAIL = 'adibfarrasy@gmail.com'

const [arg1, arg2] = process.argv.slice(2)
let userEmail = DEFAULT_EMAIL
let targetBalance = 0
// arg1 might be an email (contains '@') or a number. arg2, when present,
// is always the number.
if (arg1 !== undefined) {
  if (arg1.includes('@')) {
    userEmail = arg1
    if (arg2 !== undefined) targetBalance = Number.parseInt(arg2, 10)
  } else {
    targetBalance = Number.parseInt(arg1, 10)
  }
}

if (!Number.isFinite(targetBalance) || targetBalance < 0) {
  console.error(`Invalid balance: ${process.argv[2]} (must be a non-negative integer)`)
  process.exit(1)
}

const existing = await db.select().from(user).where(eq(user.email, userEmail))
const target = existing[0]

if (!target) {
  console.log(`No user found with email ${userEmail}. Nothing to reset.`)
  process.exit(0)
}

const result = await db
  .update(creditAccount)
  .set({ balance: targetBalance, updatedAt: new Date() })
  .where(eq(creditAccount.userId, target.id))
  .returning({ balance: creditAccount.balance })

if (result.length === 0) {
  console.log(`User ${userEmail} has no credit_account row. Run \`task seed:local\` first.`)
  process.exit(0)
}

console.log(`Set credit balance for ${userEmail} → ${result[0]?.balance}`)
process.exit(0)
