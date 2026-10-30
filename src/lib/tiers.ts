// Shared tier configuration — single source of truth for subscription tiers
// Used by AuthPage (onboarding), SubscriptionPage (management), and edge functions

export const DEFAULT_TRIAL_DAYS = 21;

export type SubscriptionTier = 'self_managed' | 'facilities';
export type BillingInterval = 'monthly' | 'annual';

export interface TierConfig {
  id: SubscriptionTier;
  name: string;
  tagline: string;
  monthly: number;   // dollars
  annual: number;     // dollars (total per year)
  features: string[];
}

export const TIERS: TierConfig[] = [
  {
    id: 'self_managed',
    name: 'Self-Managed',
    tagline: 'The board runs the building. ONE two keeps it compliant.',
    monthly: 179,
    annual: 1790,
    features: [
      'Runbook of 45 DC obligations, Board Health score',
      'Meetings, elections, votes and minutes',
      'Fiscal Lens: ledger, monthly close, owner statements, online payments',
      '32 playbooks, work orders, vendors, 1099s',
      'Asset registry with replacement years and reserve balance',
      'Owner portal, letters and notices, The Archives',
    ],
  },
  {
    id: 'facilities',
    name: 'Plus Facilities',
    tagline: 'Everything in Self-Managed, plus inspected equipment and staff.',
    monthly: 279,
    annual: 2790,
    features: [
      'Everything in Self-Managed',
      'Inspection and permit calendar: elevator, pool, fire systems, boiler',
      'Reserve study tools, component schedules, funding scenarios',
      'Bids workflow and insurance claims workflow',
      'Amenity reservations and rules',
      'Staff role for your porter, super or concierge',
    ],
  },
];

export function getTierById(id: string): TierConfig | undefined {
  return TIERS.find(t => t.id === id);
}

export function getTierDisplayName(id: string): string {
  return getTierById(id)?.name || id;
}
