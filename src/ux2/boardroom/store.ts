/**
 * Runbook switches — which of the 32 runbooks the building has turned off.
 * Switching one off keeps its playbook for manual cases; it only stops the
 * trigger. Persisted per browser like the other stores; backend mirroring
 * can use `runbook_instances` later without changing this contract.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { RUNBOOKS } from './runbooks';

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
      setOn: (id, on) => set(s => ({ off: on ? s.off.filter(x => x !== id) : Array.from(new Set([...s.off, id])) })),
    }),
    { name: 'onetwo-ux2-runbooks', version: 1, partialize: s => ({ off: s.off }) },
  ),
);
