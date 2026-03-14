// Shared tier configuration — single source of truth for subscription tiers
// Used by AuthPage (onboarding), SubscriptionPage (management), and edge functions

export const DEFAULT_TRIAL_DAYS = 30;

export type SubscriptionTier = 'compliance_pro' | 'community_plus' | 'management_suite';
export type BillingInterval = 'monthly' | 'annual';

export interface TierConfig {
  id: SubscriptionTier;
  name: string;
  monthly: number;
  annual: number;
  stripePriceMonthly: string;
  stripePriceAnnual: string;
  features: string[];
}

export const TIERS: TierConfig[] = [
  {
    id: 'compliance_pro',
    name: 'Compliance Pro',
    monthly: 179,
    annual: 1800,
    stripePriceMonthly: 'price_1T3qQD2eQBbijDsqxvNiEs8U',
    stripePriceAnnual: 'price_1T3qQD2eQBbijDsqbcwCMX7v',
    features: [
      'Dashboard with Fiduciary Alerts & compliance grades',
      'Board Room: governance calendar, duties & roles',
      'Fiscal Lens: double-entry GL, budgets & reserves',
      'The Building: contacts, bylaws, insurance, vendors',
      'Case Workflow with pre-legal escalation paths',
      'Property Log & The Archives',
      'DC jurisdiction compliance built in',
    ],
  },
  {
    id: 'community_plus',
    name: 'Community Plus',
    monthly: 279,
    annual: 2850,
    stripePriceMonthly: 'price_1T36YO2eQBbijDsqkULOdtRi',
    stripePriceAnnual: 'price_1T3qQg2eQBbijDsqHaOVBbtA',
    features: [
      'Everything in Compliance Pro',
      'Resident portal with issue reporting',
      'Community voting & resolutions',
      'Assessment tracking & processing',
      'Communications & notice templates',
      'PM Scorecard & vendor management',
    ],
  },
  {
    id: 'management_suite',
    name: 'Management Suite',
    monthly: 399,
    annual: 4250,
    stripePriceMonthly: 'price_1T3qRQ2eQBbijDsq7PP4vlxh',
    stripePriceAnnual: 'price_1T3qSR2eQBbijDsqzVEUuZD4',
    features: [
      'Everything in Community Plus',
      'Property Manager role & tools',
      'Work order & invoice generation',
      'Email & postal distributions',
      'Mailing list management',
      'Priority support',
    ],
  },
];

export function getTierById(id: string): TierConfig | undefined {
  return TIERS.find(t => t.id === id);
}

export function getTierDisplayName(id: string): string {
  return getTierById(id)?.name || id;
}

// Reverse lookup: Stripe price ID → tier ID
export const PRICE_TO_TIER: Record<string, SubscriptionTier> = {};
for (const tier of TIERS) {
  PRICE_TO_TIER[tier.stripePriceMonthly] = tier.id;
  PRICE_TO_TIER[tier.stripePriceAnnual] = tier.id;
}
