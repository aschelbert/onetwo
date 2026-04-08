import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ReportType =
  | 'board_packet'
  | 'financial_statement'
  | 'delinquency'
  | 'compliance_summary'
  | 'meeting_minutes'
  | 'annual_report';

export interface GeneratedReport {
  id: string;
  name: string;
  type: ReportType;
  periodStart: string;   // ISO date e.g. "2024-01-01"
  periodEnd: string;     // ISO date e.g. "2024-12-31"
  periodLabel: string;   // human label e.g. "FY 2024"
  sections: string[];    // section IDs included
  generatedAt: string;   // ISO datetime
  generatedBy: string;
}

interface ReportsState {
  reports: GeneratedReport[];
  addReport: (r: GeneratedReport) => void;
  deleteReport: (id: string) => void;
}

export const useReportsStore = create<ReportsState>()(persist((set) => ({
  reports: [],
  addReport: (r) => set((s) => ({ reports: [r, ...s.reports] })),
  deleteReport: (id) => set((s) => ({ reports: s.reports.filter((r) => r.id !== id) })),
}), {
  name: 'onetwo-wizard-reports',
  version: 2,
  merge: (persisted: any, current: any) => ({
    ...current,
    ...(persisted || {}),
  }),
}));
