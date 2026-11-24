import { describe, it, expect } from 'vitest';
import { cashForecast, checkGoals, loanPaymentsIn, loanStanding, monthlyPayment, outlook, paysIn, suggestedGrowth, type Loan } from '@/lib/outlook';
import { componentsOf } from '@/lib/reservePlan';
import type { ReserveItem } from '@/types/financial';

const loan = (over: Partial<Loan> = {}): Loan => ({ id: 'l1', name: 'Elevators', lender: 'Bank', principal: 150000, ratePct: 7, years: 10, firstPayment: '2027-01', securedBy: '', covenant: '', projectId: '', ...over });
const FLAT = { inflationPct: 0, interestPct: 0, growthPct: 0 };
const item = (name: string, cost: number, life: number, last: string): ReserveItem => ({ id: name, name, estimatedCost: cost, currentFunding: 0, usefulLife: life, lastReplaced: last, yearsRemaining: 0, isContingency: false });

describe('loans', () => {
  it('works out the monthly payment, with or without interest', () => {
    expect(monthlyPayment(loan())).toBe(1741.63);
    expect(monthlyPayment(loan({ ratePct: 0, principal: 12000, years: 1 }))).toBe(1000);
  });
  it('splits a payment into interest and principal and tracks what is owed', () => {
    const first = loanStanding(loan(), '2027-01');
    expect(first).toMatchObject({ made: 1, interestThis: 875, principalThis: 866.63, owed: 149133.37, paidOff: '2036-12', active: true });
    expect(loanStanding(loan(), '2026-12')).toMatchObject({ made: 0, owed: 150000, active: false });
    const end = loanStanding(loan(), '2036-12');
    expect(end.left).toBe(0);
    expect(end.owed).toBeLessThan(5);
    expect(loanStanding(loan(), '2037-06').active).toBe(false);
  });
  it('knows which months and years carry a payment', () => {
    expect(paysIn(loan(), '2026-12')).toBe(false);
    expect(paysIn(loan(), '2036-12')).toBe(true);
    expect(paysIn(loan(), '2037-01')).toBe(false);
    expect(loanPaymentsIn([loan({ firstPayment: '2027-07' })], 2027)).toBe(Math.round(1741.63 * 6));
    expect(loanPaymentsIn([loan()], 2026)).toBe(0);
  });
});

describe('the five-year outlook', () => {
  const base = { year: 2026, duesNow: 276000, units: 50, reserveBalance: 100000, comps: componentsOf([item('HVAC', 100000, 20, '2008')], 2026, FLAT), assumptions: FLAT, loans: [] as Loan[] };
  it('suggests a growth rate from what a line is called', () => {
    expect([suggestedGrowth('Insurance'), suggestedGrowth('Utilities'), suggestedGrowth('Landscaping')]).toEqual([7, 4, 3]);
  });
  it('grows each line at its own rate and moves dues with what has to be raised', () => {
    const rows = outlook({ ...base, lines: [{ id: 'a', name: 'Insurance', budgeted: 100000 }, { id: 'b', name: 'Admin', budgeted: 100000 }], rates: { b: 0 }, reserveMonthly: 6000 });
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({ year: 2026, operating: 200000, reserve: 72000, toRaise: 272000, dues: 460, change: null });
    // Insurance at the suggested 7%, Admin held flat.
    expect(rows[1]).toMatchObject({ operating: 207000, toRaise: 279000, dues: 472, change: 2.6 });
    expect(rows[2].operating).toBe(214490);
  });
  it('lays the replacements and the loan payments over the years', () => {
    const rows = outlook({ ...base, lines: [{ id: 'b', name: 'Admin', budgeted: 100000 }], rates: { b: 0 }, reserveMonthly: 1000, loans: [loan()] });
    expect(rows[2]).toMatchObject({ year: 2028, replacements: [{ name: 'HVAC', cost: 100000 }], reservesEnd: 36000 });
    expect(rows[0].loans).toBe(0);
    expect(rows[1].loans).toBe(Math.round(1741.63 * 12));
    // The loan arriving is the jump in dues.
    expect(rows[1].change).toBeGreaterThan(15);
  });
  it('checks a dues ceiling in every year and a reserve target by its year', () => {
    const rows = outlook({ ...base, lines: [{ id: 'a', name: 'Insurance', budgeted: 200000 }], rates: { a: 6 }, reserveMonthly: 1000 });
    const checks = checkGoals(rows, [{ measure: 'dues-increase', text: 'Hold dues', target: 4 }, { measure: 'reserve-funded', text: 'Build the reserves', target: 60, longTarget: 70, longBy: '2029' }, { measure: 'late-dues', text: 'Ignored', target: 3 }]);
    expect(checks).toHaveLength(2);
    expect(checks[0]).toMatchObject({ ok: false });
    expect(checks[0].detail).toContain('2027');
    expect(checks[1].text).toBe('Build the reserves: 70% by 2029');
    expect(checks[1].ok).toBe((rows[3].pct ?? 0) >= 70);
  });
});

describe('the twelve-month cash forecast', () => {
  it('walks cash month by month and flags the months under the floor', () => {
    const rows = cashForecast({ from: '2026-11', cash: 58300, monthlyDues: 23000, collected: 0.96, operatingByMonth: [22000, 23000, 16000, 15000, 15000, 15000, 20000, 15000, 15000, 15000, 17000, 18000], billsDue: 3100, reserveMonthly: 6000, loans: [loan({ firstPayment: '2027-02' })], floor: 52000 });
    expect(rows).toHaveLength(12);
    // November: 58,300 + 22,080 - 17,000 - 3,100 - 6,000
    expect(rows[0]).toMatchObject({ month: '2026-11', duesIn: 22080, operatingOut: 17000, billsOut: 3100, end: 54280, underFloor: false });
    expect(rows[1]).toMatchObject({ month: '2026-12', billsOut: 0, end: 52360 });
    expect(rows[2]).toMatchObject({ month: '2027-01', end: 46440, underFloor: true });
    expect(rows[3].loansOut).toBe(1742);
    expect(rows[2].loansOut).toBe(0);
  });
});

describe('looking at another reserve level', () => {
  it('shows this year as it is and the level as a change in dues next year', () => {
    const rows = outlook({ year: 2026, lines: [{ id: 'b', name: 'Admin', budgeted: 200000 }], rates: { b: 0 }, duesNow: 272000, units: 50, reserveBalance: 0, reserveMonthly: 8000, reserveMonthlyNow: 6000, comps: [], assumptions: FLAT, loans: [] });
    expect(rows[0]).toMatchObject({ reserve: 72000, toRaise: 272000, dues: 453 });
    expect(rows[1]).toMatchObject({ reserve: 96000, toRaise: 296000, dues: 493, change: 8.8 });
    expect(rows[2].change).toBe(0);
  });
});
