import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isBackendEnabled } from '@/lib/supabase';
import * as announcementsSvc from '@/lib/services/announcements';
import * as communicationsSvc from '@/lib/services/communications';

export interface FilingAttachment {
  name: string; size: string; uploadedAt: string;
}

export interface RegulatoryFiling {
  id: string; name: string; category: string; dueDate: string; status: 'pending' | 'filed';
  filedDate: string | null; confirmationNum: string; notes: string;
  responsible: string; recurrence: string; legalRef: string;
  attachments: FilingAttachment[];
}

export interface OwnerCommunication {
  id: string; type: string; subject: string; date: string; method: string;
  recipients: string; respondedBy: string | null; status: 'sent' | 'pending' | 'draft'; notes: string;
}

export interface Announcement {
  id: string; title: string; body: string; category: 'general' | 'maintenance' | 'financial' | 'safety' | 'rules' | 'meeting';
  postedBy: string; postedDate: string; pinned: boolean;
}

interface ComplianceState {
  completions: Record<string, boolean>;
  itemAttachments: Record<string, FilingAttachment[]>;
  filings: RegulatoryFiling[];
  communications: OwnerCommunication[];
  announcements: Announcement[];

  // DB sync
  loadFromDb: (tenantId: string) => Promise<void>;

  toggleItem: (id: string) => void;
  setCompletion: (id: string, val: boolean) => void;

  addItemAttachment: (itemId: string, att: FilingAttachment) => void;
  removeItemAttachment: (itemId: string, attName: string) => void;

  addFiling: (f: Omit<RegulatoryFiling, 'id' | 'status' | 'filedDate' | 'confirmationNum' | 'attachments'>) => void;
  markFilingComplete: (id: string, filedDate: string, confirmationNum: string) => void;
  deleteFiling: (id: string) => void;
  addFilingAttachment: (id: string, att: FilingAttachment) => void;
  removeFilingAttachment: (id: string, attName: string) => void;

  addCommunication: (c: Omit<OwnerCommunication, 'id'>, tenantId?: string) => void;
  deleteCommunication: (id: string) => void;

  addAnnouncement: (a: Omit<Announcement, 'id'>, tenantId?: string) => void;
  deleteAnnouncement: (id: string) => void;
  togglePinAnnouncement: (id: string) => void;
}

export const useComplianceStore = create<ComplianceState>()(persist((set) => ({
  completions: {
    g1: true, g3: true, g4: true, f1: true, f2: true, f4: true, f5: true,
    i1: true, i2: true, i4: true, m2: true, m3: true, r1: true, r2: true, r4: true,
  },

  itemAttachments: {},

  filings: [
    { id: 'rf1', name: 'DC Biennial Report', category: 'government', dueDate: '2026-04-01', status: 'pending', filedDate: null, confirmationNum: '', notes: 'File with DCRA. $80 fee.', responsible: 'President', recurrence: 'biennial', legalRef: 'DC Code § 29-102.11', attachments: [] },
    { id: 'rf2', name: 'Form 1120-H (Federal Tax Return)', category: 'tax', dueDate: '2026-03-15', status: 'pending', filedDate: null, confirmationNum: '', notes: 'Form 1120-H for exempt function income. Due March 15. Extension available.', responsible: 'Treasurer', recurrence: 'annual', legalRef: 'IRS Code § 528', attachments: [] },
    { id: 'rf3', name: 'DC Personal Property Tax Return', category: 'tax', dueDate: '2026-07-31', status: 'pending', filedDate: null, confirmationNum: '', notes: 'If HOA owns tangible personal property >$225K.', responsible: 'Treasurer', recurrence: 'annual', legalRef: 'DC Code § 47-1508', attachments: [] },
    { id: 'rf4', name: 'Annual Fire Safety Inspection', category: 'inspection', dueDate: '2026-06-30', status: 'pending', filedDate: null, confirmationNum: '', notes: 'Schedule with DC Fire and EMS.', responsible: 'Vice President', recurrence: 'annual', legalRef: 'DC Fire Code', attachments: [] },
    { id: 'rf5', name: 'Elevator Inspection Certificate', category: 'inspection', dueDate: '2026-08-15', status: 'filed', filedDate: '2025-08-20', confirmationNum: 'ELEV-2025-8842', notes: 'Annual inspection by certified inspector.', responsible: 'Vice President', recurrence: 'annual', legalRef: 'DC Code § 1-303.43', attachments: [{ name: 'elevator-cert-2025.pdf', size: '245 KB', uploadedAt: '2025-08-20' }] },
    { id: 'rf6', name: 'Annual Financial Audit', category: 'financial', dueDate: '2026-06-30', status: 'pending', filedDate: null, confirmationNum: '', notes: 'Independent CPA review of HOA financials.', responsible: 'Treasurer', recurrence: 'annual', legalRef: 'DC Code § 29-1135.05', attachments: [] },
  ],

  communications: [
    { id: 'oc1', type: 'notice', subject: '2026 Assessment Increase Notice (3%)', date: '2025-12-15', method: 'mail+email', recipients: 'All owners (50 units)', respondedBy: null, status: 'sent', notes: 'Included: new monthly amount, effective date, budget summary.' },
    { id: 'oc2', type: 'minutes', subject: 'January Board Meeting Minutes', date: '2026-01-20', method: 'email', recipients: 'All owners (50 units)', respondedBy: 'Secretary', status: 'sent', notes: 'Distributed within 10 days of meeting.' },
    { id: 'oc3', type: 'notice', subject: 'Annual Owner Rights Notice (DC Condo Act)', date: '2026-01-10', method: 'mail', recipients: 'All owners (50 units)', respondedBy: null, status: 'sent', notes: 'Right to inspect records, attend meetings, run for board.' },
    { id: 'oc4', type: 'financial', subject: '2025 Annual Financial Statements', date: '2026-02-28', method: 'email+portal', recipients: 'All owners (50 units)', respondedBy: 'Treasurer', status: 'pending', notes: 'Income statement, balance sheet, reserve fund status.' },
    { id: 'oc5', type: 'response', subject: 'Unit 502 — Balcony Enclosure Violation Notice', date: '2026-01-22', method: 'certified mail', recipients: 'Unit 502 — Lisa Chen', respondedBy: 'VP', status: 'sent', notes: 'First notice of violation. 30-day cure period.' },
    { id: 'oc6', type: 'resale', subject: 'Resale Certificate Package — Unit 204', date: '2026-02-05', method: 'email', recipients: 'Unit 204 buyer agent', respondedBy: 'Secretary', status: 'sent', notes: 'Bylaws, CC&Rs, rules, budget, reserve study, insurance cert.' },
  ],

  announcements: [
    { id: 'ann1', title: 'Elevator Modernization Project — March Timeline', body: 'The board has approved an elevator modernization project beginning March 15. Service elevator will be out of commission for approximately 6 weeks. The passenger elevator will remain in service throughout. Residents on floors 5+ are encouraged to plan accordingly for move-ins/outs during this period. Contractor: Schindler Elevator Corp. Questions? Contact the property manager.', category: 'maintenance', postedBy: 'Vice President', postedDate: '2026-02-20', pinned: true },
    { id: 'ann2', title: '2026 Annual Meeting — Save the Date', body: 'The 2026 Annual Meeting of Unit Owners is scheduled for Saturday, March 28 at 10:00 AM in the community room. Agenda includes: board elections (2 seats), 2026 budget ratification, reserve fund update, and Q&A. Proxy forms will be mailed by March 1. If you are interested in running for the board, please submit your candidacy by March 14.', category: 'meeting', postedBy: 'President', postedDate: '2026-02-15', pinned: true },
    { id: 'ann3', title: 'Monthly Assessment Reminder — Auto-Pay Available', body: 'A friendly reminder that monthly assessments are due on the 1st of each month. Late fees apply after the 15th per the collection policy. We now offer auto-pay through the resident portal — set it up under My Unit > Payment Settings to avoid late fees.', category: 'financial', postedBy: 'Treasurer', postedDate: '2026-02-01', pinned: false },
    { id: 'ann4', title: 'Fire Alarm Testing — February 28', body: 'DC Fire and EMS will conduct annual fire alarm testing on Friday, February 28 between 9 AM and 3 PM. Expect intermittent alarm sounds throughout the day. No evacuation required unless continuous alarm. Please ensure your unit smoke detectors have fresh batteries.', category: 'safety', postedBy: 'Vice President', postedDate: '2026-02-18', pinned: false },
    { id: 'ann5', title: 'Updated Quiet Hours Policy', body: 'The board has approved updated quiet hours effective March 1: Sunday–Thursday 10 PM to 8 AM, Friday–Saturday 11 PM to 9 AM. Construction and renovation work remains restricted to Monday–Friday 9 AM to 5 PM. Please review the updated House Rules posted in the lobby and on the portal.', category: 'rules', postedBy: 'President', postedDate: '2026-02-10', pinned: false },
  ],

  // ── DB sync ──
  loadFromDb: async (tenantId: string) => {
    const [announcements, communications] = await Promise.all([
      announcementsSvc.fetchAnnouncements(tenantId),
      communicationsSvc.fetchCommunications(tenantId),
    ]);
    const updates: Partial<ComplianceState> = {};
    if (announcements) updates.announcements = announcements;
    if (communications) updates.communications = communications;
    if (Object.keys(updates).length > 0) set(updates);
  },

  toggleItem: (id) => set(s => ({ completions: { ...s.completions, [id]: !s.completions[id] } })),
  setCompletion: (id, val) => set(s => ({ completions: { ...s.completions, [id]: val } })),

  addItemAttachment: (itemId, att) => set(s => ({
    itemAttachments: { ...s.itemAttachments, [itemId]: [...(s.itemAttachments[itemId] || []), att] }
  })),
  removeItemAttachment: (itemId, attName) => set(s => ({
    itemAttachments: { ...s.itemAttachments, [itemId]: (s.itemAttachments[itemId] || []).filter(a => a.name !== attName) }
  })),

  addFiling: (f) => set(s => ({ filings: [...s.filings, { id: 'rf' + Date.now(), status: 'pending', filedDate: null, confirmationNum: '', attachments: [], ...f }] })),
  markFilingComplete: (id, filedDate, confirmationNum) => set(s => ({ filings: s.filings.map(f => f.id === id ? { ...f, status: 'filed', filedDate, confirmationNum } : f) })),
  deleteFiling: (id) => set(s => ({ filings: s.filings.filter(f => f.id !== id) })),
  addFilingAttachment: (id, att) => set(s => ({ filings: s.filings.map(f => f.id === id ? { ...f, attachments: [...f.attachments, att] } : f) })),
  removeFilingAttachment: (id, attName) => set(s => ({ filings: s.filings.map(f => f.id === id ? { ...f, attachments: f.attachments.filter(a => a.name !== attName) } : f) })),

  addCommunication: (c, tenantId?) => {
    const id = 'oc' + Date.now();
    set(s => ({ communications: [{ id, ...c }, ...s.communications] }));
    if (isBackendEnabled && tenantId) {
      communicationsSvc.createCommunication(tenantId, c).then(dbRow => {
        if (dbRow) set(s => ({ communications: s.communications.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      });
    }
  },
  deleteCommunication: (id) => {
    set(s => ({ communications: s.communications.filter(c => c.id !== id) }));
    if (isBackendEnabled) communicationsSvc.deleteCommunication(id);
  },

  addAnnouncement: (a, tenantId?) => {
    const id = 'ann' + Date.now();
    set(s => ({ announcements: [{ id, ...a }, ...(s.announcements || [])] }));
    if (isBackendEnabled && tenantId) {
      announcementsSvc.createAnnouncement(tenantId, a).then(dbRow => {
        if (dbRow) set(s => ({ announcements: (s.announcements || []).map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      });
    }
  },
  deleteAnnouncement: (id) => {
    set(s => ({ announcements: (s.announcements || []).filter(a => a.id !== id) }));
    if (isBackendEnabled) announcementsSvc.deleteAnnouncement(id);
  },
  togglePinAnnouncement: (id) => {
    set(s => ({ announcements: (s.announcements || []).map(a => a.id === id ? { ...a, pinned: !a.pinned } : a) }));
    if (isBackendEnabled) {
      const a = useComplianceStore.getState().announcements.find(x => x.id === id);
      if (a) announcementsSvc.updateAnnouncement(id, { pinned: a.pinned });
    }
  },
}), {
  name: 'onetwo-compliance',
  merge: (persisted: any, current: any) => ({
    ...current,
    ...persisted,
    announcements: persisted?.announcements || current.announcements || [],
  }),
}));
