import * as WebBrowser from 'expo-web-browser'
import { createContext, useContext, useRef } from 'react'
import { Platform } from 'react-native'
import { authClient } from '@/lib/auth-client'

type User = typeof authClient.$Infer.Session.user

export interface AuthContextValue {
  user: User | null
  isAuthenticated: boolean
  isInitialLoading: boolean
  isLoading: boolean
  loginWithGoogle: () => void
  loginWithApple: () => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const session = authClient.useSession()
  const user = session.data?.user ?? null
  const isAuthenticated = !!user
  const isInitialLoading = session.isPending
  const signInInFlight = useRef(false)

  async function socialSignIn(provider: 'google' | 'apple') {
    if (signInInFlight.current) return
    signInInFlight.current = true
    try {
      // Clear any lingering ASWebAuthenticationSession from a previous
      // attempt so the new one doesn't trip "Another web browser is
      // already open." iOS only — Android has no such session, and
      // dismissAuthSession() throws UnavailabilityError there.
      if (Platform.OS === 'ios') {
        WebBrowser.dismissAuthSession()
      }
      await authClient.signIn.social({
        provider,
        callbackURL: '/auth-callback',
      })
    } catch (error) {
      console.error(error)
    } finally {
      signInInFlight.current = false
    }
  }

  return (
    <AuthContext
      value={{
        user,
        isAuthenticated,
        isInitialLoading,
        isLoading: isInitialLoading,
        loginWithGoogle: () => socialSignIn('google'),
        loginWithApple: () => socialSignIn('apple'),
        logout: () => authClient.signOut(),
      }}
    >
      {children}
    </AuthContext>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
