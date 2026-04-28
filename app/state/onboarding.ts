import { atomWithStorage } from 'jotai/utils'
import { createMMKVJSONStorage } from '@/state/storage'

export type DebugBubblePosition = {
  x: number
  y: number
}

export const onboardingCompleteAtom = atomWithStorage<boolean>(
  'onboarding_complete',
  false,
  createMMKVJSONStorage<boolean>(),
  { getOnInit: true },
)

export const debugBubblePositionAtom = atomWithStorage<DebugBubblePosition>(
  'debug_bubble_position',
  { x: 320, y: 700 },
  createMMKVJSONStorage<DebugBubblePosition>(),
  { getOnInit: true },
)

export const devSkipGatesAtom = atomWithStorage<boolean>(
  'dev_skip_gates',
  false,
  createMMKVJSONStorage<boolean>(),
  { getOnInit: true },
)
