/**
 * Reset onboarding for a user so the app re-routes through the onboarding
 * flow on next launch.
 *
 * Usage:
 *   bun --env-file=.env.development.local backend/scripts/reset-onboarding.ts
 *   bun --env-file=.env.development.local backend/scripts/reset-onboarding.ts other@example.com
 *   (or: task reset-onboarding:local -- other@example.com)
 *
 * Email argument is optional; defaults to the dev user.
 *
 * Wipes:
 *   - onboarding_progress: status -> in_progress, all timestamps cleared
 *   - user_biometrics: row deleted (forces re-capture of height/weight/face)
 *   - clothing_item: rows deleted (forces re-completing the starter wardrobe)
 *   - credit_grant (source=signup): deleted (so the 15-credit reward fires
 *     again when onboarding re-completes)
 *
 * The user row, session, and credit_account itself are preserved — only
 * the onboarding artefacts are reset.
 */

import { and, eq } from 'drizzle-orm'
import { db } from '../db/db'
import { clothingItem, creditGrant, onboardingProgress, user, userBiometrics } from '../db/schema'

const DEFAULT_EMAIL = 'adibfarrasy@gmail.com'
const userEmail = process.argv[2] ?? DEFAULT_EMAIL

const existing = await db.select().from(user).where(eq(user.email, userEmail))
const target = existing[0]

if (!target) {
  console.log(`No user found with email ${userEmail}. Nothing to reset.`)
  process.exit(0)
}

console.log(`Resetting onboarding for ${target.email} (${target.id})`)

await db
  .update(onboardingProgress)
  .set({
    status: 'in_progress',
    biometricsCompletedAt: null,
    starterWardrobeCompletedAt: null,
    completedAt: null,
    updatedAt: new Date(),
  })
  .where(eq(onboardingProgress.userId, target.id))

await db.delete(userBiometrics).where(eq(userBiometrics.userId, target.id))
await db.delete(clothingItem).where(eq(clothingItem.userId, target.id))
await db
  .delete(creditGrant)
  .where(and(eq(creditGrant.userId, target.id), eq(creditGrant.source, 'signup')))

console.log('Done. Reload the app and the gate will redirect to /onboarding-1.')
process.exit(0)
