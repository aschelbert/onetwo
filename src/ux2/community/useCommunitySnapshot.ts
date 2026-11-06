import { useMemo } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useElectionStore } from '@/store/useElectionStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { todayIso } from '../runbook/adapters';
import type { CommunitySnapshot } from './metrics';

/** Collect the Community snapshot from the compliance, meetings, election, issues and financial stores. */
export function useCommunitySnapshot(today: string = todayIso()): CommunitySnapshot {
  const currentUser = useAuthStore(s => s.currentUser);
  const currentRole = useAuthStore(s => s.currentRole);
  const announcements = useComplianceStore(s => s.announcements);
  const communications = useComplianceStore(s => s.communications);
  const meetings = useMeetingsStore(s => s.meetings);
  const elections = useElectionStore(s => s.elections);
  const issues = useIssuesStore(s => s.issues);
  const units = useFinancialStore(s => s.units);
  return useMemo(() => ({
    today,
    viewer: {
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      linkedUnits: currentUser.linkedUnits?.length ? currentUser.linkedUnits : currentUser.unitNumber ? [currentUser.unitNumber] : [],
      isBoard: currentRole === 'BOARD_MEMBER' || currentRole === 'PROPERTY_MANAGER' || currentRole === 'PLATFORM_ADMIN',
    },
    announcements,
    communications,
    meetings,
    elections,
    issues,
    units,
  }), [today, currentUser, currentRole, announcements, communications, meetings, elections, issues, units]);
}
