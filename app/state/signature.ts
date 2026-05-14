import { atom } from 'jotai'

// Captured signature stored as an array of SVG path-data strings (one per
// stroke). Using path strings instead of a rasterized image keeps the size
// tiny and lets us re-render at any resolution. Cleared via Erase, persisted
// when the user hits Save in the signature pad.
export const signaturePathsAtom = atom<string[]>([])
