// supabase/functions/_shared/checkoutPricing.ts
// What ONE two costs, and which Chargebee item price bills each line.
//
// The one place prices live. The signup page reads it (through src/lib/tiers)
// to show plan cards and the order summary; the checkout functions read it to
// decide what to charge. A request names a plan, a billing period and add-ons
// by id only: amounts are always worked out here, never taken from the
// browser.
//
// No Deno and no network in this file, so the app and its tests can import it.

export type PlanId = "self_managed" | "facilities";
export type BillingPeriod = "monthly" | "annual";
export type AddonId = "on_call" | "pm_seat";

export const PLAN_IDS: PlanId[] = ["self_managed", "facilities"];
export const BILLING_PERIODS: BillingPeriod[] = ["monthly", "annual"];
export const ADDON_IDS: AddonId[] = ["on_call", "pm_seat"];

/** Dollars a month. A year is ten months: "annual, two months free". */
export const PLAN_MONTHLY: Record<PlanId, number> = { self_managed: 179, facilities: 279 };

/** Dollars a month, by the plan the add-on is attached to. */
export const ADDON_MONTHLY: Record<AddonId, Record<PlanId, number>> = {
  on_call: { self_managed: 249, facilities: 499 },
  pm_seat: { self_managed: 79, facilities: 79 },
};

export const ANNUAL_MONTHS = 10;

/** Trial length when the Admin Console setting cannot be read. */
export const DEFAULT_TRIAL_DAYS = 21;

const forPeriod = (monthly: number, period: BillingPeriod): number =>
  period === "annual" ? monthly * ANNUAL_MONTHS : monthly;

/** Dollars for one billing period of a plan. */
export function planPrice(plan: PlanId, period: BillingPeriod): number {
  return forPeriod(PLAN_MONTHLY[plan], period);
}

/** Dollars for one billing period of an add-on on the given plan. */
export function addonPrice(addon: AddonId, plan: PlanId, period: BillingPeriod): number {
  return forPeriod(ADDON_MONTHLY[addon][plan], period);
}

/**
 * Chargebee item price ids. An add-on bills on the same period as its plan,
 * so each has a monthly and a yearly price.
 *
 * On Call has one item price per period, not one per plan: Chargebee holds
 * its Plus Facilities price as a differential price on that same item price,
 * and applies it when the add-on is attached to that plan. ADDON_MONTHLY
 * above has to say the same thing Chargebee does.
 *
 * The production site still calls Self-Managed by its earlier name.
 */
export function itemPriceId(line: PlanId | AddonId, period: BillingPeriod, site = ""): string {
  const suffix = period === "annual" ? "USD-Yearly" : "USD-Monthly";
  const selfManaged = site && !site.includes("test") ? "Compliance-Pro" : "Self-Managed";
  const item: Record<PlanId | AddonId, string> = {
    self_managed: selfManaged,
    facilities: "Plus-Facilities",
    on_call: "On-Call",
    pm_seat: "PM-Seat",
  };
  return `${item[line]}-${suffix}`;
}

export interface CheckoutLine {
  id: PlanId | AddonId;
  kind: "plan" | "addon";
  itemPriceId: string;
  /** Cents for one billing period. */
  amountCents: number;
}

export interface ResolvedCheckout {
  plan: PlanId;
  period: BillingPeriod;
  addons: AddonId[];
  lines: CheckoutLine[];
  /** Cents for one billing period, before tax. */
  totalCents: number;
}

export type CheckoutResolution =
  | { ok: true; checkout: ResolvedCheckout }
  | { ok: false; error: string };

/**
 * Turn the ids a request sent into the lines to bill. Anything that is not a
 * known id is refused outright rather than skipped, so a tampered request
 * fails instead of quietly becoming a cheaper order.
 */
export function resolveCheckout(
  input: { plan?: unknown; period?: unknown; addons?: unknown },
  site = "",
): CheckoutResolution {
  const plan = input.plan as PlanId;
  if (typeof plan !== "string" || !PLAN_IDS.includes(plan)) return { ok: false, error: "Unknown plan." };
  const period = input.period as BillingPeriod;
  if (typeof period !== "string" || !BILLING_PERIODS.includes(period)) {
    return { ok: false, error: "Unknown billing period." };
  }
  const raw = input.addons ?? [];
  if (!Array.isArray(raw)) return { ok: false, error: "Add-ons must be a list." };
  const addons: AddonId[] = [];
  for (const a of raw) {
    if (typeof a !== "string" || !ADDON_IDS.includes(a as AddonId)) return { ok: false, error: "Unknown add-on." };
    if (addons.includes(a as AddonId)) return { ok: false, error: "An add-on is listed twice." };
    addons.push(a as AddonId);
  }
  // Always in catalog order, whatever order the request used
  addons.sort((a, b) => ADDON_IDS.indexOf(a) - ADDON_IDS.indexOf(b));

  const lines: CheckoutLine[] = [
    { id: plan, kind: "plan", itemPriceId: itemPriceId(plan, period, site), amountCents: planPrice(plan, period) * 100 },
    ...addons.map((a): CheckoutLine => ({
      id: a,
      kind: "addon",
      itemPriceId: itemPriceId(a, period, site),
      amountCents: addonPrice(a, plan, period) * 100,
    })),
  ];
  return {
    ok: true,
    checkout: { plan, period, addons, lines, totalCents: lines.reduce((sum, l) => sum + l.amountCents, 0) },
  };
}

/** A usable trial length from whatever the settings lookup returned. */
export function trialDaysFrom(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : DEFAULT_TRIAL_DAYS;
}

/**
 * Cents to authorise at signup. During a trial nothing is charged, so the
 * card is only verified; with the trial turned off the first period is due.
 */
export function dueTodayCents(totalCents: number, trialDays: number): number {
  return trialDays > 0 ? 0 : totalCents;
}
