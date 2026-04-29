import { ORPCError } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { onboardingProgress, userBiometrics } from '../db/schema'
import { userBiometricsInsertSchema } from '../zod-schemas'
import { requirePermission } from './authed'
import { maybeCompleteOnboarding } from './onboarding-helpers'

// Spec: specs/fit-page.allium — UserBiometrics (lines 70-76),
// SetBiometrics (lines 132-154), RemoveFacePhoto (lines 156-162).

const getBiometrics = requirePermission({ permission: { userBiometrics: ['read'] } }).handler(
  async ({ context }) => {
    const { db, user } = context
    const rows = await db.select().from(userBiometrics).where(eq(userBiometrics.userId, user.id))
    return rows[0] ?? null
  },
)

// SetBiometrics — upsert by userId. One biometrics row per user, so we always
// INSERT ... ON CONFLICT DO UPDATE on the userId PK.
const setBiometrics = requirePermission({ permission: { userBiometrics: ['upsert'] } })
  .input(userBiometricsInsertSchema)
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const now = new Date()
    const result = await db
      .insert(userBiometrics)
      .values({
        userId: user.id,
        heightCm: input.heightCm,
        weightKg: input.weightKg,
        facePhotoUrl: input.facePhotoUrl ?? null,
      })
      .onConflictDoUpdate({
        target: userBiometrics.userId,
        set: {
          heightCm: input.heightCm,
          weightKg: input.weightKg,
          facePhotoUrl: input.facePhotoUrl ?? null,
          updatedAt: now,
        },
      })
      .returning()

    // CompleteBiometricsStep (specs/onboarding.allium lines 87-94): on the
    // first biometrics write, stamp the onboarding row's biometrics step and
    // then check whether onboarding as a whole is done.
    const progressRows = await db
      .select()
      .from(onboardingProgress)
      .where(eq(onboardingProgress.userId, user.id))
    const progress = progressRows[0]
    if (progress && progress.biometricsCompletedAt === null) {
      await db
        .update(onboardingProgress)
        .set({ biometricsCompletedAt: now, updatedAt: now })
        .where(eq(onboardingProgress.userId, user.id))
      await maybeCompleteOnboarding(db, user.id)
    }

    return result[0]
  })

// RemoveFacePhoto — spec requires face_photo_url != null; NOT_FOUND when no
// biometrics row exists, BAD_REQUEST when already null.
const removeFacePhoto = requirePermission({
  permission: { userBiometrics: ['delete-photo'] },
}).handler(async ({ context }) => {
  const { db, user } = context
  const existing = await db.select().from(userBiometrics).where(eq(userBiometrics.userId, user.id))
  const row = existing[0]
  if (!row) {
    throw new ORPCError('NOT_FOUND', { message: 'Biometrics not set' })
  }
  if (row.facePhotoUrl === null) {
    throw new ORPCError('BAD_REQUEST', { message: 'Face photo is already not set' })
  }
  const result = await db
    .update(userBiometrics)
    .set({ facePhotoUrl: null, updatedAt: new Date() })
    .where(eq(userBiometrics.userId, user.id))
    .returning()
  return result[0]
})

export const biometricsHandlers = {
  get: getBiometrics,
  set: setBiometrics,
  removePhoto: removeFacePhoto,
}
