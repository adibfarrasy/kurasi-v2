import {
  FunnelSans_400Regular,
  FunnelSans_500Medium,
  FunnelSans_600SemiBold,
  FunnelSans_700Bold,
} from '@expo-google-fonts/funnel-sans'
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { useFonts } from 'expo-font'
import { Redirect, Slot, usePathname } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useAtomValue } from 'jotai'
import { useEffect } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { DevToolsOverlay } from '@/components/dev/dev-tools-overlay'
import { AuthProvider, useAuth } from '@/contexts/auth-context'
import { devSkipGatesAtom, onboardingCompleteAtom } from '@/state/onboarding'
import '../global.css'
import 'react-native-gesture-handler'
import 'react-native-reanimated'

SplashScreen.preventAutoHideAsync()

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
  const [fontsLoaded] = useFonts({
    Bebas: require('@/assets/fonts/BebasNeue-Regular.ttf'),
    Kirang: require('@/assets/fonts/KirangHaerang-Regular.ttf'),
    FunnelSans_400Regular,
    FunnelSans_500Medium,
    FunnelSans_600SemiBold,
    FunnelSans_700Bold,
  })

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync()
    }
  }, [fontsLoaded])

  if (!fontsLoaded) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <AuthProvider>
          <RouteGate />
          {__DEV__ ? <DevToolsOverlay /> : null}
        </AuthProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  )
}
