import { describe, it, expect } from 'vitest';
import { analyzeFunding, getBudgetAlerts } from '@/lib/fundingAnalysis';
import type { FundingContext } from '@/lib/fundingAnalysis';

const baseCtx: FundingContext = {
  operatingBalance: 50000,
  reserveBalance: 100000,
  reservePctFunded: 80,
  totalUnits: 20,
  budgetRemaining: 30000,
  totalBudgeted: 100000,
  totalSpent: 70000,
};

describe('analyzeFunding', () => {
  it('reserves sufficient → reserves-direct option offered', () => {
    const { options } = analyzeFunding(30000, baseCtx);
    const direct = options.find(o => o.strategyId === 'reserves-direct');
    expect(direct).toBeDefined();
    expect(direct!.available).toBe(true);
  });

  it('reserves insufficient → reserves-direct not offered', () => {
    const ctx: FundingContext = { ...baseCtx, reserveBalance: 5000 };
    const { options } = analyzeFunding(30000, ctx);
    const direct = options.find(o => o.strategyId === 'reserves-direct');
    expect(direct).toBeUndefined();
  });

  it('amount > $25k → phase-project and hoa-loan options', () => {
    const { options } = analyzeFunding(30000, baseCtx);
    expect(options.find(o => o.strategyId === 'phase-project')).toBeDefined();
    expect(options.find(o => o.strategyId === 'hoa-loan')).toBeDefined();
  });

  it('perUnit calculation: amount / totalUnits rounded to 2 decimals', () => {
    const { options } = analyzeFunding(10000, { ...baseCtx, totalUnits: 3 });
    const sa = options.find(o => o.strategyId === 'special-assessment');
    expect(sa).toBeDefined();
    // 10000 / 3 = 3333.333... → 3333.33
    expect(sa!.perUnit).toBe(3333.33);
  });
});

describe('getBudgetAlerts', () => {
  it('75% → low', () => {
    const alerts = getBudgetAlerts([{ name: 'Utilities', budgeted: 1000, actual: 750 }]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].level).toBe('low');
  });

  it('85% → medium', () => {
    const alerts = getBudgetAlerts([{ name: 'Utilities', budgeted: 1000, actual: 850 }]);
    expect(alerts[0].level).toBe('medium');
  });

  it('95% → high', () => {
    const alerts = getBudgetAlerts([{ name: 'Utilities', budgeted: 1000, actual: 950 }]);
    expect(alerts[0].level).toBe('high');
  });

  it('100%+ → critical', () => {
    const alerts = getBudgetAlerts([{ name: 'Utilities', budgeted: 1000, actual: 1100 }]);
    expect(alerts[0].level).toBe('critical');
  });

  it('below 75% → no alert', () => {
    const alerts = getBudgetAlerts([{ name: 'Utilities', budgeted: 1000, actual: 500 }]);
    expect(alerts).toHaveLength(0);
  });
});
