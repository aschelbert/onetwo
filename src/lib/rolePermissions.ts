import type { Role } from '@/types/auth';

export interface NavItem {
  id: string;
  label: string;
  path: string;
  separator?: boolean;
  icon?: string;
}

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
  ],
  RESIDENT: [
    { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: 'dashboard' },
    { id: 'community', label: 'Community Room', path: '/community', icon: 'community' },
    { id: 'contacts', label: 'The Building', path: '/building', icon: 'contacts' },
    { id: 'financial', label: 'Fiscal Lens', path: '/financial', icon: 'financial' },
    { id: 'archives', label: 'The Archives', path: '/archives', icon: 'archives' },
  ],
  PROPERTY_MANAGER: [
    { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: 'dashboard' },
    { id: 'boardroom', label: 'Board Room', path: '/boardroom', icon: 'boardroom' },
    { id: 'contacts', label: 'The Building', path: '/building', icon: 'contacts' },
    { id: 'financial', label: 'Fiscal Lens', path: '/financial', icon: 'financial' },
    { id: 'property-log', label: 'Property Log', path: '/property-log', icon: 'property-log' },
    { id: 'archives', label: 'The Archives', path: '/archives', icon: 'archives' },
  ],
};
