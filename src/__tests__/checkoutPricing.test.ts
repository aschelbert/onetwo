import { describe, it, expect } from 'vitest';
import {
  ADDON_IDS, BILLING_PERIODS, PLAN_IDS, addonPrice, dueTodayCents, itemPriceId, planPrice, resolveCheckout, trialDaysFrom,
  type AddonId,
} from '../../supabase/functions/_shared/checkoutPricing';
import { ADDONS, TIERS, getAddOnPrice } from '@/lib/tiers';
import { buildingKey, checkBuilding, reservedTenantId } from '../../supabase/functions/_shared/checkoutBuilding';
import { EMPTY_FORM, fieldErrors, splitName, summarize, whatIsMissing } from '@/features/auth/signup/signupForm';

// Every plan × period × add-on combination, with the price the pricing page states.
const MONTHLY = {
  self_managed: { plan: 179, on_call: 249, pm_seat: 79 },
  facilities: { plan: 279, on_call: 499, pm_seat: 79 },
} as const;

const subsets: AddonId[][] = [[], ['on_call'], ['pm_seat'], ['on_call', 'pm_seat']];

describe('price resolution', () => {
  for (const plan of PLAN_IDS) for (const period of BILLING_PERIODS) for (const addons of subsets) {
    it(`${plan} · ${period} · ${addons.join('+') || 'no add-ons'}`, () => {
      const months = period === 'annual' ? 10 : 1; // annual is two months free
      const expected = (MONTHLY[plan].plan + addons.reduce((sum, a) => sum + MONTHLY[plan][a], 0)) * months * 100;
      const r = resolveCheckout({ plan, period, addons }, 'getonetwo-test');
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.checkout.totalCents).toBe(expected);
      expect(r.checkout.lines.map(l => l.kind)).toEqual(['plan', ...addons.map(() => 'addon')]);
      // Add-ons bill on the plan's period
      const suffix = period === 'annual' ? 'USD-Yearly' : 'USD-Monthly';
      expect(r.checkout.lines.every(l => l.itemPriceId.endsWith(suffix))).toBe(true);
    });
  }

  it('names the item prices the Chargebee catalog holds', () => {
    expect(itemPriceId('self_managed', 'monthly', 'getonetwo-test')).toBe('Self-Managed-USD-Monthly');
    expect(itemPriceId('facilities', 'annual', 'getonetwo-test')).toBe('Plus-Facilities-USD-Yearly');
    expect(itemPriceId('on_call', 'annual', 'getonetwo-test')).toBe('On-Call-USD-Yearly');
    expect(itemPriceId('pm_seat', 'monthly', 'getonetwo-test')).toBe('PM-Seat-USD-Monthly');
    // The production site keeps Self-Managed under its earlier name
    expect(itemPriceId('self_managed', 'annual', 'getonetwo')).toBe('Compliance-Pro-USD-Yearly');
  });

  it('puts add-ons in catalog order whatever order was sent', () => {
    const r = resolveCheckout({ plan: 'facilities', period: 'monthly', addons: ['pm_seat', 'on_call'] });
    expect(r.ok && r.checkout.addons).toEqual(['on_call', 'pm_seat']);
  });

  it.each([
    [{ plan: 'enterprise', period: 'monthly', addons: [] }, 'Unknown plan.'],
    [{ period: 'monthly' }, 'Unknown plan.'],
    [{ plan: 'self_managed', period: 'weekly', addons: [] }, 'Unknown billing period.'],
    [{ plan: 'self_managed', period: 'monthly', addons: ['free_forever'] }, 'Unknown add-on.'],
    [{ plan: 'self_managed', period: 'monthly', addons: ['On-Call-USD-Monthly'] }, 'Unknown add-on.'],
    [{ plan: 'self_managed', period: 'monthly', addons: [{ id: 'on_call', price: 1 }] }, 'Unknown add-on.'],
    [{ plan: 'self_managed', period: 'monthly', addons: ['on_call', 'on_call'] }, 'An add-on is listed twice.'],
    [{ plan: 'self_managed', period: 'monthly', addons: 'on_call' }, 'Add-ons must be a list.'],
  ])('refuses a tampered order: %j', (input, error) => {
    expect(resolveCheckout(input)).toEqual({ ok: false, error });
  });

  it('ignores any amount the request carries', () => {
    const r = resolveCheckout({ plan: 'facilities', period: 'monthly', addons: [], amount: 1, totalCents: 1, price: 0 } as never);
    expect(r.ok && r.checkout.totalCents).toBe(27900);
  });

  it('charges nothing at signup during a trial, and the first period without one', () => {
    expect(dueTodayCents(52800, 21)).toBe(0);
    expect(dueTodayCents(52800, 0)).toBe(52800);
  });

  it('falls back to 21 days when the trial setting cannot be read', () => {
    expect(trialDaysFrom(14)).toBe(14);
    expect(trialDaysFrom(0)).toBe(0); // the trial is turned off
    expect(trialDaysFrom(null)).toBe(21);
    expect(trialDaysFrom(-3)).toBe(21);
    expect(trialDaysFrom('30')).toBe(21);
  });

  it('is what the app shows: tiers.ts reads the same numbers', () => {
    for (const t of TIERS) {
      expect(t.monthly).toBe(planPrice(t.id, 'monthly'));
      expect(t.annual).toBe(planPrice(t.id, 'annual'));
      for (const a of ADDONS) for (const period of BILLING_PERIODS) {
        expect(getAddOnPrice(a, t.id, period)).toBe(addonPrice(a.id, t.id, period));
      }
    }
    expect(ADDONS.map(a => a.id)).toEqual(ADDON_IDS);
  });

  it('agrees with the order summary on the page', () => {
    for (const plan of PLAN_IDS) for (const period of BILLING_PERIODS) for (const addons of subsets) {
      const server = resolveCheckout({ plan, period, addons });
      expect(server.ok && server.checkout.totalCents).toBe(summarize(plan, period, addons).total * 100);
    }
  });
});

describe('the building on the form', () => {
  const good = { name: ' 1700 Example St Condominium ', address: { street: '1700 Example St NW', city: 'Washington', state: 'district of columbia', zip: '20009' } };

  it('trims, and turns a state name into its code', () => {
    expect(checkBuilding(good)).toEqual({
      ok: true,
      building: { name: '1700 Example St Condominium', address: { street: '1700 Example St NW', city: 'Washington', state: 'DC', zip: '20009' } },
    });
  });

  it.each([
    [{ ...good, name: '' }, 'name'],
    [{ ...good, address: { ...good.address, street: ' ' } }, 'street'],
    [{ ...good, address: { ...good.address, city: '' } }, 'city'],
    [{ ...good, address: { ...good.address, state: 'ZZ' } }, 'state'],
    [{ ...good, address: { ...good.address, zip: '2000' } }, 'zip'],
    [null, 'name'],
  ])('names the field that is wrong', (input, field) => {
    const r = checkBuilding(input);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.field).toBe(field);
  });

  it('reserves the same id for the same person and building, every time', async () => {
    const key = buildingKey(good);
    const a = await reservedTenantId('user-1', key);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await reservedTenantId('user-1', key)).toBe(a);
    // Same building however it is typed
    expect(await reservedTenantId('user-1', buildingKey({ name: 'Other name', address: { street: '1700 example st. nw', zip: '20009-1234' } }))).toBe(a);
    expect(await reservedTenantId('user-2', key)).not.toBe(a);
    expect(await reservedTenantId('user-1', buildingKey({ ...good, address: { ...good.address, street: '1702 Example St NW' } }))).not.toBe(a);
  });
});

describe('the signup form', () => {
  const filled = {
    ...EMPTY_FORM, fullName: 'Dana Lee', email: 'dana@example.com',
    bldgName: '1700 Example St Condominium', street: '1700 Example St NW', city: 'Washington', state: 'DC', zip: '20009',
  };
  const newAccount = { needsEmail: true, needsNewPassword: true, needsAccountPassword: false };

  it('splits one name field into first and last', () => {
    expect(splitName('  Dana   Q.  Lee ')).toEqual({ firstName: 'Dana', lastName: 'Q. Lee' });
    expect(splitName('Dana')).toEqual({ firstName: 'Dana', lastName: '' });
  });

  it('has nothing to say about a complete form', () => {
    expect(fieldErrors(filled, 'Correct-Horse-Battery-9', newAccount)).toEqual({});
  });

  it('asks for a last name, a real email, a strong password and a real address', () => {
    const e = fieldErrors({ ...filled, fullName: 'Dana', email: 'dana@', state: 'Narnia', zip: 'abc' }, 'short', newAccount);
    expect(Object.keys(e).sort()).toEqual(['email', 'fullName', 'password', 'state', 'zip']);
  });

  it('does not hold an existing account to the new-password rules', () => {
    const existing = { needsEmail: true, needsNewPassword: false, needsAccountPassword: true };
    expect(fieldErrors(filled, 'old-pw', existing)).toEqual({});
    expect(fieldErrors(filled, '', existing).password).toBe('Enter your ONE two password.');
  });

  it('says which steps still need finishing', () => {
    const agreed = { terms: true, privacy: true, marketing: false };
    expect(whatIsMissing(fieldErrors(EMPTY_FORM, '', newAccount), agreed)).toBe('Finish steps 1 and 4 to start.');
    expect(whatIsMissing(fieldErrors(filled, '', newAccount), agreed)).toBe('Finish step 1 to start.');
    expect(whatIsMissing(fieldErrors({ ...filled, zip: '' }, 'Correct-Horse-Battery-9', newAccount), agreed)).toBe('Finish step 4 to start.');
    expect(whatIsMissing({}, { terms: false, privacy: true, marketing: false })).toBe('Please agree to the Terms of Service to continue.');
    expect(whatIsMissing({}, agreed)).toBeNull();
  });
});
