import { atomWithStorage } from 'jotai/utils'
import { createMMKVJSONStorage } from '@/state/storage'

export const onboardingCompleteAtom = atomWithStorage<boolean>(
  'onboarding_complete',
  false,
  createMMKVJSONStorage<boolean>(),
  { getOnInit: true },
)
