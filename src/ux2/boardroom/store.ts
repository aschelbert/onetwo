/**
 * Runbook switches — which of the 32 runbooks the building has turned off.
 * Switching one off keeps its playbook for manual cases; it only stops the
 * trigger. Persisted per browser like the other stores, except the month
 * close, whose switch also lives in financial_settings for the database job.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useFinancialStore } from '@/store/useFinancialStore';
import { RUNBOOKS } from './runbooks';

/** The one runbook the server also runs: its switch is kept with the financial settings so the morning job sees it. */
const SHARED = 'month-close';

interface RunbookSwitchState {
  /** Runbook ids the building switched off. */
  off: string[];
  isOn: (id: string) => boolean;
  setOn: (id: string, on: boolean) => void;
}

export const useRunbookSwitches = create<RunbookSwitchState>()(
  persist(
    (set, get) => ({
      off: RUNBOOKS.filter(r => !r.defaultOn).map(r => r.id),
      isOn: id => !get().off.includes(id),
      setOn: (id, on) => {
        set(s => ({ off: on ? s.off.filter(x => x !== id) : Array.from(new Set([...s.off, id])) }));
        if (id === SHARED) useFinancialStore.getState().setMonthCloseEnabled(on);
      },
    }),
    { name: 'onetwo-ux2-runbooks', version: 1, partialize: s => ({ off: s.off }) },
  ),
);
