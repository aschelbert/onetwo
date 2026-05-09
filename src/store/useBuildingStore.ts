import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isBackendEnabled, getActiveTenantId } from '@/lib/supabase';
import * as buildingSvc from '@/lib/services/building';
import * as assetsSvc from '@/lib/services/assets';

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
  w9OnFile?: boolean;
}
export interface BuildingAddress {
  street: string; city: string; state: string; zip: string;
}
export interface BuildingDetails {
  yearBuilt: string; totalUnits: number; floors: number; type: string; sqft: string; lotSize: string;
  parking: string; architect: string; contractor: string; amenities: string[];
  entityType: 'incorporated' | 'unincorporated';
  fiscalYearEnd: string; // MM-DD format, e.g. '12-31'
}

export interface MaintenanceSchedule {
  id: string;
  task: string;
  category: string;
  frequency: string;
  vendor: string;
  lastCompleted: string;
  nextDue: string;
  estimatedCost: string;
  notes: string;
  status: 'on-track' | 'due-soon' | 'overdue' | 'completed';
}

export type AssetCategory = 'Mechanical' | 'Amenity' | 'Safety' | 'Technology' | 'Common Area' | 'Landscaping';
export type AssetCondition = 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Critical';

export interface ConditionAssessment {
  date: string;
  condition: AssetCondition;
  assessedBy: string;
  notes: string;
}

export interface AssetWarranty {
  id: string;
  description: string;
  type: string;
  vendorId: string;
  vendorName: string;
  expires: string;
  documentRef: string;
}

export interface BuildingAsset {
  id: string;
  name: string;
  category: AssetCategory;
  location: string;
  condition: AssetCondition;
  installedDate: string;
  originalCost: number;
  usefulLifeYears: number;
  remainingLifeYears: number;
  replacementCostToday: number;
  inflationRate: number;
  criticality: string;
  annualMaintenanceCost: number;
  annualOperatingCost: number;
  parentAssetId: string | null;
  reserveItemId: string;
  maintenanceScheduleIds: string[];
  workOrderIds: string[];
  vendorIds: string[];
  insurancePolicyIds: string[];
  amenityConfigId: string;
  glAccountNum: string;
  budgetCategoryId: string;
  spendingApprovalIds: string[];
  conditionHistory: ConditionAssessment[];
  warranties: AssetWarranty[];
  notes: string;
  insuredValue: number;
}

export interface BylawsConfig {
  assessmentCapPct: number;
  ownerVoteThreshold: number;
  boardSpendingLimit: number;
  quorumPct: number;
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
  maintenanceSchedules: MaintenanceSchedule[];
  assets: BuildingAsset[];
  bylawsConfig: BylawsConfig;
  updateBylawsConfig: (config: Partial<BylawsConfig>) => void;

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
  toggleVendorW9: (id: string) => void;

  addMaintenanceSchedule: (m: Omit<MaintenanceSchedule, 'id'>, tenantId?: string) => void;
  updateMaintenanceSchedule: (id: string, m: Partial<MaintenanceSchedule>) => void;
  removeMaintenanceSchedule: (id: string) => void;

  addAsset: (a: Omit<BuildingAsset, 'id'>, tenantId?: string) => void;
  updateAsset: (id: string, a: Partial<BuildingAsset>) => void;
  removeAsset: (id: string) => void;
  addConditionAssessment: (assetId: string, assessment: ConditionAssessment) => void;
  addWarranty: (assetId: string, warranty: Omit<AssetWarranty, 'id'>) => void;
  removeWarranty: (assetId: string, warrantyId: string) => void;
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
function syncMaintenanceSchedule(id: string) {
  if (!isBackendEnabled) return;
  const m = useBuildingStore.getState().maintenanceSchedules.find(x => x.id === id);
  if (m) buildingSvc.updateMaintenanceSchedule(id, m);
}
function syncAsset(id: string) {
  if (!isBackendEnabled) return;
  const a = useBuildingStore.getState().assets.find(x => x.id === id);
  if (a) assetsSvc.updateAsset(id, a);
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
    fiscalYearEnd: '12-31',
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
    { id: 'ld9', name: 'Resale Certificate Policy', version: '1.0', size: '180 KB', status: 'current', attachments: [{ name: 'Resale_Certificate_Policy.pdf', size: '180 KB', uploadedAt: '2025-04-10', type: 'application/pdf' }] },
    { id: 'ld10', name: 'Document Retention Policy', version: '2.0', size: '210 KB', status: 'current', attachments: [{ name: 'Document_Retention_Policy.pdf', size: '210 KB', uploadedAt: '2025-05-01', type: 'application/pdf' }] },
    { id: 'ld11', name: 'Emergency Preparedness Plan', version: '2026 Edition', size: '1.5 MB', status: 'current', attachments: [{ name: 'Emergency_Preparedness_Plan_2026.pdf', size: '1.5 MB', uploadedAt: '2026-01-15', type: 'application/pdf' }] },
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
  maintenanceSchedules: [
    { id: 'ms1', task: 'HVAC Filter Replacement', category: 'HVAC', frequency: 'quarterly', vendor: 'Cool Air Services', lastCompleted: '2026-01-15', nextDue: '2026-04-15', estimatedCost: '$450', notes: 'Replace all common area HVAC filters', status: 'on-track' },
    { id: 'ms2', task: 'Elevator Inspection', category: 'Elevator', frequency: 'semi-annual', vendor: 'Metro Elevator Co', lastCompleted: '2025-12-01', nextDue: '2026-06-01', estimatedCost: '$950', notes: 'State-mandated safety inspection for both elevators', status: 'on-track' },
    { id: 'ms3', task: 'Fire Alarm System Test', category: 'Fire Safety', frequency: 'annual', vendor: '', lastCompleted: '2025-06-15', nextDue: '2026-06-15', estimatedCost: '$1,200', notes: 'Full fire alarm and sprinkler system test per NFPA 72', status: 'on-track' },
    { id: 'ms4', task: 'Backflow Preventer Test', category: 'Plumbing', frequency: 'annual', vendor: 'Quick Fix Plumbing', lastCompleted: '2025-03-10', nextDue: '2026-03-10', estimatedCost: '$350', notes: 'Annual backflow prevention device testing — DC Water requirement', status: 'overdue' },
    { id: 'ms5', task: 'Roof Inspection', category: 'General', frequency: 'semi-annual', vendor: 'Apex Roofing', lastCompleted: '2025-10-01', nextDue: '2026-04-01', estimatedCost: '$600', notes: 'Visual inspection of membrane, flashing, and drainage', status: 'due-soon' },
    { id: 'ms6', task: 'Emergency Generator Test', category: 'Electrical', frequency: 'monthly', vendor: '', lastCompleted: '2026-03-01', nextDue: '2026-04-01', estimatedCost: '$200', notes: 'Monthly load test of backup generator', status: 'on-track' },
  ],
  assets: [
    {
      id: 'ast1', name: 'Pool & Deck Area', category: 'Amenity', location: 'Ground Floor - South', condition: 'Good',
      installedDate: '2010-06-15', originalCost: 120000, usefulLifeYears: 25, remainingLifeYears: 8,
      replacementCostToday: 185000, inflationRate: 3, criticality: 'Medium',
      annualMaintenanceCost: 8400, annualOperatingCost: 1200, parentAssetId: null,
      reserveItemId: '', maintenanceScheduleIds: ['ms1'], workOrderIds: [],
      vendorIds: ['v1'], insurancePolicyIds: ['ins3'], amenityConfigId: '',
      glAccountNum: '', budgetCategoryId: 'cat1', spendingApprovalIds: [],
      conditionHistory: [
        { date: '2026-01-10', condition: 'Good', assessedBy: 'Diane Carter', notes: 'Deck boards solid, pool liner in good shape' },
        { date: '2025-01-15', condition: 'Good', assessedBy: 'Diane Carter', notes: 'Post-season inspection, all good' },
        { date: '2024-01-12', condition: 'Fair', assessedBy: 'Mark Green', notes: 'Some deck boards showing wear' },
      ],
      warranties: [
        { id: 'w1', description: 'Pool liner warranty', type: 'Manufacturer', vendorId: 'v1', vendorName: 'Green Thumb Landscaping', expires: '2030-06-15', documentRef: '' },
      ],
      notes: 'Heated pool, 40x20ft, max capacity 30. Deck resurfaced 2022.', insuredValue: 185000,
    },
    {
      id: 'ast2', name: 'Pool Pump', category: 'Mechanical', location: 'Pool Equipment Room', condition: 'Fair',
      installedDate: '2018-04-01', originalCost: 3200, usefulLifeYears: 8, remainingLifeYears: 3,
      replacementCostToday: 4200, inflationRate: 3, criticality: 'High',
      annualMaintenanceCost: 600, annualOperatingCost: 200, parentAssetId: 'ast1',
      reserveItemId: '', maintenanceScheduleIds: [], workOrderIds: [],
      vendorIds: ['v5'], insurancePolicyIds: [], amenityConfigId: '',
      glAccountNum: '', budgetCategoryId: 'cat1', spendingApprovalIds: [],
      conditionHistory: [
        { date: '2026-02-01', condition: 'Fair', assessedBy: 'Pete Quick', notes: 'Bearings showing wear, monitor closely' },
      ],
      warranties: [], notes: 'Pentair SuperFlo 1.5HP', insuredValue: 0,
    },
    {
      id: 'ast3', name: 'Pool Heater', category: 'Mechanical', location: 'Pool Equipment Room', condition: 'Good',
      installedDate: '2020-03-15', originalCost: 6500, usefulLifeYears: 12, remainingLifeYears: 6,
      replacementCostToday: 8500, inflationRate: 3, criticality: 'Medium',
      annualMaintenanceCost: 400, annualOperatingCost: 200, parentAssetId: 'ast1',
      reserveItemId: '', maintenanceScheduleIds: [], workOrderIds: [],
      vendorIds: ['v2'], insurancePolicyIds: [], amenityConfigId: '',
      glAccountNum: '', budgetCategoryId: 'cat1', spendingApprovalIds: [],
      conditionHistory: [
        { date: '2026-01-10', condition: 'Good', assessedBy: 'Tom Frost', notes: 'Operating efficiently' },
      ],
      warranties: [
        { id: 'w2', description: 'Heat exchanger warranty', type: 'Manufacturer', vendorId: 'v2', vendorName: 'Cool Air Services', expires: '2028-03-15', documentRef: '' },
      ],
      notes: 'Hayward H400FDN natural gas', insuredValue: 0,
    },
    {
      id: 'ast4', name: 'Elevator #1', category: 'Mechanical', location: 'Main Lobby', condition: 'Good',
      installedDate: '2005-01-15', originalCost: 180000, usefulLifeYears: 25, remainingLifeYears: 12,
      replacementCostToday: 320000, inflationRate: 3, criticality: 'Critical',
      annualMaintenanceCost: 6000, annualOperatingCost: 1200, parentAssetId: null,
      reserveItemId: 'res3', maintenanceScheduleIds: ['ms2'], workOrderIds: [],
      vendorIds: ['v4'], insurancePolicyIds: ['ins3'], amenityConfigId: '',
      glAccountNum: '', budgetCategoryId: 'cat1', spendingApprovalIds: ['sa3'],
      conditionHistory: [
        { date: '2026-01-15', condition: 'Good', assessedBy: 'James Metro', notes: 'Annual inspection passed' },
        { date: '2025-06-01', condition: 'Good', assessedBy: 'James Metro', notes: 'Semi-annual check OK' },
      ],
      warranties: [], notes: 'Otis Gen2 — serves floors 1-8. State inspection due Sep 2026.', insuredValue: 320000,
    },
    {
      id: 'ast5', name: 'Elevator #2', category: 'Mechanical', location: 'Service Lobby', condition: 'Fair',
      installedDate: '2005-01-15', originalCost: 180000, usefulLifeYears: 25, remainingLifeYears: 12,
      replacementCostToday: 320000, inflationRate: 3, criticality: 'Critical',
      annualMaintenanceCost: 6000, annualOperatingCost: 1200, parentAssetId: null,
      reserveItemId: 'res3', maintenanceScheduleIds: ['ms2'], workOrderIds: [],
      vendorIds: ['v4'], insurancePolicyIds: ['ins3'], amenityConfigId: '',
      glAccountNum: '', budgetCategoryId: 'cat1', spendingApprovalIds: [],
      conditionHistory: [
        { date: '2026-01-15', condition: 'Fair', assessedBy: 'James Metro', notes: 'Door operator showing wear, plan replacement' },
      ],
      warranties: [], notes: 'Otis Gen2 — serves floors 1-8, freight-capable.', insuredValue: 320000,
    },
    {
      id: 'ast6', name: 'Community Room', category: 'Amenity', location: 'Floor 1 - West Wing', condition: 'Good',
      installedDate: '1998-01-01', originalCost: 50000, usefulLifeYears: 30, remainingLifeYears: 15,
      replacementCostToday: 75000, inflationRate: 3, criticality: 'Low',
      annualMaintenanceCost: 2400, annualOperatingCost: 600, parentAssetId: null,
      reserveItemId: '', maintenanceScheduleIds: [], workOrderIds: [],
      vendorIds: [], insurancePolicyIds: ['ins2'], amenityConfigId: '',
      glAccountNum: '', budgetCategoryId: 'cat1', spendingApprovalIds: [],
      conditionHistory: [
        { date: '2025-12-01', condition: 'Good', assessedBy: 'Diane Carter', notes: 'Furniture and AV in good shape. Carpet replaced 2024.' },
      ],
      warranties: [], notes: 'Seats 60, AV system, kitchenette. Reservable for private events.', insuredValue: 75000,
    },
    {
      id: 'ast7', name: 'HVAC Central', category: 'Mechanical', location: 'Mechanical Room - Basement', condition: 'Fair',
      installedDate: '2007-08-01', originalCost: 145000, usefulLifeYears: 20, remainingLifeYears: 5,
      replacementCostToday: 210000, inflationRate: 3, criticality: 'Critical',
      annualMaintenanceCost: 8500, annualOperatingCost: 3200, parentAssetId: null,
      reserveItemId: 'res2', maintenanceScheduleIds: ['ms1'], workOrderIds: [],
      vendorIds: ['v2'], insurancePolicyIds: ['ins3'], amenityConfigId: '',
      glAccountNum: '', budgetCategoryId: 'cat1', spendingApprovalIds: [],
      conditionHistory: [
        { date: '2026-02-15', condition: 'Fair', assessedBy: 'Tom Frost', notes: 'Compressor efficiency declining, plan replacement in 3-5 years' },
        { date: '2025-08-01', condition: 'Fair', assessedBy: 'Tom Frost', notes: 'Filters replaced, refrigerant topped off' },
        { date: '2024-02-10', condition: 'Good', assessedBy: 'Tom Frost', notes: 'System running well' },
      ],
      warranties: [], notes: 'Trane XR17 system, 50-ton capacity. Serves common areas.', insuredValue: 210000,
    },
    {
      id: 'ast8', name: 'Fire Suppression System', category: 'Safety', location: 'Building-wide', condition: 'Good',
      installedDate: '1998-01-01', originalCost: 95000, usefulLifeYears: 30, remainingLifeYears: 18,
      replacementCostToday: 140000, inflationRate: 3, criticality: 'Critical',
      annualMaintenanceCost: 3600, annualOperatingCost: 0, parentAssetId: null,
      reserveItemId: '', maintenanceScheduleIds: ['ms3'], workOrderIds: [],
      vendorIds: [], insurancePolicyIds: ['ins3'], amenityConfigId: '',
      glAccountNum: '', budgetCategoryId: 'cat1', spendingApprovalIds: [],
      conditionHistory: [
        { date: '2025-06-15', condition: 'Good', assessedBy: 'DC Fire Marshall', notes: 'Annual NFPA 72 test passed' },
      ],
      warranties: [], notes: 'Sprinkler + fire alarm system. NFPA 72 compliant.', insuredValue: 140000,
    },
    {
      id: 'ast9', name: 'Lobby / Foyer', category: 'Common Area', location: 'Floor 1 - Main Entrance', condition: 'Excellent',
      installedDate: '1998-01-01', originalCost: 35000, usefulLifeYears: 20, remainingLifeYears: 14,
      replacementCostToday: 55000, inflationRate: 3, criticality: 'Low',
      annualMaintenanceCost: 1800, annualOperatingCost: 600, parentAssetId: null,
      reserveItemId: '', maintenanceScheduleIds: [], workOrderIds: [],
      vendorIds: [], insurancePolicyIds: ['ins2'], amenityConfigId: '',
      glAccountNum: '', budgetCategoryId: 'cat1', spendingApprovalIds: [],
      conditionHistory: [
        { date: '2025-11-01', condition: 'Excellent', assessedBy: 'Diane Carter', notes: 'Renovated 2024 — new furniture, lighting, flooring' },
      ],
      warranties: [], notes: 'Renovated 2024. Package room adjacent.', insuredValue: 55000,
    },
    {
      id: 'ast10', name: 'Fitness Center', category: 'Amenity', location: 'Floor 1 - East Wing', condition: 'Good',
      installedDate: '2015-03-01', originalCost: 45000, usefulLifeYears: 15, remainingLifeYears: 7,
      replacementCostToday: 65000, inflationRate: 3, criticality: 'Low',
      annualMaintenanceCost: 3600, annualOperatingCost: 1200, parentAssetId: null,
      reserveItemId: '', maintenanceScheduleIds: [], workOrderIds: [],
      vendorIds: [], insurancePolicyIds: ['ins2'], amenityConfigId: '',
      glAccountNum: '', budgetCategoryId: 'cat1', spendingApprovalIds: [],
      conditionHistory: [
        { date: '2025-12-01', condition: 'Good', assessedBy: 'Diane Carter', notes: 'Equipment functional, treadmill belt replaced' },
      ],
      warranties: [], notes: 'Cardio + free weights. 8 machines total.', insuredValue: 65000,
    },
    {
      id: 'ast11', name: 'Parking Gate System', category: 'Technology', location: 'Garage Entrance', condition: 'Poor',
      installedDate: '2012-09-01', originalCost: 12000, usefulLifeYears: 12, remainingLifeYears: 1,
      replacementCostToday: 18000, inflationRate: 3, criticality: 'High',
      annualMaintenanceCost: 2400, annualOperatingCost: 600, parentAssetId: null,
      reserveItemId: 'res4', maintenanceScheduleIds: [], workOrderIds: [],
      vendorIds: [], insurancePolicyIds: [], amenityConfigId: '',
      glAccountNum: '', budgetCategoryId: 'cat1', spendingApprovalIds: ['sa1'],
      conditionHistory: [
        { date: '2026-01-20', condition: 'Poor', assessedBy: 'Diane Carter', notes: 'Gate arm sticking, motor struggling. Replace soon.' },
        { date: '2025-06-01', condition: 'Fair', assessedBy: 'Diane Carter', notes: 'Intermittent issues with remote sensors' },
      ],
      warranties: [], notes: 'RFID + remote access. 65 spaces.', insuredValue: 0,
    },
    {
      id: 'ast12', name: 'Landscaping', category: 'Landscaping', location: 'Exterior Grounds', condition: 'Good',
      installedDate: '1998-01-01', originalCost: 25000, usefulLifeYears: 10, remainingLifeYears: 4,
      replacementCostToday: 35000, inflationRate: 3, criticality: 'Low',
      annualMaintenanceCost: 7800, annualOperatingCost: 0, parentAssetId: null,
      reserveItemId: '', maintenanceScheduleIds: ['ms5'], workOrderIds: [],
      vendorIds: ['v1'], insurancePolicyIds: [], amenityConfigId: '',
      glAccountNum: '', budgetCategoryId: 'cat3', spendingApprovalIds: [],
      conditionHistory: [
        { date: '2026-03-01', condition: 'Good', assessedBy: 'Mark Green', notes: 'Spring prep complete, irrigation tested' },
      ],
      warranties: [], notes: 'Includes irrigation system, seasonal plantings, tree maintenance.', insuredValue: 0,
    },
  ],
  bylawsConfig: { assessmentCapPct: 15, ownerVoteThreshold: 66.7, boardSpendingLimit: 5000, quorumPct: 51 },

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
    if (data.maintenanceSchedules) updates.maintenanceSchedules = data.maintenanceSchedules;
    if (data.assets) updates.assets = data.assets;
    if (data.profile) {
      const current = useBuildingStore.getState().details;
      updates.details = { ...current, ...data.profile };
    }
    if (Object.keys(updates).length > 0) set(updates);
  },

  // ─── Mutations ─────────────────────────────────

  updateName: (name) => set({ name }),
  updateAddress: (addr) => set(s => ({ address: { ...s.address, ...addr } })),
  updateDetails: (det) => {
    set(s => ({ details: { ...s.details, ...det } }));
    if (isBackendEnabled) {
      const tenantId = getActiveTenantId();
      if (tenantId) buildingSvc.upsertBuildingProfile(tenantId, det);
    }
  },

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
  toggleVendorW9: (id) => {
    set(s => ({ vendors: s.vendors.map(x => x.id === id ? { ...x, w9OnFile: !x.w9OnFile } : x) }));
    syncVendor(id);
  },

  addMaintenanceSchedule: (m, tenantId?) => {
    const id = 'ms' + Date.now();
    set(s => ({ maintenanceSchedules: [...s.maintenanceSchedules, { id, ...m }] }));
    if (isBackendEnabled && tenantId) {
      buildingSvc.createMaintenanceSchedule(tenantId, m).then(dbRow => {
        if (dbRow) set(s => ({ maintenanceSchedules: s.maintenanceSchedules.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      });
    }
  },
  updateMaintenanceSchedule: (id, m) => {
    set(s => ({ maintenanceSchedules: s.maintenanceSchedules.map(x => x.id === id ? { ...x, ...m } : x) }));
    syncMaintenanceSchedule(id);
  },
  removeMaintenanceSchedule: (id) => {
    set(s => ({ maintenanceSchedules: s.maintenanceSchedules.filter(x => x.id !== id) }));
    if (isBackendEnabled) buildingSvc.deleteMaintenanceSchedule(id);
  },

  addAsset: (a, tenantId?) => {
    const id = 'ast' + Date.now();
    set(s => ({ assets: [...s.assets, { id, ...a }] }));
    if (isBackendEnabled && tenantId) {
      assetsSvc.createAsset(tenantId, a).then(dbRow => {
        if (dbRow) set(s => ({ assets: s.assets.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      });
    }
  },
  updateAsset: (id, a) => {
    set(s => ({ assets: s.assets.map(x => x.id === id ? { ...x, ...a } : x) }));
    syncAsset(id);
  },
  removeAsset: (id) => {
    set(s => ({ assets: s.assets.filter(x => x.id !== id) }));
    if (isBackendEnabled) assetsSvc.deleteAsset(id);
  },
  addConditionAssessment: (assetId, assessment) => {
    set(s => ({
      assets: s.assets.map(x => x.id === assetId ? { ...x, conditionHistory: [assessment, ...x.conditionHistory], condition: assessment.condition } : x),
    }));
    syncAsset(assetId);
  },
  addWarranty: (assetId, warranty) => {
    const wId = 'w' + Date.now();
    set(s => ({
      assets: s.assets.map(x => x.id === assetId ? { ...x, warranties: [...x.warranties, { id: wId, ...warranty }] } : x),
    }));
    syncAsset(assetId);
  },
  removeWarranty: (assetId, warrantyId) => {
    set(s => ({
      assets: s.assets.map(x => x.id === assetId ? { ...x, warranties: x.warranties.filter(w => w.id !== warrantyId) } : x),
    }));
    syncAsset(assetId);
  },

  updateBylawsConfig: (config) => set(s => ({ bylawsConfig: { ...s.bylawsConfig, ...config } })),
}), {
  name: 'onetwo-building',
  version: 3,
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
    maintenanceSchedules: state.maintenanceSchedules,
    assets: state.assets,
    bylawsConfig: state.bylawsConfig,
  }),
  merge: (persisted: any, current: any) => ({
    ...current,
    ...(persisted || {}),
    board: persisted?.board?.length ? persisted.board : current.board,
    legalDocuments: persisted?.legalDocuments?.length ? persisted.legalDocuments : current.legalDocuments,
    insurance: persisted?.insurance?.length ? persisted.insurance : current.insurance,
    vendors: persisted?.vendors?.length ? persisted.vendors : current.vendors,
    maintenanceSchedules: persisted?.maintenanceSchedules?.length ? persisted.maintenanceSchedules : current.maintenanceSchedules,
    assets: persisted?.assets?.length ? persisted.assets : current.assets,
  }),
}));
