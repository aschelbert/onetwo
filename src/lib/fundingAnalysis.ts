import type { FundingOption } from '@/store/useSpendingStore';
import { fmt } from '@/lib/formatters';

export interface FundingContext {
  operatingBalance: number;
  reserveBalance: number;
  reservePctFunded: number;
  totalUnits: number;
  budgetRemaining: number;
  totalBudgeted: number;
  totalSpent: number;
}

interface FinancialStoreSlice {
  getBalanceSheet: () => { assets: { operating: number; reserves: number } };
  getBudgetVariance: () => Array<{ budgeted: number; actual: number }>;
  getReserveFundingStatus: () => Array<{ estimatedCost: number }>;
  units: Array<{ number: string }>;
}

export function getFinancialContext(financialStore: FinancialStoreSlice): FundingContext {
  const bs = financialStore.getBalanceSheet();
  const bv = financialStore.getBudgetVariance();
  const reserveStatus = financialStore.getReserveFundingStatus();
  const totalUnits = financialStore.units.length;

  const operatingBalance = bs.assets.operating;
  const reserveBalance = bs.assets.reserves;
  const totalReserveNeeded = reserveStatus.reduce((s, r) => s + r.estimatedCost, 0);
  const reservePctFunded = totalReserveNeeded > 0 ? Math.round((reserveBalance / totalReserveNeeded) * 100) : 100;

  const totalBudgeted = bv.reduce((s, b) => s + b.budgeted, 0);
  const totalSpent = bv.reduce((s, b) => s + b.actual, 0);
  const budgetRemaining = totalBudgeted - totalSpent;

  return { operatingBalance, reserveBalance, reservePctFunded, totalUnits, budgetRemaining, totalBudgeted, totalSpent };
}

export function analyzeFunding(amount: number, ctx: FundingContext): { options: FundingOption[]; recommendation: string } {
  const { operatingBalance, reserveBalance, reservePctFunded, totalUnits, budgetRemaining } = ctx;
  const perUnit = totalUnits > 0 ? Math.round((amount / totalUnits) * 100) / 100 : amount;

  const options: FundingOption[] = [];

  // Operating budget
  const canOperating = budgetRemaining >= amount;
  const opPct = budgetRemaining > 0 ? Math.round((amount / budgetRemaining) * 100) : 999;
  options.push({
    source: 'operating',
    label: 'Operating Budget',
    available: canOperating,
    impact: canOperating
      ? `Uses ${opPct}% of remaining operating budget (${fmt(budgetRemaining)} left)`
      : `Short by ${fmt(amount - budgetRemaining)} — operating budget can't cover this`,
    perUnit: 0,
    recommended: canOperating && amount <= 10000,
  });

  // Reserves
  const canReserve = reserveBalance >= amount;
  const afterReservePct = reserveBalance > 0 ? Math.round(((reserveBalance - amount) / (reserveBalance / (reservePctFunded / 100))) * 100) : 0;
  options.push({
    source: 'reserves',
    label: 'Reserve Fund',
    available: canReserve,
    impact: canReserve
      ? `Reserves drop from ${reservePctFunded}% to ~${Math.max(0, afterReservePct)}% funded — ${afterReservePct < 30 ? 'CRITICALLY LOW, may trigger special assessment later' : afterReservePct < 50 ? 'below recommended level' : 'still healthy'}`
      : `Reserves only have ${fmt(reserveBalance)} — can't cover ${fmt(amount)}`,
    perUnit: 0,
    recommended: canReserve && afterReservePct >= 50,
  });

  // Special assessment
  options.push({
    source: 'special_assessment',
    label: 'Special Assessment',
    available: true,
    impact: `Each unit pays ${fmt(perUnit)} — ${perUnit > 2000 ? 'consider installment plan (3-12 months) to ease impact' : perUnit > 500 ? 'moderate per-unit cost' : 'minor per-unit cost'}`,
    perUnit,
    recommended: !canOperating && (!canReserve || afterReservePct < 30),
  });

  // Insurance
  options.push({
    source: 'insurance',
    label: 'Insurance Claim',
    available: true,
    impact: 'File claim with carrier — HOA pays deductible only if approved. Best option when damage is from a covered peril.',
    perUnit: 0,
    recommended: false,
  });

  // HOA Loan
  options.push({
    source: 'loan',
    label: 'HOA Loan / Financing',
    available: true,
    impact: amount >= 25000
      ? `Spread cost over 3-10 years — estimated ${fmt(Math.round(amount / 60))} to ${fmt(Math.round(amount / 36))}/month added to assessments. Avoids large one-time hit.`
      : `Financing typically makes sense for projects over $25K — this is ${fmt(amount)}.`,
    perUnit: amount >= 25000 ? Math.round((amount / 60 / totalUnits) * 100) / 100 : 0,
    recommended: amount >= 50000 && (!canReserve || afterReservePct < 40),
  });

  // Build recommendation
  let recommendation = '';
  const recommended = options.find(o => o.recommended);
  if (amount <= 5000 && canOperating) {
    recommendation = 'This is within typical board spending authority. Fund from operating budget — no owner vote likely needed.';
  } else if (canReserve && afterReservePct >= 50) {
    recommendation = 'Reserves can cover this and stay above 50% funded. This is the cleanest option — no impact on unit owners.';
  } else if (canReserve && afterReservePct >= 30) {
    recommendation = 'Reserves can cover this, but funding drops below 50%. Consider a partial reserve draw + increased reserve contribution next budget cycle.';
  } else if (amount >= 50000) {
    recommendation = 'For a project this size, consider phasing the work across fiscal years, using reserves for Phase 1, or financing to spread the cost. A special assessment of ' + fmt(perUnit) + '/unit is significant — installment plans reduce owner hardship.';
  } else if (!canOperating && !canReserve) {
    recommendation = 'Neither operating budget nor reserves can cover this. A special assessment is needed — ' + fmt(perUnit) + ' per unit. Consider payment plans for amounts over $1,000/unit.';
  } else {
    recommendation = recommended?.impact || 'Review the funding options below to find the best fit.';
  }

  return { options, recommendation };
}
