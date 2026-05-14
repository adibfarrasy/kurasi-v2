import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { Redirect, Slot, usePathname } from 'expo-router'
import { useAtomValue } from 'jotai'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { AuthProvider, useAuth } from '@/contexts/auth-context'
import { QueryProvider } from '@/contexts/query-client'
import { onboardingCompleteAtom } from '@/state/onboarding'
import '../global.css'

function RouteGate() {
  const pathname = usePathname()
  const hasOnboarded = useAtomValue(onboardingCompleteAtom)
  const { isAuthenticated, isInitialLoading } = useAuth()

  const isOnboardingRoute = pathname.startsWith('/onboarding-')
  const isAuthCallbackRoute = pathname === '/auth-callback'
  const isLoginRoute = pathname === '/login'

  if (isAuthCallbackRoute) return <Slot />
  if (isInitialLoading) return null

  // Auth gate first: anyone not signed in only sees /login.
  if (!isAuthenticated) {
    return isLoginRoute ? <Slot /> : <Redirect href="/login" />
  }

  // Onboarding gate uses MMKV `onboardingCompleteAtom` only. We tried a
  // server-authoritative check via `orpc.onboarding.get` to catch the
  // case where the DB has been wiped but MMKV still says completed —
  // unfortunately it raced with router.replace('/') from the onboarding
  // exit screen and triggered a max-update-depth loop. To recover from
  // a wipe, run `task reset-onboarding:local` AND clear app data
  // (uninstall + reinstall, or Simulator → Erase All Content).
  if (isLoginRoute) {
    return <Redirect href={hasOnboarded ? '/' : '/onboarding-1'} />
  }

  if (!hasOnboarded && !isOnboardingRoute) {
    return <Redirect href="/onboarding-1" />
  }

  if (hasOnboarded && isOnboardingRoute) {
    return <Redirect href="/" />
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
          </BottomSheetModalProvider>
        </AuthProvider>
      </QueryProvider>
    </GestureHandlerRootView>
  )
}
