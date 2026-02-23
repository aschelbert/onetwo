import { create } from 'zustand';

// ── Types ──────────────────────────────────────────

export type SubscriptionTier = 'essentials' | 'compliance_pro' | 'advanced_governance';
export type SubscriptionStatus = 'active' | 'trial' | 'past_due' | 'cancelled' | 'suspended';
export type BuildingStatus = 'active' | 'onboarding' | 'suspended' | 'archived';

export interface Tenant {
  id: string;
  name: string;
  subdomain: string;  // e.g., "sunnyacres" → sunnyacres.getonetwo.com
  address: { street: string; city: string; state: string; zip: string };
  totalUnits: number;
  yearBuilt: string;
  status: BuildingStatus;
  createdAt: string;
  subscription: {
    tier: SubscriptionTier;
    status: SubscriptionStatus;
    startDate: string;
    nextBillingDate: string;
    monthlyRate: number;
    trialEndsAt: string | null;
  };
  stats: {
    activeUsers: number;
    occupiedUnits: number;
    collectionRate: number;
    complianceScore: number;
    openCases: number;
    monthlyRevenue: number;
  };
  primaryContact: { name: string; email: string; phone: string; role: string };
  features: {
    fiscalLens: boolean;
    caseOps: boolean;
    complianceRunbook: boolean;
    aiAdvisor: boolean;
    documentVault: boolean;
    paymentProcessing: boolean;
    votesResolutions: boolean;
    communityPortal: boolean;
    vendorManagement: boolean;
    reserveStudyTools: boolean;
  };
  onboardingChecklist: {
    accountCreated: boolean;
    buildingProfileComplete: boolean;
    unitsConfigured: boolean;
    firstUserInvited: boolean;
    bylawsUploaded: boolean;
    financialSetupDone: boolean;
    goLive: boolean;
  };
}

// Feature matrix per tier — determines defaults when creating/changing tiers
export const TIER_FEATURES: Record<SubscriptionTier, Record<keyof Tenant['features'], boolean>> = {
  essentials: {
    fiscalLens: true, caseOps: true, complianceRunbook: true,
    aiAdvisor: false, documentVault: false, paymentProcessing: false,
    votesResolutions: false, communityPortal: false, vendorManagement: false, reserveStudyTools: false,
  },
  compliance_pro: {
    fiscalLens: true, caseOps: true, complianceRunbook: true,
    aiAdvisor: true, documentVault: true, paymentProcessing: true,
    votesResolutions: false, communityPortal: false, vendorManagement: true, reserveStudyTools: false,
  },
  advanced_governance: {
    fiscalLens: true, caseOps: true, complianceRunbook: true,
    aiAdvisor: true, documentVault: true, paymentProcessing: true,
    votesResolutions: true, communityPortal: true, vendorManagement: true, reserveStudyTools: true,
  },
};

export function generateSubdomain(name: string, existingSubdomains: string[]): string {
  let sub = name.toLowerCase().replace(/[^a-z0-9]+/g, '').replace(/condominium|hoa|association|residences|towers|gardens|condos/gi, '').trim();
  if (!sub) sub = 'building';
  if (sub.length > 20) sub = sub.slice(0, 20);
  let candidate = sub;
  let suffix = 2;
  while (existingSubdomains.includes(candidate)) { candidate = sub + suffix; suffix++; }
  return candidate;
}

export interface PlatformUser {
  id: string;
  name: string;
  email: string;
  role: 'super_admin' | 'support' | 'billing' | 'readonly';
  status: 'active' | 'inactive';
  lastLogin: string;
  createdAt: string;
  buildings: string[]; // tenant IDs they can access ('*' = all)
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  actorRole: string;
  action: string;
  target: string;
  details: string;
  buildingId: string | null;
}

// ── Seed Data ──────────────────────────────────────

const seedTenants: Tenant[] = [
  {
    id: 'bld-001', name: 'Sunny Acres Condominium', subdomain: 'sunnyacres',
    address: { street: '1234 Constitution Ave NW', city: 'Washington', state: 'DC', zip: '20001' },
    totalUnits: 50, yearBuilt: '1998', status: 'active', createdAt: '2025-03-15',
    subscription: { tier: 'compliance_pro', status: 'active', startDate: '2025-03-15', nextBillingDate: '2026-03-15', monthlyRate: 179, trialEndsAt: null },
    stats: { activeUsers: 7, occupiedUnits: 48, collectionRate: 94, complianceScore: 82, openCases: 3, monthlyRevenue: 6860 },
    primaryContact: { name: 'Robert Mitchell', email: 'robert@example.com', phone: '202-555-0401', role: 'President' },
    features: { ...TIER_FEATURES.compliance_pro },
    onboardingChecklist: { accountCreated: true, buildingProfileComplete: true, unitsConfigured: true, firstUserInvited: true, bylawsUploaded: true, financialSetupDone: true, goLive: true },
  },
  {
    id: 'bld-002', name: 'Park View Towers', subdomain: 'parkview',
    address: { street: '800 Park Road NW', city: 'Washington', state: 'DC', zip: '20010' },
    totalUnits: 120, yearBuilt: '2005', status: 'active', createdAt: '2025-06-01',
    subscription: { tier: 'advanced_governance', status: 'active', startDate: '2025-06-01', nextBillingDate: '2026-06-01', monthlyRate: 299, trialEndsAt: null },
    stats: { activeUsers: 24, occupiedUnits: 115, collectionRate: 97, complianceScore: 91, openCases: 5, monthlyRevenue: 23000 },
    primaryContact: { name: 'Amanda Torres', email: 'amanda@parkview.com', phone: '202-555-1200', role: 'Property Manager' },
    features: { ...TIER_FEATURES.advanced_governance },
    onboardingChecklist: { accountCreated: true, buildingProfileComplete: true, unitsConfigured: true, firstUserInvited: true, bylawsUploaded: true, financialSetupDone: true, goLive: true },
  },
  {
    id: 'bld-003', name: 'Georgetown Gardens HOA', subdomain: 'georgetowngardens',
    address: { street: '3100 Wisconsin Ave NW', city: 'Washington', state: 'DC', zip: '20016' },
    totalUnits: 28, yearBuilt: '1962', status: 'active', createdAt: '2025-09-10',
    subscription: { tier: 'essentials', status: 'active', startDate: '2025-09-10', nextBillingDate: '2026-03-10', monthlyRate: 49, trialEndsAt: null },
    stats: { activeUsers: 4, occupiedUnits: 26, collectionRate: 88, complianceScore: 65, openCases: 1, monthlyRevenue: 3640 },
    primaryContact: { name: 'William Chen', email: 'wchen@gtowngardens.com', phone: '202-555-2800', role: 'Treasurer' },
    features: { ...TIER_FEATURES.essentials },
    onboardingChecklist: { accountCreated: true, buildingProfileComplete: true, unitsConfigured: true, firstUserInvited: true, bylawsUploaded: false, financialSetupDone: true, goLive: true },
  },
  {
    id: 'bld-004', name: 'Capitol Hill Residences', subdomain: 'capitolhill',
    address: { street: '500 East Capitol St SE', city: 'Washington', state: 'DC', zip: '20003' },
    totalUnits: 75, yearBuilt: '2012', status: 'onboarding', createdAt: '2026-02-01',
    subscription: { tier: 'compliance_pro', status: 'trial', startDate: '2026-02-01', nextBillingDate: '2026-03-01', monthlyRate: 179, trialEndsAt: '2026-03-01' },
    stats: { activeUsers: 2, occupiedUnits: 0, collectionRate: 0, complianceScore: 0, openCases: 0, monthlyRevenue: 0 },
    primaryContact: { name: 'Priya Sharma', email: 'priya@capitolhill.com', phone: '202-555-7500', role: 'President' },
    features: { ...TIER_FEATURES.compliance_pro },
    onboardingChecklist: { accountCreated: true, buildingProfileComplete: true, unitsConfigured: false, firstUserInvited: false, bylawsUploaded: false, financialSetupDone: false, goLive: false },
  },
  {
    id: 'bld-005', name: 'Dupont Circle Condos', subdomain: 'dupontcircle',
    address: { street: '1800 Connecticut Ave NW', city: 'Washington', state: 'DC', zip: '20009' },
    totalUnits: 36, yearBuilt: '1985', status: 'suspended', createdAt: '2025-01-20',
    subscription: { tier: 'essentials', status: 'past_due', startDate: '2025-01-20', nextBillingDate: '2026-01-20', monthlyRate: 49, trialEndsAt: null },
    stats: { activeUsers: 3, occupiedUnits: 34, collectionRate: 91, complianceScore: 72, openCases: 2, monthlyRevenue: 4080 },
    primaryContact: { name: 'James Wilson', email: 'jwilson@dupontcondos.com', phone: '202-555-3600', role: 'Vice President' },
    features: { ...TIER_FEATURES.essentials },
    onboardingChecklist: { accountCreated: true, buildingProfileComplete: true, unitsConfigured: true, firstUserInvited: true, bylawsUploaded: true, financialSetupDone: true, goLive: true },
  },
];

const seedPlatformUsers: PlatformUser[] = [
  { id: 'padm-000', name: 'Alyssa Schelbert', email: 'alyssa@getonetwo.com', role: 'super_admin', status: 'active', lastLogin: '2026-02-22T10:00:00Z', createdAt: '2024-10-01', buildings: ['*'] },
  { id: 'padm-001', name: 'Alex Rivera', email: 'alex@onetwo.com', role: 'super_admin', status: 'active', lastLogin: '2026-02-20T08:30:00Z', createdAt: '2024-11-01', buildings: ['*'] },
  { id: 'padm-002', name: 'Morgan Lee', email: 'morgan@onetwo.com', role: 'support', status: 'active', lastLogin: '2026-02-19T14:22:00Z', createdAt: '2025-02-15', buildings: ['*'] },
  { id: 'padm-003', name: 'Jordan Kim', email: 'jordan@onetwo.com', role: 'billing', status: 'active', lastLogin: '2026-02-18T10:05:00Z', createdAt: '2025-06-01', buildings: ['*'] },
  { id: 'padm-004', name: 'Casey Nguyen', email: 'casey@onetwo.com', role: 'readonly', status: 'inactive', lastLogin: '2026-01-15T09:00:00Z', createdAt: '2025-09-01', buildings: ['bld-001', 'bld-002'] },
];

const seedAuditLog: AuditEntry[] = [
  { id: 'aud-001', timestamp: '2026-02-20T08:32:00Z', actor: 'Alex Rivera', actorRole: 'super_admin', action: 'login', target: 'Platform', details: 'Admin login from 192.168.1.10', buildingId: null },
  { id: 'aud-002', timestamp: '2026-02-19T16:45:00Z', actor: 'Morgan Lee', actorRole: 'support', action: 'building.update', target: 'Capitol Hill Residences', details: 'Extended trial period to Mar 15', buildingId: 'bld-004' },
  { id: 'aud-003', timestamp: '2026-02-18T11:20:00Z', actor: 'Jordan Kim', actorRole: 'billing', action: 'subscription.update', target: 'Dupont Circle Condos', details: 'Sent past-due notice (invoice #INV-2026-0042)', buildingId: 'bld-005' },
  { id: 'aud-004', timestamp: '2026-02-17T09:15:00Z', actor: 'Alex Rivera', actorRole: 'super_admin', action: 'building.suspend', target: 'Dupont Circle Condos', details: 'Account suspended — 45 days past due', buildingId: 'bld-005' },
  { id: 'aud-005', timestamp: '2026-02-15T14:30:00Z', actor: 'Alex Rivera', actorRole: 'super_admin', action: 'building.create', target: 'Capitol Hill Residences', details: 'New building onboarded — Professional trial started', buildingId: 'bld-004' },
  { id: 'aud-006', timestamp: '2026-02-14T10:00:00Z', actor: 'Morgan Lee', actorRole: 'support', action: 'user.assist', target: 'Georgetown Gardens', details: 'Reset password for William Chen', buildingId: 'bld-003' },
  { id: 'aud-007', timestamp: '2026-02-12T16:00:00Z', actor: 'Alex Rivera', actorRole: 'super_admin', action: 'feature.toggle', target: 'Park View Towers', details: 'Enabled AI Advisor feature', buildingId: 'bld-002' },
  { id: 'aud-008', timestamp: '2026-02-10T08:45:00Z', actor: 'Jordan Kim', actorRole: 'billing', action: 'subscription.upgrade', target: 'Park View Towers', details: 'Upgraded Professional → Enterprise', buildingId: 'bld-002' },
];

// ── Store ──────────────────────────────────────────

interface PlatformAdminState {
  tenants: Tenant[];
  platformUsers: PlatformUser[];
  auditLog: AuditEntry[];

  // Computed
  getPlatformMetrics: () => {
    totalBuildings: number; activeBuildings: number; totalUnits: number;
    totalUsers: number; mrr: number; arr: number; avgCompliance: number;
    trialBuildings: number; pastDueBuildings: number;
  };

  // Mutations
  updateTenantStatus: (id: string, status: BuildingStatus) => void;
  updateSubscription: (id: string, updates: Partial<Tenant['subscription']>) => void;
  toggleFeature: (id: string, feature: keyof Tenant['features']) => void;
  addTenant: (tenant: Tenant) => void;
  changeTier: (id: string, tier: SubscriptionTier, actor: string) => void;
  updateOnboardingStep: (id: string, step: keyof Tenant['onboardingChecklist'], done: boolean) => void;
  addPlatformUser: (user: PlatformUser) => void;
  updatePlatformUser: (id: string, updates: Partial<PlatformUser>) => void;
  removePlatformUser: (id: string) => void;
  addAuditEntry: (entry: Omit<AuditEntry, 'id' | 'timestamp'>) => void;
}

export const usePlatformAdminStore = create<PlatformAdminState>((set, get) => ({
  tenants: seedTenants,
  platformUsers: seedPlatformUsers,
  auditLog: seedAuditLog,

  getPlatformMetrics: () => {
    const { tenants } = get();
    const active = tenants.filter(t => t.status === 'active');
    const totalUsers = tenants.reduce((s, t) => s + t.stats.activeUsers, 0);
    const mrr = tenants.filter(t => ['active', 'trial'].includes(t.subscription.status)).reduce((s, t) => s + t.subscription.monthlyRate, 0);
    const avgCompliance = active.length > 0 ? Math.round(active.reduce((s, t) => s + t.stats.complianceScore, 0) / active.length) : 0;
    return {
      totalBuildings: tenants.length,
      activeBuildings: active.length,
      totalUnits: tenants.reduce((s, t) => s + t.totalUnits, 0),
      totalUsers,
      mrr,
      arr: mrr * 12,
      avgCompliance,
      trialBuildings: tenants.filter(t => t.subscription.status === 'trial').length,
      pastDueBuildings: tenants.filter(t => t.subscription.status === 'past_due').length,
    };
  },

  updateTenantStatus: (id, status) => set(s => ({
    tenants: s.tenants.map(t => t.id === id ? { ...t, status } : t),
  })),

  updateSubscription: (id, updates) => set(s => ({
    tenants: s.tenants.map(t => t.id === id ? { ...t, subscription: { ...t.subscription, ...updates } } : t),
  })),

  toggleFeature: (id, feature) => set(s => ({
    tenants: s.tenants.map(t => t.id === id ? { ...t, features: { ...t.features, [feature]: !t.features[feature] } } : t),
  })),

  addTenant: (tenant) => set(s => ({ tenants: [...s.tenants, tenant] })),

  changeTier: (id, tier, actor) => set(s => ({
    tenants: s.tenants.map(t => t.id === id ? {
      ...t,
      subscription: { ...t.subscription, tier, monthlyRate: { essentials: 49, compliance_pro: 179, advanced_governance: 299 }[tier] },
      features: { ...TIER_FEATURES[tier] },
    } : t),
    auditLog: [{ id: `aud-${Date.now()}`, timestamp: new Date().toISOString(), actor, actorRole: 'super_admin', action: 'subscription.tier_change', target: s.tenants.find(t => t.id === id)?.name || id, details: `Tier changed to ${tier} — features auto-updated`, buildingId: id }, ...s.auditLog],
  })),

  updateOnboardingStep: (id, step, done) => set(s => ({
    tenants: s.tenants.map(t => t.id === id ? { ...t, onboardingChecklist: { ...t.onboardingChecklist, [step]: done } } : t),
  })),

  addPlatformUser: (user) => set(s => ({ platformUsers: [...s.platformUsers, user] })),

  updatePlatformUser: (id, updates) => set(s => ({
    platformUsers: s.platformUsers.map(u => u.id === id ? { ...u, ...updates } : u),
  })),

  removePlatformUser: (id) => set(s => ({
    platformUsers: s.platformUsers.filter(u => u.id !== id),
  })),

  addAuditEntry: (entry) => set(s => ({
    auditLog: [{ ...entry, id: `aud-${Date.now()}`, timestamp: new Date().toISOString() }, ...s.auditLog],
  })),
}));

