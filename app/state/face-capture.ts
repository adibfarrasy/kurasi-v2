import { atom } from 'jotai'

// In-memory shared slot for the captured face URI. Camera screen writes here
// on shutter; consumers (onboarding-3) read it without round-tripping through
// route params, which expo-router doesn't preserve across `router.back()`.
export const capturedFaceAtom = atom<string | null>(null)
