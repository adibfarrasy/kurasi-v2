import { atom } from 'jotai'

// In-memory profile selected during onboarding wheels — read by the
// membership-card screen so it can render the user's choices on the card.
// Kept separate from `capturedFaceAtom` (face-capture.ts) since the face
// is captured asynchronously via a separate route, while these are picked
// inline on onboarding-3.

export type Gender = 'Male' | 'Female'

export const genderAtom = atom<Gender>('Male')
export const heightAtom = atom<number>(165)
export const weightAtom = atom<number>(62)
