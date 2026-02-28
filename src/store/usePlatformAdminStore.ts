import { create } from 'zustand';
import { isBackendEnabled } from '@/lib/supabase';
import * as platformSvc from '@/lib/services/platform';

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

export interface SupportTicket {
  id: string;
  buildingId: string;
  buildingName: string;
  subject: string;
  description: string;
  status: 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  notes: Array<{ author: string; text: string; date: string }>;
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  audience: 'all' | 'essentials' | 'compliance_pro' | 'advanced_governance' | string;
  status: 'draft' | 'sent';
  createdBy: string;
  createdAt: string;
  sentAt: string | null;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  trigger: 'onboarding_welcome' | 'trial_ending' | 'past_due' | 'feature_update' | 'monthly_report' | 'custom';
  lastEdited: string;
}

export interface Invoice {
  id: string;
  buildingId: string;
  buildingName: string;
  amount: number;
  status: 'paid' | 'pending' | 'overdue' | 'void';
  date: string;
  dueDate: string;
  paidDate: string | null;
}

const seedTickets: SupportTicket[] = [
  { id: 'tkt-001', buildingId: 'bld-003', buildingName: 'Georgetown Gardens HOA', subject: 'Cannot upload bylaws PDF', description: 'Getting error when trying to upload bylaws document. File is 4.2MB PDF.', status: 'open', priority: 'medium', assignedTo: null, createdBy: 'William Chen', createdAt: '2026-02-21T09:30:00Z', updatedAt: '2026-02-21T09:30:00Z', notes: [] },
  { id: 'tkt-002', buildingId: 'bld-001', buildingName: 'Sunny Acres Condominium', subject: 'Need to add property manager role', description: 'We hired PremierProperty as our management company. Need to set up their access.', status: 'in_progress', priority: 'high', assignedTo: 'Morgan Lee', createdBy: 'Robert Mitchell', createdAt: '2026-02-19T14:00:00Z', updatedAt: '2026-02-20T10:15:00Z', notes: [{ author: 'Morgan Lee', text: 'Sent PM invite instructions to Robert. Following up.', date: '2026-02-20T10:15:00Z' }] },
  { id: 'tkt-003', buildingId: 'bld-005', buildingName: 'Dupont Circle Condos', subject: 'Payment method update failing', description: 'Trying to update credit card but getting "card declined" even though card is valid.', status: 'waiting', priority: 'urgent', assignedTo: 'Jordan Kim', createdBy: 'James Wilson', createdAt: '2026-02-18T16:20:00Z', updatedAt: '2026-02-19T11:00:00Z', notes: [{ author: 'Jordan Kim', text: 'Contacted payment processor. Waiting for response on hold.', date: '2026-02-19T11:00:00Z' }] },
  { id: 'tkt-004', buildingId: 'bld-002', buildingName: 'Park View Towers', subject: 'Compliance report export', description: 'Can we get a CSV export of our compliance status for the board meeting?', status: 'resolved', priority: 'low', assignedTo: 'Morgan Lee', createdBy: 'Amanda Torres', createdAt: '2026-02-15T08:00:00Z', updatedAt: '2026-02-16T14:30:00Z', notes: [{ author: 'Morgan Lee', text: 'Generated and emailed compliance report CSV.', date: '2026-02-16T14:30:00Z' }] },
];

const seedAnnouncements: Announcement[] = [
  { id: 'ann-001', title: 'Votes & Resolutions Now Available', message: 'Advanced Governance subscribers can now create ownership-weighted elections with full compliance tracking.', audience: 'advanced_governance', status: 'sent', createdBy: 'Alyssa Schelbert', createdAt: '2026-02-15', sentAt: '2026-02-15' },
  { id: 'ann-002', title: 'Scheduled Maintenance — Feb 28', message: 'Brief downtime expected Feb 28 2-4 AM ET for infrastructure upgrades.', audience: 'all', status: 'draft', createdBy: 'Alex Rivera', createdAt: '2026-02-22', sentAt: null },
];

const seedTemplates: EmailTemplate[] = [
  { id: 'tmpl-001', name: 'Welcome — New Building', subject: 'Welcome to ONE two, {{building_name}}!', body: 'Hi {{contact_name}},\n\nYour building {{building_name}} is now set up at {{subdomain}}.getonetwo.com.\n\nYour 30-day trial of {{tier_name}} begins today. Here\'s how to get started:\n\n1. Complete your building profile\n2. Configure your units\n3. Invite your first board member or resident\n4. Upload your governing documents\n\nQuestions? Reply to this email or visit our help center.\n\n— The ONE two Team', trigger: 'onboarding_welcome', lastEdited: '2026-01-10' },
  { id: 'tmpl-002', name: 'Trial Ending — 7 Days', subject: 'Your ONE two trial ends in 7 days', body: 'Hi {{contact_name}},\n\nYour trial for {{building_name}} ({{tier_name}}) ends on {{trial_end_date}}.\n\nTo continue uninterrupted:\n→ Log in at {{subdomain}}.getonetwo.com\n→ Go to Account Settings → Billing\n→ Add a payment method\n\nNeed more time? Reply and we\'ll extend your trial.', trigger: 'trial_ending', lastEdited: '2026-01-15' },
  { id: 'tmpl-003', name: 'Payment Past Due', subject: 'Action required: Payment overdue for {{building_name}}', body: 'Hi {{contact_name}},\n\nWe were unable to process payment of {{amount}} for {{building_name}}.\n\nPlease update your payment method within 15 days to avoid service interruption.\n\nUpdate billing: {{subdomain}}.getonetwo.com/settings/billing', trigger: 'past_due', lastEdited: '2026-01-20' },
  { id: 'tmpl-004', name: 'Feature Update', subject: 'New in ONE two: {{feature_name}}', body: 'Hi {{contact_name}},\n\nWe\'ve just launched {{feature_name}} for {{tier_name}} subscribers.\n\n{{feature_description}}\n\nLog in to try it: {{subdomain}}.getonetwo.com', trigger: 'feature_update', lastEdited: '2026-02-10' },
  { id: 'tmpl-005', name: 'Monthly Summary Report', subject: 'Your {{month}} summary for {{building_name}}', body: 'Hi {{contact_name}},\n\nHere\'s your monthly summary for {{building_name}}:\n\n• Compliance Score: {{compliance_score}}%\n• Collection Rate: {{collection_rate}}%\n• Open Cases: {{open_cases}}\n• Active Users: {{active_users}}\n\nView full details: {{subdomain}}.getonetwo.com/dashboard', trigger: 'monthly_report', lastEdited: '2026-02-01' },
];

const seedInvoices: Invoice[] = [
  { id: 'inv-001', buildingId: 'bld-001', buildingName: 'Sunny Acres Condominium', amount: 179, status: 'paid', date: '2026-02-01', dueDate: '2026-02-15', paidDate: '2026-02-03' },
  { id: 'inv-002', buildingId: 'bld-001', buildingName: 'Sunny Acres Condominium', amount: 179, status: 'paid', date: '2026-01-01', dueDate: '2026-01-15', paidDate: '2026-01-02' },
  { id: 'inv-003', buildingId: 'bld-002', buildingName: 'Park View Towers', amount: 299, status: 'paid', date: '2026-02-01', dueDate: '2026-02-15', paidDate: '2026-02-01' },
  { id: 'inv-004', buildingId: 'bld-002', buildingName: 'Park View Towers', amount: 299, status: 'paid', date: '2026-01-01', dueDate: '2026-01-15', paidDate: '2026-01-03' },
  { id: 'inv-005', buildingId: 'bld-003', buildingName: 'Georgetown Gardens HOA', amount: 49, status: 'paid', date: '2026-02-01', dueDate: '2026-02-15', paidDate: '2026-02-10' },
  { id: 'inv-006', buildingId: 'bld-005', buildingName: 'Dupont Circle Condos', amount: 49, status: 'overdue', date: '2026-01-20', dueDate: '2026-02-03', paidDate: null },
  { id: 'inv-007', buildingId: 'bld-005', buildingName: 'Dupont Circle Condos', amount: 49, status: 'overdue', date: '2025-12-20', dueDate: '2026-01-03', paidDate: null },
];

interface PlatformAdminState {
  tenants: Tenant[];
  platformUsers: PlatformUser[];
  auditLog: AuditEntry[];
  supportTickets: SupportTicket[];
  announcements: Announcement[];
  emailTemplates: EmailTemplate[];
  invoices: Invoice[];
  impersonating: string | null; // tenant ID being impersonated

  // DB sync
  loadFromDb: () => Promise<void>;

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
  // Support
  addTicket: (ticket: Omit<SupportTicket, 'id' | 'createdAt' | 'updatedAt' | 'notes'>) => void;
  updateTicket: (id: string, updates: Partial<SupportTicket>) => void;
  addTicketNote: (id: string, author: string, text: string) => void;
  // Announcements
  addAnnouncement: (a: Omit<Announcement, 'id' | 'createdAt' | 'sentAt'>) => void;
  sendAnnouncement: (id: string) => void;
  deleteAnnouncement: (id: string) => void;
  // Templates
  updateTemplate: (id: string, updates: Partial<EmailTemplate>) => void;
  addTemplate: (t: Omit<EmailTemplate, 'id' | 'lastEdited'>) => void;
  // Impersonation
  setImpersonating: (tenantId: string | null) => void;
}

export const usePlatformAdminStore = create<PlatformAdminState>((set, get) => ({
  tenants: seedTenants,
  platformUsers: seedPlatformUsers,
  auditLog: seedAuditLog,
  supportTickets: seedTickets,
  announcements: seedAnnouncements,
  emailTemplates: seedTemplates,
  invoices: seedInvoices,
  impersonating: null,

  // ─── DB Hydration ──────────────────────────────────
  loadFromDb: async () => {
    const [tickets, templates, announcements] = await Promise.all([
      platformSvc.fetchTickets(),
      platformSvc.fetchTemplates(),
      platformSvc.fetchPlatformAnnouncements(),
    ]);
    const updates: Partial<PlatformAdminState> = {};
    if (tickets) updates.supportTickets = tickets;
    if (templates) updates.emailTemplates = templates;
    if (announcements) updates.announcements = announcements;
    if (Object.keys(updates).length > 0) set(updates);
  },

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

  // Support tickets
  addTicket: (ticket) => {
    const id = `tkt-${Date.now()}`;
    const now = new Date().toISOString();
    set(s => ({ supportTickets: [{ ...ticket, id, createdAt: now, updatedAt: now, notes: [] }, ...s.supportTickets] }));
    if (isBackendEnabled) {
      platformSvc.createTicket(ticket).then(dbRow => {
        if (dbRow) set(s => ({ supportTickets: s.supportTickets.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      });
    }
  },
  updateTicket: (id, updates) => {
    set(s => ({ supportTickets: s.supportTickets.map(t => t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t) }));
    if (isBackendEnabled) platformSvc.updateTicket(id, updates);
  },
  addTicketNote: (id, author, text) => {
    set(s => ({ supportTickets: s.supportTickets.map(t => t.id === id ? { ...t, notes: [...t.notes, { author, text, date: new Date().toISOString() }], updatedAt: new Date().toISOString() } : t) }));
    if (isBackendEnabled) {
      const ticket = usePlatformAdminStore.getState().supportTickets.find(t => t.id === id);
      if (ticket) platformSvc.updateTicket(id, { notes: ticket.notes });
    }
  },
  // Announcements
  addAnnouncement: (a) => {
    const id = `ann-${Date.now()}`;
    set(s => ({ announcements: [{ ...a, id, createdAt: new Date().toISOString().split('T')[0], sentAt: null }, ...s.announcements] }));
    if (isBackendEnabled) {
      platformSvc.createPlatformAnnouncement(a).then(dbRow => {
        if (dbRow) set(s => ({ announcements: s.announcements.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      });
    }
  },
  sendAnnouncement: (id) => {
    const sentAt = new Date().toISOString().split('T')[0];
    set(s => ({ announcements: s.announcements.map(a => a.id === id ? { ...a, status: 'sent' as const, sentAt } : a) }));
    if (isBackendEnabled) platformSvc.updatePlatformAnnouncement(id, { status: 'sent', sentAt });
  },
  deleteAnnouncement: (id) => {
    set(s => ({ announcements: s.announcements.filter(a => a.id !== id) }));
    if (isBackendEnabled) platformSvc.deletePlatformAnnouncement(id);
  },
  // Templates
  updateTemplate: (id, updates) => {
    const lastEdited = new Date().toISOString().split('T')[0];
    set(s => ({ emailTemplates: s.emailTemplates.map(t => t.id === id ? { ...t, ...updates, lastEdited } : t) }));
    if (isBackendEnabled) platformSvc.updateTemplate(id, { ...updates, lastEdited });
  },
  addTemplate: (t) => {
    const id = `tmpl-${Date.now()}`;
    const lastEdited = new Date().toISOString().split('T')[0];
    set(s => ({ emailTemplates: [...s.emailTemplates, { ...t, id, lastEdited }] }));
    if (isBackendEnabled) {
      platformSvc.createTemplate(t).then(dbRow => {
        if (dbRow) set(s => ({ emailTemplates: s.emailTemplates.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      });
    }
  },
  // Impersonation
  setImpersonating: (tenantId) => set({ impersonating: tenantId }),
}));
