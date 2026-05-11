import { atom } from 'jotai'

// Name typed into the membership card. Stored in an atom so both the sheet
// copy of the card and the page-level zoom overlay copy can render the same
// live value without prop-drilling through render boundaries.
export const cardNameAtom = atom<string>('')
