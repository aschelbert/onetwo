import { TIERS, ADDONS, type SubscriptionTier, type AddOnId } from '@/lib/tiers';

/**
 * What the product is today, as the Admin Console describes it: the app's
 * modules, the features inside each, and which plan or add-on unlocks them.
 * Plans and prices come from lib/tiers so the console cannot drift from what
 * signup and Chargebee charge.
 */

export const PLAN_IDS: SubscriptionTier[] = TIERS.map(t => t.id);
export const PLAN_LABELS: Record<SubscriptionTier, string> = { self_managed: 'Self-Managed', facilities: 'Plus Facilities' };
export const PLAN_PRICES: Record<SubscriptionTier, number> = Object.fromEntries(TIERS.map(t => [t.id, t.monthly])) as Record<SubscriptionTier, number>;
export const PLAN_COLORS: Record<SubscriptionTier, string> = { self_managed: '#c42030', facilities: '#16a34a' };
export const PLAN_BADGE: Record<SubscriptionTier, string> = { self_managed: 'bg-accent-100 text-accent-700', facilities: 'bg-sage-100 text-sage-700' };
export const ADDON_LABELS: Record<AddOnId, string> = Object.fromEntries(ADDONS.map(a => [a.id, a.name])) as Record<AddOnId, string>;

/** 'all' = every plan; 'facilities' = Plus Facilities only; otherwise the add-on that unlocks it. */
export type Availability = 'all' | 'facilities' | AddOnId;

export interface CatalogFeature {
  name: string;
  detail: string;
  availability: Availability;
}

export interface CatalogModule {
  id: string;
  name: string;
  path: string;
  summary: string;
  features: CatalogFeature[];
}

export const MODULE_CATALOG: CatalogModule[] = [
  {
    id: 'home', name: 'Home', path: '/home',
    summary: 'What is due now, the calendar, and the Board Health score.',
    features: [
      { name: 'Agenda and calendar', detail: 'What needs the board this week, with every deadline on one calendar', availability: 'all' },
      { name: 'Board Health score', detail: 'Stewardship score and trend across the building\'s obligations', availability: 'all' },
      { name: 'Setup', detail: 'Guided setup: units, documents, payments, mail', availability: 'all' },
    ],
  },
  {
    id: 'building', name: 'Building', path: '/building',
    summary: 'The building\'s records: documents, obligations, contracts, directory.',
    features: [
      { name: 'Overview', detail: 'Building profile and what needs attention', availability: 'all' },
      { name: 'Documents', detail: 'Governing documents, policies and records', availability: 'all' },
      { name: 'Obligations', detail: 'Runbook of 45 DC obligations with due dates and filings', availability: 'all' },
      { name: 'Contracts', detail: 'Vendors, contracts, insurance and lapse tracking', availability: 'all' },
      { name: 'Directory', detail: 'Units, owners and each unit\'s share', availability: 'all' },
      { name: 'Archive', detail: 'The Archives: closed years and past records', availability: 'all' },
      { name: 'Asset registry', detail: 'Assets with replacement years and reserve balance', availability: 'all' },
      { name: 'Inspection and permit calendar', detail: 'Elevator, pool, fire systems, boiler', availability: 'facilities' },
    ],
  },
  {
    id: 'community', name: 'Community', path: '/community',
    summary: 'Owners and residents: notices, meetings, votes, requests.',
    features: [
      { name: 'Notices', detail: 'Announcements and pinned notices to owners', availability: 'all' },
      { name: 'Meetings', detail: 'Meeting notices, agendas, minutes and reports', availability: 'all' },
      { name: 'Votes', detail: 'Elections and owner votes', availability: 'all' },
      { name: 'Requests', detail: 'Resident requests with status', availability: 'all' },
      { name: 'Property log', detail: 'Running log of what happened at the property', availability: 'all' },
      { name: 'Amenities', detail: 'Amenity reservations and rules', availability: 'facilities' },
      { name: 'PM scorecard', detail: 'How the property manager is performing', availability: 'pm_seat' },
    ],
  },
  {
    id: 'funds', name: 'Funds', path: '/funds',
    summary: 'Fiscal Lens: the ledger, dues, bills, budget and statements.',
    features: [
      { name: 'Overview', detail: 'Cash, reserves and the month at a glance', availability: 'all' },
      { name: 'Income', detail: 'Dues, collections and owner balances', availability: 'all' },
      { name: 'Expenses', detail: 'Bills, approvals and work order payments', availability: 'all' },
      { name: 'Planning', detail: 'Annual budget, drafts and next year\'s dues', availability: 'all' },
      { name: 'Statements & taxes', detail: 'Monthly close, owner statements, 1099s', availability: 'all' },
      { name: 'Online payments', detail: 'Owners pay dues online', availability: 'all' },
      { name: 'Reserve study tools', detail: 'Component schedules and funding scenarios', availability: 'facilities' },
    ],
  },
  {
    id: 'boardroom', name: 'Board Room', path: '/boardroom',
    summary: 'Where the board acts: open actions, runbooks, mail in and out.',
    features: [
      { name: 'Current Actions', detail: 'Open cases and what each one needs next', availability: 'all' },
      { name: 'Inbox', detail: 'Incoming requests and items to triage', availability: 'all' },
      { name: 'Runbooks', detail: '32 playbooks, work orders and vendor onboarding', availability: 'all' },
      { name: 'Outbox', detail: 'Letters and notices, drafted and mailed', availability: 'all' },
      { name: 'Bids and insurance claims', detail: 'Bids workflow and insurance claims workflow', availability: 'facilities' },
      { name: 'Tasks', detail: 'Tasks shared with the property manager', availability: 'pm_seat' },
      { name: 'Intercom', detail: 'Board and manager messages in one place', availability: 'pm_seat' },
    ],
  },
  {
    id: 'me', name: 'Me', path: '/account',
    summary: 'The signed-in person: account, unit, users, subscription, help.',
    features: [
      { name: 'My Account', detail: 'Profile and sign-in', availability: 'all' },
      { name: 'My Unit', detail: 'Balance, payments and unit details', availability: 'all' },
      { name: 'User Management', detail: 'Invite and manage board members and owners', availability: 'all' },
      { name: 'Subscription', detail: 'Plan, add-ons and billing through Chargebee', availability: 'all' },
      { name: 'Help & Support', detail: 'Guides and contact', availability: 'all' },
      { name: 'Staff role', detail: 'A seat for the porter, super or concierge', availability: 'facilities' },
      { name: 'On Call advisor', detail: 'A named advisor, monthly call, replies within a business day', availability: 'on_call' },
    ],
  },
];

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  all: 'All plans', facilities: 'Plus Facilities', on_call: 'On Call add-on', pm_seat: 'PM Seat add-on',
};
export const AVAILABILITY_BADGE: Record<Availability, string> = {
  all: 'bg-ink-100 text-ink-600', facilities: 'bg-sage-100 text-sage-700',
  on_call: 'bg-amber-100 text-amber-800', pm_seat: 'bg-purple-100 text-purple-700',
};

/** Whether a plan includes a feature without an add-on. */
export function planIncludes(plan: SubscriptionTier, a: Availability): boolean {
  return a === 'all' || (a === 'facilities' && plan === 'facilities');
}

export const CATALOG_FEATURE_COUNT = MODULE_CATALOG.reduce((n, m) => n + m.features.length, 0);
export function planFeatureCount(plan: SubscriptionTier): number {
  return MODULE_CATALOG.reduce((n, m) => n + m.features.filter(f => planIncludes(plan, f.availability)).length, 0);
}
