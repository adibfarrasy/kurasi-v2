import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { Redirect, Slot, usePathname } from 'expo-router'
import { useAtomValue } from 'jotai'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { DevToolsOverlay } from '@/components/dev/dev-tools-overlay'
import { AuthProvider, useAuth } from '@/contexts/auth-context'
import { QueryProvider } from '@/contexts/query-client'
import { devSkipGatesAtom, onboardingCompleteAtom } from '@/state/onboarding'
import '../global.css'

function RouteGate() {
  const pathname = usePathname()
  const hasOnboarded = useAtomValue(onboardingCompleteAtom)
  const skipGates = useAtomValue(devSkipGatesAtom)
  const { isAuthenticated, isInitialLoading } = useAuth()

  const isOnboardingRoute = pathname.startsWith('/onboarding-')
  const isAuthCallbackRoute = pathname === '/auth-callback'

  if (skipGates) return <Slot />
  if (isAuthCallbackRoute) return <Slot />
  if (isInitialLoading) return null

  if (!hasOnboarded && !isOnboardingRoute) {
    return <Redirect href="/onboarding-1" />
  }

  if (hasOnboarded && isOnboardingRoute) {
    return <Redirect href={isAuthenticated ? '/' : '/login'} />
  }

  return <Slot />
}

export default function Layout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryProvider>
        <AuthProvider>
          <BottomSheetModalProvider>
            <RouteGate />
            {__DEV__ ? <DevToolsOverlay /> : null}
          </BottomSheetModalProvider>
        </AuthProvider>
      </QueryProvider>
    </GestureHandlerRootView>
  )
}
