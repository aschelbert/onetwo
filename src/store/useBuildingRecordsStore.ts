import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isBackendEnabled, getActiveTenantId } from '@/lib/supabase';
import * as recordsSvc from '@/lib/services/buildingRecords';
import type { BuildingRecord } from '@/lib/buildingRecords';
import { generateLocalId } from '@/lib/generateId';

interface BuildingRecordsState {
  records: BuildingRecord[];
  /** Why the last save did not reach the database, when it did not. */
  saveError: string | null;
  loadFromDb: (tenantId: string) => Promise<void>;
  addRecord: (r: Omit<BuildingRecord, 'id'>) => void;
  updateRecord: (id: string, r: Partial<BuildingRecord>) => void;
  removeRecord: (id: string) => void;
}

const isLocal = (id: string) => id.startsWith('rec');

/** The building's licences, certificates, tests and notices (Building › Obligations › Licences and certificates). */
export const useBuildingRecordsStore = create<BuildingRecordsState>()(persist((set) => ({
  records: [],
  saveError: null,

  loadFromDb: async (tenantId) => {
    const records = await recordsSvc.fetchRecords(tenantId);
    if (records) set({ records });
  },

  addRecord: (r) => {
    const id = generateLocalId('rec');
    set(s => ({ records: [...s.records, { id, ...r }], saveError: null }));
    const tid = getActiveTenantId();
    if (isBackendEnabled && tid) {
      recordsSvc.createRecord(tid, r).then(saved => {
        if (saved) set(s => ({ records: s.records.map(x => (x.id === id ? { ...x, id: saved.id } : x)) }));
        else set(s => ({ records: s.records.filter(x => x.id !== id), saveError: 'That record could not be saved. Try again; if it keeps happening, the building\'s database may be waiting on an update.' }));
      }).catch(() => set(s => ({ records: s.records.filter(x => x.id !== id), saveError: 'That record could not be saved. Check the connection and try again.' })));
    }
  },

  updateRecord: (id, r) => {
    set(s => ({ records: s.records.map(x => (x.id === id ? { ...x, ...r } : x)) }));
    if (isBackendEnabled && !isLocal(id)) void recordsSvc.updateRecord(id, r);
  },

  removeRecord: (id) => {
    set(s => ({ records: s.records.filter(x => x.id !== id) }));
    if (isBackendEnabled && !isLocal(id)) void recordsSvc.deleteRecord(id);
  },
}), {
  name: 'onetwo-building-records',
  version: 1,
  partialize: s => ({ records: s.records }),
}));
