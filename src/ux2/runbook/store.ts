/**
 * Home card state — which cards the viewer hid, snoozed or marked done
 * locally. Persisted per browser like the other stores and mirrored to
 * `runbook_instances` when the backend is on.
 *
 * Hiding a card never changes the underlying record: the filing is still
 * pending, the step still open. It only takes the card off this person's
 * Home until the data changes or the snooze ends.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isBackendEnabled, getActiveTenantId } from '@/lib/supabase';
import * as runbookSvc from '@/lib/services/runbook';
import type { RunbookInstanceState } from '@/lib/services/runbook';

export interface CardState {
  state: RunbookInstanceState;
  /** YYYY-MM-DD the snooze ends. */
  snoozedUntil?: string;
  at: string;
}

interface RunbookStoreState {
  /** Keyed by `${userId}:${cardId}`. */
  cards: Record<string, CardState>;
  loadFromDb: (tenantId: string, userId: string) => Promise<void>;
  hide: (userId: string, cardId: string) => void;
  snooze: (userId: string, cardId: string, until: string) => void;
  markDone: (userId: string, cardId: string) => void;
  restore: (userId: string, cardId: string) => void;
  /** Ids hidden for this user as of `today` (snoozes that ended are not hidden). */
  hiddenFor: (userId: string, today: string) => Set<string>;
}

const key = (userId: string, cardId: string) => `${userId}:${cardId}`;

function sync(userId: string, cardId: string, cs: CardState | null) {
  const tid = getActiveTenantId();
  if (!isBackendEnabled || !tid) return;
  const op = cs
    ? runbookSvc.upsertRunbookInstance(tid, { cardId, userId, state: cs.state, snoozedUntil: cs.snoozedUntil ?? null, completedAt: cs.state === 'done' ? cs.at : null, meta: {} })
    : runbookSvc.deleteRunbookInstance(tid, userId, cardId);
  op.catch(err => console.error('[syncWrite] runbook instance failed:', err));
}

export const useRunbookStore = create<RunbookStoreState>()(
  persist(
    (set, get) => ({
      cards: {},
      loadFromDb: async (tenantId, userId) => {
        const rows = await runbookSvc.fetchRunbookInstances(tenantId, userId);
        if (!rows) return;
        const cards: Record<string, CardState> = { ...get().cards };
        for (const r of rows) cards[key(r.userId, r.cardId)] = { state: r.state, snoozedUntil: r.snoozedUntil ?? undefined, at: r.completedAt ?? new Date().toISOString() };
        set({ cards });
      },
      hide: (userId, cardId) => {
        const cs: CardState = { state: 'hidden', at: new Date().toISOString() };
        set(s => ({ cards: { ...s.cards, [key(userId, cardId)]: cs } }));
        sync(userId, cardId, cs);
      },
      snooze: (userId, cardId, until) => {
        const cs: CardState = { state: 'snoozed', snoozedUntil: until, at: new Date().toISOString() };
        set(s => ({ cards: { ...s.cards, [key(userId, cardId)]: cs } }));
        sync(userId, cardId, cs);
      },
      markDone: (userId, cardId) => {
        const cs: CardState = { state: 'done', at: new Date().toISOString() };
        set(s => ({ cards: { ...s.cards, [key(userId, cardId)]: cs } }));
        sync(userId, cardId, cs);
      },
      restore: (userId, cardId) => {
        set(s => {
          const cards = { ...s.cards };
          delete cards[key(userId, cardId)];
          return { cards };
        });
        sync(userId, cardId, null);
      },
      hiddenFor: (userId, today) => {
        const out = new Set<string>();
        const prefix = `${userId}:`;
        for (const [k, cs] of Object.entries(get().cards)) {
          if (!k.startsWith(prefix)) continue;
          if (cs.state === 'snoozed' && cs.snoozedUntil && cs.snoozedUntil <= today) continue;
          out.add(k.slice(prefix.length));
        }
        return out;
      },
    }),
    {
      name: 'onetwo-ux2-runbook',
      version: 1,
      partialize: s => ({ cards: s.cards }),
      merge: (persisted, current) => ({ ...current, ...((persisted as Partial<RunbookStoreState>) || {}) }),
    },
  ),
);
