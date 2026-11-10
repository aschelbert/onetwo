/**
 * Runs the month close runbook when a board member or manager opens the app,
 * and again when the books close or dues post, so the case's automated steps
 * tick as the work lands. Everything it calls is idempotent (one case per
 * month, a done step stays done), so re-running is harmless.
 */
import { useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useRunbookSwitches } from './store';
import { MONTH_CLOSE_ID, runMonthClose } from './monthClose';

export function useMonthClose(enabled = true) {
  const role = useAuthStore(s => s.currentRole);
  const startDay = useFinancialStore(s => s.monthCloseStartDay);
  const closedThrough = useFinancialStore(s => s.closedThrough);
  const invoiceCount = useFinancialStore(s => s.unitInvoices.length);
  const casesLoaded = useIssuesStore(s => s.casesLoaded);
  const on = useRunbookSwitches(s => !s.off.includes(MONTH_CLOSE_ID));
  useEffect(() => {
    if (!enabled || !casesLoaded || !on) return;
    if (role !== 'BOARD_MEMBER' && role !== 'PROPERTY_MANAGER' && role !== 'PM_COMPANY') return;
    try { runMonthClose(); } catch (err) { console.error('[month close] run failed:', err); }
  }, [enabled, casesLoaded, on, role, startDay, closedThrough, invoiceCount]);
}
