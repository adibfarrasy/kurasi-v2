import type { PermissionAction, PermissionKey, PermissionResource } from 'backend/permissions'
import { createContext, useContext } from 'react'
import { authClient } from '@/lib/auth-client'

type User = typeof authClient.$Infer.Session.user

export interface AuthContextValue {
  user: User | null
  isAuthenticated: boolean
  isInitialLoading: boolean
  isLoading: boolean
  can: (permission: PermissionKey) => boolean
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

  const can = (permission: PermissionKey) => {
    const [action, resource] = permission.split('.') as [PermissionAction, PermissionResource]
    const role = user?.role ?? 'new'
    return authClient.admin.checkRolePermission({
      role,
      permission: { [resource]: [action] },
    })
  }

  return (
    <AuthContext
      value={{
        user,
        isAuthenticated,
        isInitialLoading,
        isLoading: isInitialLoading,
        can,
        loginWithGoogle: async () => {
          try {
            await authClient.signIn.social({
              provider: 'google',
              callbackURL: '/auth-callback',
            })
          } catch (error) {
            console.error(error)
          }
        },
        loginWithApple: () => {
          authClient.signIn.social({
            provider: 'apple',
          })
        },
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
