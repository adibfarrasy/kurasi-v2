import { createAccessControl } from 'better-auth/plugins/access'
import { adminAc, defaultStatements } from 'better-auth/plugins/admin/access'

const statement = {
  ...defaultStatements,
  clothingItem: ['create', 'read', 'update', 'delete'],
} as const

export const ac = createAccessControl(statement)

// Owner: full user management + clothing item access
export const owner = ac.newRole({
  ...adminAc.statements, // user: create, list, set-role, ban, impersonate, delete, set-password; session: list, revoke, delete
  clothingItem: ['create', 'read', 'update', 'delete'],
})

// Admin: clothing item access only (no user management)
export const admin = ac.newRole({
  clothingItem: ['create', 'read', 'update', 'delete'],
})

// New: no permissions
export const newUser = ac.newRole({
  clothingItem: [],
})

export type PermissionStatement = typeof statement
export type PermissionResource = keyof PermissionStatement
export type PermissionAction<R extends PermissionResource = PermissionResource> =
  PermissionStatement[R][number]
export type PermissionKey = {
  [R in PermissionResource]: `${PermissionAction<R>}.${R}`
}[PermissionResource]
