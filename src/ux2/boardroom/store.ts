/**
 * Runbook switches — which of the 32 runbooks the building has turned off.
 * Switching one off keeps its playbook for manual cases; it only stops the
 * trigger. Persisted per browser like the other stores, except the wired
 * runbooks, whose switches also live in financial_settings for the database jobs.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useFinancialStore } from '@/store/useFinancialStore';
import { RUNBOOKS } from './runbooks';

/** Runbooks the server also runs: their switches are kept with the financial settings so the morning job sees them. */
const SHARED = new Set(RUNBOOKS.filter(r => r.wired).map(r => r.id));

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
        if (SHARED.has(id)) useFinancialStore.getState().setRunbookOff(id, !on);
        if (id === 'month-close') useFinancialStore.getState().setMonthCloseEnabled(on);
      },
    }),
    { name: 'onetwo-ux2-runbooks', version: 1, partialize: s => ({ off: s.off }) },
  ),
);
