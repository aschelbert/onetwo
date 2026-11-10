/**
 * Runs the wired runbooks when a board member or manager opens the app, and
 * again as the data they watch changes (a payment lands, the books close, a
 * policy is renewed), so each case's automated steps tick as the work lands.
 * Everything it calls is idempotent (one case per trigger, a done step stays
 * done), so re-running is harmless. The database runs the same jobs every
 * morning; this is the fallback and either side finds the other's case.
 */
import { useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { runMonthClose } from './monthClose';
import { runCollections } from './collections';
import { runInsuranceRenewal } from './insuranceRenewal';

/** Every wired runbook, once; each guards itself. */
export function runRunbookTriggers(today?: string): void {
  for (const [name, run] of [['month close', runMonthClose], ['collections', runCollections], ['insurance renewal', runInsuranceRenewal]] as const) {
    try { run(today); } catch (err) { console.error(`[runbooks] ${name} failed:`, err); }
  }
}

export function useRunbookTriggers(enabled = true) {
  const role = useAuthStore(s => s.currentRole);
  const casesLoaded = useIssuesStore(s => s.casesLoaded);
  const startDay = useFinancialStore(s => s.monthCloseStartDay);
  const closedThrough = useFinancialStore(s => s.closedThrough);
  const invoices = useFinancialStore(s => s.unitInvoices);
  const units = useFinancialStore(s => s.units);
  const off = useFinancialStore(s => s.runbooksOff);
  const monthCloseEnabled = useFinancialStore(s => s.monthCloseEnabled);
  const insurance = useBuildingStore(s => s.insurance);
  useEffect(() => {
    if (!enabled || !casesLoaded) return;
    if (role !== 'BOARD_MEMBER' && role !== 'PROPERTY_MANAGER' && role !== 'PM_COMPANY') return;
    runRunbookTriggers();
  }, [enabled, casesLoaded, role, startDay, closedThrough, invoices, units, off, monthCloseEnabled, insurance]);
}

/** The old name, for the month close alone. */
export const useMonthClose = useRunbookTriggers;
