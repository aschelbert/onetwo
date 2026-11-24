import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isBackendEnabled, getActiveTenantId } from '@/lib/supabase';
import * as recordsSvc from '@/lib/services/actionRecords';
import type { ActionRecord } from '@/lib/actions/types';

interface ActionRecordsState {
  records: ActionRecord[];
  /** Why the last save did not reach the database, when it did not. */
  saveError: string | null;
  loadFromDb: (tenantId: string) => Promise<void>;
  /** Adds a record and returns its id. */
  add: (r: Omit<ActionRecord, 'id'>) => string;
  /** Changes the record's own fields (title, dates, unit). */
  patch: (id: string, changes: Partial<Omit<ActionRecord, 'id' | 'kind' | 'data'>>) => void;
  /** Merges into the record's data. A nested group is replaced whole, so pass the full group. */
  patchData: (id: string, changes: Record<string, unknown>) => void;
  remove: (id: string) => void;
  /** The one standing document of a kind (utility meters and bills, the year's objectives), or undefined. */
  doc: (kind: string) => ActionRecord | undefined;
  /** Writes the standing document of a kind, creating it the first time. */
  setDoc: (kind: string, title: string, data: Record<string, unknown>, today: string) => void;
}

/** The records behind the Board Room's guided actions, and the standing documents those actions read. */
export const useActionRecordsStore = create<ActionRecordsState>()(persist((set, get) => ({
  records: [],
  saveError: null,

  loadFromDb: async (tenantId) => {
    const records = await recordsSvc.fetchRecords(tenantId);
    if (records) set({ records });
  },

  add: (r) => {
    const record: ActionRecord = { ...r, id: crypto.randomUUID() };
    set(s => ({ records: [record, ...s.records], saveError: null }));
    const tid = getActiveTenantId();
    if (isBackendEnabled && tid) {
      const failed = () => set(s => ({ records: s.records.filter(x => x.id !== record.id), saveError: "That could not be saved. Try again; if it keeps happening, the building's database may be waiting on an update." }));
      recordsSvc.createRecord(tid, record).then(ok => { if (!ok) failed(); }).catch(failed);
    }
    return record.id;
  },

  patch: (id, changes) => {
    set(s => ({ records: s.records.map(x => (x.id === id ? { ...x, ...changes } : x)) }));
    const now = get().records.find(x => x.id === id);
    if (isBackendEnabled && now) void recordsSvc.updateRecord(now);
  },

  patchData: (id, changes) => {
    set(s => ({ records: s.records.map(x => (x.id === id ? { ...x, data: { ...x.data, ...changes } } : x)) }));
    const now = get().records.find(x => x.id === id);
    if (isBackendEnabled && now) void recordsSvc.updateRecord(now);
  },

  remove: (id) => {
    set(s => ({ records: s.records.filter(x => x.id !== id) }));
    if (isBackendEnabled) void recordsSvc.deleteRecord(id);
  },

  doc: (kind) => get().records.find(r => r.kind === kind),

  setDoc: (kind, title, data, today) => {
    const existing = get().records.find(r => r.kind === kind);
    if (existing) get().patchData(existing.id, data);
    else get().add({ kind, title, unit: '', openedOn: today, dueOn: '', closedOn: '', data });
  },
}), {
  name: 'onetwo-action-records',
  version: 1,
  partialize: s => ({ records: s.records }),
}));
