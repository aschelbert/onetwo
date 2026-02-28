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
  const { reserveBalance, reservePctFunded, totalUnits } = ctx;
  const perUnit = totalUnits > 0 ? Math.round((amount / totalUnits) * 100) / 100 : amount;

  // Shared reserve calculations
  const totalReserveNeeded = reservePctFunded > 0 ? reserveBalance / (reservePctFunded / 100) : 0;
  const afterDrawPct = totalReserveNeeded > 0 ? Math.round(((reserveBalance - amount) / totalReserveNeeded) * 100) : 0;
  const canReserve = reserveBalance >= amount;

  const options: FundingOption[] = [];

  // ── Strategy 1: RESERVES DIRECT ──
  if (canReserve && afterDrawPct >= 30) {
    options.push({
      source: 'reserves',
      strategyId: 'reserves-direct',
      label: 'Reserves — Full Draw',
      available: true,
      impact: `Reserves drop from ${reservePctFunded}% to ~${afterDrawPct}% funded — ${afterDrawPct >= 50 ? 'still healthy' : 'below recommended level but above 30% minimum'}`,
      perUnit: 0,
      recommended: afterDrawPct >= 50,
      timeline: 'Immediate — board vote only',
      pros: ['No owner impact', 'No debt', 'Fastest path to project start'],
      cons: afterDrawPct < 50
        ? ['Reserves drop below 50% — consider increasing future contributions']
        : ['Reduces reserves, may need higher future contributions'],
      nextSteps: ['Board approves reserve draw', 'Execute contract', 'Update reserve study post-completion'],
      approvalType: 'board',
    });
  }

  // ── Strategy 2: PHASE THE PROJECT ──
  if (amount > 25000) {
    const phase1 = Math.round(Math.min(reserveBalance * 0.6, amount * 0.6));
    const phase2 = amount - phase1;
    const phase1PerUnit = totalUnits > 0 ? Math.round((phase2 / totalUnits) * 100) / 100 : phase2;
    options.push({
      source: 'reserves',
      strategyId: 'phase-project',
      label: 'Phase the Project',
      available: true,
      impact: `Phase 1: ${fmt(phase1)} from reserves now. Phase 2: ${fmt(phase2)} in next fiscal year (${fmt(phase1PerUnit)}/unit if assessed)`,
      perUnit: phase1PerUnit,
      recommended: false,
      timeline: 'Phase 1 immediate; Phase 2 in 12-18 months',
      pros: ['No special assessment needed for Phase 1', 'Most urgent work done now', 'Spreads financial impact across fiscal years'],
      cons: ['Project takes longer to complete', 'Phase 2 costs may increase due to inflation/deterioration', 'Requires careful scope division'],
      nextSteps: ['Define Phase 1 scope (most critical work)', 'Board approves Phase 1 reserve draw', 'Budget Phase 2 in next fiscal year'],
      approvalType: 'board',
    });
  }

  // ── Strategy 3: INCREASE RESERVE CONTRIBUTION ──
  const monthlyIncrease = totalUnits > 0 ? Math.round((amount / (18 * totalUnits)) * 100) / 100 : 0;
  options.push({
    source: 'reserves',
    strategyId: 'increase-contribution',
    label: 'Increase Reserve Contributions',
    available: true,
    impact: `Increase monthly assessments by ${fmt(monthlyIncrease)}/unit for 18 months to build reserves, then fund the project`,
    perUnit: 0,
    recommended: false,
    timeline: 'Project deferred 12-18 months',
    monthlyPerUnit: monthlyIncrease,
    pros: ['No one-time owner charge', 'Predictable monthly payments', 'Reserves stay healthy long-term'],
    cons: ['Project deferred 12-18 months', 'Risk of further deterioration while waiting', 'Costs may increase during deferral'],
    nextSteps: ['Board approves assessment increase', 'Monitor reserve accumulation quarterly', 'Revisit project timeline once funds available'],
    approvalType: 'board',
  });

  // ── Strategy 4: HOA LOAN ──
  if (amount > 25000) {
    const rate = 0.065;
    const termYears = amount <= 50000 ? 5 : amount <= 100000 ? 7 : 10;
    const termMonths = termYears * 12;
    const monthlyRate = rate / 12;
    const monthlyPayment = Math.round((amount * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1));
    const loanMonthlyPerUnit = totalUnits > 0 ? Math.round((monthlyPayment / totalUnits) * 100) / 100 : monthlyPayment;
    const totalInterest = (monthlyPayment * termMonths) - amount;

    options.push({
      source: 'loan',
      strategyId: 'hoa-loan',
      label: 'HOA Loan',
      available: true,
      impact: `${termYears}-year loan at ~6.5% — ${fmt(monthlyPayment)}/month total (${fmt(loanMonthlyPerUnit)}/unit/month). Total interest: ${fmt(totalInterest)}`,
      perUnit: 0,
      recommended: false,
      timeline: `Work starts immediately; repaid over ${termYears} years`,
      monthlyPerUnit: loanMonthlyPerUnit,
      pros: ['Work starts immediately', 'Modest monthly assessment increase', 'No large one-time owner charge'],
      cons: [`Total interest cost of ${fmt(totalInterest)}`, 'HOA carries debt on balance sheet', 'Requires lender qualification'],
      nextSteps: ['Board checks bylaws for borrowing authority', 'Solicit loan proposals from HOA lenders', 'Board approves loan terms', 'Adjust monthly assessments for debt service'],
      approvalType: 'board',
    });
  }

  // ── Strategy 5: SPECIAL ASSESSMENT ──
  const installmentGuidance = perUnit >= 5000
    ? '12-24 month installment plan recommended; include hardship provision'
    : perUnit >= 1000
    ? '3-12 month installment plan recommended'
    : 'payable in full or 3-month installment option';
  options.push({
    source: 'special_assessment',
    strategyId: 'special-assessment',
    label: 'Special Assessment',
    available: true,
    impact: `One-time charge of ${fmt(perUnit)}/unit — ${installmentGuidance}`,
    perUnit,
    recommended: false,
    timeline: 'Work starts after owner vote + collection period',
    pros: ['No debt', 'Cleanest financial position after payment', 'Reserves untouched'],
    cons: ['Highest immediate owner impact', 'Requires 2/3 owner vote (DC)', 'Collection risk — some owners may not pay on time'],
    nextSteps: ['Calculate per-unit allocation per Declaration percentages', 'Design payment plan options', 'Send owner notice 30-60 days before vote', 'Hold owner vote (2/3 approval required)'],
    approvalType: 'owner',
  });

  // ── Strategy 6: COMBINATION ──
  if (amount > 10000) {
    const reservePortion = Math.round(Math.min(reserveBalance * 0.5, amount * 0.4));
    const remainAfterReserves = amount - reservePortion;
    const assessmentPortion = Math.round(remainAfterReserves * 0.6);
    const contributionPortion = remainAfterReserves - assessmentPortion;
    const comboPerUnit = totalUnits > 0 ? Math.round((assessmentPortion / totalUnits) * 100) / 100 : assessmentPortion;
    const comboMonthly = totalUnits > 0 ? Math.round((contributionPortion / (18 * totalUnits)) * 100) / 100 : 0;

    options.push({
      source: 'reserves',
      strategyId: 'combination',
      label: 'Combination Strategy',
      available: true,
      impact: `${fmt(reservePortion)} from reserves + ${fmt(assessmentPortion)} assessment (${fmt(comboPerUnit)}/unit) + ${fmt(contributionPortion)} via increased contributions (${fmt(comboMonthly)}/unit/month for 18 months)`,
      perUnit: comboPerUnit,
      recommended: false,
      timeline: 'Work starts after owner vote; contributions over 18 months',
      monthlyPerUnit: comboMonthly,
      pros: ['Balances impact across multiple sources', 'Smaller assessment than full special assessment', 'Preserves some reserves'],
      cons: ['More complex to administer', 'Still requires owner vote for assessment portion', 'Three moving parts to track'],
      nextSteps: ['Board approves reserve portion', 'Send owner notice for assessment portion', 'Hold owner vote', 'Adjust monthly assessments for contribution increase'],
      approvalType: 'owner',
    });
  }

  // ── Recommendation logic ──
  let recommendation = '';
  const reservesDirect = options.find(o => o.strategyId === 'reserves-direct');

  if (reservesDirect && afterDrawPct >= 50) {
    recommendation = `Reserves Direct is the strongest option — reserves stay at ~${afterDrawPct}% funded with no owner impact. Compare against other strategies below if the board wants to preserve more reserves.`;
  } else if (reservesDirect && afterDrawPct >= 30) {
    recommendation = `Reserves can cover this, but funding drops to ~${afterDrawPct}%. Consider Reserves Direct for speed, or a Combination Strategy to preserve more reserves. Review all options below.`;
  } else if (amount > 50000) {
    recommendation = `At ${fmt(amount)}, this is a significant project. HOA Loan keeps monthly impact at ${options.find(o => o.strategyId === 'hoa-loan')?.monthlyPerUnit ? fmt(options.find(o => o.strategyId === 'hoa-loan')!.monthlyPerUnit!) + '/unit/month' : 'a modest level'}, while a Special Assessment is ${fmt(perUnit)}/unit. Phasing or a Combination Strategy can reduce one-time impact. Compare the strategies below.`;
  } else if (amount > 25000) {
    recommendation = `At ${fmt(amount)} (${fmt(perUnit)}/unit), compare Phasing, Increased Contributions, and a Special Assessment. Each balances cost, timeline, and owner impact differently — review the strategies below.`;
  } else if (!canReserve) {
    recommendation = `Reserves can't cover this project. A Special Assessment of ${fmt(perUnit)}/unit is the most direct path, or Increase Contributions to defer the project 12-18 months. Review the strategies below.`;
  } else {
    recommendation = 'Review the funding strategies below to find the best balance of cost, timeline, and owner impact.';
  }

  return { options, recommendation };
}
