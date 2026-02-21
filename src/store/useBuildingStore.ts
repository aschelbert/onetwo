import { create } from 'zustand';

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

  // Mutations
  updateName: (name: string) => void;
  updateAddress: (addr: Partial<BuildingAddress>) => void;
  updateDetails: (det: Partial<BuildingDetails>) => void;
  updateManagement: (mgmt: Partial<ManagementInfo>) => void;

  addBoardMember: (m: Omit<BoardMember, 'id'>) => void;
  updateBoardMember: (id: string, m: Partial<BoardMember>) => void;
  removeBoardMember: (id: string) => void;

  addLegalCounsel: (c: Omit<LegalCounsel, 'id'>) => void;
  updateLegalCounsel: (id: string, c: Partial<LegalCounsel>) => void;
  removeLegalCounsel: (id: string) => void;

  addLegalDocument: (d: Omit<LegalDocument, 'id' | 'attachments'>) => void;
  updateLegalDocument: (id: string, d: Partial<LegalDocument>) => void;
  removeLegalDocument: (id: string) => void;
  addLegalDocAttachment: (docId: string, attachment: { name: string; size: string; type: string }) => void;
  removeLegalDocAttachment: (docId: string, attachmentIndex: number) => void;

  addInsurance: (p: Omit<InsurancePolicy, 'id' | 'attachments'>) => void;
  updateInsurance: (id: string, p: Partial<InsurancePolicy>) => void;
  removeInsurance: (id: string) => void;
  addInsuranceAttachment: (policyId: string, attachment: { name: string; size: string; type: string }) => void;
  removeInsuranceAttachment: (policyId: string, attachmentIndex: number) => void;

  addVendor: (v: Omit<Vendor, 'id'>) => void;
  updateVendor: (id: string, v: Partial<Vendor>) => void;
  removeVendor: (id: string) => void;
  toggleVendorStatus: (id: string) => void;
}

export const useBuildingStore = create<BuildingState>((set) => ({
  name: 'Sunny Acres Condominium',
  address: { street: '1234 Constitution Avenue NW', city: 'Washington', state: 'District of Columbia', zip: '20001' },
  details: {
    yearBuilt: '1998', totalUnits: 50, floors: 8, type: 'Mid-rise Condominium', sqft: '78,500 sq ft',
    lotSize: '1.2 acres', parking: '65 spaces (covered garage)', architect: 'Thompson & Associates',
    contractor: 'Pacific Coast Builders Inc.',
    amenities: ['Community Room','Fitness Center','Rooftop Deck','Secure Lobby','Elevator (2)','Package Room'],
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

  // ─── Mutations ─────────────────────────────────

  updateName: (name) => set({ name }),
  updateAddress: (addr) => set(s => ({ address: { ...s.address, ...addr } })),
  updateDetails: (det) => set(s => ({ details: { ...s.details, ...det } })),
  updateManagement: (mgmt) => set(s => ({ management: { ...s.management, ...mgmt } })),

  addBoardMember: (m) => set(s => ({ board: [...s.board, { id: 'bm' + Date.now(), ...m }] })),
  updateBoardMember: (id, m) => set(s => ({ board: s.board.map(b => b.id === id ? { ...b, ...m } : b) })),
  removeBoardMember: (id) => set(s => ({ board: s.board.filter(b => b.id !== id) })),

  addLegalCounsel: (c) => set(s => ({ legalCounsel: [...s.legalCounsel, { id: 'lc' + Date.now(), ...c }] })),
  updateLegalCounsel: (id, c) => set(s => ({ legalCounsel: s.legalCounsel.map(x => x.id === id ? { ...x, ...c } : x) })),
  removeLegalCounsel: (id) => set(s => ({ legalCounsel: s.legalCounsel.filter(x => x.id !== id) })),

  addLegalDocument: (d) => set(s => ({ legalDocuments: [...s.legalDocuments, { id: 'ld' + Date.now(), ...d, attachments: [] }] })),
  updateLegalDocument: (id, d) => set(s => ({ legalDocuments: s.legalDocuments.map(x => x.id === id ? { ...x, ...d } : x) })),
  removeLegalDocument: (id) => set(s => ({ legalDocuments: s.legalDocuments.filter(x => x.id !== id) })),
  addLegalDocAttachment: (docId, attachment) => set(s => ({
    legalDocuments: s.legalDocuments.map(x => x.id === docId ? { ...x, attachments: [...x.attachments, { ...attachment, uploadedAt: new Date().toISOString().split('T')[0] }] } : x),
  })),
  removeLegalDocAttachment: (docId, idx) => set(s => ({
    legalDocuments: s.legalDocuments.map(x => x.id === docId ? { ...x, attachments: x.attachments.filter((_, i) => i !== idx) } : x),
  })),

  addInsurance: (p) => set(s => ({ insurance: [...s.insurance, { id: 'ins' + Date.now(), ...p, attachments: [] }] })),
  updateInsurance: (id, p) => set(s => ({ insurance: s.insurance.map(x => x.id === id ? { ...x, ...p } : x) })),
  removeInsurance: (id) => set(s => ({ insurance: s.insurance.filter(x => x.id !== id) })),
  addInsuranceAttachment: (policyId, attachment) => set(s => ({
    insurance: s.insurance.map(x => x.id === policyId ? { ...x, attachments: [...x.attachments, { ...attachment, uploadedAt: new Date().toISOString().split('T')[0] }] } : x),
  })),
  removeInsuranceAttachment: (policyId, idx) => set(s => ({
    insurance: s.insurance.map(x => x.id === policyId ? { ...x, attachments: x.attachments.filter((_, i) => i !== idx) } : x),
  })),

  addVendor: (v) => set(s => ({ vendors: [...s.vendors, { id: 'v' + Date.now(), ...v }] })),
  updateVendor: (id, v) => set(s => ({ vendors: s.vendors.map(x => x.id === id ? { ...x, ...v } : x) })),
  removeVendor: (id) => set(s => ({ vendors: s.vendors.filter(x => x.id !== id) })),
  toggleVendorStatus: (id) => set(s => ({ vendors: s.vendors.map(x => x.id === id ? { ...x, status: x.status === 'active' ? 'inactive' : 'active' } : x) })),
}));
