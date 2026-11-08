/**
 * Building setup state: the documents you added (and what was read from
 * them) and your decision on each item found. Kept per browser and reset
 * when a different building loads. What you accept is written into the
 * building's own records straight away (`applySetup`), so this store only
 * remembers the review, not the data.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { pathFor, type Decision, type SetupDoc } from './setupModel';

/** Who someone is invited as. Owners and residents are tied to a unit; board members to a seat. */
export type InviteAccess = 'owner' | 'resident' | 'board' | 'property_manager' | 'staff';
export interface SetupInvite { id: string; email: string; access: InviteAccess; seat: string | null; unit: string | null; sentAt?: string }

interface SetupState {
  docs: SetupDoc[];
  decisions: Record<string, Decision>;
  /** Steps marked "later" in Fill the gaps. */
  later: string[];
  /** The Home card is hidden; a chip stays in the header. */
  hidden: boolean;
  invitedBoard: boolean;
  /** People added on the invite step, kept until sent (and after, marked sent). */
  invites: SetupInvite[];
  addInvites: (list: Omit<SetupInvite, 'id'>[]) => void;
  removeInvite: (id: string) => void;
  markInvitesSent: (emails: string[], at: string) => void;
  addDoc: (doc: SetupDoc) => void;
  updateDoc: (id: string, patch: Partial<SetupDoc>) => void;
  removeDoc: (id: string) => void;
  decide: (key: string, d: Omit<Decision, 'at'>) => void;
  undo: (key: string) => void;
  setLater: (id: string, later: boolean) => void;
  setHidden: (hidden: boolean) => void;
  setInvitedBoard: (v: boolean) => void;
  reset: () => void;
}

const EMPTY = { docs: [] as SetupDoc[], decisions: {} as Record<string, Decision>, later: [] as string[], hidden: false, invitedBoard: false, invites: [] as SetupInvite[] };

export const useSetupStore = create<SetupState>()(persist((set) => ({
  ...EMPTY,
  addDoc: (doc) => set(s => ({ docs: [...s.docs, doc] })),
  updateDoc: (id, patch) => set(s => ({ docs: s.docs.map(d => (d.id === id ? { ...d, ...patch } : d)) })),
  removeDoc: (id) => set(s => ({ docs: s.docs.filter(d => d.id !== id) })),
  decide: (key, d) => set(s => ({ decisions: { ...s.decisions, [key]: { ...d, at: new Date().toISOString() } } })),
  undo: (key) => set(s => { const next = { ...s.decisions }; delete next[key]; return { decisions: next }; }),
  setLater: (id, later) => set(s => ({ later: later ? [...new Set([...s.later, id])] : s.later.filter(x => x !== id) })),
  setHidden: (hidden) => set({ hidden }),
  setInvitedBoard: (invitedBoard) => set({ invitedBoard }),
  addInvites: (list) => set(s => {
    const have = new Set(s.invites.map(i => i.email.toLowerCase()));
    const fresh = list.filter(i => !have.has(i.email.toLowerCase()) && (have.add(i.email.toLowerCase()), true));
    return { invites: [...s.invites, ...fresh.map(i => ({ ...i, id: `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` }))] };
  }),
  removeInvite: (id) => set(s => ({ invites: s.invites.filter(i => i.id !== id) })),
  markInvitesSent: (emails, at) => set(s => {
    const sent = new Set(emails.map(e => e.toLowerCase()));
    return { invites: s.invites.map(i => (sent.has(i.email.toLowerCase()) ? { ...i, sentAt: at } : i)) };
  }),
  reset: () => set({ ...EMPTY }),
}), {
  name: 'onetwo-setup',
  version: 2,
  // v2: items accepted before every item had a home in the app (old destinations such as "Rules on file")
  // go back to review, so accepting them again puts them where they now belong.
  migrate: (persisted, version) => {
    const st = (persisted ?? {}) as Partial<SetupState>;
    if (!st.invites) st.invites = [];
    if (version < 2 && st.decisions) {
      st.decisions = Object.fromEntries(Object.entries(st.decisions).filter(([, d]) => d.status === 'skipped' || !!pathFor(d.savedTo)));
    }
    return st as SetupState;
  },
  // A document still "reading" when the page closed never finished: show it as failed so it can be read again.
  onRehydrateStorage: () => (state) => {
    if (!state) return;
    const stuck = state.docs.some(d => d.status === 'reading');
    if (stuck) useSetupStore.setState({ docs: state.docs.map(d => (d.status === 'reading' ? { ...d, status: 'error' as const, error: 'Reading stopped when the page closed. Add the file again.' } : d)) });
  },
}));
