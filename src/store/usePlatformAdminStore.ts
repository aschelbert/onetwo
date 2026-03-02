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

// ── New Types (Admin Console v2) ──────────────────

export interface Permission {
  id: string;
  roleId: string;
  featureId: string;
  actions: string[];
  updatedAt: string;
  updatedBy: string | null;
}

export interface StripeWebhookEvent {
  id: string;
  stripeEventId: string;
  type: string;
  status: 'processing' | 'success' | 'failed';
  tenantId?: string;
  tenantName?: string;
  amount?: number;
  payload: Record<string, unknown>;
  errorMessage?: string;
  createdAt: string;
  processedAt?: string;
}

export interface StripePayment {
  id: string;
  tenantId?: string;
  tenantName: string;
  amount: number;
  status: 'succeeded' | 'failed' | 'pending' | 'refunded';
  stripePaymentIntentId?: string;
  stripeInvoiceId?: string;
  paymentMethod: string;
  last4?: string;
  failureReason?: string;
  createdAt: string;
}

export interface StripeConfig {
  mode: 'test' | 'live';
  publishableKey: string;
  webhookUrl: string;
  connectedAt: string;
  lastWebhookReceived?: string;
}

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface PlatformAccount {
  num: string;
  name: string;
  type: AccountType;
  subType: string;
  parentNum: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface PlatformGLEntry {
  id: string;
  date: string;
  memo: string;
  debitAcct: string;
  creditAcct: string;
  amount: number;
  source: string;
  ref: string | null;
  postedAt: string;
  postedBy: string | null;
}

export interface PlatformBudget {
  id: string;
  acctNum: string;
  name: string;
  budgeted: number;
  period: string;
  fiscalYear: number;
  isActive: boolean;
}

// Role definitions for RBAC
export const TENANT_ROLES = [
  { id: 'board_member', name: 'Board Member', description: 'HOA board members with governance and fiduciary responsibilities', icon: '🛡️', tiers: ['essentials', 'compliance_pro', 'advanced_governance'] as SubscriptionTier[] },
  { id: 'resident', name: 'Resident', description: 'Unit owners and residents of the community', icon: '🏠', tiers: ['essentials', 'compliance_pro', 'advanced_governance'] as SubscriptionTier[] },
  { id: 'property_manager', name: 'Property Manager', description: 'Professional property management company representatives', icon: '💼', tiers: ['advanced_governance'] as SubscriptionTier[] },
] as const;

export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete', 'approve'] as const;

// Feature groups for display in permissions matrix
export const FEATURE_GROUPS: { name: string; features: string[] }[] = [
  { name: 'Financial', features: ['fiscalLens', 'paymentProcessing'] },
  { name: 'Compliance & Governance', features: ['complianceRunbook'] },
  { name: 'Case & Workflow', features: ['caseOps'] },
  { name: 'AI & Intelligence', features: ['aiAdvisor'] },
  { name: 'Documents & Archives', features: ['documentVault'] },
  { name: 'Community', features: ['votesResolutions', 'communityPortal'] },
  { name: 'Management', features: ['vendorManagement', 'reserveStudyTools'] },
];

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

// ── Seed Data (Admin Console v2) ──────────────────

const seedPermissions: Permission[] = [
  // Board Member: full access
  ...['fiscalLens','caseOps','complianceRunbook','aiAdvisor','documentVault','paymentProcessing','votesResolutions','communityPortal','vendorManagement','reserveStudyTools'].map((f, i) => ({
    id: `perm-bm-${i}`, roleId: 'board_member', featureId: f,
    actions: ['view','create','edit','delete','approve'], updatedAt: '2026-01-01T00:00:00Z', updatedBy: null,
  })),
  // Resident: view-heavy with limited create
  { id: 'perm-res-0', roleId: 'resident', featureId: 'fiscalLens', actions: ['view'], updatedAt: '2026-01-01T00:00:00Z', updatedBy: null },
  { id: 'perm-res-1', roleId: 'resident', featureId: 'caseOps', actions: ['view','create'], updatedAt: '2026-01-01T00:00:00Z', updatedBy: null },
  { id: 'perm-res-2', roleId: 'resident', featureId: 'complianceRunbook', actions: ['view'], updatedAt: '2026-01-01T00:00:00Z', updatedBy: null },
  { id: 'perm-res-3', roleId: 'resident', featureId: 'aiAdvisor', actions: ['view'], updatedAt: '2026-01-01T00:00:00Z', updatedBy: null },
  { id: 'perm-res-4', roleId: 'resident', featureId: 'documentVault', actions: ['view'], updatedAt: '2026-01-01T00:00:00Z', updatedBy: null },
  { id: 'perm-res-5', roleId: 'resident', featureId: 'paymentProcessing', actions: ['view'], updatedAt: '2026-01-01T00:00:00Z', updatedBy: null },
  { id: 'perm-res-6', roleId: 'resident', featureId: 'votesResolutions', actions: ['view','create'], updatedAt: '2026-01-01T00:00:00Z', updatedBy: null },
  { id: 'perm-res-7', roleId: 'resident', featureId: 'communityPortal', actions: ['view','create','edit'], updatedAt: '2026-01-01T00:00:00Z', updatedBy: null },
  { id: 'perm-res-8', roleId: 'resident', featureId: 'vendorManagement', actions: ['view'], updatedAt: '2026-01-01T00:00:00Z', updatedBy: null },
  { id: 'perm-res-9', roleId: 'resident', featureId: 'reserveStudyTools', actions: ['view'], updatedAt: '2026-01-01T00:00:00Z', updatedBy: null },
  // Property Manager: operational access
  { id: 'perm-pm-0', roleId: 'property_manager', featureId: 'fiscalLens', actions: ['view','create','edit'], updatedAt: '2026-01-01T00:00:00Z', updatedBy: null },
  { id: 'perm-pm-1', roleId: 'property_manager', featureId: 'caseOps', actions: ['view','create','edit'], updatedAt: '2026-01-01T00:00:00Z', updatedBy: null },
  { id: 'perm-pm-2', roleId: 'property_manager', featureId: 'complianceRunbook', actions: ['view','create','edit'], updatedAt: '2026-01-01T00:00:00Z', updatedBy: null },
  { id: 'perm-pm-3', roleId: 'property_manager', featureId: 'aiAdvisor', actions: ['view','create','edit'], updatedAt: '2026-01-01T00:00:00Z', updatedBy: null },
  { id: 'perm-pm-4', roleId: 'property_manager', featureId: 'documentVault', actions: ['view','create','edit'], updatedAt: '2026-01-01T00:00:00Z', updatedBy: null },
  { id: 'perm-pm-5', roleId: 'property_manager', featureId: 'paymentProcessing', actions: ['view','create','edit','approve'], updatedAt: '2026-01-01T00:00:00Z', updatedBy: null },
  { id: 'perm-pm-6', roleId: 'property_manager', featureId: 'votesResolutions', actions: ['view','create','edit'], updatedAt: '2026-01-01T00:00:00Z', updatedBy: null },
  { id: 'perm-pm-7', roleId: 'property_manager', featureId: 'communityPortal', actions: ['view','create','edit'], updatedAt: '2026-01-01T00:00:00Z', updatedBy: null },
  { id: 'perm-pm-8', roleId: 'property_manager', featureId: 'vendorManagement', actions: ['view','create','edit','delete'], updatedAt: '2026-01-01T00:00:00Z', updatedBy: null },
  { id: 'perm-pm-9', roleId: 'property_manager', featureId: 'reserveStudyTools', actions: ['view','create','edit','delete'], updatedAt: '2026-01-01T00:00:00Z', updatedBy: null },
];

const seedStripeConfig: StripeConfig = {
  mode: 'test',
  publishableKey: 'pk_test_51Pq...xxxxx',
  webhookUrl: 'https://api.getonetwo.com/webhooks/stripe',
  connectedAt: '2026-01-15T10:00:00Z',
  lastWebhookReceived: '2026-03-02T08:45:12Z',
};

const seedStripePayments: StripePayment[] = [
  { id: 'pi_001', tenantName: '1302 R Street NW', amount: 179, status: 'succeeded', stripePaymentIntentId: 'pi_seed_001', stripeInvoiceId: 'in_Rk0001', paymentMethod: 'card', last4: '4242', createdAt: '2026-03-01' },
  { id: 'pi_002', tenantName: 'Capitol Hill Terraces', amount: 2508, status: 'succeeded', stripePaymentIntentId: 'pi_seed_002', stripeInvoiceId: 'in_Rk0002', paymentMethod: 'card', last4: '5555', createdAt: '2026-01-01' },
  { id: 'pi_003', tenantName: 'Dupont Circle Lofts', amount: 399, status: 'succeeded', stripePaymentIntentId: 'pi_seed_003', stripeInvoiceId: 'in_Rk0003', paymentMethod: 'ach', last4: '9012', createdAt: '2026-02-28' },
  { id: 'pi_004', tenantName: 'Dupont Circle Lofts', amount: 399, status: 'succeeded', stripePaymentIntentId: 'pi_seed_004', stripeInvoiceId: 'in_Rk0004', paymentMethod: 'ach', last4: '9012', createdAt: '2026-01-28' },
  { id: 'pi_005', tenantName: '1302 R Street NW', amount: 179, status: 'succeeded', stripePaymentIntentId: 'pi_seed_005', stripeInvoiceId: 'in_Rk0005', paymentMethod: 'card', last4: '4242', createdAt: '2026-02-01' },
  { id: 'pi_006', tenantName: 'Georgetown Mews', amount: 179, status: 'failed', stripePaymentIntentId: 'pi_seed_006', stripeInvoiceId: 'in_Rk0006', paymentMethod: 'card', last4: '0019', createdAt: '2026-02-15' },
  { id: 'pi_007', tenantName: '1302 R Street NW', amount: 179, status: 'succeeded', stripePaymentIntentId: 'pi_seed_007', stripeInvoiceId: 'in_Rk0007', paymentMethod: 'card', last4: '4242', createdAt: '2026-01-01' },
  { id: 'pi_008', tenantName: 'Capitol Hill Terraces', amount: 249, status: 'succeeded', stripePaymentIntentId: 'pi_seed_008', stripeInvoiceId: 'in_Rk0008', paymentMethod: 'card', last4: '5555', createdAt: '2025-12-01' },
];

const seedStripeWebhookEvents: StripeWebhookEvent[] = [
  { id: 'evt_001', stripeEventId: 'evt_1PqAb_seed', type: 'invoice.paid', status: 'success', tenantName: '1302 R Street NW Condominium', amount: 179, payload: {}, createdAt: '2026-03-01T10:00:12Z', processedAt: '2026-03-01T10:00:13Z' },
  { id: 'evt_002', stripeEventId: 'evt_1PqCd_seed', type: 'invoice.paid', status: 'success', tenantName: 'Dupont Circle Lofts', amount: 399, payload: {}, createdAt: '2026-02-28T14:22:45Z', processedAt: '2026-02-28T14:22:46Z' },
  { id: 'evt_003', stripeEventId: 'evt_1PqEf_seed', type: 'customer.subscription.updated', status: 'success', tenantName: 'Capitol Hill Terraces HOA', payload: {}, createdAt: '2026-02-27T09:11:30Z', processedAt: '2026-02-27T09:11:31Z' },
  { id: 'evt_004', stripeEventId: 'evt_1PqGh_seed', type: 'invoice.payment_failed', status: 'failed', tenantName: 'Georgetown Mews', amount: 179, payload: {}, createdAt: '2026-02-15T16:30:00Z', processedAt: '2026-02-15T16:30:01Z' },
  { id: 'evt_005', stripeEventId: 'evt_1PqIj_seed', type: 'customer.subscription.trial_will_end', status: 'success', tenantName: 'Adams Morgan Commons', payload: {}, createdAt: '2026-03-02T08:45:12Z', processedAt: '2026-03-02T08:45:13Z' },
  { id: 'evt_006', stripeEventId: 'evt_1PqKl_seed', type: 'invoice.paid', status: 'success', tenantName: 'Capitol Hill Terraces HOA', amount: 2508, payload: {}, createdAt: '2026-01-01T00:05:00Z', processedAt: '2026-01-01T00:05:01Z' },
  { id: 'evt_007', stripeEventId: 'evt_1PqMn_seed', type: 'checkout.session.completed', status: 'success', tenantName: 'Adams Morgan Commons', amount: 0, payload: {}, createdAt: '2026-02-01T11:15:00Z', processedAt: '2026-02-01T11:15:01Z' },
];

const seedPlatformAccounts: PlatformAccount[] = [
  { num: '1000', name: 'Assets', type: 'asset', subType: 'header', parentNum: null, isActive: true, sortOrder: 100 },
  { num: '1010', name: 'Operating Account (Chase)', type: 'asset', subType: 'bank', parentNum: '1000', isActive: true, sortOrder: 110 },
  { num: '1020', name: 'Stripe Balance', type: 'asset', subType: 'bank', parentNum: '1000', isActive: true, sortOrder: 120 },
  { num: '1030', name: 'Savings Reserve', type: 'asset', subType: 'bank', parentNum: '1000', isActive: true, sortOrder: 130 },
  { num: '1100', name: 'Accounts Receivable', type: 'asset', subType: 'receivable', parentNum: '1000', isActive: true, sortOrder: 140 },
  { num: '1110', name: 'Subscription AR', type: 'asset', subType: 'receivable', parentNum: '1100', isActive: true, sortOrder: 141 },
  { num: '1120', name: 'Trial Conversions Pending', type: 'asset', subType: 'receivable', parentNum: '1100', isActive: true, sortOrder: 142 },
  { num: '1200', name: 'Prepaid Expenses', type: 'asset', subType: 'prepaid', parentNum: '1000', isActive: true, sortOrder: 150 },
  { num: '2000', name: 'Liabilities', type: 'liability', subType: 'header', parentNum: null, isActive: true, sortOrder: 200 },
  { num: '2010', name: 'Accounts Payable', type: 'liability', subType: 'payable', parentNum: '2000', isActive: true, sortOrder: 210 },
  { num: '2020', name: 'Accrued Expenses', type: 'liability', subType: 'payable', parentNum: '2000', isActive: true, sortOrder: 220 },
  { num: '2030', name: 'Deferred Revenue', type: 'liability', subType: 'deferred', parentNum: '2000', isActive: true, sortOrder: 230 },
  { num: '2040', name: 'Credit Card Payable', type: 'liability', subType: 'payable', parentNum: '2000', isActive: true, sortOrder: 240 },
  { num: '3000', name: 'Equity', type: 'equity', subType: 'header', parentNum: null, isActive: true, sortOrder: 300 },
  { num: '3010', name: 'Founder Equity', type: 'equity', subType: 'equity', parentNum: '3000', isActive: true, sortOrder: 310 },
  { num: '3020', name: 'Retained Earnings', type: 'equity', subType: 'equity', parentNum: '3000', isActive: true, sortOrder: 320 },
  { num: '4000', name: 'Revenue', type: 'revenue', subType: 'header', parentNum: null, isActive: true, sortOrder: 400 },
  { num: '4010', name: 'Subscription Revenue - Monthly', type: 'revenue', subType: 'subscription', parentNum: '4000', isActive: true, sortOrder: 410 },
  { num: '4020', name: 'Subscription Revenue - Annual', type: 'revenue', subType: 'subscription', parentNum: '4000', isActive: true, sortOrder: 420 },
  { num: '4030', name: 'Setup Fees', type: 'revenue', subType: 'fees', parentNum: '4000', isActive: true, sortOrder: 430 },
  { num: '4040', name: 'Add-on Services', type: 'revenue', subType: 'services', parentNum: '4000', isActive: true, sortOrder: 440 },
  { num: '4090', name: 'Refunds & Credits', type: 'revenue', subType: 'contra', parentNum: '4000', isActive: true, sortOrder: 490 },
  { num: '5000', name: 'Cost of Goods Sold', type: 'expense', subType: 'header', parentNum: null, isActive: true, sortOrder: 500 },
  { num: '5010', name: 'Cloud Hosting (AWS/GCP)', type: 'expense', subType: 'cogs', parentNum: '5000', isActive: true, sortOrder: 510 },
  { num: '5020', name: 'Stripe Processing Fees', type: 'expense', subType: 'cogs', parentNum: '5000', isActive: true, sortOrder: 520 },
  { num: '5030', name: 'Third-party APIs & Services', type: 'expense', subType: 'cogs', parentNum: '5000', isActive: true, sortOrder: 530 },
  { num: '5040', name: 'Customer Support Tools', type: 'expense', subType: 'cogs', parentNum: '5000', isActive: true, sortOrder: 540 },
  { num: '6000', name: 'Operating Expenses', type: 'expense', subType: 'header', parentNum: null, isActive: true, sortOrder: 600 },
  { num: '6010', name: 'Payroll & Benefits', type: 'expense', subType: 'opex', parentNum: '6000', isActive: true, sortOrder: 610 },
  { num: '6020', name: 'Contractors & Freelancers', type: 'expense', subType: 'opex', parentNum: '6000', isActive: true, sortOrder: 620 },
  { num: '6030', name: 'Software & SaaS Tools', type: 'expense', subType: 'opex', parentNum: '6000', isActive: true, sortOrder: 630 },
  { num: '6040', name: 'Legal & Professional', type: 'expense', subType: 'opex', parentNum: '6000', isActive: true, sortOrder: 640 },
  { num: '6050', name: 'Marketing & Advertising', type: 'expense', subType: 'opex', parentNum: '6000', isActive: true, sortOrder: 650 },
  { num: '6060', name: 'Office & Facilities', type: 'expense', subType: 'opex', parentNum: '6000', isActive: true, sortOrder: 660 },
  { num: '6070', name: 'Insurance', type: 'expense', subType: 'opex', parentNum: '6000', isActive: true, sortOrder: 670 },
  { num: '6080', name: 'Travel & Conferences', type: 'expense', subType: 'opex', parentNum: '6000', isActive: true, sortOrder: 680 },
  { num: '6090', name: 'Bank Fees & Interest', type: 'expense', subType: 'opex', parentNum: '6000', isActive: true, sortOrder: 690 },
  { num: '6100', name: 'Miscellaneous', type: 'expense', subType: 'opex', parentNum: '6000', isActive: true, sortOrder: 700 },
];

const seedGLEntries: PlatformGLEntry[] = [
  { id: 'PGL5000', date: '2025-06-01', memo: 'Founder initial investment', debitAcct: '1010', creditAcct: '3010', amount: 150000, source: 'equity', ref: null, postedAt: '2025-06-01T00:00:00Z', postedBy: 'system' },
  { id: 'PGL5001', date: '2025-12-31', memo: 'Retained earnings carry-forward', debitAcct: '1010', creditAcct: '3020', amount: 28000, source: 'equity', ref: null, postedAt: '2025-12-31T00:00:00Z', postedBy: 'system' },
  { id: 'PGL5002', date: '2026-01-01', memo: 'Subscription - 1302 R Street NW (Jan)', debitAcct: '1020', creditAcct: '4010', amount: 179, source: 'stripe', ref: 'tn-001', postedAt: '2026-01-01T10:00:00Z', postedBy: 'system' },
  { id: 'PGL5003', date: '2026-01-01', memo: 'Subscription - Capitol Hill Terraces (Annual)', debitAcct: '1020', creditAcct: '4020', amount: 2508, source: 'stripe', ref: 'tn-002', postedAt: '2026-01-01T00:05:00Z', postedBy: 'system' },
  { id: 'PGL5004', date: '2026-01-01', memo: 'Subscription - Dupont Circle Lofts (Jan)', debitAcct: '1020', creditAcct: '4010', amount: 399, source: 'stripe', ref: 'tn-003', postedAt: '2026-01-01T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5005', date: '2026-01-01', memo: 'Subscription - Georgetown Mews (Jan)', debitAcct: '1020', creditAcct: '4010', amount: 179, source: 'stripe', ref: 'tn-005', postedAt: '2026-01-01T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5006', date: '2026-02-01', memo: 'Subscription - 1302 R Street NW (Feb)', debitAcct: '1020', creditAcct: '4010', amount: 179, source: 'stripe', ref: 'tn-001', postedAt: '2026-02-01T10:00:00Z', postedBy: 'system' },
  { id: 'PGL5007', date: '2026-02-15', memo: 'Subscription - Dupont Circle Lofts (Feb)', debitAcct: '1020', creditAcct: '4010', amount: 399, source: 'stripe', ref: 'tn-003', postedAt: '2026-02-15T14:22:00Z', postedBy: 'system' },
  { id: 'PGL5008', date: '2026-03-01', memo: 'Subscription - 1302 R Street NW (Mar)', debitAcct: '1020', creditAcct: '4010', amount: 179, source: 'stripe', ref: 'tn-001', postedAt: '2026-03-01T10:00:00Z', postedBy: 'system' },
  { id: 'PGL5009', date: '2026-02-28', memo: 'Subscription - Dupont Circle Lofts (Mar)', debitAcct: '1020', creditAcct: '4010', amount: 399, source: 'stripe', ref: 'tn-003', postedAt: '2026-02-28T14:22:00Z', postedBy: 'system' },
  { id: 'PGL5010', date: '2026-01-15', memo: 'Stripe payout to Chase', debitAcct: '1010', creditAcct: '1020', amount: 3200, source: 'payout', ref: null, postedAt: '2026-01-15T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5011', date: '2026-02-15', memo: 'Stripe payout to Chase', debitAcct: '1010', creditAcct: '1020', amount: 900, source: 'payout', ref: null, postedAt: '2026-02-15T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5012', date: '2026-03-01', memo: 'Stripe payout to Chase', debitAcct: '1010', creditAcct: '1020', amount: 550, source: 'payout', ref: null, postedAt: '2026-03-01T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5013', date: '2026-01-31', memo: 'Stripe fees - January', debitAcct: '5020', creditAcct: '1020', amount: 52.27, source: 'stripe_fee', ref: null, postedAt: '2026-01-31T23:59:00Z', postedBy: 'system' },
  { id: 'PGL5014', date: '2026-02-28', memo: 'Stripe fees - February', debitAcct: '5020', creditAcct: '1020', amount: 17.48, source: 'stripe_fee', ref: null, postedAt: '2026-02-28T23:59:00Z', postedBy: 'system' },
  { id: 'PGL5015', date: '2026-01-31', memo: 'AWS hosting - January', debitAcct: '5010', creditAcct: '1010', amount: 2180, source: 'expense', ref: 'aws-jan', postedAt: '2026-01-31T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5016', date: '2026-02-28', memo: 'AWS hosting - February', debitAcct: '5010', creditAcct: '1010', amount: 2350, source: 'expense', ref: 'aws-feb', postedAt: '2026-02-28T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5017', date: '2026-01-31', memo: 'Twilio + SendGrid - January', debitAcct: '5030', creditAcct: '1010', amount: 285, source: 'expense', ref: 'api-jan', postedAt: '2026-01-31T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5018', date: '2026-02-28', memo: 'Twilio + SendGrid - February', debitAcct: '5030', creditAcct: '1010', amount: 310, source: 'expense', ref: 'api-feb', postedAt: '2026-02-28T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5019', date: '2026-01-31', memo: 'Intercom - January', debitAcct: '5040', creditAcct: '1010', amount: 189, source: 'expense', ref: 'support-jan', postedAt: '2026-01-31T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5020', date: '2026-02-28', memo: 'Intercom - February', debitAcct: '5040', creditAcct: '1010', amount: 189, source: 'expense', ref: 'support-feb', postedAt: '2026-02-28T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5021', date: '2026-01-31', memo: 'Payroll - January', debitAcct: '6010', creditAcct: '1010', amount: 17500, source: 'payroll', ref: 'jan', postedAt: '2026-01-31T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5022', date: '2026-02-28', memo: 'Payroll - February', debitAcct: '6010', creditAcct: '1010', amount: 17500, source: 'payroll', ref: 'feb', postedAt: '2026-02-28T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5023', date: '2026-01-31', memo: '1099 Contractors - January', debitAcct: '6020', creditAcct: '1010', amount: 4200, source: 'payroll', ref: 'jan-1099', postedAt: '2026-01-31T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5024', date: '2026-02-28', memo: '1099 Contractors - February', debitAcct: '6020', creditAcct: '1010', amount: 4800, source: 'payroll', ref: 'feb-1099', postedAt: '2026-02-28T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5025', date: '2026-01-31', memo: 'SaaS tools (GitHub, Figma, Linear, etc.)', debitAcct: '6030', creditAcct: '2040', amount: 780, source: 'expense', ref: 'tools-jan', postedAt: '2026-01-31T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5026', date: '2026-02-28', memo: 'SaaS tools (GitHub, Figma, Linear, etc.)', debitAcct: '6030', creditAcct: '2040', amount: 780, source: 'expense', ref: 'tools-feb', postedAt: '2026-02-28T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5027', date: '2026-01-15', memo: 'Legal retainer - Q1', debitAcct: '6040', creditAcct: '1010', amount: 4500, source: 'expense', ref: 'legal-q1', postedAt: '2026-01-15T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5028', date: '2026-02-01', memo: 'Google Ads - February', debitAcct: '6050', creditAcct: '2040', amount: 2800, source: 'expense', ref: 'mktg-feb', postedAt: '2026-02-01T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5029', date: '2026-01-01', memo: 'E&O Insurance - Monthly', debitAcct: '6070', creditAcct: '1010', amount: 580, source: 'expense', ref: 'ins-jan', postedAt: '2026-01-01T12:00:00Z', postedBy: 'system' },
  { id: 'PGL5030', date: '2026-02-01', memo: 'E&O Insurance - Monthly', debitAcct: '6070', creditAcct: '1010', amount: 580, source: 'expense', ref: 'ins-feb', postedAt: '2026-02-01T12:00:00Z', postedBy: 'system' },
];

const seedPlatformBudgets: PlatformBudget[] = [
  { id: 'pb1', acctNum: '5010', name: 'Cloud Hosting', budgeted: 2400, period: 'MONTHLY', fiscalYear: 2026, isActive: true },
  { id: 'pb2', acctNum: '5020', name: 'Stripe Fees', budgeted: 180, period: 'MONTHLY', fiscalYear: 2026, isActive: true },
  { id: 'pb3', acctNum: '5030', name: 'Third-party APIs', budgeted: 350, period: 'MONTHLY', fiscalYear: 2026, isActive: true },
  { id: 'pb4', acctNum: '5040', name: 'Support Tools', budgeted: 200, period: 'MONTHLY', fiscalYear: 2026, isActive: true },
  { id: 'pb5', acctNum: '6010', name: 'Payroll & Benefits', budgeted: 18000, period: 'MONTHLY', fiscalYear: 2026, isActive: true },
  { id: 'pb6', acctNum: '6020', name: 'Contractors', budgeted: 5000, period: 'MONTHLY', fiscalYear: 2026, isActive: true },
  { id: 'pb7', acctNum: '6030', name: 'Software Tools', budgeted: 800, period: 'MONTHLY', fiscalYear: 2026, isActive: true },
  { id: 'pb8', acctNum: '6040', name: 'Legal & Professional', budgeted: 1500, period: 'MONTHLY', fiscalYear: 2026, isActive: true },
  { id: 'pb9', acctNum: '6050', name: 'Marketing', budgeted: 3000, period: 'MONTHLY', fiscalYear: 2026, isActive: true },
  { id: 'pb10', acctNum: '6070', name: 'Insurance', budgeted: 600, period: 'MONTHLY', fiscalYear: 2026, isActive: true },
];

// ── Accounting Helper Functions ──────────────────────

export function accountBalance(acctNum: string, accounts: PlatformAccount[], entries: PlatformGLEntry[]): number {
  const account = accounts.find(a => a.num === acctNum);
  if (!account) return 0;
  const isDebitNormal = account.type === 'asset' || account.type === 'expense';
  let balance = 0;
  for (const entry of entries) {
    if (entry.debitAcct === acctNum) balance += entry.amount;
    if (entry.creditAcct === acctNum) balance -= entry.amount;
  }
  return isDebitNormal ? balance : -balance;
}

export function groupBalance(parentNum: string, accounts: PlatformAccount[], entries: PlatformGLEntry[]): number {
  const children = accounts.filter(a => a.parentNum === parentNum);
  if (children.length === 0) return accountBalance(parentNum, accounts, entries);
  return children.reduce((sum, child) => {
    const grandchildren = accounts.filter(a => a.parentNum === child.num);
    return sum + (grandchildren.length > 0
      ? groupBalance(child.num, accounts, entries)
      : accountBalance(child.num, accounts, entries));
  }, 0);
}

export function getBudgetVariance(budget: PlatformBudget, monthsElapsed: number, accounts: PlatformAccount[], entries: PlatformGLEntry[]) {
  const actual = Math.abs(accountBalance(budget.acctNum, accounts, entries));
  const ytdBudget = budget.budgeted * monthsElapsed;
  const variance = ytdBudget - actual;
  const burnPct = ytdBudget > 0 ? Math.round((actual / ytdBudget) * 100) : 0;
  return {
    name: budget.name, acctNum: budget.acctNum, monthlyBudget: budget.budgeted,
    avgMonthly: monthsElapsed > 0 ? actual / monthsElapsed : 0,
    ytdActual: actual, ytdBudget, variance, burnPct,
    status: burnPct > 100 ? 'over' as const : burnPct > 85 ? 'warning' as const : 'healthy' as const,
  };
}

export function generatePnL(fromDate: string, toDate: string, accounts: PlatformAccount[], entries: PlatformGLEntry[]) {
  const filtered = entries.filter(e => e.date >= fromDate && e.date <= toDate);
  const revenue = accounts.filter(a => a.type === 'revenue' && a.subType !== 'header' && a.subType !== 'contra')
    .map(a => ({ num: a.num, name: a.name, amount: accountBalance(a.num, accounts, filtered) }))
    .filter(a => a.amount !== 0);
  const cogs = accounts.filter(a => a.parentNum === '5000')
    .map(a => ({ num: a.num, name: a.name, amount: accountBalance(a.num, accounts, filtered) }))
    .filter(a => a.amount !== 0);
  const opex = accounts.filter(a => a.parentNum === '6000')
    .map(a => ({ num: a.num, name: a.name, amount: accountBalance(a.num, accounts, filtered) }))
    .filter(a => a.amount !== 0);
  const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0);
  const totalCOGS = cogs.reduce((s, r) => s + r.amount, 0);
  const grossProfit = totalRevenue - totalCOGS;
  const totalOpEx = opex.reduce((s, r) => s + r.amount, 0);
  const netIncome = grossProfit - totalOpEx;
  return { revenue, cogs, opex, totalRevenue, totalCOGS, grossProfit, totalOpEx, netIncome };
}

// ── Store Interface ──────────────────────────────────

interface PlatformAdminState {
  tenants: Tenant[];
  platformUsers: PlatformUser[];
  auditLog: AuditEntry[];
  supportTickets: SupportTicket[];
  announcements: Announcement[];
  emailTemplates: EmailTemplate[];
  invoices: Invoice[];
  impersonating: string | null; // tenant ID being impersonated

  // Admin Console v2 state
  permissions: Permission[];
  stripeWebhookEvents: StripeWebhookEvent[];
  stripePayments: StripePayment[];
  stripeConfig: StripeConfig;
  platformAccounts: PlatformAccount[];
  glEntries: PlatformGLEntry[];
  platformBudgets: PlatformBudget[];

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
  // Permissions
  updatePermission: (roleId: string, featureId: string, actions: string[]) => void;
  bulkUpdatePermissions: (roleId: string, mode: 'grant' | 'viewonly' | 'revoke') => void;
  // Finance
  addGLEntry: (entry: Omit<PlatformGLEntry, 'id' | 'postedAt' | 'postedBy'>) => void;
  addPlatformAccount: (account: PlatformAccount) => void;
  updateBudget: (id: string, updates: Partial<PlatformBudget>) => void;
  // Computed
  getAccountBalance: (acctNum: string) => number;
  getGroupBalance: (parentNum: string) => number;
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

  // Admin Console v2 initial state
  permissions: seedPermissions,
  stripeWebhookEvents: seedStripeWebhookEvents,
  stripePayments: seedStripePayments,
  stripeConfig: seedStripeConfig,
  platformAccounts: seedPlatformAccounts,
  glEntries: seedGLEntries,
  platformBudgets: seedPlatformBudgets,

  // ─── DB Hydration ──────────────────────────────────
  loadFromDb: async () => {
    const [tickets, templates, announcements, perms, stripePayments, stripeWebhooks, stripeConf, accounts, glEntries, budgets] = await Promise.all([
      platformSvc.fetchTickets(),
      platformSvc.fetchTemplates(),
      platformSvc.fetchPlatformAnnouncements(),
      platformSvc.fetchPermissions(),
      platformSvc.fetchStripePayments(),
      platformSvc.fetchStripeWebhookEvents(),
      platformSvc.fetchStripeConfig(),
      platformSvc.fetchPlatformAccounts(),
      platformSvc.fetchPlatformGLEntries(),
      platformSvc.fetchPlatformBudgets(),
    ]);
    const updates: Partial<PlatformAdminState> = {};
    if (tickets) updates.supportTickets = tickets;
    if (templates) updates.emailTemplates = templates;
    if (announcements) updates.announcements = announcements;
    if (perms) updates.permissions = perms;
    if (stripePayments) updates.stripePayments = stripePayments;
    if (stripeWebhooks) updates.stripeWebhookEvents = stripeWebhooks;
    if (stripeConf) updates.stripeConfig = stripeConf;
    if (accounts) updates.platformAccounts = accounts;
    if (glEntries) updates.glEntries = glEntries;
    if (budgets) updates.platformBudgets = budgets;
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

  // ─── Permissions ───────────────────────────────────
  updatePermission: (roleId, featureId, actions) => {
    set(s => ({
      permissions: s.permissions.map(p =>
        p.roleId === roleId && p.featureId === featureId
          ? { ...p, actions, updatedAt: new Date().toISOString(), updatedBy: 'admin' }
          : p
      ),
    }));
    if (isBackendEnabled) platformSvc.updatePermission(roleId, featureId, actions);
  },
  bulkUpdatePermissions: (roleId, mode) => {
    const allFeatures = Object.keys(TIER_FEATURES.essentials);
    const role = TENANT_ROLES.find(r => r.id === roleId);
    if (!role) return;
    set(s => ({
      permissions: s.permissions.map(p => {
        if (p.roleId !== roleId) return p;
        const featureAvailable = role.tiers.some(tier => TIER_FEATURES[tier][p.featureId as keyof Tenant['features']]);
        if (!featureAvailable) return { ...p, actions: [], updatedAt: new Date().toISOString() };
        let newActions: string[];
        if (mode === 'grant') newActions = [...PERMISSION_ACTIONS];
        else if (mode === 'viewonly') newActions = ['view'];
        else newActions = [];
        return { ...p, actions: newActions, updatedAt: new Date().toISOString(), updatedBy: 'admin' };
      }),
    }));
    if (isBackendEnabled) platformSvc.bulkUpdatePermissions(roleId, mode, allFeatures);
  },

  // ─── Finance ──────────────────────────────────────
  addGLEntry: (entry) => {
    const id = `PGL${Date.now()}`;
    const now = new Date().toISOString();
    set(s => ({ glEntries: [{ ...entry, id, postedAt: now, postedBy: 'admin' }, ...s.glEntries] }));
    if (isBackendEnabled) {
      platformSvc.createPlatformGLEntry(entry).then(dbRow => {
        if (dbRow) set(s => ({ glEntries: s.glEntries.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      });
    }
  },
  addPlatformAccount: (account) => {
    set(s => ({ platformAccounts: [...s.platformAccounts, account].sort((a, b) => a.sortOrder - b.sortOrder) }));
    if (isBackendEnabled) platformSvc.createPlatformAccount(account);
  },
  updateBudget: (id, updates) => {
    set(s => ({ platformBudgets: s.platformBudgets.map(b => b.id === id ? { ...b, ...updates } : b) }));
    if (isBackendEnabled) platformSvc.updatePlatformBudget(id, updates);
  },

  // ─── Computed ─────────────────────────────────────
  getAccountBalance: (acctNum) => {
    const { platformAccounts, glEntries } = get();
    return accountBalance(acctNum, platformAccounts, glEntries);
  },
  getGroupBalance: (parentNum) => {
    const { platformAccounts, glEntries } = get();
    return groupBalance(parentNum, platformAccounts, glEntries);
  },
}));
