import { create } from 'zustand';

export interface RegulatoryFiling {
  id: string; name: string; category: string; dueDate: string; status: 'pending' | 'filed';
  filedDate: string | null; confirmationNum: string; notes: string;
  responsible: string; recurrence: string; legalRef: string;
}

export interface OwnerCommunication {
  id: string; type: string; subject: string; date: string; method: string;
  recipients: string; respondedBy: string | null; status: 'sent' | 'pending' | 'draft'; notes: string;
}

interface ComplianceState {
  completions: Record<string, boolean>;
  filings: RegulatoryFiling[];
  communications: OwnerCommunication[];

  toggleItem: (id: string) => void;
  setCompletion: (id: string, val: boolean) => void;

  addFiling: (f: Omit<RegulatoryFiling, 'id' | 'status' | 'filedDate' | 'confirmationNum'>) => void;
  markFilingComplete: (id: string, filedDate: string, confirmationNum: string) => void;
  deleteFiling: (id: string) => void;

  addCommunication: (c: Omit<OwnerCommunication, 'id'>) => void;
  deleteCommunication: (id: string) => void;
}

export const useComplianceStore = create<ComplianceState>((set) => ({
  completions: {
    g1: true, g3: true, g4: true, f1: true, f2: true, f4: true, f5: true,
    i1: true, i2: true, i4: true, m2: true, m3: true, r1: true, r2: true, r4: true,
  },

  filings: [
    { id: 'rf1', name: 'DC Biennial Report', category: 'government', dueDate: '2026-04-01', status: 'pending', filedDate: null, confirmationNum: '', notes: 'File with DCRA. $80 fee.', responsible: 'President', recurrence: 'biennial', legalRef: 'DC Code § 29-102.11' },
    { id: 'rf2', name: 'Form 1120-H (Federal Tax Return)', category: 'tax', dueDate: '2026-03-15', status: 'pending', filedDate: null, confirmationNum: '', notes: 'Form 1120-H for exempt function income. Due March 15. Extension available.', responsible: 'Treasurer', recurrence: 'annual', legalRef: 'IRS Code § 528' },
    { id: 'rf3', name: 'DC Personal Property Tax Return', category: 'tax', dueDate: '2026-07-31', status: 'pending', filedDate: null, confirmationNum: '', notes: 'If HOA owns tangible personal property >$225K.', responsible: 'Treasurer', recurrence: 'annual', legalRef: 'DC Code § 47-1508' },
    { id: 'rf4', name: 'Annual Fire Safety Inspection', category: 'inspection', dueDate: '2026-06-30', status: 'pending', filedDate: null, confirmationNum: '', notes: 'Schedule with DC Fire and EMS.', responsible: 'Vice President', recurrence: 'annual', legalRef: 'DC Fire Code' },
    { id: 'rf5', name: 'Elevator Inspection Certificate', category: 'inspection', dueDate: '2026-08-15', status: 'filed', filedDate: '2025-08-20', confirmationNum: 'ELEV-2025-8842', notes: 'Annual inspection by certified inspector.', responsible: 'Vice President', recurrence: 'annual', legalRef: 'DC Code § 1-303.43' },
    { id: 'rf6', name: 'Annual Financial Audit', category: 'financial', dueDate: '2026-06-30', status: 'pending', filedDate: null, confirmationNum: '', notes: 'Independent CPA review of HOA financials.', responsible: 'Treasurer', recurrence: 'annual', legalRef: 'DC Code § 29-1135.05' },
  ],

  communications: [
    { id: 'oc1', type: 'notice', subject: '2026 Assessment Increase Notice (3%)', date: '2025-12-15', method: 'mail+email', recipients: 'All owners (50 units)', respondedBy: null, status: 'sent', notes: 'Included: new monthly amount, effective date, budget summary.' },
    { id: 'oc2', type: 'minutes', subject: 'January Board Meeting Minutes', date: '2026-01-20', method: 'email', recipients: 'All owners (50 units)', respondedBy: 'Secretary', status: 'sent', notes: 'Distributed within 10 days of meeting.' },
    { id: 'oc3', type: 'notice', subject: 'Annual Owner Rights Notice (DC Condo Act)', date: '2026-01-10', method: 'mail', recipients: 'All owners (50 units)', respondedBy: null, status: 'sent', notes: 'Right to inspect records, attend meetings, run for board.' },
    { id: 'oc4', type: 'financial', subject: '2025 Annual Financial Statements', date: '2026-02-28', method: 'email+portal', recipients: 'All owners (50 units)', respondedBy: 'Treasurer', status: 'pending', notes: 'Income statement, balance sheet, reserve fund status.' },
    { id: 'oc5', type: 'response', subject: 'Unit 502 — Balcony Enclosure Violation Notice', date: '2026-01-22', method: 'certified mail', recipients: 'Unit 502 — Lisa Chen', respondedBy: 'VP', status: 'sent', notes: 'First notice of violation. 30-day cure period.' },
    { id: 'oc6', type: 'resale', subject: 'Resale Certificate Package — Unit 204', date: '2026-02-05', method: 'email', recipients: 'Unit 204 buyer agent', respondedBy: 'Secretary', status: 'sent', notes: 'Bylaws, CC&Rs, rules, budget, reserve study, insurance cert.' },
  ],

  toggleItem: (id) => set(s => ({ completions: { ...s.completions, [id]: !s.completions[id] } })),
  setCompletion: (id, val) => set(s => ({ completions: { ...s.completions, [id]: val } })),

  addFiling: (f) => set(s => ({ filings: [...s.filings, { id: 'rf' + Date.now(), status: 'pending', filedDate: null, confirmationNum: '', ...f }] })),
  markFilingComplete: (id, filedDate, confirmationNum) => set(s => ({ filings: s.filings.map(f => f.id === id ? { ...f, status: 'filed', filedDate, confirmationNum } : f) })),
  deleteFiling: (id) => set(s => ({ filings: s.filings.filter(f => f.id !== id) })),

  addCommunication: (c) => set(s => ({ communications: [{ id: 'oc' + Date.now(), ...c }, ...s.communications] })),
  deleteCommunication: (id) => set(s => ({ communications: s.communications.filter(c => c.id !== id) })),
}));
