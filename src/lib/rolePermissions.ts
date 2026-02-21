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
    { id: 'compliance', label: 'Compliance Runbook', path: '/compliance' },
    { id: 'contacts', label: 'The Building', path: '/building' },
    { id: 'financial', label: 'Fiscal Lens', path: '/financial' },
    { id: 'issues-board', label: 'Case Ops', path: '/issues' },
  ],
  RESIDENT: [
    { id: 'dashboard', label: 'Dashboard', path: '/dashboard' },
    { id: 'contacts', label: 'The Building', path: '/building' },
    { id: 'issues-resident', label: 'Report Issues', path: '/issues' },
  ],
  PROPERTY_MANAGER: [
    { id: 'dashboard', label: 'Dashboard', path: '/dashboard' },
    { id: 'contacts', label: 'The Building', path: '/building' },
    { id: 'financial', label: 'Fiscal Lens', path: '/financial' },
    { id: 'issues-board', label: 'Case Ops', path: '/issues' },
    { id: 'compliance', label: 'Compliance Runbook', path: '/compliance' },
  ],
};
