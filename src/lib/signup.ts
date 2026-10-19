// Pure functions for the signup flow — plan recommendation, pricing display, trial dates.

import type { PlanId, BillingInterval, BuildingAmenity } from '@/lib/tiers';
import {
  PLANS, ON_CALL, PM_SEAT, SETUP,
  planPrice, onCallPrice, pmSeatPrice,
  DEFAULT_TRIAL_DAYS,
} from '@/lib/tiers';

const FACILITIES_AMENITIES: BuildingAmenity[] = ['elevator', 'pool', 'sport_court'];

/** Recommend a plan based on which amenity chips the user selected. */
export function recommendPlan(amenities: BuildingAmenity[]): PlanId {
  return amenities.some(a => FACILITIES_AMENITIES.includes(a))
    ? 'facilities'
    : 'self_managed';
}

/** Dollar amount the user would pay today (setup only — subscription starts after trial). */
export function dueToday(plan: PlanId, _interval: BillingInterval, setup: boolean): number {
  return setup ? SETUP[plan] : 0;
}

/** Descriptive string: "After your trial: $179/mo" */
export function afterTrialText(
  plan: PlanId,
  interval: BillingInterval,
  onCall: boolean,
  pmSeat: boolean,
  trialDays: number = DEFAULT_TRIAL_DAYS,
): string {
  let total = planPrice(plan, interval);
  if (onCall) total += onCallPrice(plan, interval);
  if (pmSeat) total += pmSeatPrice(interval);
  const suffix = interval === 'annual' ? '/yr' : '/mo';
  return `After your ${trialDays}-day trial: $${total}${suffix}`;
}

/** Date the trial ends, as a Date object. */
export function trialEndDate(trialDays: number = DEFAULT_TRIAL_DAYS): Date {
  const d = new Date();
  d.setDate(d.getDate() + trialDays);
  return d;
}

/** Format dollars for display: "$179" */
export function fmtDollars(amount: number): string {
  return `$${amount}`;
}

/** Summary line for the plan picker sidebar. */
export function planSummaryLine(plan: PlanId): string {
  return `${PLANS[plan].name} — ${PLANS[plan].tagline}`;
}
