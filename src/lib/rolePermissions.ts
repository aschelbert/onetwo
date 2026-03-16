import type { Role } from '@/types/auth';
import type { Permission } from '@/store/usePlatformAdminStore';
import { CORE_FEATURES } from '@/store/usePlatformAdminStore';

export interface NavItem {
  id: string;
  label: string;
  path: string;
  separator?: boolean;
  icon?: string;
}

// Maps featureId (from admin console permissions) → sidebar nav item.
// Order here determines display order in the sidebar.
const FEATURE_NAV_MAP: { featureId: string; nav: NavItem }[] = [
  { featureId: 'dashboard',        nav: { id: 'dashboard',    label: 'Dashboard',      path: '/dashboard',     icon: 'dashboard' } },
  { featureId: 'boardRoom',        nav: { id: 'boardroom',    label: 'Board Room',     path: '/boardroom',     icon: 'boardroom' } },
  { featureId: 'building',         nav: { id: 'contacts',     label: 'The Building',   path: '/building',      icon: 'contacts' } },
  { featureId: 'fiscalLens',       nav: { id: 'financial',    label: 'Fiscal Lens',    path: '/financial',     icon: 'financial' } },
  { featureId: 'propertyLog',      nav: { id: 'property-log', label: 'Property Log',   path: '/property-log',  icon: 'property-log' } },
  { featureId: 'communityPortal',  nav: { id: 'community',    label: 'Community Room', path: '/community',     icon: 'community' } },
  { featureId: 'archives',         nav: { id: 'archives',     label: 'The Archives',   path: '/archives',      icon: 'archives' } },
  { featureId: 'myUnit',           nav: { id: 'my-unit',      label: 'My Unit',        path: '/my-unit',       icon: 'my-unit' } },
  { featureId: 'userManagement',   nav: { id: 'user-mgmt',    label: 'Association Team', path: '/admin/users',  icon: 'user-mgmt' } },
];

// Role name in auth store → roleId used in permissions
const ROLE_TO_PERMISSION_ID: Record<string, string> = {
  BOARD_MEMBER: 'board_member',
  RESIDENT: 'resident',
  STAFF: 'staff',
  PROPERTY_MANAGER: 'property_manager',
};

/**
 * Build navigation items for a tenant role based on:
 * 1. RBAC permissions (role must have 'view' action for the feature)
 * 2. Tenant features (non-core features must be enabled on the tenant)
 */
export function getNavigationForRole(
  role: Role,
  permissions: Permission[],
  tenantFeatures: Record<string, boolean>,
): NavItem[] {
  // Platform admin always gets admin console only
  if (role === 'PLATFORM_ADMIN') {
    return [{ id: 'admin-console', label: 'Admin Console', path: '/admin/console', icon: 'admin-console' }];
  }

  const permRoleId = ROLE_TO_PERMISSION_ID[role];
  if (!permRoleId) return [];

  const rolePerms = permissions.filter(p => p.roleId === permRoleId);
  const coreSet = new Set<string>(CORE_FEATURES as readonly string[]);

  return FEATURE_NAV_MAP.filter(({ featureId }) => {
    // Check RBAC: role must have 'view' permission for this feature
    const perm = rolePerms.find(p => p.featureId === featureId);
    if (!perm || !perm.actions.includes('view')) return false;

    // Core features are always available; non-core must be enabled on the tenant
    if (coreSet.has(featureId)) return true;
    return tenantFeatures[featureId] === true;
  }).map(({ nav }) => nav);
}

// Legacy static navigation — kept as fallback
export const navigation: Record<Role, NavItem[]> = {
  PLATFORM_ADMIN: [
    { id: 'admin-console', label: 'Admin Console', path: '/admin/console', icon: 'admin-console' },
  ],
  BOARD_MEMBER: [
    { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: 'dashboard' },
    { id: 'boardroom', label: 'Board Room', path: '/boardroom', icon: 'boardroom' },
    { id: 'contacts', label: 'The Building', path: '/building', icon: 'contacts' },
    { id: 'financial', label: 'Fiscal Lens', path: '/financial', icon: 'financial' },
    { id: 'property-log', label: 'Property Log', path: '/property-log', icon: 'property-log' },
    { id: 'archives', label: 'The Archives', path: '/archives', icon: 'archives' },
    { id: 'user-mgmt', label: 'Association Team', path: '/admin/users', icon: 'user-mgmt' },
  ],
  RESIDENT: [
    { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: 'dashboard' },
    { id: 'community', label: 'Community Room', path: '/community', icon: 'community' },
    { id: 'contacts', label: 'The Building', path: '/building', icon: 'contacts' },
    { id: 'financial', label: 'Fiscal Lens', path: '/financial', icon: 'financial' },
    { id: 'archives', label: 'The Archives', path: '/archives', icon: 'archives' },
  ],
  STAFF: [
    { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: 'dashboard' },
    { id: 'contacts', label: 'The Building', path: '/building', icon: 'contacts' },
    { id: 'property-log', label: 'Property Log', path: '/property-log', icon: 'property-log' },
    { id: 'archives', label: 'The Archives', path: '/archives', icon: 'archives' },
  ],
  PROPERTY_MANAGER: [
    { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: 'dashboard' },
    { id: 'boardroom', label: 'Board Room', path: '/boardroom', icon: 'boardroom' },
    { id: 'contacts', label: 'The Building', path: '/building', icon: 'contacts' },
    { id: 'financial', label: 'Fiscal Lens', path: '/financial', icon: 'financial' },
    { id: 'property-log', label: 'Property Log', path: '/property-log', icon: 'property-log' },
    { id: 'archives', label: 'The Archives', path: '/archives', icon: 'archives' },
    { id: 'user-mgmt', label: 'Association Team', path: '/admin/users', icon: 'user-mgmt' },
  ],
};
