// Shared tier configuration -- single source of truth for subscription tiers
// Used by AuthPage (onboarding), SubscriptionPage (management), and edge functions

export const DEFAULT_TRIAL_DAYS = 30;

// Legacy tier ids kept for reading old rows; new ids are essentials, board, estate
export type SubscriptionTier =
  | 'essentials'
  | 'board'
  | 'estate'
  | 'pm_addon'
  | 'compliance_pro'
  | 'community_plus'
  | 'management_suite';

export type ActiveTier = 'essentials' | 'board' | 'estate';

export type BillingInterval = 'monthly' | 'annual';

export const DEFAULT_SIGNUP_TIER: ActiveTier = 'essentials';
export const DEFAULT_BILLING_INTERVAL: BillingInterval = 'monthly';

// Feature flags that map to tenant_features columns
export interface TierFeatureFlags {
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
}

// Limits per tier
export interface TierLimits {
  maxUnits: number | null; // null = unlimited
  maxAssetClasses: number | null;
  postalMode: 'per_letter' | 'included';
  postalAllowance: number | null; // letters/month, null = n/a
  vendorContracts: number | null; // null = unlimited
  amenities: boolean;
}

export interface TierConfig {
  id: ActiveTier;
  name: string;
  monthly: number;
  annual: number;
  stripePriceMonthly: string;
  stripePriceAnnual: string;
  features: TierFeatureFlags;
  limits: TierLimits;
  support: string[];
}

// Feature matrix -- single source of truth
export const TIER_FEATURES: Record<ActiveTier, TierFeatureFlags> = {
  essentials: {
    fiscalLens: true,
    caseOps: true,
    complianceRunbook: true,
    aiAdvisor: true,
    documentVault: true,
    paymentProcessing: true,
    votesResolutions: true,
    communityPortal: true,
    vendorManagement: false,
    reserveStudyTools: false,
  },
  board: {
    fiscalLens: true,
    caseOps: true,
    complianceRunbook: true,
    aiAdvisor: true,
    documentVault: true,
    paymentProcessing: true,
    votesResolutions: true,
    communityPortal: true,
    vendorManagement: true,
    reserveStudyTools: false,
  },
  estate: {
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
  },
};

export const TIER_LIMITS: Record<ActiveTier, TierLimits> = {
  essentials: {
    maxUnits: 10,
    maxAssetClasses: 1,
    postalMode: 'per_letter',
    postalAllowance: null,
    vendorContracts: 1,
    amenities: false,
  },
  board: {
    maxUnits: 100,
    maxAssetClasses: 5,
    postalMode: 'included',
    postalAllowance: 100,
    vendorContracts: null,
    amenities: false,
  },
  estate: {
    maxUnits: null,
    maxAssetClasses: null,
    postalMode: 'included',
    postalAllowance: null,
    vendorContracts: null,
    amenities: true,
  },
};

export const TIERS: TierConfig[] = [
  {
    id: 'essentials',
    name: 'Essentials',
    monthly: 79,
    annual: 790,
    // TODO: replace with actual Stripe price IDs
    stripePriceMonthly: 'price_essentials_monthly',
    stripePriceAnnual: 'price_essentials_annual',
    features: TIER_FEATURES.essentials,
    limits: TIER_LIMITS.essentials,
    support: ['Guided setup call', 'Chat support'],
  },
  {
    id: 'board',
    name: 'Board',
    monthly: 199,
    annual: 1990,
    // TODO: replace with actual Stripe price IDs
    stripePriceMonthly: 'price_board_monthly',
    stripePriceAnnual: 'price_board_annual',
    features: TIER_FEATURES.board,
    limits: TIER_LIMITS.board,
    support: ['Guided setup call', 'Chat support', 'Email support'],
  },
  {
    id: 'estate',
    name: 'Estate',
    monthly: 399,
    annual: 3990,
    // TODO: replace with actual Stripe price IDs
    stripePriceMonthly: 'price_estate_monthly',
    stripePriceAnnual: 'price_estate_annual',
    features: TIER_FEATURES.estate,
    limits: TIER_LIMITS.estate,
    support: ['Guided setup call', 'Priority support', 'Phone support'],
  },
];

// Legacy tier configs for backward compatibility (read-only display)
export const LEGACY_TIER_NAMES: Record<string, string> = {
  compliance_pro: 'Compliance Pro (legacy)',
  community_plus: 'Community Plus (legacy)',
  management_suite: 'Management Suite (legacy)',
};

export function getTierById(id: string): TierConfig | undefined {
  return TIERS.find(t => t.id === id);
}

export function getTierDisplayName(id: string): string {
  const tier = getTierById(id);
  if (tier) return tier.name;
  return LEGACY_TIER_NAMES[id] || id;
}

export function isActiveTier(id: string): id is ActiveTier {
  return id === 'essentials' || id === 'board' || id === 'estate';
}

// Reverse lookup: Stripe price ID -> tier ID
export const PRICE_TO_TIER: Record<string, SubscriptionTier> = {};
for (const tier of TIERS) {
  PRICE_TO_TIER[tier.stripePriceMonthly] = tier.id;
  PRICE_TO_TIER[tier.stripePriceAnnual] = tier.id;
}
// Keep legacy price mappings so old webhook events still resolve
PRICE_TO_TIER['price_1T3qQD2eQBbijDsqxvNiEs8U'] = 'essentials'; // was compliance_pro monthly
PRICE_TO_TIER['price_1T3qQD2eQBbijDsqbcwCMX7v'] = 'essentials'; // was compliance_pro annual
PRICE_TO_TIER['price_1T36YO2eQBbijDsqkULOdtRi'] = 'board'; // was community_plus monthly
PRICE_TO_TIER['price_1T3qQg2eQBbijDsqHaOVBbtA'] = 'board'; // was community_plus annual
PRICE_TO_TIER['price_1T3qRQ2eQBbijDsq7PP4vlxh'] = 'estate'; // was management_suite monthly
PRICE_TO_TIER['price_1T3qSR2eQBbijDsqzVEUuZD4'] = 'estate'; // was management_suite annual

// Generate human-readable feature description from TIER_FEATURES + limits.
// Used in SubscriptionPage and AuthPage so copy cannot drift from the matrix.
export function describeTier(tierId: ActiveTier): string[] {
  const tier = getTierById(tierId);
  if (!tier) return [];

  const lines: string[] = [];
  const f = tier.features;
  const l = tier.limits;

  // Limits
  if (l.maxUnits !== null) {
    lines.push(`Up to ${l.maxUnits} units`);
  } else {
    lines.push('Unlimited units');
  }

  if (l.maxAssetClasses !== null) {
    lines.push(`${l.maxAssetClasses} asset class${l.maxAssetClasses > 1 ? 'es' : ''}`);
  } else {
    lines.push('Unlimited asset classes');
  }

  if (l.postalMode === 'included' && l.postalAllowance) {
    lines.push(`${l.postalAllowance} letters/month included`);
  } else if (l.postalMode === 'included') {
    lines.push('Postal letters included');
  } else {
    lines.push('Postal letters per-letter pricing');
  }

  if (l.vendorContracts !== null) {
    lines.push(`${l.vendorContracts} vendor contract${l.vendorContracts > 1 ? 's' : ''}`);
  } else if (f.vendorManagement) {
    lines.push('Unlimited vendor contracts');
  }

  // Core features always on
  if (f.fiscalLens) lines.push('Fiscal Lens (double-entry GL, budgets)');
  if (f.caseOps) lines.push('Case Ops workflow');
  if (f.complianceRunbook) lines.push('Compliance Runbook');
  if (f.documentVault) lines.push('Document Vault');
  if (f.communityPortal) lines.push('Community Portal');
  if (f.paymentProcessing) lines.push('Payment processing (Stripe fees pass through)');
  if (f.votesResolutions) lines.push('Votes and resolutions');
  if (f.aiAdvisor) lines.push('AI Advisor');

  // Tier-differentiating features
  if (f.vendorManagement) lines.push('Vendor management, work orders, invoice-first money out');
  if (f.reserveStudyTools) lines.push('Reserve study tools and asset inspection calendar');
  if (l.amenities) lines.push('Amenity reservations');

  // Support
  for (const s of tier.support) {
    lines.push(s);
  }

  return lines;
}

// Recommend a tier based on unit count and building amenities
export type BuildingAmenity = 'elevator' | 'pool' | 'gym' | 'sport_court' | 'parking_garage' | 'roof_deck';

export function recommendTier(unitCount: number, amenities: BuildingAmenity[]): ActiveTier {
  const hasComplexAmenity = amenities.some(a => a === 'pool' || a === 'elevator' || a === 'sport_court');
  if (hasComplexAmenity) return 'estate';
  if (unitCount > 100) return 'estate';
  if (unitCount > 10) return 'board';
  if (unitCount <= 10 && amenities.length === 0) return 'essentials';
  return 'board';
}
