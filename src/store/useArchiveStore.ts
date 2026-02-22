import { create } from 'zustand';

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
  addArchive: (a: ArchiveSnapshot) => void;
  deleteArchive: (id: string) => void;
}

export const useArchiveStore = create<ArchiveState>((set) => ({
  archives: [],
  addArchive: (a) => set(s => ({ archives: [a, ...s.archives] })),
  deleteArchive: (id) => set(s => ({ archives: s.archives.filter(a => a.id !== id) })),
}));
