import { Redirect } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from '@/contexts/auth-context'

/**
 * Landing route for the `kurasi://auth-callback` deep link the backend
 * redirects to after a successful OAuth sign-in.
 *
 * Only Android actually visits this route: its Custom Tab auth flow turns
 * the `kurasi://` redirect into a real OS deep link. iOS uses a native
 * ASWebAuthenticationSession that captures the redirect internally, so
 * there the app never leaves /login and RouteGate handles routing.
 *
 * By the time we're here the better-auth expo plugin has already stored
 * the session cookie and triggered a session refetch — so this screen's
 * only job is to wait for that to resolve, then hand off to RouteGate.
 */
export default function AuthCallback() {
  const { isAuthenticated, isInitialLoading } = useAuth()

  // Session is still being fetched/validated — hold on a visible spinner
  // (a bare <Text> here renders black-on-black in dark mode → looks blank).
  if (isInitialLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <ActivityIndicator color="white" />
      </View>
    )
  }

  // Resolved. Redirecting to "/" lets RouteGate (_layout.tsx) apply the same
  // `hasOnboarded` routing iOS already uses: "/onboarding-1" for users who
  // haven't onboarded, "/" (My Fit) otherwise. Falling back to "/login"
  // covers the rare case where the session cookie didn't take.
  return <Redirect href={isAuthenticated ? '/' : '/login'} />
}
