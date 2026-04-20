import { useAtom } from 'jotai'
import { onboardingCompleteAtom } from '@/state/onboarding'

export function useOnboarding() {
  const [hasOnboarded, setHasOnboarded] = useAtom(onboardingCompleteAtom)

  return {
    hasOnboarded,
    setHasOnboarded,
    completeOnboarding: () => setHasOnboarded(true),
    resetOnboarding: () => setHasOnboarded(false),
  }
}
