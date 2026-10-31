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

export type AddOnId = 'on_call' | 'pm_seat';

export interface AddOnConfig {
  id: AddOnId;
  name: string;
  description: string;
  monthly: number;
  annual: number;
  /** Per-tier price overrides. Falls back to top-level monthly/annual if tier not listed. */
  tierPricing?: Partial<Record<SubscriptionTier, { monthly: number; annual: number }>>;
}

export const ADDONS: AddOnConfig[] = [
  {
    id: 'on_call',
    name: 'On Call',
    description: 'A named advisor who knows your building. Monthly call, replies within a business day, budget and year-end reviewed, a seat at the annual meeting.',
    monthly: 249,
    annual: 2490,
    tierPricing: {
      facilities: { monthly: 499, annual: 4990 },
    },
  },
  {
    id: 'pm_seat',
    name: 'Property Manager Seat',
    description: 'Keeping a manager for operations? Give them a seat so they work inside your records instead of theirs.',
    monthly: 79,
    annual: 790,
  },
];

/** Get the effective price for an add-on given the selected tier. */
export function getAddOnPrice(addon: AddOnConfig, tier: SubscriptionTier, interval: BillingInterval): number {
  const tp = addon.tierPricing?.[tier];
  return interval === 'annual' ? (tp?.annual ?? addon.annual) : (tp?.monthly ?? addon.monthly);
}

export function getTierById(id: string): TierConfig | undefined {
  return TIERS.find(t => t.id === id);
}

export function getTierDisplayName(id: string): string {
  return getTierById(id)?.name || id;
}
