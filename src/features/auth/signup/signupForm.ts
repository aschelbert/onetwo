/**
 * The one-page signup's form: what it holds, how each field is checked, and
 * how it survives a reload or a detour to the login page.
 *
 * Kept apart from the page so the rules can be tested without rendering it.
 */
import { isStateCode, toStateCode } from '@/lib/usStates';
import { passwordError } from '@/lib/passwordPolicy';
import { NO_CONSENT, missingConsent, type Consent } from '@/lib/consent';
import { ADDONS, TIERS, getAddOnPrice } from '@/lib/tiers';
import type { AddOnId, BillingInterval, SubscriptionTier } from '@/lib/tiers';

export interface SignupForm {
  /** "First and last name", typed once and used for the account and billing. */
  fullName: string;
  email: string;
  tier: SubscriptionTier;
  interval: BillingInterval;
  addOns: AddOnId[];
  bldgName: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  consent: Consent;
}

export const EMPTY_FORM: SignupForm = {
  fullName: '', email: '', tier: 'self_managed', interval: 'monthly', addOns: [],
  bldgName: '', street: '', city: '', state: '', zip: '', consent: NO_CONSENT,
};

export type FieldId = 'fullName' | 'email' | 'password' | 'bldgName' | 'street' | 'city' | 'state' | 'zip';

/** "Dana Q. Lee" → first "Dana", last "Q. Lee". */
export function splitName(fullName: string): { firstName: string; lastName: string } {
  const [first = '', ...rest] = fullName.trim().split(/\s+/);
  return { firstName: first, lastName: rest.join(' ') };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * What is wrong with each field, by field. A field with nothing wrong is
 * absent. `password` is checked only when a new one is being chosen: someone
 * signing in to an account they already have, or already signed in, skips it.
 */
export function fieldErrors(
  form: SignupForm,
  password: string,
  opts: { needsNewPassword: boolean; needsAccountPassword: boolean; needsEmail: boolean },
): Partial<Record<FieldId, string>> {
  const errors: Partial<Record<FieldId, string>> = {};
  const { firstName, lastName } = splitName(form.fullName);
  if (!firstName) errors.fullName = 'Enter your first and last name.';
  else if (!lastName) errors.fullName = 'Add your last name too.';
  if (opts.needsEmail) {
    if (!form.email.trim()) errors.email = 'Enter your email address.';
    else if (!EMAIL.test(form.email.trim())) errors.email = 'Enter an email address like you@example.com.';
  }
  if (opts.needsNewPassword) {
    const weak = passwordError(password);
    if (weak) errors.password = weak;
  } else if (opts.needsAccountPassword && !password) {
    errors.password = 'Enter your ONE two password.';
  }
  if (!form.bldgName.trim()) errors.bldgName = "Enter the association's name.";
  if (!form.street.trim()) errors.street = "Enter the building's street address.";
  if (!form.city.trim()) errors.city = 'Enter the city.';
  if (!form.state.trim()) errors.state = 'Enter the state.';
  else if (!isStateCode(toStateCode(form.state))) errors.state = 'Enter a US state, such as DC.';
  if (!form.zip.trim()) errors.zip = 'Enter the ZIP code.';
  else if (!/^\d{5}(-\d{4})?$/.test(form.zip.trim())) errors.zip = 'Enter a 5-digit ZIP code.';
  return errors;
}

export const ACCOUNT_FIELDS: FieldId[] = ['fullName', 'email', 'password'];
export const BUILDING_FIELDS: FieldId[] = ['bldgName', 'street', 'city', 'state', 'zip'];

/** One sentence on what still stands between the visitor and the button, or null. */
export function whatIsMissing(errors: Partial<Record<FieldId, string>>, consent: Consent): string | null {
  const account = ACCOUNT_FIELDS.some(f => errors[f]);
  const building = BUILDING_FIELDS.some(f => errors[f]);
  if (account && building) return 'Finish steps 1 and 4 to start.';
  if (account) return 'Finish step 1 to start.';
  if (building) return 'Finish step 4 to start.';
  return missingConsent(consent);
}

// ── Order summary ──

export interface OrderLine { id: string; name: string; price: number }

export interface OrderSummary {
  planName: string;
  planPrice: number;
  addOns: OrderLine[];
  /** Dollars for one billing period, before tax. */
  total: number;
  /** "/mo" or "/yr". */
  per: string;
}

/** The order as the page shows it. Same price list the server charges from. */
export function summarize(tier: SubscriptionTier, interval: BillingInterval, addOns: AddOnId[]): OrderSummary {
  const plan = TIERS.find(t => t.id === tier) ?? TIERS[0];
  const planPrice = interval === 'annual' ? plan.annual : plan.monthly;
  const lines = ADDONS.filter(a => addOns.includes(a.id))
    .map(a => ({ id: a.id, name: a.name, price: getAddOnPrice(a, plan.id, interval) }));
  return {
    planName: plan.name,
    planPrice,
    addOns: lines,
    total: planPrice + lines.reduce((sum, l) => sum + l.price, 0),
    per: interval === 'annual' ? '/yr' : '/mo',
  };
}

export const dollars = (n: number): string => `$${n.toLocaleString('en-US')}`;

/** "Dec 14, 2026": the day the trial ends and billing starts. */
export function trialEndDate(trialDays: number, from: Date = new Date()): string {
  return new Date(from.getTime() + trialDays * 86400000)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Keeping the form across a reload or a trip to the login page ──

const DRAFT_KEY = 'onetwo_signup_form';

/** Save everything except the password, which is never stored. */
export function saveDraft(form: SignupForm): void {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form)); } catch { /* storage unavailable */ }
}

export function clearDraft(): void {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ }
}

/** The saved form, with anything unrecognised dropped. Null when there is none. */
export function loadDraft(): SignupForm | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<SignupForm> | null;
    if (!d || typeof d !== 'object') return null;
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    return {
      fullName: str(d.fullName),
      email: str(d.email),
      tier: TIERS.some(t => t.id === d.tier) ? (d.tier as SubscriptionTier) : EMPTY_FORM.tier,
      interval: d.interval === 'annual' ? 'annual' : 'monthly',
      addOns: Array.isArray(d.addOns) ? ADDONS.map(a => a.id).filter(id => (d.addOns as unknown[]).includes(id)) : [],
      bldgName: str(d.bldgName),
      street: str(d.street),
      city: str(d.city),
      state: str(d.state),
      zip: str(d.zip),
      consent: { ...NO_CONSENT, ...(d.consent && typeof d.consent === 'object' ? d.consent : {}) },
    };
  } catch {
    return null;
  }
}
