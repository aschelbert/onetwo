import type { Role } from '@/types/auth';

export interface NavItem {
  id: string;
  label: string;
  path: string;
  separator?: boolean;
}

export const navigation: Record<Role, NavItem[]> = {
  PLATFORM_ADMIN: [
    { id: 'admin-console', label: 'Admin Console', path: '/admin/console' },
  ],
  BOARD_MEMBER: [
    { id: 'dashboard', label: 'Dashboard', path: '/dashboard' },
    { id: 'boardroom', label: 'Board Room', path: '/boardroom' },
    { id: 'board-ops', label: 'Board Ops', path: '/board-ops' },
    { id: 'contacts', label: 'The Building', path: '/building' },
    { id: 'financial', label: 'Fiscal Lens', path: '/financial' },
    { id: 'property-log', label: 'Property Log', path: '/property-log' },
    { id: 'archives', label: 'The Archives', path: '/archives' },
  ],
  RESIDENT: [
    { id: 'dashboard', label: 'Dashboard', path: '/dashboard' },
    { id: 'community', label: 'Community Room', path: '/community' },
    { id: 'contacts', label: 'The Building', path: '/building' },
    { id: 'financial', label: 'Fiscal Lens', path: '/financial' },
    { id: 'archives', label: 'The Archives', path: '/archives' },
  ],
  PROPERTY_MANAGER: [
    { id: 'dashboard', label: 'Dashboard', path: '/dashboard' },
    { id: 'boardroom', label: 'Board Room', path: '/boardroom' },
    { id: 'board-ops', label: 'Board Ops', path: '/board-ops' },
    { id: 'contacts', label: 'The Building', path: '/building' },
    { id: 'financial', label: 'Fiscal Lens', path: '/financial' },
    { id: 'property-log', label: 'Property Log', path: '/property-log' },
    { id: 'archives', label: 'The Archives', path: '/archives' },
  ],
};
