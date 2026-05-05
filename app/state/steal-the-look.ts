import type { StealTheLookResult } from 'backend/orpc/steal-the-look-handlers'
import { atomWithStorage } from 'jotai/utils'
import { createMMKVJSONStorage } from '@/state/storage'

// Draft state for the most recent Steal-the-Look analyze run. Persisted via
// MMKV so the user doesn't lose it if the app gets backgrounded mid-session.
// Cleared on Save-to-My-Fit (when the draft becomes a real Outfit row).
export const stealTheLookDraftAtom = atomWithStorage<StealTheLookResult | null>(
  'steal_the_look_draft',
  null,
  createMMKVJSONStorage<StealTheLookResult | null>(),
  { getOnInit: true },
)
