import { useState } from 'react';
import type { CaseTrackerCase, CaseStep } from '@/types/issues';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { fmt } from '@/lib/formatters';

interface Step3Props {
  c: CaseTrackerCase;
  step: CaseStep;
  onToggleAction: (actionId: string) => void;
}

/* ── helpers ── */
function parseContractInfo(contract: string): { amount: number; period: 'monthly' | 'annual' | 'on-call' } {
  const lower = contract.toLowerCase();
  if (lower.includes('on-call') || lower.includes('on call')) return { amount: 0, period: 'on-call' };
  const match = contract.match(/\$[\d,]+(?:\.\d{2})?/);
  const amount = match ? parseFloat(match[0].replace(/[$,]/g, '')) : 0;
  if (lower.includes('/mo') || lower.includes('month')) return { amount, period: 'monthly' };
  return { amount, period: 'annual' };
}

function annualize(info: { amount: number; period: 'monthly' | 'annual' | 'on-call' }): number {
  if (info.period === 'monthly') return info.amount * 12;
  if (info.period === 'annual') return info.amount;
  return 0;
}

function parsePremium(premiumStr: string): number {
  const match = premiumStr.match(/\$[\d,]+(?:\.\d{2})?/);
  return match ? parseFloat(match[0].replace(/[$,]/g, '')) : 0;
}

/* ── ReviewSection ── */
function ReviewSection({
  title,
  actionId,
  done,
  onToggle,
  children,
}: {
  title: string;
  actionId: string;
  done: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className={`rounded-xl border overflow-hidden ${done ? 'border-sage-300 bg-sage-50/30' : 'border-ink-200 bg-white'}`}>
      <div className={`flex items-center gap-3 px-4 py-3 cursor-pointer select-none ${done ? 'bg-sage-50' : 'bg-ink-50'}`}>
        <button
          onClick={onToggle}
          className={`w-6 h-6 rounded-md border-2 flex items-center justify-center text-[11px] font-bold transition-all shrink-0 ${
            done
              ? 'bg-sage-500 border-sage-500 text-white'
              : 'border-ink-300 text-ink-300 hover:border-accent-400'
          }`}
        >
          {done ? '✓' : ''}
        </button>
        <button onClick={() => setOpen(!open)} className="flex-1 flex items-center gap-2 text-left">
          <h3 className={`text-[13px] font-semibold ${done ? 'text-sage-600' : 'text-ink-900'}`}>{title}</h3>
          <span className="text-ink-400 text-[11px] ml-auto">{open ? '▾' : '▸'}</span>
        </button>
      </div>
      {open && <div className="px-4 py-3 space-y-3">{children}</div>}
    </div>
  );
}

/* ── Main ── */
export function Step3ThreeYearOutlook({ c, step, onToggleAction }: Step3Props) {
  const actions = step.actions || [];
  const actionMap = Object.fromEntries(actions.map(a => [a.id, a]));
  const allDone = actions.every(a => a.done);

  const { vendors, insurance } = useBuildingStore();
  const fin = useFinancialStore();
  const reserveItems = fin.getReserveFundingStatus();
  const income = fin.getIncomeMetrics();
  const variance = fin.getBudgetVariance();

  // Vendor contracts
  const activeVendors = vendors.filter(v => v.status === 'active');
  const vendorContracts = activeVendors.map(v => {
    const info = parseContractInfo(v.contract);
    return { id: v.id, name: v.name, service: v.service, currentCost: annualize(info), contractType: info.period, raw: v.contract };
  });

  // Capital projects due within 3 years
  const capitalProjects = reserveItems
    .filter((r: any) => r.yearsRemaining <= 3 && !r.isContingency)
    .map((r: any) => ({
      id: r.id, name: r.name, estimatedCost: r.estimatedCost, yearsRemaining: r.yearsRemaining,
      currentFunding: r.currentFunding, gap: r.gap,
    }));

  // Insurance premiums
  const insurancePolicies = insurance.map(p => ({
    id: p.id, type: p.type, premium: parsePremium(p.premium), expires: p.expires,
  }));
  const totalInsurance = insurancePolicies.reduce((s, p) => s + p.premium, 0);

  // Current totals
  const totalOperating = variance.reduce((s: number, v: any) => s + v.budgeted, 0);
  const totalVendorCost = vendorContracts.reduce((s, v) => s + v.currentCost, 0);
  const reserveContribution = fin.annualReserveContribution;
  const totalCapitalDue = capitalProjects.reduce((s: any, p: any) => s + p.estimatedCost, 0);
  const annualRevenue = income.annualExpected;

  // Reserve balance
  const totalReserveBalance = reserveItems.reduce((s: number, r: any) => s + (r.currentFunding || 0), 0);
  const totalReserveNeeded = reserveItems.filter((r: any) => !r.isContingency).reduce((s: number, r: any) => s + (r.estimatedCost || 0), 0);
  const reservePercentFunded = totalReserveNeeded > 0 ? (totalReserveBalance / totalReserveNeeded) * 100 : 100;
  const SAFE_THRESHOLD_PCT = 30;

  const collectionRate = income.collectionRate ?? 0.97;

  // ── Scenario computations ──

  // Dues increase scenarios
  const duesScenarios = [0, 5, 10].map(pct => {
    const factor = 1 + pct / 100;
    return {
      label: `${pct}%`, pct,
      years: [1, 2, 3].map(yr => {
        const revenue = annualRevenue * Math.pow(factor, yr);
        const inflationFactor = Math.pow(1.04, yr);
        const insInflation = Math.pow(1.065, yr);
        const totalExp = (totalOperating * inflationFactor) + (reserveContribution * inflationFactor) + (totalInsurance * insInflation)
          + (capitalProjects.filter((p: any) => p.yearsRemaining <= yr).reduce((s: any, p: any) => s + p.estimatedCost, 0) / 3);
        return { year: yr, revenue, totalExp, net: revenue - totalExp };
      }),
    };
  });

  // Insurance inflation scenarios
  const insScenarios = [
    { label: '3.5% (Standard)', rate: 0.035 },
    { label: '10% (Elevated)', rate: 0.10 },
  ].map(sc => ({
    ...sc,
    years: [1, 2, 3].map(yr => ({ year: yr, total: totalInsurance * Math.pow(1 + sc.rate, yr) })),
    yr3Delta: totalInsurance * Math.pow(1 + sc.rate, 3) - totalInsurance,
  }));

  // Delinquency scenarios
  const currentDelinquencyRate = 1 - collectionRate;
  const delinquencyScenarios = [0, 5, 10].map(addPct => {
    const newDelinquencyRate = Math.min(currentDelinquencyRate + addPct / 100, 1);
    const newCollectionRate = 1 - newDelinquencyRate;
    return {
      label: addPct === 0 ? 'Current' : `+${addPct}%`,
      delinquencyRate: newDelinquencyRate,
      years: [1, 2, 3].map(yr => {
        const grossRevenue = annualRevenue * Math.pow(1.03, yr);
        const netRevenue = grossRevenue * newCollectionRate;
        return { year: yr, grossRevenue, netRevenue, lostRevenue: grossRevenue - netRevenue };
      }),
    };
  });

  // Reserve threshold analysis (5 years)
  const reserveThresholdYears = [1, 2, 3, 4, 5].map(yr => {
    const contribution = reserveContribution * Math.pow(1.04, yr);
    const capitalSpend = reserveItems
      .filter((r: any) => !r.isContingency && r.yearsRemaining <= yr)
      .reduce((s: number, r: any) => s + (r.estimatedCost - (r.currentFunding || 0)), 0);
    const projectedBalance = totalReserveBalance + (contribution * yr) - capitalSpend;
    const projectedPctFunded = totalReserveNeeded > 0 ? (projectedBalance / totalReserveNeeded) * 100 : 100;
    return { year: yr, projectedBalance, projectedPctFunded, belowSafe: projectedPctFunded < SAFE_THRESHOLD_PCT };
  });
  const firstBelowSafe = reserveThresholdYears.find(y => y.belowSafe);

  // Special assessment triggers
  const triggerPoints: { year: number; reason: string; amount: number; severity: 'warning' | 'critical' }[] = [];
  for (const yr of reserveThresholdYears) {
    if (yr.projectedPctFunded < SAFE_THRESHOLD_PCT) {
      const shortfall = (totalReserveNeeded * SAFE_THRESHOLD_PCT / 100) - yr.projectedBalance;
      triggerPoints.push({ year: yr.year, reason: `Reserves fall below ${SAFE_THRESHOLD_PCT}% funded`, amount: Math.max(0, shortfall), severity: 'critical' });
      break;
    }
  }
  for (const proj of capitalProjects) {
    const yrIdx = (proj.yearsRemaining ?? 0) - 1;
    const thresholdYear = yrIdx >= 0 && yrIdx < reserveThresholdYears.length ? reserveThresholdYears[yrIdx] : undefined;
    const projBal = thresholdYear?.projectedBalance ?? totalReserveBalance;
    if (proj.estimatedCost > projBal * 0.8) {
      triggerPoints.push({ year: proj.yearsRemaining || 1, reason: `${proj.name} cost exceeds 80% of projected reserves`, amount: proj.estimatedCost - projBal, severity: proj.estimatedCost > projBal ? 'critical' : 'warning' });
    }
  }
  for (const sc of duesScenarios) {
    if (sc.pct === 0) {
      for (const y of sc.years) {
        if (y.net < 0) {
          triggerPoints.push({ year: y.year, reason: 'Operating shortfall with 0% dues increase', amount: Math.abs(y.net), severity: 'warning' });
          break;
        }
      }
    }
  }

  // 3-year baseline summary
  const baselineYears = [1, 2, 3].map(yr => {
    const inflationFactor = Math.pow(1.04, yr);
    const insuranceInflation = Math.pow(1.065, yr);
    const revenue = annualRevenue * Math.pow(1.03, yr);
    const operating = totalOperating * inflationFactor;
    const reserve = reserveContribution * inflationFactor;
    const ins = totalInsurance * insuranceInflation;
    const capital = capitalProjects.filter((p: any) => p.yearsRemaining <= yr).reduce((s: any, p: any) => s + p.estimatedCost, 0) / 3;
    const totalExpenses = operating + reserve + ins + capital;
    return { year: yr, revenue, operating, reserve, insurance: ins, capital, net: revenue - totalExpenses };
  });

  return (
    <div className="p-5 md:px-7 md:py-6 space-y-4" style={{ maxWidth: 860 }}>
      {step.desc && (
        <div className="bg-mist-50 border border-mist-100 rounded-xl p-4">
          <p className="text-[13px] text-ink-700 leading-relaxed">{step.desc}</p>
        </div>
      )}

      {/* Section 1: Base Outlook — Contracts, Capital, Insurance, Summary */}
      <ReviewSection
        title="Vendor Contracts, Capital Projects & Insurance Projections"
        actionId="outlook-base"
        done={actionMap['outlook-base']?.done || false}
        onToggle={() => onToggleAction('outlook-base')}
      >
        {/* Vendor Contracts */}
        <div className="mb-3">
          <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-2">Vendor Contracts</p>
          <table className="w-full text-xs">
            <thead><tr className="text-ink-400 uppercase tracking-wider">
              <th className="text-left pb-2">Vendor</th>
              <th className="text-left pb-2">Service</th>
              <th className="text-right pb-2">Annual Cost</th>
              <th className="text-left pb-2">Terms</th>
            </tr></thead>
            <tbody>
              {vendorContracts.map(v => (
                <tr key={v.id} className="border-t border-ink-50">
                  <td className="py-1.5 text-ink-700 font-medium">{v.name}</td>
                  <td className="py-1.5 text-ink-600">{v.service}</td>
                  <td className="py-1.5 text-right text-ink-600">{v.currentCost > 0 ? fmt(v.currentCost) : 'On-call'}</td>
                  <td className="py-1.5 text-ink-500">{v.raw}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Capital Projects */}
        {capitalProjects.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-2">Capital Projects Due (Next 3 Years)</p>
            <table className="w-full text-xs">
              <thead><tr className="text-ink-400 uppercase tracking-wider">
                <th className="text-left pb-2">Item</th>
                <th className="text-right pb-2">Est. Cost</th>
                <th className="text-right pb-2">Yrs Left</th>
                <th className="text-right pb-2">Funded</th>
                <th className="text-right pb-2">Gap</th>
              </tr></thead>
              <tbody>
                {capitalProjects.map((p: any) => (
                  <tr key={p.id} className="border-t border-ink-50">
                    <td className="py-1.5 text-ink-700 font-medium">{p.name}</td>
                    <td className="py-1.5 text-right text-ink-600">{fmt(p.estimatedCost)}</td>
                    <td className="py-1.5 text-right text-ink-600">{p.yearsRemaining}</td>
                    <td className="py-1.5 text-right text-ink-600">{fmt(p.currentFunding)}</td>
                    <td className={`py-1.5 text-right font-medium ${p.gap > 0 ? 'text-red-600' : 'text-sage-700'}`}>{fmt(p.gap)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Insurance */}
        <div className="mb-3">
          <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-2">Insurance Premium Projections</p>
          <table className="w-full text-xs">
            <thead><tr className="text-ink-400 uppercase tracking-wider">
              <th className="text-left pb-2">Policy</th>
              <th className="text-right pb-2">Current</th>
              <th className="text-right pb-2">Year 2</th>
              <th className="text-right pb-2">Year 3</th>
            </tr></thead>
            <tbody>
              {insurancePolicies.map(p => (
                <tr key={p.id} className="border-t border-ink-50">
                  <td className="py-1.5 text-ink-700">{p.type}</td>
                  <td className="py-1.5 text-right text-ink-600">{fmt(p.premium)}</td>
                  <td className="py-1.5 text-right text-ink-500">{fmt(p.premium * 1.065)}</td>
                  <td className="py-1.5 text-right text-ink-500">{fmt(p.premium * 1.065 * 1.065)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-ink-200">
                <td className="py-1.5 text-ink-900 font-semibold">Total</td>
                <td className="py-1.5 text-right font-bold text-ink-900">{fmt(totalInsurance)}</td>
                <td className="py-1.5 text-right font-bold text-ink-700">{fmt(totalInsurance * 1.065)}</td>
                <td className="py-1.5 text-right font-bold text-ink-700">{fmt(totalInsurance * 1.065 * 1.065)}</td>
              </tr>
            </tbody>
          </table>
          <p className="text-[10px] text-ink-400 italic mt-1">Assumes 6.5% annual insurance premium increase.</p>
        </div>

        {/* 3-Year Summary */}
        <div>
          <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider mb-2">3-Year Summary</p>
          <table className="w-full text-xs">
            <thead><tr className="text-ink-400 uppercase tracking-wider">
              <th className="text-left pb-2" />
              <th className="text-right pb-2">Year 1</th>
              <th className="text-right pb-2">Year 2</th>
              <th className="text-right pb-2">Year 3</th>
            </tr></thead>
            <tbody>
              <tr className="border-t border-ink-50"><td className="py-1.5 text-ink-700">Revenue</td>{baselineYears.map(y => <td key={y.year} className="py-1.5 text-right text-sage-700 font-medium">{fmt(y.revenue)}</td>)}</tr>
              <tr className="border-t border-ink-50"><td className="py-1.5 text-ink-700">Operating</td>{baselineYears.map(y => <td key={y.year} className="py-1.5 text-right text-ink-600">{fmt(y.operating)}</td>)}</tr>
              <tr className="border-t border-ink-50"><td className="py-1.5 text-ink-700">Reserve Contribution</td>{baselineYears.map(y => <td key={y.year} className="py-1.5 text-right text-ink-600">{fmt(y.reserve)}</td>)}</tr>
              <tr className="border-t border-ink-50"><td className="py-1.5 text-ink-700">Insurance</td>{baselineYears.map(y => <td key={y.year} className="py-1.5 text-right text-ink-600">{fmt(y.insurance)}</td>)}</tr>
              {totalCapitalDue > 0 && <tr className="border-t border-ink-50"><td className="py-1.5 text-ink-700">Capital (avg/yr)</td>{baselineYears.map(y => <td key={y.year} className="py-1.5 text-right text-ink-600">{fmt(y.capital)}</td>)}</tr>}
              <tr className="border-t-2 border-ink-200"><td className="py-2 text-ink-900 font-semibold">Net Surplus / (Shortfall)</td>{baselineYears.map(y => <td key={y.year} className={`py-2 text-right font-bold ${y.net >= 0 ? 'text-sage-700' : 'text-red-600'}`}>{fmt(y.net)}</td>)}</tr>
            </tbody>
          </table>
          <p className="text-[10px] text-ink-400 italic mt-1">Assumes 4% general inflation, 6.5% insurance inflation, 3% revenue growth.</p>
        </div>
      </ReviewSection>

      {/* Section 2: Dues Increase Scenarios */}
      <ReviewSection
        title="Dues Increase Scenarios (0%, 5%, 10%)"
        actionId="dues-scenarios"
        done={actionMap['dues-scenarios']?.done || false}
        onToggle={() => onToggleAction('dues-scenarios')}
      >
        <p className="text-[11px] text-ink-500 mb-3">Net surplus/(shortfall) under 0%, 5%, and 10% annual dues increases, with 4% expense inflation.</p>
        <table className="w-full text-xs">
          <thead><tr className="text-ink-400 uppercase tracking-wider">
            <th className="text-left pb-2">Scenario</th>
            <th className="text-right pb-2">Year 1</th>
            <th className="text-right pb-2">Year 2</th>
            <th className="text-right pb-2">Year 3</th>
          </tr></thead>
          <tbody>
            {duesScenarios.map(sc => (
              <tr key={sc.label} className="border-t border-ink-50">
                <td className="py-1.5 text-ink-700 font-medium">{sc.label} increase</td>
                {sc.years.map(y => (
                  <td key={y.year} className={`py-1.5 text-right font-medium ${y.net >= 0 ? 'text-sage-700' : 'text-red-600'}`}>{fmt(y.net)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {duesScenarios[0].years.some(y => y.net < 0) && (
          <div className="mt-2 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            <p className="text-[11px] text-amber-800 font-medium">A 0% dues increase results in a shortfall. A dues increase is needed to cover rising costs.</p>
          </div>
        )}
      </ReviewSection>

      {/* Section 3: Insurance Inflation Scenarios */}
      <ReviewSection
        title="Insurance Inflation Scenarios (3.5% vs 10%)"
        actionId="insurance-scenarios"
        done={actionMap['insurance-scenarios']?.done || false}
        onToggle={() => onToggleAction('insurance-scenarios')}
      >
        <p className="text-[11px] text-ink-500 mb-3">Total insurance cost projection under standard (3.5%) vs elevated (10%) annual inflation.</p>
        <table className="w-full text-xs">
          <thead><tr className="text-ink-400 uppercase tracking-wider">
            <th className="text-left pb-2">Scenario</th>
            <th className="text-right pb-2">Current</th>
            <th className="text-right pb-2">Year 1</th>
            <th className="text-right pb-2">Year 2</th>
            <th className="text-right pb-2">Year 3</th>
            <th className="text-right pb-2">3-Yr Increase</th>
          </tr></thead>
          <tbody>
            {insScenarios.map(sc => (
              <tr key={sc.label} className="border-t border-ink-50">
                <td className="py-1.5 text-ink-700 font-medium">{sc.label}</td>
                <td className="py-1.5 text-right text-ink-600">{fmt(totalInsurance)}</td>
                {sc.years.map(y => (
                  <td key={y.year} className="py-1.5 text-right text-ink-600">{fmt(y.total)}</td>
                ))}
                <td className="py-1.5 text-right font-medium text-red-600">+{fmt(sc.yr3Delta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {insScenarios[1].yr3Delta > insScenarios[0].yr3Delta * 1.5 && (
          <div className="mt-2 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            <p className="text-[11px] text-amber-800 font-medium">At 10% inflation, insurance costs increase by {fmt(insScenarios[1].yr3Delta)} over 3 years — {fmt(insScenarios[1].yr3Delta - insScenarios[0].yr3Delta)} more than standard projections.</p>
          </div>
        )}
      </ReviewSection>

      {/* Section 4: Delinquency Impact */}
      <ReviewSection
        title="Delinquency Impact Scenarios (5–10% Increase)"
        actionId="delinquency-scenarios"
        done={actionMap['delinquency-scenarios']?.done || false}
        onToggle={() => onToggleAction('delinquency-scenarios')}
      >
        <p className="text-[11px] text-ink-500 mb-3">Lost revenue if delinquency rate increases by 5% or 10% above current ({(currentDelinquencyRate * 100).toFixed(1)}%).</p>
        <table className="w-full text-xs">
          <thead><tr className="text-ink-400 uppercase tracking-wider">
            <th className="text-left pb-2">Scenario</th>
            <th className="text-right pb-2">Delinq. Rate</th>
            <th className="text-right pb-2">Yr 1 Lost</th>
            <th className="text-right pb-2">Yr 2 Lost</th>
            <th className="text-right pb-2">Yr 3 Lost</th>
          </tr></thead>
          <tbody>
            {delinquencyScenarios.map(sc => (
              <tr key={sc.label} className="border-t border-ink-50">
                <td className="py-1.5 text-ink-700 font-medium">{sc.label}</td>
                <td className="py-1.5 text-right text-ink-600">{(sc.delinquencyRate * 100).toFixed(1)}%</td>
                {sc.years.map(y => (
                  <td key={y.year} className={`py-1.5 text-right font-medium ${sc.label === 'Current' ? 'text-ink-600' : 'text-red-600'}`}>{fmt(y.lostRevenue)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 bg-ink-50 rounded px-3 py-2">
          <p className="text-[11px] text-ink-500">A 10% delinquency increase would reduce Year 3 net revenue by {fmt(delinquencyScenarios[2].years[2].lostRevenue - delinquencyScenarios[0].years[2].lostRevenue)} compared to current collection rates.</p>
        </div>
      </ReviewSection>

      {/* Section 5: Reserve Safe Threshold */}
      <ReviewSection
        title="Reserve Safe Threshold Analysis"
        actionId="reserve-threshold"
        done={actionMap['reserve-threshold']?.done || false}
        onToggle={() => onToggleAction('reserve-threshold')}
      >
        <p className="text-[11px] text-ink-500 mb-3">Projected reserve balance and percent funded over 5 years. Safe threshold: {SAFE_THRESHOLD_PCT}% funded.</p>
        <table className="w-full text-xs">
          <thead><tr className="text-ink-400 uppercase tracking-wider">
            <th className="text-left pb-2" />
            <th className="text-right pb-2">Current</th>
            {reserveThresholdYears.map(y => <th key={y.year} className="text-right pb-2">Year {y.year}</th>)}
          </tr></thead>
          <tbody>
            <tr className="border-t border-ink-50">
              <td className="py-1.5 text-ink-700">Balance</td>
              <td className="py-1.5 text-right text-ink-600 font-medium">{fmt(totalReserveBalance)}</td>
              {reserveThresholdYears.map(y => (
                <td key={y.year} className={`py-1.5 text-right font-medium ${y.belowSafe ? 'text-red-600' : 'text-ink-600'}`}>{fmt(y.projectedBalance)}</td>
              ))}
            </tr>
            <tr className="border-t border-ink-50">
              <td className="py-1.5 text-ink-700">% Funded</td>
              <td className="py-1.5 text-right text-ink-600">{reservePercentFunded.toFixed(0)}%</td>
              {reserveThresholdYears.map(y => (
                <td key={y.year} className="py-1.5 text-right">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold text-white ${y.projectedPctFunded >= 70 ? 'bg-emerald-500' : y.projectedPctFunded >= SAFE_THRESHOLD_PCT ? 'bg-amber-500' : 'bg-red-500'}`}>
                    {y.projectedPctFunded.toFixed(0)}%
                  </span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        {firstBelowSafe ? (
          <div className="mt-2 bg-red-50 border border-red-200 rounded px-3 py-2">
            <p className="text-[11px] text-red-800 font-medium">Reserves projected to dip below {SAFE_THRESHOLD_PCT}% funded in Year {firstBelowSafe.year} ({firstBelowSafe.projectedPctFunded.toFixed(0)}% funded, {fmt(firstBelowSafe.projectedBalance)} balance). Increased contributions or a special assessment may be needed.</p>
          </div>
        ) : (
          <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
            <p className="text-[11px] text-emerald-800 font-medium">Reserves remain above {SAFE_THRESHOLD_PCT}% funded through Year 5 under current contribution levels.</p>
          </div>
        )}
      </ReviewSection>

      {/* Section 6: Special Assessment Triggers */}
      <ReviewSection
        title="Special Assessment Trigger Points"
        actionId="assessment-triggers"
        done={actionMap['assessment-triggers']?.done || false}
        onToggle={() => onToggleAction('assessment-triggers')}
      >
        <p className="text-[11px] text-ink-500 mb-3">Conditions that may require a special assessment based on scenario modeling.</p>
        {triggerPoints.length > 0 ? (
          <div className="space-y-2">
            {triggerPoints.map((tp, i) => (
              <div key={i} className={`rounded px-3 py-2 border ${tp.severity === 'critical' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${tp.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {tp.severity === 'critical' ? 'Critical' : 'Warning'} — Year {tp.year}
                  </span>
                </div>
                <p className={`text-[11px] font-medium mt-1 ${tp.severity === 'critical' ? 'text-red-800' : 'text-amber-800'}`}>{tp.reason}</p>
                {tp.amount > 0 && <p className={`text-[11px] mt-0.5 ${tp.severity === 'critical' ? 'text-red-600' : 'text-amber-600'}`}>Estimated shortfall: {fmt(tp.amount)}</p>}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
            <p className="text-[11px] text-emerald-800 font-medium">No special assessment triggers identified under current projections.</p>
          </div>
        )}
      </ReviewSection>

      {/* All-done summary */}
      {allDone && (
        <div className="rounded-xl border-2 border-sage-300 bg-sage-50 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-sage-500 text-white flex items-center justify-center text-[11px] font-bold">✓</span>
            <h3 className="text-sm font-bold text-ink-900">3-Year Outlook Complete</h3>
          </div>
          <p className="text-[12px] text-ink-500 leading-relaxed">
            All scenario reports reviewed. Proceed to Step 4 to obtain bids and cost estimates.
          </p>
        </div>
      )}
    </div>
  );
}
