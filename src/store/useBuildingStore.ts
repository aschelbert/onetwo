import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isBackendEnabled } from '@/lib/supabase';
import * as buildingSvc from '@/lib/services/building';

// ─── Types ─────────────────────────────────────

export interface BoardMember {
  id: string; name: string; role: string; email: string; phone: string; term: string;
}
export interface ManagementInfo {
  company: string; contact: string; title: string; email: string; phone: string;
  emergency: string; address: string; hours: string; afterHours: string;
}
export interface LegalCounsel {
  id: string; firm: string; attorney: string; email: string; phone: string; specialty: string;
}
export interface LegalDocument {
  id: string; name: string; version: string; size: string; status: 'current' | 'review-due';
  attachments: Array<{ name: string; size: string; uploadedAt: string; type: string }>;
}
export interface InsurancePolicy {
  id: string; type: string; carrier: string; coverage: string; premium: string; expires: string; policyNum: string;
  attachments: Array<{ name: string; size: string; uploadedAt: string; type: string }>;
}
export interface Vendor {
  id: string; name: string; service: string; contact: string; phone: string; email: string; contract: string; status: 'active' | 'inactive';
}
export interface BuildingAddress {
  street: string; city: string; state: string; zip: string;
}
export interface BuildingDetails {
  yearBuilt: string; totalUnits: number; floors: number; type: string; sqft: string; lotSize: string;
  parking: string; architect: string; contractor: string; amenities: string[];
  entityType: 'incorporated' | 'unincorporated';
}

interface BuildingState {
  name: string;
  address: BuildingAddress;
  details: BuildingDetails;
  board: BoardMember[];
  management: ManagementInfo;
  legalCounsel: LegalCounsel[];
  legalDocuments: LegalDocument[];
  insurance: InsurancePolicy[];
  vendors: Vendor[];

  // DB sync
  loadFromDb: (tenantId: string) => Promise<void>;

  // Mutations
  updateName: (name: string) => void;
  updateAddress: (addr: Partial<BuildingAddress>) => void;
  updateDetails: (det: Partial<BuildingDetails>) => void;
  updateManagement: (mgmt: Partial<ManagementInfo>, tenantId?: string) => void;

  addBoardMember: (m: Omit<BoardMember, 'id'>, tenantId?: string) => void;
  updateBoardMember: (id: string, m: Partial<BoardMember>) => void;
  removeBoardMember: (id: string) => void;

  addLegalCounsel: (c: Omit<LegalCounsel, 'id'>, tenantId?: string) => void;
  updateLegalCounsel: (id: string, c: Partial<LegalCounsel>) => void;
  removeLegalCounsel: (id: string) => void;

  addLegalDocument: (d: Omit<LegalDocument, 'id' | 'attachments'>, tenantId?: string) => void;
  updateLegalDocument: (id: string, d: Partial<LegalDocument>) => void;
  removeLegalDocument: (id: string) => void;
  addLegalDocAttachment: (docId: string, attachment: { name: string; size: string; type: string }) => void;
  removeLegalDocAttachment: (docId: string, attachmentIndex: number) => void;

  addInsurance: (p: Omit<InsurancePolicy, 'id' | 'attachments'>, tenantId?: string) => void;
  updateInsurance: (id: string, p: Partial<InsurancePolicy>) => void;
  removeInsurance: (id: string) => void;
  addInsuranceAttachment: (policyId: string, attachment: { name: string; size: string; type: string }) => void;
  removeInsuranceAttachment: (policyId: string, attachmentIndex: number) => void;

  addVendor: (v: Omit<Vendor, 'id'>, tenantId?: string) => void;
  updateVendor: (id: string, v: Partial<Vendor>) => void;
  removeVendor: (id: string) => void;
  toggleVendorStatus: (id: string) => void;
}

// Sync helpers
function syncBoardMember(id: string) {
  if (!isBackendEnabled) return;
  const m = useBuildingStore.getState().board.find(x => x.id === id);
  if (m) buildingSvc.updateBoardMember(id, m);
}
function syncLegalCounsel(id: string) {
  if (!isBackendEnabled) return;
  const c = useBuildingStore.getState().legalCounsel.find(x => x.id === id);
  if (c) buildingSvc.updateLegalCounsel(id, c);
}
function syncLegalDocument(id: string) {
  if (!isBackendEnabled) return;
  const d = useBuildingStore.getState().legalDocuments.find(x => x.id === id);
  if (d) buildingSvc.updateLegalDocument(id, d);
}
function syncInsurance(id: string) {
  if (!isBackendEnabled) return;
  const p = useBuildingStore.getState().insurance.find(x => x.id === id);
  if (p) buildingSvc.updateInsurancePolicy(id, p);
}
function syncVendor(id: string) {
  if (!isBackendEnabled) return;
  const v = useBuildingStore.getState().vendors.find(x => x.id === id);
  if (v) buildingSvc.updateVendor(id, v);
}

export const useBuildingStore = create<BuildingState>()(persist((set) => ({
  name: 'Sunny Acres Condominium',
  address: { street: '1234 Constitution Avenue NW', city: 'Washington', state: 'District of Columbia', zip: '20001' },
  details: {
    yearBuilt: '1998', totalUnits: 50, floors: 8, type: 'Mid-rise Condominium', sqft: '78,500 sq ft',
    lotSize: '1.2 acres', parking: '65 spaces (covered garage)', architect: 'Thompson & Associates',
    contractor: 'Pacific Coast Builders Inc.',
    amenities: ['Community Room','Fitness Center','Rooftop Deck','Secure Lobby','Elevator (2)','Package Room'],
    entityType: 'incorporated',
  },
  board: [
    { id: 'bm1', name: 'Robert Mitchell', role: 'President', email: 'robert@example.com', phone: '202-555-0401', term: 'Jan 2025 – Dec 2026' },
    { id: 'bm2', name: 'Jennifer Adams', role: 'Vice President', email: 'jennifer@example.com', phone: '202-555-0202', term: 'Jan 2025 – Dec 2026' },
    { id: 'bm3', name: 'David Chen', role: 'Treasurer', email: 'david@example.com', phone: '202-555-0102', term: 'Jan 2025 – Dec 2026' },
    { id: 'bm4', name: 'Maria Rodriguez', role: 'Secretary', email: 'maria@example.com', phone: '202-555-0303', term: 'Jan 2024 – Dec 2025' },
    { id: 'bm5', name: 'Thomas Baker', role: 'Member at Large', email: 'thomas@example.com', phone: '202-555-0404', term: 'Jan 2024 – Dec 2025' },
  ],
  management: {
    company: 'Premier Property Management', contact: 'Diane Carter', title: 'Property Manager',
    email: 'diane@premierpm.com', phone: '202-555-9000', emergency: '202-555-9111',
    address: '2000 M Street NW, Suite 400, Washington, DC 20036', hours: 'Mon-Fri 8:00 AM – 5:00 PM', afterHours: '24/7 Emergency Line',
  },
  legalCounsel: [
    { id: 'lc1', firm: 'Anderson & Associates', attorney: 'Patricia Anderson', email: 'panderson@andersonlaw.com', phone: '202-555-7001', specialty: 'HOA / Condominium Law' },
  ],
  legalDocuments: [
    { id: 'ld1', name: 'Condominium Bylaws', version: '3.0 (Amended 2024)', size: '2.4 MB', status: 'current', attachments: [{ name: 'Bylaws_v3_2024.pdf', size: '2.4 MB', uploadedAt: '2024-03-15', type: 'application/pdf' }] },
    { id: 'ld2', name: 'CC&Rs', version: '2.0 (Amended 2023)', size: '1.8 MB', status: 'review-due', attachments: [{ name: 'CCR_v2_2023.pdf', size: '1.8 MB', uploadedAt: '2023-06-20', type: 'application/pdf' }] },
    { id: 'ld3', name: 'Master Deed', version: '1.0 (Original)', size: '3.2 MB', status: 'current', attachments: [{ name: 'MasterDeed_Original.pdf', size: '3.2 MB', uploadedAt: '1998-01-15', type: 'application/pdf' }] },
    { id: 'ld4', name: 'Rules & Regulations', version: '2026 Edition', size: '890 KB', status: 'review-due', attachments: [] },
    { id: 'ld5', name: 'Articles of Incorporation', version: '1.0', size: '420 KB', status: 'current', attachments: [{ name: 'Articles_of_Inc.pdf', size: '420 KB', uploadedAt: '1998-01-15', type: 'application/pdf' }] },
    { id: 'ld6', name: 'Architectural Standards', version: '2.0', size: '1.1 MB', status: 'review-due', attachments: [] },
    { id: 'ld7', name: 'Collection Policy', version: '2.0', size: '280 KB', status: 'review-due', attachments: [] },
    { id: 'ld8', name: 'Reserve Study (2025)', version: '2025 Update', size: '5.8 MB', status: 'current', attachments: [{ name: 'ReserveStudy_2025.pdf', size: '5.8 MB', uploadedAt: '2025-06-15', type: 'application/pdf' }] },
  ],
  insurance: [
    { id: 'ins1', type: 'Directors & Officers (D&O)', carrier: 'Chubb Insurance', coverage: '$2,000,000', premium: '$3,200/yr', expires: '2026-09-30', policyNum: 'DO-2026-4421', attachments: [{ name: 'DO_Policy_2026.pdf', size: '1.5 MB', uploadedAt: '2025-10-01', type: 'application/pdf' }] },
    { id: 'ins2', type: 'General Liability', carrier: 'Hartford Insurance', coverage: '$5,000,000', premium: '$8,500/yr', expires: '2026-09-30', policyNum: 'GL-2026-8890', attachments: [{ name: 'GL_Policy_2026.pdf', size: '2.1 MB', uploadedAt: '2025-10-01', type: 'application/pdf' }] },
    { id: 'ins3', type: 'Property / Hazard', carrier: 'Travelers Insurance', coverage: '$15,000,000', premium: '$18,200/yr', expires: '2026-09-30', policyNum: 'PH-2026-1155', attachments: [] },
    { id: 'ins4', type: 'Fidelity Bond', carrier: 'Chubb Insurance', coverage: '$500,000', premium: '$1,100/yr', expires: '2026-09-30', policyNum: 'FB-2026-3302', attachments: [] },
    { id: 'ins5', type: 'Workers Compensation', carrier: 'Liberty Mutual', coverage: 'Statutory', premium: '$2,400/yr', expires: '2026-12-31', policyNum: 'WC-2026-5578', attachments: [] },
    { id: 'ins6', type: 'Umbrella', carrier: 'Hartford Insurance', coverage: '$10,000,000', premium: '$4,500/yr', expires: '2026-09-30', policyNum: 'UB-2026-7710', attachments: [] },
  ],
  vendors: [
    { id: 'v1', name: 'Green Thumb Landscaping', service: 'Landscaping', contact: 'Mark Green', phone: '202-555-4001', email: 'mark@greenthumb.com', contract: 'Monthly, $650/mo', status: 'active' },
    { id: 'v2', name: 'Cool Air Services', service: 'HVAC', contact: 'Tom Frost', phone: '202-555-4002', email: 'tom@coolair.com', contract: 'Annual, $3,200/yr', status: 'active' },
    { id: 'v3', name: 'Apex Roofing', service: 'Roofing', contact: 'Diana Apex', phone: '202-555-4003', email: 'diana@apexroof.com', contract: 'On-call', status: 'active' },
    { id: 'v4', name: 'Metro Elevator Co', service: 'Elevator', contact: 'James Metro', phone: '202-555-4004', email: 'james@metroelevator.com', contract: 'Annual inspection, $950/yr', status: 'active' },
    { id: 'v5', name: 'Quick Fix Plumbing', service: 'Plumbing', contact: 'Pete Quick', phone: '202-555-4005', email: 'pete@quickfix.com', contract: 'On-call', status: 'active' },
  ],

  // ─── DB Hydration ─────────────────────────────
  loadFromDb: async (tenantId: string) => {
    const data = await buildingSvc.fetchAllBuildingData(tenantId);
    const updates: Partial<BuildingState> = {};
    if (data.board) updates.board = data.board;
    if (data.management) updates.management = data.management;
    if (data.counsel) updates.legalCounsel = data.counsel;
    if (data.docs) updates.legalDocuments = data.docs;
    if (data.insurance) updates.insurance = data.insurance;
    if (data.vendors) updates.vendors = data.vendors;
    if (Object.keys(updates).length > 0) set(updates);
  },

  // ─── Mutations ─────────────────────────────────

  updateName: (name) => set({ name }),
  updateAddress: (addr) => set(s => ({ address: { ...s.address, ...addr } })),
  updateDetails: (det) => set(s => ({ details: { ...s.details, ...det } })),

  updateManagement: (mgmt, tenantId?) => {
    set(s => ({ management: { ...s.management, ...mgmt } }));
    if (isBackendEnabled && tenantId) {
      buildingSvc.upsertManagementInfo(tenantId, { ...useBuildingStore.getState().management });
    }
  },

  addBoardMember: (m, tenantId?) => {
    const id = 'bm' + Date.now();
    set(s => ({ board: [...s.board, { id, ...m }] }));
    if (isBackendEnabled && tenantId) {
      buildingSvc.createBoardMember(tenantId, m).then(dbRow => {
        if (dbRow) set(s => ({ board: s.board.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      });
    }
  },
  updateBoardMember: (id, m) => {
    set(s => ({ board: s.board.map(b => b.id === id ? { ...b, ...m } : b) }));
    syncBoardMember(id);
  },
  removeBoardMember: (id) => {
    set(s => ({ board: s.board.filter(b => b.id !== id) }));
    if (isBackendEnabled) buildingSvc.deleteBoardMember(id);
  },

  addLegalCounsel: (c, tenantId?) => {
    const id = 'lc' + Date.now();
    set(s => ({ legalCounsel: [...s.legalCounsel, { id, ...c }] }));
    if (isBackendEnabled && tenantId) {
      buildingSvc.createLegalCounsel(tenantId, c).then(dbRow => {
        if (dbRow) set(s => ({ legalCounsel: s.legalCounsel.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      });
    }
  },
  updateLegalCounsel: (id, c) => {
    set(s => ({ legalCounsel: s.legalCounsel.map(x => x.id === id ? { ...x, ...c } : x) }));
    syncLegalCounsel(id);
  },
  removeLegalCounsel: (id) => {
    set(s => ({ legalCounsel: s.legalCounsel.filter(x => x.id !== id) }));
    if (isBackendEnabled) buildingSvc.deleteLegalCounsel(id);
  },

  addLegalDocument: (d, tenantId?) => {
    const id = 'ld' + Date.now();
    set(s => ({ legalDocuments: [...s.legalDocuments, { id, ...d, attachments: [] }] }));
    if (isBackendEnabled && tenantId) {
      buildingSvc.createLegalDocument(tenantId, d).then(dbRow => {
        if (dbRow) set(s => ({ legalDocuments: s.legalDocuments.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      });
    }
  },
  updateLegalDocument: (id, d) => {
    set(s => ({ legalDocuments: s.legalDocuments.map(x => x.id === id ? { ...x, ...d } : x) }));
    syncLegalDocument(id);
  },
  removeLegalDocument: (id) => {
    set(s => ({ legalDocuments: s.legalDocuments.filter(x => x.id !== id) }));
    if (isBackendEnabled) buildingSvc.deleteLegalDocument(id);
  },
  addLegalDocAttachment: (docId, attachment) => {
    set(s => ({
      legalDocuments: s.legalDocuments.map(x => x.id === docId ? { ...x, attachments: [...x.attachments, { ...attachment, uploadedAt: new Date().toISOString().split('T')[0] }] } : x),
    }));
    syncLegalDocument(docId);
  },
  removeLegalDocAttachment: (docId, idx) => {
    set(s => ({
      legalDocuments: s.legalDocuments.map(x => x.id === docId ? { ...x, attachments: x.attachments.filter((_, i) => i !== idx) } : x),
    }));
    syncLegalDocument(docId);
  },

  addInsurance: (p, tenantId?) => {
    const id = 'ins' + Date.now();
    set(s => ({ insurance: [...s.insurance, { id, ...p, attachments: [] }] }));
    if (isBackendEnabled && tenantId) {
      buildingSvc.createInsurancePolicy(tenantId, p).then(dbRow => {
        if (dbRow) set(s => ({ insurance: s.insurance.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      });
    }
  },
  updateInsurance: (id, p) => {
    set(s => ({ insurance: s.insurance.map(x => x.id === id ? { ...x, ...p } : x) }));
    syncInsurance(id);
  },
  removeInsurance: (id) => {
    set(s => ({ insurance: s.insurance.filter(x => x.id !== id) }));
    if (isBackendEnabled) buildingSvc.deleteInsurancePolicy(id);
  },
  addInsuranceAttachment: (policyId, attachment) => {
    set(s => ({
      insurance: s.insurance.map(x => x.id === policyId ? { ...x, attachments: [...x.attachments, { ...attachment, uploadedAt: new Date().toISOString().split('T')[0] }] } : x),
    }));
    syncInsurance(policyId);
  },
  removeInsuranceAttachment: (policyId, idx) => {
    set(s => ({
      insurance: s.insurance.map(x => x.id === policyId ? { ...x, attachments: x.attachments.filter((_, i) => i !== idx) } : x),
    }));
    syncInsurance(policyId);
  },

  addVendor: (v, tenantId?) => {
    const id = 'v' + Date.now();
    set(s => ({ vendors: [...s.vendors, { id, ...v }] }));
    if (isBackendEnabled && tenantId) {
      buildingSvc.createVendor(tenantId, v).then(dbRow => {
        if (dbRow) set(s => ({ vendors: s.vendors.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      });
    }
  },
  updateVendor: (id, v) => {
    set(s => ({ vendors: s.vendors.map(x => x.id === id ? { ...x, ...v } : x) }));
    syncVendor(id);
  },
  removeVendor: (id) => {
    set(s => ({ vendors: s.vendors.filter(x => x.id !== id) }));
    if (isBackendEnabled) buildingSvc.deleteVendor(id);
  },
  toggleVendorStatus: (id) => {
    set(s => ({ vendors: s.vendors.map(x => x.id === id ? { ...x, status: x.status === 'active' ? 'inactive' : 'active' } : x) }));
    syncVendor(id);
  },
}), {
  name: 'onetwo-building',
  partialize: (state) => ({
    name: state.name,
    address: state.address,
    details: state.details,
    board: state.board,
    management: state.management,
    legalCounsel: state.legalCounsel,
    legalDocuments: state.legalDocuments,
    insurance: state.insurance,
    vendors: state.vendors,
  }),
  merge: (persisted: any, current: any) => ({
    ...current,
    ...(persisted || {}),
  }),
}));
