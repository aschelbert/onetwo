import { describe, it, expect } from 'vitest';
import {
  periodTotal,
  monthlyRateCents,
  planPrice,
  pmSeatPrice,
  normalizePlan,
  planPriceId,
  onCallPriceId,
  pmSeatPriceId,
  setupPriceId,
  planFeatures,
  onCallPrice,
  setupPrice,
  PLANS,
  ON_CALL,
  PM_SEAT,
  SETUP,
  DEFAULT_TRIAL_DAYS,
} from '@/lib/tiers';

describe('periodTotal', () => {
  it('Self-Managed base monthly = 179', () => {
    expect(periodTotal({ plan: 'self_managed', onCall: false, pmSeat: false, interval: 'monthly' })).toBe(179);
  });

  it('Plus Facilities base monthly = 279', () => {
    expect(periodTotal({ plan: 'facilities', onCall: false, pmSeat: false, interval: 'monthly' })).toBe(279);
  });

  it('Self-Managed + On Call monthly = 179 + 249 = 428', () => {
    expect(periodTotal({ plan: 'self_managed', onCall: true, pmSeat: false, interval: 'monthly' })).toBe(428);
  });

  it('Plus Facilities + On Call + PM monthly = 279 + 499 + 79 = 857', () => {
    expect(periodTotal({ plan: 'facilities', onCall: true, pmSeat: true, interval: 'monthly' })).toBe(857);
  });

  it('Self-Managed + PM monthly = 179 + 79 = 258', () => {
    expect(periodTotal({ plan: 'self_managed', onCall: false, pmSeat: true, interval: 'monthly' })).toBe(258);
  });

  it('Plus Facilities + On Call + PM annual = 2790 + 4990 + 790 = 8570', () => {
    expect(periodTotal({ plan: 'facilities', onCall: true, pmSeat: true, interval: 'annual' })).toBe(8570);
  });

  it('Self-Managed annual = 1790', () => {
    expect(periodTotal({ plan: 'self_managed', onCall: false, pmSeat: false, interval: 'annual' })).toBe(1790);
  });

  it('Self-Managed + On Call annual = 1790 + 2490 = 4280', () => {
    expect(periodTotal({ plan: 'self_managed', onCall: true, pmSeat: false, interval: 'annual' })).toBe(4280);
  });
});

describe('monthlyRateCents', () => {
  it('Self-Managed base = 17900', () => {
    expect(monthlyRateCents('self_managed', false, false)).toBe(17900);
  });

  it('Plus Facilities base = 27900', () => {
    expect(monthlyRateCents('facilities', false, false)).toBe(27900);
  });

  it('Plus Facilities + PM = 35800', () => {
    expect(monthlyRateCents('facilities', false, true)).toBe(35800);
  });

  it('Plus Facilities + On Call = 77800', () => {
    expect(monthlyRateCents('facilities', true, false)).toBe(77800);
  });

  it('Plus Facilities + On Call + PM = 85700', () => {
    expect(monthlyRateCents('facilities', true, true)).toBe(85700);
  });

  it('Self-Managed + PM = 25800', () => {
    expect(monthlyRateCents('self_managed', false, true)).toBe(25800);
  });
});

describe('planPrice', () => {
  it('Self-Managed monthly = 179', () => {
    expect(planPrice('self_managed', 'monthly')).toBe(179);
  });

  it('Plus Facilities monthly = 279', () => {
    expect(planPrice('facilities', 'monthly')).toBe(279);
  });

  it('Self-Managed annual = 1790', () => {
    expect(planPrice('self_managed', 'annual')).toBe(1790);
  });

  it('Plus Facilities annual = 2790', () => {
    expect(planPrice('facilities', 'annual')).toBe(2790);
  });
});

describe('pmSeatPrice', () => {
  it('monthly = 79', () => {
    expect(pmSeatPrice('monthly')).toBe(79);
  });

  it('annual = 790', () => {
    expect(pmSeatPrice('annual')).toBe(790);
  });
});

describe('normalizePlan', () => {
  it('maps essentials → self_managed', () => {
    expect(normalizePlan('essentials')).toBe('self_managed');
  });

  it('maps board → self_managed', () => {
    expect(normalizePlan('board')).toBe('self_managed');
  });

  it('maps estate → facilities', () => {
    expect(normalizePlan('estate')).toBe('facilities');
  });

  it('maps compliance_pro → self_managed', () => {
    expect(normalizePlan('compliance_pro')).toBe('self_managed');
  });

  it('maps community_plus → self_managed', () => {
    expect(normalizePlan('community_plus')).toBe('self_managed');
  });

  it('maps management_suite → facilities', () => {
    expect(normalizePlan('management_suite')).toBe('facilities');
  });

  it('maps pm_addon → self_managed', () => {
    expect(normalizePlan('pm_addon')).toBe('self_managed');
  });

  it('passes through self_managed', () => {
    expect(normalizePlan('self_managed')).toBe('self_managed');
  });

  it('passes through facilities', () => {
    expect(normalizePlan('facilities')).toBe('facilities');
  });

  it('defaults unknown to self_managed', () => {
    expect(normalizePlan('unknown_plan')).toBe('self_managed');
  });
});

describe('planFeatures', () => {
  it('self_managed has all core true but facilities false', () => {
    const f = planFeatures('self_managed');
    expect(f.fiscalLens).toBe(true);
    expect(f.facilities).toBe(false);
    expect(f.onCall).toBe(false);
  });

  it('facilities has facilities true', () => {
    const f = planFeatures('facilities');
    expect(f.facilities).toBe(true);
    expect(f.onCall).toBe(false);
  });

  it('onCall param passes through', () => {
    const f = planFeatures('self_managed', true);
    expect(f.onCall).toBe(true);
  });

  it('trial=true enables facilities for self_managed', () => {
    const f = planFeatures('self_managed', false, true);
    expect(f.facilities).toBe(true);
    expect(f.onCall).toBe(false);
  });

  it('trial=true keeps facilities true for facilities plan', () => {
    const f = planFeatures('facilities', false, true);
    expect(f.facilities).toBe(true);
  });
});

describe('price ID helpers', () => {
  it('planPriceId returns correct IDs', () => {
    expect(planPriceId('self_managed', 'monthly')).toBe('Self-Managed-USD-Monthly');
    expect(planPriceId('self_managed', 'annual')).toBe('Self-Managed-USD-Annual');
    expect(planPriceId('facilities', 'monthly')).toBe('Facilities-USD-Monthly');
    expect(planPriceId('facilities', 'annual')).toBe('Facilities-USD-Annual');
  });

  it('onCallPriceId returns plan-specific IDs', () => {
    expect(onCallPriceId('self_managed', 'monthly')).toBe('OnCall-SM-USD-Monthly');
    expect(onCallPriceId('facilities', 'annual')).toBe('OnCall-Fac-USD-Annual');
  });

  it('pmSeatPriceId returns interval-specific IDs', () => {
    expect(pmSeatPriceId('monthly')).toBe('PM-Seat-USD-Monthly');
    expect(pmSeatPriceId('annual')).toBe('PM-Seat-USD-Annual');
  });

  it('setupPriceId returns plan-specific IDs', () => {
    expect(setupPriceId('self_managed')).toBe('Setup-SM-USD');
    expect(setupPriceId('facilities')).toBe('Setup-Fac-USD');
  });
});

describe('constants', () => {
  it('DEFAULT_TRIAL_DAYS is 21', () => {
    expect(DEFAULT_TRIAL_DAYS).toBe(21);
  });

  it('PLANS has correct prices', () => {
    expect(PLANS.self_managed.monthly).toBe(179);
    expect(PLANS.facilities.monthly).toBe(279);
    expect(PLANS.facilities.name).toBe('Plus Facilities');
  });

  it('ON_CALL has correct prices', () => {
    expect(ON_CALL.self_managed.monthly).toBe(249);
    expect(ON_CALL.facilities.monthly).toBe(499);
  });

  it('PM_SEAT has correct price', () => {
    expect(PM_SEAT.monthly).toBe(79);
  });

  it('SETUP has correct prices', () => {
    expect(SETUP.self_managed).toBe(299);
    expect(SETUP.facilities).toBe(599);
  });
});
