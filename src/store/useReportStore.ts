import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isBackendEnabled } from '@/lib/supabase';
import * as reportsSvc from '@/lib/services/reports';
import type { ReportConfig, GeneratedReport } from '@/lib/services/reports';

export type { ReportConfig, GeneratedReport } from '@/lib/services/reports';

interface ReportState {
  configs: ReportConfig[];
  reports: GeneratedReport[];
  loadFromDb: (tenantId: string) => Promise<void>;
  addConfig: (config: Omit<ReportConfig, 'id'>, tenantId?: string) => void;
  updateConfig: (id: string, updates: Partial<ReportConfig>) => void;
  deleteConfig: (id: string) => void;
  addReport: (report: Omit<GeneratedReport, 'id'>, tenantId?: string) => void;
  deleteReport: (id: string) => void;
}

export const useReportStore = create<ReportState>()(persist((set) => ({
  configs: [
    { id: 'rc1', name: 'Monthly Board Packet', type: 'board_packet', sections: [
      { id: 'financial', label: 'Financial Summary', enabled: true },
      { id: 'compliance', label: 'Compliance Status', enabled: true },
      { id: 'maintenance', label: 'Maintenance & Work Orders', enabled: true },
      { id: 'issues', label: 'Open Issues & Cases', enabled: true },
      { id: 'meetings', label: 'Meeting Minutes', enabled: true },
      { id: 'delinquency', label: 'Delinquency Report', enabled: true },
      { id: 'vendor', label: 'Vendor Activity', enabled: false },
      { id: 'property_log', label: 'Property Log', enabled: false },
    ], schedule: 'monthly', lastGenerated: '', createdBy: 'Robert Mitchell' },
  ],
  reports: [],

  loadFromDb: async (tenantId: string) => {
    const [configs, reports] = await Promise.all([
      reportsSvc.fetchConfigs(tenantId),
      reportsSvc.fetchReports(tenantId),
    ]);
    const updates: Partial<ReportState> = {};
    if (configs) updates.configs = configs;
    if (reports) updates.reports = reports;
    if (Object.keys(updates).length > 0) set(updates);
  },

  addConfig: (config, tenantId?) => {
    const id = 'rc' + Date.now();
    set(s => ({ configs: [{ id, ...config }, ...s.configs] }));
    if (isBackendEnabled && tenantId) {
      reportsSvc.createConfig(tenantId, config).then(dbRow => {
        if (dbRow) set(s => ({ configs: s.configs.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      });
    }
  },

  updateConfig: (id, updates) => {
    set(s => ({ configs: s.configs.map(c => c.id === id ? { ...c, ...updates } : c) }));
    if (isBackendEnabled) reportsSvc.updateConfig(id, updates);
  },

  deleteConfig: (id) => {
    set(s => ({ configs: s.configs.filter(c => c.id !== id) }));
    if (isBackendEnabled) reportsSvc.deleteConfig(id);
  },

  addReport: (report, tenantId?) => {
    const id = 'rpt' + Date.now();
    set(s => ({ reports: [{ id, ...report }, ...s.reports] }));
    if (isBackendEnabled && tenantId) {
      reportsSvc.createReport(tenantId, report).then(dbRow => {
        if (dbRow) set(s => ({ reports: s.reports.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      });
    }
  },

  deleteReport: (id) => {
    set(s => ({ reports: s.reports.filter(r => r.id !== id) }));
    if (isBackendEnabled) reportsSvc.deleteReport(id);
  },
}), {
  name: 'onetwo-reports',
  merge: (persisted: any, current: any) => ({
    ...current,
    ...(persisted || {}),
  }),
}));
