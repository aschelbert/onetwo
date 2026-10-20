// Shared plan configuration -- single source of truth for pricing, features, and Chargebee IDs.
// Used by AuthPage (onboarding), SubscriptionPage (management), and edge functions.

export type PlanId = 'self_managed' | 'facilities';

// Legacy tier ids kept for reading old rows only
export type LegacyPlanId =
  | 'essentials'
  | 'board'
  | 'estate'
  | 'pm_addon'
  | 'compliance_pro'
  | 'community_plus'
  | 'management_suite';

export type BillingInterval = 'monthly' | 'annual';

export const DEFAULT_TRIAL_DAYS = 21;
export const DEFAULT_BILLING_INTERVAL: BillingInterval = 'monthly';

// Kept for AuthPage amenity chip logic
export type BuildingAmenity = 'elevator' | 'pool' | 'gym' | 'sport_court' | 'parking_garage' | 'roof_deck' | 'staff_on_payroll';

// ── Plans ──

export interface PlanConfig {
  id: PlanId;
  name: string;
  monthly: number;   // dollars
  annual: number;     // dollars (total per year)
  tagline: string;
  includes: string[];
}

export const PLANS: Record<PlanId, PlanConfig> = {
  self_managed: {
    id: 'self_managed',
    name: 'Self-Managed',
    monthly: 179,
    annual: 1790,
    tagline: 'Everything a self-managed board needs',
    includes: [
      'Fiscal Lens (double-entry GL, budgets, 1099s)',
      'Case Ops workflow',
      'Compliance Runbook',
      'AI Advisor',
      'Document Vault',
      'Payment processing (fees at cost)',
      'Votes & Resolutions',
      'Community Portal',
      'Vendor management & work orders',
      'Reserve study tools',
    ],
  },
  facilities: {
    id: 'facilities',
    name: 'Plus Facilities',
    monthly: 279,
    annual: 2790,
    tagline: 'For buildings with staff, amenities, and complex operations',
    includes: [
      'Everything in Self-Managed',
      'Staff role & scheduling',
      'Amenity reservations',
      'Inspection calendar',
      'Community room booking',
    ],
  },
};

// ── Feature lists for marketing copy ──

export const CORE_INCLUDES = [
  'Fiscal Lens (double-entry GL, budgets, 1099s)',
  'Case Ops workflow',
  'Compliance Runbook',
  'AI Advisor',
  'Document Vault',
  'Payment processing (fees at cost)',
  'Votes & Resolutions',
  'Community Portal',
  'Vendor management & work orders',
  'Reserve study tools',
];

export const FACILITIES_ADDS = [
  'Staff role & scheduling',
  'Amenity reservations',
  'Inspection calendar',
  'Community room booking',
];

// ── Add-ons ──

export const ON_CALL: Record<PlanId, { monthly: number; annual: number; hours: number }> = {
  self_managed: { monthly: 249, annual: 2490, hours: 2 },
  facilities:   { monthly: 499, annual: 4990, hours: 5 },
};

export const PM_SEAT = { monthly: 79, annual: 790 };

export const SETUP: Record<PlanId, number> = {
  self_managed: 299,
  facilities: 599,
};

// ── Feature flags ──

export interface PlanFeatureFlags {
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
  facilities: boolean;
  onCall: boolean;
}

export function planFeatures(plan: PlanId, onCall: boolean = false, trial: boolean = false): PlanFeatureFlags {
  return {
    fiscalLens: true,
    caseOps: true,
    complianceRunbook: true,
    aiAdvisor: true,
    documentVault: true,
    paymentProcessing: true,
    votesResolutions: true,
    communityPortal: true,
    vendorManagement: true,
    reserveStudyTools: true,
    facilities: plan === 'facilities' || trial,
    onCall,
  };
}

// ── Add-on labels ──

export const PM_SEAT_LABEL = 'Property manager seat';
export const SETUP_LABEL = 'Setup with us';

// ── Price helpers ──

export function planPrice(plan: PlanId, interval: BillingInterval): number {
  return interval === 'annual' ? PLANS[plan].annual : PLANS[plan].monthly;
}

export function pmSeatPrice(interval: BillingInterval): number {
  return interval === 'annual' ? PM_SEAT.annual : PM_SEAT.monthly;
}

export function onCallPrice(plan: PlanId, interval: BillingInterval): number {
  return interval === 'annual' ? ON_CALL[plan].annual : ON_CALL[plan].monthly;
}

export function setupPrice(plan: PlanId): number {
  return SETUP[plan];
}

/** Returns the dollar total for a billing period (month or year). */
export function periodTotal(opts: {
  plan: PlanId;
  onCall: boolean;
  pmSeat: boolean;
  interval: BillingInterval;
}): number {
  const { plan, onCall, pmSeat, interval } = opts;
  let total = planPrice(plan, interval);
  if (onCall) total += onCallPrice(plan, interval);
  if (pmSeat) total += pmSeatPrice(interval);
  return total;
}

/** Returns the monthly rate in cents for DB/API use. */
export function monthlyRateCents(plan: PlanId, onCall: boolean, pmSeat: boolean): number {
  let rate = plan === 'facilities' ? 27900 : 17900;
  if (onCall) rate += plan === 'facilities' ? 49900 : 24900;
  if (pmSeat) rate += 7900;
  return rate;
}

// ── Legacy tier mapping ──

const PLAN_MAP: Record<string, PlanId> = {
  self_managed: 'self_managed',
  facilities: 'facilities',
  essentials: 'self_managed',
  board: 'self_managed',
  estate: 'facilities',
  compliance_pro: 'self_managed',
  community_plus: 'self_managed',
  management_suite: 'facilities',
  pm_addon: 'self_managed',
};

export function normalizePlan(tier: string): PlanId {
  return PLAN_MAP[tier] || 'self_managed';
}

// ── Chargebee item-price ID helpers ──
// In production, these come from environment variables.
// The helpers build the expected Chargebee item-price-id strings.

const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : ({} as Record<string, string>);

export const CB_PRICE = {
  selfManagedMonthly:  env.VITE_CB_PRICE_SELF_MANAGED_MONTHLY  || 'Self-Managed-USD-Monthly',
  selfManagedAnnual:   env.VITE_CB_PRICE_SELF_MANAGED_ANNUAL   || 'Self-Managed-USD-Annual',
  facilitiesMonthly:   env.VITE_CB_PRICE_FACILITIES_MONTHLY    || 'Facilities-USD-Monthly',
  facilitiesAnnual:    env.VITE_CB_PRICE_FACILITIES_ANNUAL     || 'Facilities-USD-Annual',
  onCallSmMonthly:     env.VITE_CB_PRICE_ON_CALL_SM_MONTHLY    || 'OnCall-SM-USD-Monthly',
  onCallSmAnnual:      env.VITE_CB_PRICE_ON_CALL_SM_ANNUAL     || 'OnCall-SM-USD-Annual',
  onCallFacMonthly:    env.VITE_CB_PRICE_ON_CALL_FAC_MONTHLY   || 'OnCall-Fac-USD-Monthly',
  onCallFacAnnual:     env.VITE_CB_PRICE_ON_CALL_FAC_ANNUAL    || 'OnCall-Fac-USD-Annual',
  pmSeatMonthly:       env.VITE_CB_PRICE_PM_SEAT_MONTHLY       || 'PM-Seat-USD-Monthly',
  pmSeatAnnual:        env.VITE_CB_PRICE_PM_SEAT_ANNUAL        || 'PM-Seat-USD-Annual',
  setupSm:             env.VITE_CB_PRICE_SETUP_SM              || 'Setup-SM-USD',
  setupFac:            env.VITE_CB_PRICE_SETUP_FAC             || 'Setup-Fac-USD',
} as const;

export function planPriceId(plan: PlanId, interval: BillingInterval): string {
  if (plan === 'facilities') {
    return interval === 'annual' ? CB_PRICE.facilitiesAnnual : CB_PRICE.facilitiesMonthly;
  }
  return interval === 'annual' ? CB_PRICE.selfManagedAnnual : CB_PRICE.selfManagedMonthly;
}

export function onCallPriceId(plan: PlanId, interval: BillingInterval): string {
  if (plan === 'facilities') {
    return interval === 'annual' ? CB_PRICE.onCallFacAnnual : CB_PRICE.onCallFacMonthly;
  }
  return interval === 'annual' ? CB_PRICE.onCallSmAnnual : CB_PRICE.onCallSmMonthly;
}

export function pmSeatPriceId(interval: BillingInterval): string {
  return interval === 'annual' ? CB_PRICE.pmSeatAnnual : CB_PRICE.pmSeatMonthly;
}

export function setupPriceId(plan: PlanId): string {
  return plan === 'facilities' ? CB_PRICE.setupFac : CB_PRICE.setupSm;
}
