import type { Role } from '@/types/auth';
import type { ViewPermissions } from '@/types/issues';

export const ROLE_PERMISSIONS: Record<Role, ViewPermissions> = {
  PLATFORM_ADMIN: {
    canViewCaseWorkflow: true, canViewDecisionTrail: true, canViewBidDetails: true,
    canViewConflictDetails: true, canViewFiduciaryAlerts: true, canEditCases: true,
    caseDetailLevel: 'full', financialDetailLevel: 'full',
  },
  BOARD_MEMBER: {
    canViewCaseWorkflow: true, canViewDecisionTrail: true, canViewBidDetails: true,
    canViewConflictDetails: true, canViewFiduciaryAlerts: true, canEditCases: true,
    caseDetailLevel: 'full', financialDetailLevel: 'full',
  },
  PROPERTY_MANAGER: {
    canViewCaseWorkflow: true, canViewDecisionTrail: true, canViewBidDetails: true,
    canViewConflictDetails: true, canViewFiduciaryAlerts: true, canEditCases: true,
    caseDetailLevel: 'full', financialDetailLevel: 'full',
  },
  RESIDENT: {
    canViewCaseWorkflow: false, canViewDecisionTrail: false, canViewBidDetails: false,
    canViewConflictDetails: false, canViewFiduciaryAlerts: false, canEditCases: false,
    caseDetailLevel: 'phase', financialDetailLevel: 'category',
  },
};

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
    { id: 'contacts', label: 'The Building', path: '/building' },
    { id: 'financial', label: 'Fiscal Lens', path: '/financial' },
    { id: 'property-log', label: 'Property Log', path: '/property-log' },
    { id: 'archives', label: 'The Archives', path: '/archives' },
  ],
};
