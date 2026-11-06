import { useMemo } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { todayIso } from '../runbook/adapters';
import type { MeSnapshot } from './metrics';

/** Collect the Me snapshot from the auth, financial and building stores. */
export function useMeSnapshot(today: string = todayIso()): MeSnapshot {
  const currentUser = useAuthStore(s => s.currentUser);
  const currentRole = useAuthStore(s => s.currentRole);
  const board = useBuildingStore(s => s.board);
  const legalDocuments = useBuildingStore(s => s.legalDocuments);
  const units = useFinancialStore(s => s.units);
  const unitInvoices = useFinancialStore(s => s.unitInvoices);
  const hoaDueDay = useFinancialStore(s => s.hoaDueDay);
  return useMemo(() => ({
    today,
    viewer: {
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      role: currentRole,
      linkedUnits: currentUser.linkedUnits?.length ? currentUser.linkedUnits : currentUser.unitNumber ? [currentUser.unitNumber] : [],
      officerTitle: board.find(b => b.name === currentUser.name)?.role,
      isBoard: currentRole === 'BOARD_MEMBER' || currentRole === 'PROPERTY_MANAGER' || currentRole === 'PLATFORM_ADMIN',
    },
    units,
    unitInvoices,
    hoaDueDay,
    legalDocuments,
  }), [today, currentUser, currentRole, board, units, unitInvoices, hoaDueDay, legalDocuments]);
}
