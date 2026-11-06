import type { Role } from '@/types/auth';
import type { NavItem } from '@/lib/rolePermissions';

/**
 * The redesign's five modules and where each one lands today.
 * Phase 0 only re-skins navigation: every module path is an alias of a
 * production page, so nothing a role could reach before becomes unreachable.
 * Later phases swap the page behind each path behind its own flag.
 */
export type Ux2ModuleId = 'home' | 'building' | 'community' | 'funds' | 'boardroom';

export interface Ux2Module {
  id: Ux2ModuleId;
  label: string;
  /** The path the module link goes to. */
  path: string;
  /** Paths that count as "inside" this module for the active state. */
  matches: string[];
  /** Legacy nav ids this module absorbs; used to honour per-role permissions. */
  legacyIds: string[];
}

export const UX2_MODULES: Ux2Module[] = [
  { id: 'home', label: 'Home', path: '/home', matches: ['/home', '/dashboard'], legacyIds: ['dashboard'] },
  { id: 'building', label: 'Building', path: '/building', matches: ['/building', '/archives', '/association-team', '/property-log'], legacyIds: ['contacts'] },
  { id: 'community', label: 'Community', path: '/community', matches: ['/community', '/voting'], legacyIds: ['community'] },
  { id: 'funds', label: 'Funds', path: '/funds', matches: ['/funds', '/financial', '/my-unit'], legacyIds: ['financial'] },
  { id: 'boardroom', label: 'Board Room', path: '/boardroom', matches: ['/boardroom', '/issues', '/compliance', '/board-ops'], legacyIds: ['boardroom'] },
];

/** Roles that see Community even though the legacy nav never listed it for them. */
const COMMUNITY_ROLES: Role[] = ['BOARD_MEMBER', 'PROPERTY_MANAGER', 'RESIDENT', 'PLATFORM_ADMIN'];

/**
 * Modules a role may see, derived from the legacy nav the role already has
 * (so tenant feature and permission filtering keeps applying) plus Community.
 */
export function modulesForRole(role: Role, legacyNav: NavItem[]): Ux2Module[] {
  const legacyIds = new Set(legacyNav.filter(i => !i.separator).map(i => i.id));
  return UX2_MODULES.filter(m => {
    if (m.id === 'community') return COMMUNITY_ROLES.includes(role) || legacyIds.has('community');
    return m.legacyIds.some(id => legacyIds.has(id));
  });
}

/**
 * Legacy destinations that have no module home until their phase lands
 * (Association Team, The Archives, Admin Console). They stay reachable from
 * the avatar menu so no feature is lost while the shell is new.
 */
export function legacyExtras(legacyNav: NavItem[]): NavItem[] {
  const absorbed = new Set(UX2_MODULES.flatMap(m => m.legacyIds));
  return legacyNav.filter(i => !i.separator && !absorbed.has(i.id) && i.id !== 'community');
}

export function activeModule(pathname: string, modules: Ux2Module[]): Ux2ModuleId | null {
  const hit = modules.find(m => m.matches.some(p => pathname === p || pathname.startsWith(p + '/')));
  return hit?.id ?? null;
}

/** The phone bottom nav: residents get Pay (My Unit) where the board gets Funds. */
export function phoneTabs(role: Role, modules: Ux2Module[]): { id: string; label: string; path: string; matches: string[] }[] {
  return modules
    .filter(m => !(role === 'RESIDENT' && m.id === 'boardroom'))
    .map(m => (role === 'RESIDENT' && m.id === 'funds'
      ? { id: 'pay', label: 'Pay', path: '/my-unit', matches: ['/my-unit', '/funds', '/financial'] }
      : { id: m.id, label: m.label, path: m.path, matches: m.matches }));
}

export interface MeMenuItem {
  id: string;
  label: string;
  path: string;
}

/** The avatar menu, in the order the design fixed. */
export function meMenu(role: Role, isDemo: boolean): MeMenuItem[] {
  const items: MeMenuItem[] = [
    { id: 'account', label: 'My Account', path: '/account' },
    { id: 'my-unit', label: 'My Unit', path: '/my-unit' },
  ];
  if (role === 'BOARD_MEMBER' || role === 'PROPERTY_MANAGER') items.push({ id: 'users', label: 'User Management', path: '/admin/users' });
  if (role === 'BOARD_MEMBER' && !isDemo) items.push({ id: 'subscription', label: 'Subscription', path: '/subscription' });
  items.push({ id: 'support', label: 'Help & Support', path: '/support' });
  return items;
}
