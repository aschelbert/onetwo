/**
 * Setup at a glance, shared by the Home card and the setup page: the items
 * found in the documents, what's decided, the four essentials for going
 * live, overall progress and the one next thing to do.
 */
import { useMemo } from 'react';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useTenantContext } from '@/components/TenantProvider';
import { useSetupStore } from '@/features/setup/useSetupStore';
import { buildItems, essentials, progress, isClear, type Item } from '@/features/setup/setupModel';

export type NextStep = { step: 'documents' | 'review' | 'finish'; label: string };

export function useSetup() {
  const docs = useSetupStore(s => s.docs);
  const decisions = useSetupStore(s => s.decisions);
  const name = useBuildingStore(s => s.name);
  const street = useBuildingStore(s => s.address.street);
  const board = useBuildingStore(s => s.board);
  const units = useFinancialStore(s => s.units);

  const items = useMemo(() => buildItems(docs), [docs]);
  const pending: Item[] = items.filter(i => !decisions[i.key]);
  const decided = items.length - pending.length;
  const ess = essentials({ name, street, unitCount: units.length, boardCount: board.length, assessedUnits: units.filter(u => u.monthlyFee > 0).length });
  const missing = Object.values(ess).filter(v => !v).length;
  const pct = progress(docs, items, decided, ess);
  const reading = docs.filter(d => d.status === 'reading').length;
  const read = docs.filter(d => d.status === 'read').length;
  const clear = pending.filter(isClear);
  const minutes = Math.max(1, Math.round(pending.length * 0.25 + missing * 3 + (docs.length ? 0 : 8)));

  const next: NextStep =
    docs.length === 0 ? { step: 'documents', label: 'Start with your documents' }
      : reading > 0 && pending.length === 0 ? { step: 'documents', label: `Reading ${reading} document${reading === 1 ? '' : 's'}` }
        : pending.length > 0 ? { step: 'review', label: `Review ${pending.length} thing${pending.length === 1 ? '' : 's'} we found` }
          : missing > 0 ? { step: 'finish', label: `Fill the gaps · ${missing} essential${missing === 1 ? '' : 's'} left` }
            : { step: 'finish', label: 'Go live' };

  return { docs, items, decisions, pending, decided, clear, ess, missing, ready: missing === 0, pct, reading, read, minutes, next };
}

/** Whether this viewer should see setup: a building still setting up, seen by its board, manager or account owner. */
export function useNeedsSetup(): boolean {
  const tenant = useTenantContext();
  const role = useAuthStore(s => s.currentRole);
  return tenant.status === 'onboarding' && !tenant.onboarding.goLive && role !== 'RESIDENT';
}
