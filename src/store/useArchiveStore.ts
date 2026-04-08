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

const seedArchives: ArchiveSnapshot[] = [
  {
    id: 'arch-fy2025',
    label: 'FY 2025 (Jan 1, 2025 – Dec 31, 2025)',
    periodStart: '2025-01-01',
    periodEnd: '2025-12-31',
    createdAt: '2026-01-15T14:00:00.000Z',
    createdBy: 'David Chen',
    compliance: {
      runbookCompletions: {
        g1: true, g2: true, g3: true, g4: true, g5: true, g6: true, g7: true, g8: true, g9: true,
        f1: true, f2: true, f3: true, f4: true, f5: true, f6: true, f7: true,
        i1: true, i2: true, i3: true, i4: true, i5: true, i6: true,
        m1: true, m2: true, m3: true, m4: true, m5: true, m6: true,
        r1: true, r2: true, r3: true, r4: true, r5: true,
        o1: true, o2: true, o3: true, o4: true,
        e1: true, e2: true, e3: true,
        l1: true, l2: true,
      },
      healthIndex: 100,
      grade: 'A+',
    },
    regulatoryRefresh: {
      refreshedAt: '2025-12-31T10:00:00.000Z',
      jurisdiction: 'DC',
      documentsDetected: ['Bylaws', 'CC&Rs / Declaration', 'Rules & Regulations', 'Resale Certificate Policy', 'Assessment Collection Policy', 'Document Retention Policy', 'Emergency Preparedness Plan'],
      regulatoryNotes: ['Bylaws detected — bylaw-specific references activated.', 'CC&Rs/Declaration detected — declaration-specific checks enabled.'],
      categoryCount: 8,
      totalChecklistItems: 44,
    },
    filings: [
      { id: 'rf-a1', name: 'DC Biennial Report', category: 'government', dueDate: '2025-04-01', status: 'filed', filedDate: '2025-03-20', confirmationNum: 'DCRA-2025-4482', notes: 'Filed on time.', responsible: 'President', recurrence: 'biennial', legalRef: 'DC Code § 29-102.11', attachments: [] },
      { id: 'rf-a2', name: 'Form 1120-H (Federal Tax Return)', category: 'tax', dueDate: '2025-04-15', status: 'filed', filedDate: '2025-04-10', confirmationNum: 'IRS-1120H-2024', notes: 'Filed for FY 2024.', responsible: 'Treasurer', recurrence: 'annual', legalRef: 'IRS Code § 528', attachments: [] },
      { id: 'rf-a3', name: 'Annual Fire Safety Inspection', category: 'inspection', dueDate: '2025-06-30', status: 'filed', filedDate: '2025-06-15', confirmationNum: 'DCFEMS-2025-1122', notes: 'Passed.', responsible: 'Vice President', recurrence: 'annual', legalRef: 'DC Fire Code', attachments: [] },
      { id: 'rf-a4', name: 'Elevator Inspection Certificate', category: 'inspection', dueDate: '2025-08-15', status: 'filed', filedDate: '2025-08-20', confirmationNum: 'ELEV-2025-8842', notes: 'Both elevators passed.', responsible: 'Vice President', recurrence: 'annual', legalRef: 'DC Code § 1-303.43', attachments: [] },
      { id: 'rf-a5', name: 'Annual Financial Audit', category: 'financial', dueDate: '2025-06-30', status: 'filed', filedDate: '2025-05-28', confirmationNum: 'AUDIT-2024', notes: 'Clean opinion from CPA Solutions Inc.', responsible: 'Treasurer', recurrence: 'annual', legalRef: 'DC Code § 29-1135.05', attachments: [] },
    ],
    meetings: [
      { id: 'mtg-a1', title: 'Annual General Meeting 2025', type: 'ANNUAL', status: 'COMPLETED', date: '2025-12-10', time: '19:00', location: 'Community Room', agenda: ['Election of board members', 'Annual financial report', 'Fee structure for 2026', 'Q&A session'], notes: '42 of 50 units represented.', minutes: 'Annual General Meeting called to order at 7:00 PM. 42 of 50 units represented (84%). Board election held. 3% assessment increase approved.', attendees: { board: ['Robert Mitchell', 'Jennifer Adams', 'David Chen', 'Maria Rodriguez', 'Thomas Baker'], owners: ['Unit 101', 'Unit 201', 'Unit 301', 'Unit 401', 'Unit 502'], guests: ['PremierProperty — Diane Carter'] }, votes: [{ id: 'v-a1', motion: 'Approve 3% assessment increase for 2026', type: 'owner', status: 'passed', date: '2025-12-10', results: [{ name: 'Aggregate', vote: '9 approve, 2 deny, 1 abstain' }], tally: { approve: 9, deny: 2, abstain: 1 } }] },
    ],
    communications: [
      { id: 'oc-a1', type: 'notice', subject: '2025 Annual Meeting Notice', date: '2025-11-10', method: 'mail+email', recipients: 'All owners (50 units)', status: 'sent', notes: '30-day notice with proxy forms.' },
      { id: 'oc-a2', type: 'financial', subject: '2024 Annual Financial Statements', date: '2025-03-15', method: 'email+portal', recipients: 'All owners (50 units)', status: 'sent', notes: 'Income statement, balance sheet, reserve fund status.' },
      { id: 'oc-a3', type: 'notice', subject: 'Annual Owner Rights Notice', date: '2025-01-15', method: 'mail', recipients: 'All owners (50 units)', status: 'sent', notes: 'Statutory rights disclosure.' },
    ],
    financial: {
      collectionRate: 96,
      totalBudgeted: 310000,
      totalActual: 295000,
      reserveBalance: 125000,
      totalAR: 4200,
      monthlyRevenue: 25500,
      unitCount: 50,
      occupiedCount: 49,
      delinquentCount: 3,
    },
    insurance: [
      { type: 'Directors & Officers (D&O)', carrier: 'Chubb Insurance', policyNumber: 'DO-2025-4421', coverage: '$2,000,000', premium: '$3,100/yr', expires: '2025-09-30', status: 'renewed' },
      { type: 'General Liability', carrier: 'Hartford Insurance', policyNumber: 'GL-2025-8890', coverage: '$5,000,000', premium: '$8,200/yr', expires: '2025-09-30', status: 'renewed' },
      { type: 'Property / Hazard', carrier: 'Travelers Insurance', policyNumber: 'PH-2025-1155', coverage: '$15,000,000', premium: '$17,500/yr', expires: '2025-09-30', status: 'renewed' },
      { type: 'Fidelity Bond', carrier: 'Chubb Insurance', policyNumber: 'FB-2025-3302', coverage: '$500,000', premium: '$1,050/yr', expires: '2025-09-30', status: 'renewed' },
    ],
    legalDocuments: [
      { name: 'Condominium Bylaws', version: '3.0 (Amended 2024)', status: 'current', attachments: [{ name: 'Bylaws_v3_2024.pdf', size: '2.4 MB' }] },
      { name: 'CC&Rs', version: '2.0 (Amended 2023)', status: 'current', attachments: [{ name: 'CCR_v2_2023.pdf', size: '1.8 MB' }] },
      { name: 'Reserve Study (2025)', version: '2025 Update', status: 'current', attachments: [{ name: 'ReserveStudy_2025.pdf', size: '5.8 MB' }] },
    ],
    board: [
      { name: 'Robert Mitchell', role: 'President', term: 'Jan 2025 – Dec 2026' },
      { name: 'Jennifer Adams', role: 'Vice President', term: 'Jan 2025 – Dec 2026' },
      { name: 'David Chen', role: 'Treasurer', term: 'Jan 2025 – Dec 2026' },
      { name: 'Maria Rodriguez', role: 'Secretary', term: 'Jan 2024 – Dec 2025' },
      { name: 'Thomas Baker', role: 'Member at Large', term: 'Jan 2024 – Dec 2025' },
    ],
  },
];

export const useArchiveStore = create<ArchiveState>()(persist((set) => ({
  archives: seedArchives,

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
  version: 2,
  merge: (persisted: any, current: any) => ({
    ...current,
    ...(persisted || {}),
    archives: persisted?.archives?.length ? persisted.archives : current.archives,
  }),
}));
