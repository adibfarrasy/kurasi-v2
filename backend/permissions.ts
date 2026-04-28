import { createAccessControl } from 'better-auth/plugins/access'
import { adminAc, defaultStatements } from 'better-auth/plugins/admin/access'

// Clothing item actions track wardrobe.allium secondary actions. Note: there is
// no `delete` — removal is always soft (archive/remove-preserving/remove-and-outfits).
const clothingItemActions = [
  'create',
  'read',
  'update',
  'archive',
  'unarchive',
  'toggle-favorite',
  'remove-preserving',
  'remove-and-outfits',
] as const

const statement = {
  ...defaultStatements,
  clothingItem: clothingItemActions,
  outfit: ['create', 'read', 'update', 'delete'],
  userBiometrics: ['read', 'upsert', 'delete-photo'],
  onboarding: ['read'],
  // subscription: every user can read/start/cancel their own; admin-lapse is
  // cron-like and restricted to admin/owner.
  subscription: ['read', 'start', 'cancel', 'renew', 'admin-lapse'],
  // Style Board (specs/style-board.allium).
  // styleCard.read: every user can browse the curated catalog.
  // styleCard.admin-manage: seed/retire curated cards (owner/admin only).
  styleCard: ['read', 'admin-manage'],
  styleInteraction: ['create'],
  savedStyle: ['read', 'create', 'delete'],
  styleTag: ['read', 'admin-manage'],
  // Fit page (specs/fit-page.allium).
  fitAdjustment: ['read', 'upsert', 'delete'],
  sharedOutfit: ['read', 'publish', 'unpublish'],
  outfitRecommendation: ['read', 'request'],
  // Social share (specs/social-share.allium).
  shareableCard: ['read', 'generate', 'update-caption', 'admin-expire'],
  shareEvent: ['read', 'create'],
  shareClick: ['record', 'read-own-analytics'],
} as const

export const ac = createAccessControl(statement)

// Owner: full user management + clothing item access
export const owner = ac.newRole({
  ...adminAc.statements, // user: create, list, set-role, ban, impersonate, delete, set-password; session: list, revoke, delete
  clothingItem: [...clothingItemActions],
  outfit: ['create', 'read', 'update', 'delete'],
  userBiometrics: ['read', 'upsert', 'delete-photo'],
  onboarding: ['read'],
  subscription: ['read', 'start', 'cancel', 'renew', 'admin-lapse'],
  styleCard: ['read', 'admin-manage'],
  styleInteraction: ['create'],
  savedStyle: ['read', 'create', 'delete'],
  styleTag: ['read', 'admin-manage'],
  fitAdjustment: ['read', 'upsert', 'delete'],
  sharedOutfit: ['read', 'publish', 'unpublish'],
  outfitRecommendation: ['read', 'request'],
  shareableCard: ['read', 'generate', 'update-caption', 'admin-expire'],
  shareEvent: ['read', 'create'],
  shareClick: ['record', 'read-own-analytics'],
})

// Admin: clothing item access only (no user management)
export const admin = ac.newRole({
  clothingItem: [...clothingItemActions],
  outfit: ['create', 'read', 'update', 'delete'],
  userBiometrics: ['read', 'upsert', 'delete-photo'],
  onboarding: ['read'],
  subscription: ['read', 'start', 'cancel', 'renew', 'admin-lapse'],
  styleCard: ['read', 'admin-manage'],
  styleInteraction: ['create'],
  savedStyle: ['read', 'create', 'delete'],
  styleTag: ['read', 'admin-manage'],
  fitAdjustment: ['read', 'upsert', 'delete'],
  sharedOutfit: ['read', 'publish', 'unpublish'],
  outfitRecommendation: ['read', 'request'],
  shareableCard: ['read', 'generate', 'update-caption', 'admin-expire'],
  shareEvent: ['read', 'create'],
  shareClick: ['record', 'read-own-analytics'],
})

// New: access to own biometrics during onboarding
export const newUser = ac.newRole({
  clothingItem: [],
  outfit: [],
  userBiometrics: ['read', 'upsert', 'delete-photo'],
  onboarding: ['read'],
  // newUser can manage their own subscription (but not admin-lapse).
  subscription: ['read', 'start', 'cancel', 'renew'],
  // newUser can browse and interact with the style board during onboarding.
  styleCard: ['read'],
  styleInteraction: ['create'],
  savedStyle: ['read', 'create', 'delete'],
  styleTag: ['read'],
  fitAdjustment: ['read', 'upsert', 'delete'],
  sharedOutfit: ['read', 'publish', 'unpublish'],
  outfitRecommendation: ['read', 'request'],
  // newUser gets read + generate (so onboarding transitions seamlessly into
  // sharing once the 5-item threshold is hit). admin-expire is cron-only.
  shareableCard: ['read', 'generate', 'update-caption'],
  shareEvent: ['read', 'create'],
  shareClick: ['record', 'read-own-analytics'],
})

export type PermissionStatement = typeof statement
export type PermissionResource = keyof PermissionStatement
export type PermissionAction<R extends PermissionResource = PermissionResource> =
  PermissionStatement[R][number]
export type PermissionKey = {
  [R in PermissionResource]: `${PermissionAction<R>}.${R}`
}[PermissionResource]
