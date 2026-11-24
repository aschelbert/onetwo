import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isBackendEnabled, getActiveTenantId } from '@/lib/supabase';
import * as registerSvc from '@/lib/services/register';
import type { RegisterEntry, RegisterKind } from '@/lib/register';

interface RegisterState {
  entries: RegisterEntry[];
  /** Why the last save did not reach the database, when it did not. */
  saveError: string | null;
  loadFromDb: (tenantId: string) => Promise<void>;
  /** Adds an entry and returns its id. */
  add: <K extends RegisterKind>(e: Omit<RegisterEntry<K>, 'id'>) => string;
  /** Changes top-level fields. */
  update: (id: string, patch: Partial<Omit<RegisterEntry, 'id' | 'kind' | 'data'>>) => void;
  /** Merges into the entry's own data (notice sent, hearing set, delivered…). */
  patchData: (id: string, patch: Record<string, unknown>) => void;
  remove: (id: string) => void;
}

/** Violations, architectural requests, resale certificate requests and liens (Board Room › Register). */
export const useRegisterStore = create<RegisterState>()(persist((set, get) => ({
  entries: [],
  saveError: null,

  loadFromDb: async (tenantId) => {
    const entries = await registerSvc.fetchEntries(tenantId);
    if (entries) set({ entries });
  },

  add: (e) => {
    const entry = { ...e, id: crypto.randomUUID() } as RegisterEntry;
    set(s => ({ entries: [entry, ...s.entries], saveError: null }));
    const tid = getActiveTenantId();
    if (isBackendEnabled && tid) {
      const failed = () => set(s => ({ entries: s.entries.filter(x => x.id !== entry.id), saveError: 'That entry could not be saved. Try again; if it keeps happening, the building\'s database may be waiting on an update.' }));
      registerSvc.createEntry(tid, entry).then(ok => { if (!ok) failed(); }).catch(failed);
    }
    return entry.id;
  },

  update: (id, patch) => {
    set(s => ({ entries: s.entries.map(x => (x.id === id ? { ...x, ...patch } as RegisterEntry : x)) }));
    if (isBackendEnabled) void registerSvc.updateEntry(id, patch);
  },

  patchData: (id, patch) => {
    set(s => ({ entries: s.entries.map(x => (x.id === id ? { ...x, data: { ...x.data, ...patch } } as RegisterEntry : x)) }));
    const data = get().entries.find(x => x.id === id)?.data;
    if (isBackendEnabled && data) void registerSvc.updateEntry(id, { data });
  },

  remove: (id) => {
    set(s => ({ entries: s.entries.filter(x => x.id !== id) }));
    if (isBackendEnabled) void registerSvc.deleteEntry(id);
  },
}), {
  name: 'onetwo-register',
  version: 1,
  partialize: s => ({ entries: s.entries }),
}));
