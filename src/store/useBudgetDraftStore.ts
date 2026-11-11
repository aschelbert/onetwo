/**
 * Next year's budget drafts, one per fiscal year. With the backend on they are
 * kept in budget_drafts (the board and the manager read and write them), so
 * every board member works on the same draft; in demo mode they live here.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isBackendEnabled, getActiveTenantId } from '@/lib/supabase';
import * as svc from '@/lib/services/budgetDrafts';
import type { BudgetDraft } from '@/ux2/boardroom/budgetDraft';

interface BudgetDraftState {
  drafts: Record<string, BudgetDraft>;
  loaded: boolean;
  load: (tenantId?: string) => Promise<void>;
  get: (fyStart: string) => BudgetDraft | undefined;
  /** Whether a new draft may be started: always in demo mode, once the board's drafts have loaded with the backend on. */
  canSeed: () => boolean;
  /** Put a whole draft (a new one). */
  put: (d: BudgetDraft) => void;
  /** Change a draft, building on the latest copy. */
  update: (fyStart: string, fn: (d: BudgetDraft) => BudgetDraft) => void;
  reset: () => void;
}

const timers: Record<string, ReturnType<typeof setTimeout>> = {};
function save(fyStart: string) {
  if (!isBackendEnabled) return;
  const tid = getActiveTenantId();
  if (!tid) return;
  clearTimeout(timers[fyStart]);
  // Typing an amount saves once it settles, not on every key.
  timers[fyStart] = setTimeout(() => {
    const d = useBudgetDraftStore.getState().drafts[fyStart];
    if (d) void svc.saveBudgetDraft(tid, d);
  }, 600);
}

export const useBudgetDraftStore = create<BudgetDraftState>()(persist((set, get) => ({
  drafts: {},
  loaded: false,
  load: async (tenantId) => {
    const tid = tenantId ?? getActiveTenantId();
    if (!isBackendEnabled || !tid) { set({ loaded: true }); return; }
    const rows = await svc.fetchBudgetDrafts(tid);
    // Only a load that worked lets the app start a new draft: one that failed could hide a draft another board member has.
    if (rows) set(s => ({ loaded: true, drafts: { ...s.drafts, ...Object.fromEntries(rows.map(d => [d.fyStart, d])) } }));
  },
  get: (fyStart) => get().drafts[fyStart],
  canSeed: () => !isBackendEnabled || get().loaded,
  put: (d) => { set(s => ({ drafts: { ...s.drafts, [d.fyStart]: d } })); save(d.fyStart); },
  update: (fyStart, fn) => {
    const cur = get().drafts[fyStart];
    if (!cur) return;
    set(s => ({ drafts: { ...s.drafts, [fyStart]: { ...fn(s.drafts[fyStart] ?? cur), updatedAt: new Date().toISOString() } } }));
    save(fyStart);
  },
  reset: () => set({ drafts: {}, loaded: false }),
}), { name: 'onetwo-budget-drafts', version: 1, partialize: s => ({ drafts: s.drafts }) }));
