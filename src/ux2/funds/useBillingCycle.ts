/**
 * Runs the billing cycle when a board member or manager opens the app: this
 * month's dues if billing is on and they are not billed yet, then late fees
 * on dues past their grace period. Once per day per browser. The database
 * runs the same cycle every morning (run_billing_cycle_all, migration 046);
 * this is the fallback for a day the job has not reached yet, and the
 * store's guards (one dues invoice per unit and month, one fee per dues
 * invoice, one transfer per month) make a second run harmless.
 */
import { useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { todayIso } from '../runbook/adapters';

let lastRunDay: string | null = null;

/** For tests and the "Run billing now" button: forget that today's run happened. */
export const resetBillingCycleGuard = () => { lastRunDay = null; };

export function useBillingCycle(enabled = true) {
  const role = useAuthStore(s => s.currentRole);
  const autoBilling = useFinancialStore(s => s.autoBillingEnabled);
  const lateFees = useFinancialStore(s => s.lateFeeEnabled);
  const unitCount = useFinancialStore(s => s.units.length);
  useEffect(() => {
    if (!enabled || unitCount === 0) return;
    if (role !== 'BOARD_MEMBER' && role !== 'PROPERTY_MANAGER' && role !== 'PM_COMPANY') return;
    if (!autoBilling && !lateFees) return;
    const today = todayIso();
    if (lastRunDay === today) return;
    lastRunDay = today;
    try { useFinancialStore.getState().runBillingCycle(today); } catch (err) { console.error('[billing] cycle failed:', err); }
  }, [enabled, role, autoBilling, lateFees, unitCount]);
}
