// Shared tier configuration — single source of truth for subscription tiers
// Used by AuthPage (onboarding), SubscriptionPage (management), and edge functions

//
// Prices come from the checkout's pricing module, which the server charges
// from, so what this file shows and what Chargebee bills cannot drift apart.
import {
  DEFAULT_TRIAL_DAYS as CHECKOUT_DEFAULT_TRIAL_DAYS, addonPrice, planPrice,
  type AddonId, type BillingPeriod, type PlanId,
} from '../../supabase/functions/_shared/checkoutPricing';

export const DEFAULT_TRIAL_DAYS = CHECKOUT_DEFAULT_TRIAL_DAYS;

export type SubscriptionTier = PlanId;
export type BillingInterval = BillingPeriod;

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
    monthly: planPrice('self_managed', 'monthly'),
    annual: planPrice('self_managed', 'annual'),
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
    monthly: planPrice('facilities', 'monthly'),
    annual: planPrice('facilities', 'annual'),
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

export type AddOnId = AddonId;

export interface AddOnConfig {
  id: AddOnId;
  name: string;
  description: string;
  monthly: number;
  annual: number;
  /** Per-tier prices, where they differ from the top-level monthly/annual. */
  tierPricing?: Partial<Record<SubscriptionTier, { monthly: number; annual: number }>>;
}

export const ADDONS: AddOnConfig[] = [
  {
    id: 'on_call',
    name: 'On Call',
    description: 'A named advisor who knows your building. Monthly call, replies within a business day, budget and year-end reviewed, a seat at the annual meeting.',
    monthly: addonPrice('on_call', 'self_managed', 'monthly'),
    annual: addonPrice('on_call', 'self_managed', 'annual'),
    tierPricing: {
      facilities: { monthly: addonPrice('on_call', 'facilities', 'monthly'), annual: addonPrice('on_call', 'facilities', 'annual') },
    },
  },
  {
    id: 'pm_seat',
    name: 'Property Manager Seat',
    description: 'Keeping a manager for operations? Give them a seat so they work inside your records instead of theirs.',
    monthly: addonPrice('pm_seat', 'self_managed', 'monthly'),
    annual: addonPrice('pm_seat', 'self_managed', 'annual'),
  },
];

/** Get the effective price for an add-on given the selected tier. */
export function getAddOnPrice(addon: AddOnConfig, tier: SubscriptionTier, interval: BillingInterval): number {
  return addonPrice(addon.id, tier, interval);
}

export function getTierById(id: string): TierConfig | undefined {
  return TIERS.find(t => t.id === id);
}

export function getTierDisplayName(id: string): string {
  return getTierById(id)?.name || id;
}

/**
 * Amenity reservations and rules come with Plus Facilities. The legacy tier
 * ids that mapped onto it (Management Suite, Estate) count too, so a tenant
 * that has not been re-tiered keeps what it had.
 */
export function tierHasAmenities(tier: string | undefined | null): boolean {
  return tier === 'facilities' || tier === 'management_suite' || tier === 'estate';
}
