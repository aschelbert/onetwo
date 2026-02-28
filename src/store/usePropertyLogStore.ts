import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isBackendEnabled } from '@/lib/supabase';
import * as logSvc from '@/lib/services/propertyLog';
import type { PropertyLogEntry } from '@/lib/services/propertyLog';

export type { PropertyLogEntry } from '@/lib/services/propertyLog';

interface PropertyLogState {
  logs: PropertyLogEntry[];
  loadFromDb: (tenantId: string) => Promise<void>;
  addLog: (log: Omit<PropertyLogEntry, 'id'>, tenantId?: string) => void;
  updateLog: (id: string, updates: Partial<PropertyLogEntry>) => void;
  deleteLog: (id: string) => void;
}

export const usePropertyLogStore = create<PropertyLogState>()(persist((set) => ({
  logs: [
    { id: 'pl1', type: 'walkthrough', title: 'February Monthly Walkthrough', date: '2026-02-15', conductedBy: 'Diane Carter', location: 'Full property', status: 'open', findings: [
      { area: 'Lobby', condition: 'good', notes: 'Floors cleaned, lights working', severity: 'none' },
      { area: 'Parking Garage Level B1', condition: 'fair', notes: 'Water stain on ceiling near spot 42. Possible pipe condensation.', severity: 'medium' },
      { area: 'Rooftop Deck', condition: 'good', notes: 'Furniture in good condition. Drain clear.', severity: 'none' },
      { area: 'Stairwell 2 — Floor 5', condition: 'poor', notes: 'Exit sign light burnt out. Fire code requirement.', severity: 'high' },
    ], actionItems: [
      { description: 'Investigate water stain in parking garage B1', assignedTo: 'Quick Fix Plumbing', dueDate: '2026-02-28', status: 'open' },
      { description: 'Replace exit sign light — Stairwell 2 Floor 5', assignedTo: 'Building maintenance', dueDate: '2026-02-20', status: 'done' },
    ], notes: 'Overall property in good condition. Two items flagged for follow-up.' },
    { id: 'pl2', type: 'inspection', title: 'Elevator Annual Inspection', date: '2025-08-20', conductedBy: 'DC Elevator Safety Division', location: 'Elevator shafts 1 & 2', status: 'resolved', findings: [
      { area: 'Passenger Elevator', condition: 'good', notes: 'All safety mechanisms functioning. Certificate renewed.', severity: 'none' },
      { area: 'Service Elevator', condition: 'fair', notes: 'Door alignment slightly off on Floor 3. Adjusted on-site.', severity: 'low' },
    ], actionItems: [], notes: 'Inspection passed. Certificate valid until Aug 2026.' },
  ],

  loadFromDb: async (tenantId: string) => {
    const logs = await logSvc.fetchLogs(tenantId);
    if (logs) set({ logs });
  },

  addLog: (log, tenantId?) => {
    const id = 'pl' + Date.now();
    set(s => ({ logs: [{ id, ...log }, ...s.logs] }));
    if (isBackendEnabled && tenantId) {
      logSvc.createLog(tenantId, log).then(dbRow => {
        if (dbRow) set(s => ({ logs: s.logs.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      });
    }
  },

  updateLog: (id, updates) => {
    set(s => ({ logs: s.logs.map(l => l.id === id ? { ...l, ...updates } : l) }));
    if (isBackendEnabled) logSvc.updateLog(id, updates);
  },

  deleteLog: (id) => {
    set(s => ({ logs: s.logs.filter(l => l.id !== id) }));
    if (isBackendEnabled) logSvc.deleteLog(id);
  },
}), {
  name: 'onetwo-property-log',
  merge: (persisted: any, current: any) => ({
    ...current,
    ...(persisted || {}),
  }),
}));
