import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isBackendEnabled } from '@/lib/supabase';
import * as archivesSvc from '@/lib/services/archives';

export interface ArchiveSnapshot {
  id: string;
  label: string;          // e.g., "FY 2025 (Jan 1, 2025 – Dec 31, 2025)"
  periodStart: string;    // ISO date
  periodEnd: string;      // ISO date
  createdAt: string;      // ISO datetime
  createdBy: string;      // board member / mgmt name

  // What's included — each section stores a frozen copy
  compliance: {
    runbookCompletions: Record<string, boolean>;
    healthIndex: number;
    grade: string;
  };
  regulatoryRefresh: {
    refreshedAt: string;
    jurisdiction: string;
    documentsDetected: string[];
    regulatoryNotes: string[];
    categoryCount: number;
    totalChecklistItems: number;
  };
  filings: Array<{
    id: string; name: string; category: string; dueDate: string; status: string;
    filedDate: string | null; confirmationNum: string; notes: string;
    responsible: string; recurrence: string; legalRef: string;
    attachments: Array<{ name: string; size: string; uploadedAt: string }>;
  }>;
  meetings: Array<{
    id: string; title: string; type: string; status: string; date: string; time: string;
    location: string; agenda: string[]; notes: string; minutes: string;
    attendees: { board: string[]; owners: string[]; guests: string[] };
    votes: Array<{ id: string; motion: string; type: string; status: string; date: string;
      results: Array<{ name: string; vote: string }>; tally: { approve: number; deny: number; abstain: number } }>;
  }>;
  communications: Array<{
    id: string; type: string; subject: string; date: string; method: string;
    recipients: string; status: string; notes: string;
  }>;
  financial: {
    collectionRate: number;
    totalBudgeted: number;
    totalActual: number;
    reserveBalance: number;
    totalAR: number;
    monthlyRevenue: number;
    unitCount: number;
    occupiedCount: number;
    delinquentCount: number;
  };
  insurance: Array<{
    type: string; carrier: string; policyNumber: string; coverage: string;
    premium: string; expires: string; status: string;
  }>;
  legalDocuments: Array<{
    name: string; version: string; status: string;
    attachments: Array<{ name: string; size: string }>;
  }>;
  board: Array<{ name: string; role: string; term: string }>;
}

interface ArchiveState {
  archives: ArchiveSnapshot[];
  loadFromDb: (tenantId: string) => Promise<void>;
  addArchive: (a: ArchiveSnapshot, tenantId?: string) => void;
  deleteArchive: (id: string) => void;
}

export const useArchiveStore = create<ArchiveState>()(persist((set) => ({
  archives: [],

  loadFromDb: async (tenantId: string) => {
    const archives = await archivesSvc.fetchArchives(tenantId);
    if (archives) set({ archives });
  },

  addArchive: (a, tenantId?) => {
    set(s => ({ archives: [a, ...s.archives] }));
    if (isBackendEnabled && tenantId) {
      archivesSvc.createArchive(tenantId, a).then(dbRow => {
        if (dbRow) set(s => ({ archives: s.archives.map(x => x.id === a.id ? { ...x, id: dbRow.id } : x) }));
      });
    }
  },

  deleteArchive: (id) => {
    set(s => ({ archives: s.archives.filter(a => a.id !== id) }));
    if (isBackendEnabled) archivesSvc.deleteArchive(id);
  },
}), {
  name: 'onetwo-archives',
  merge: (persisted: any, current: any) => ({
    ...current,
    ...(persisted || {}),
  }),
}));
