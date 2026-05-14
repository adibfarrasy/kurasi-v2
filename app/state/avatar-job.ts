import type { NormalizeAvatarProgress } from 'backend/orpc/normalize-avatar-handlers'
import { atom } from 'jotai'

// Tracks the async avatar-generation job kicked off when the user hits
// Continue on onboarding-3. The job runs in the background while the
// user customizes their membership card — by the time they finish
// signing it should ideally be ready, but if not the card page shows
// the loading carousel over the mannequin until it lands.
//
// All cross-screen: onboarding-3 writes `sessionId`, membership-card
// reads `sessionId` + polls + writes back `phase`/`avatarUrl`. A second
// kickoff (user navigates back + reuploads) discards the previous
// session by simply overwriting `sessionId` — the polling effect on
// membership-card keys on sessionId, so it tears down cleanly and
// re-subscribes.

export type AvatarJobPhase = NormalizeAvatarProgress['phase']

export const avatarJobSessionIdAtom = atom<string | null>(null)
export const avatarJobPhaseAtom = atom<AvatarJobPhase | null>(null)
export const avatarJobResultUrlAtom = atom<string | null>(null)
export const avatarJobErrorAtom = atom<string | null>(null)
// Records the face URI the in-flight (or last completed) session was
// started with. Used by onboarding-3 to detect "user retook their photo
// → discard previous session" without restarting the job needlessly when
// they navigate back-and-forth without changing the photo.
export const avatarJobSourceUriAtom = atom<string | null>(null)

/**
 * Reset everything to a clean slate. Call before kicking off a fresh job
 * (e.g. user backed up to retake their photo).
 */
export const resetAvatarJobAtom = atom(null, (_get, set) => {
  set(avatarJobSessionIdAtom, null)
  set(avatarJobPhaseAtom, null)
  set(avatarJobResultUrlAtom, null)
  set(avatarJobErrorAtom, null)
  set(avatarJobSourceUriAtom, null)
})
