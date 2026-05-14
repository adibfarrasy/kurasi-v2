import * as ImageManipulator from 'expo-image-manipulator'
import { client } from '@/lib/orpc-client'
import type { Gender } from '@/state/onboarding-profile'

// Kicks off a normalize-avatar job for the given captured photo URI and
// profile. Returns the new sessionId on success. Lives in `lib/` so both
// the onboarding-3 Continue handler and the in-card Retake button can
// reach the same prepare-and-upload pipeline without duplicating the
// image-manipulator + orpc plumbing.

function genderToBackend(g: Gender): 'masc' | 'femme' {
  return g === 'Female' ? 'femme' : 'masc'
}

async function prepareForUpload(uri: string): Promise<string> {
  const ctx = ImageManipulator.ImageManipulator.manipulate(uri).resize({ width: 1024 })
  const ref = await ctx.renderAsync()
  const out = await ref.saveAsync({
    compress: 0.85,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  })
  if (!out.base64) throw new Error('Image manipulator returned no base64')
  return out.base64
}

export type StartAvatarJobInput = {
  faceUri: string
  gender: Gender
  heightCm: number
  weightKg: number
}

export async function startAvatarJob(input: StartAvatarJobInput): Promise<{ sessionId: string }> {
  const base64 = await prepareForUpload(input.faceUri)
  return client.normalizeAvatar.start({
    imageBase64: base64,
    mimeType: 'image/jpeg',
    gender: genderToBackend(input.gender),
    heightCm: input.heightCm,
    weightKg: input.weightKg,
  })
}
