import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { fmt } from '@/lib/formatters';

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

export function ThreeYearOutlookPanel() {
  const { vendors, insurance } = useBuildingStore();
  const fin = useFinancialStore();
  const reserveItems = fin.getReserveFundingStatus();
  const income = fin.getIncomeMetrics();
  const variance = fin.getBudgetVariance();

  // Expiring Contracts (active vendors)
  const activeVendors = vendors.filter(v => v.status === 'active');
  const vendorContracts = activeVendors.map(v => {
    const info = parseContractInfo(v.contract);
    return { id: v.id, name: v.name, service: v.service, currentCost: annualize(info), contractType: info.period, raw: v.contract };
  });

  // Capital Projects Due within 3 years
  const capitalProjects = reserveItems
    .filter((r: any) => r.yearsRemaining <= 3 && !r.isContingency)
    .map((r: any) => ({
      id: r.id, name: r.name, estimatedCost: r.estimatedCost, yearsRemaining: r.yearsRemaining,
      currentFunding: r.currentFunding, gap: r.gap,
    }));

  // Insurance Premiums
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

  // 3-year projection
  const years = [1, 2, 3].map(yr => {
    const inflationFactor = Math.pow(1.04, yr);
    const insuranceInflation = Math.pow(1.065, yr);
    const revenue = annualRevenue * Math.pow(1.03, yr);
    const operating = totalOperating * inflationFactor;
    const reserve = reserveContribution * inflationFactor;
    const ins = totalInsurance * insuranceInflation;
    const contracts = totalVendorCost * inflationFactor;
    const capital = capitalProjects.filter((p: any) => p.yearsRemaining <= yr).reduce((s: any, p: any) => s + p.estimatedCost, 0) / 3;
    const totalExpenses = operating + reserve + ins + capital;
    return { year: yr, revenue, operating, reserve, insurance: ins, contracts, capital, net: revenue - totalExpenses };
  });

  return (
    <div className="mt-3 bg-mist-50 border border-mist-200 rounded-lg p-4 space-y-4">
      <p className="text-xs font-bold text-accent-700 uppercase tracking-widest">3-Year Financial Outlook</p>

      {/* Expiring Contracts */}
      <div className="bg-white rounded-lg border border-ink-100 p-4">
        <p className="text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">Vendor Contracts</p>
        <div className="overflow-x-auto">
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
      </div>

      {/* Capital Projects Due */}
      {capitalProjects.length > 0 && (
        <div className="bg-white rounded-lg border border-ink-100 p-4">
          <p className="text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">Capital Projects Due (Next 3 Years)</p>
          <div className="overflow-x-auto">
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
        </div>
      )}

      {/* Insurance Premium Projections */}
      <div className="bg-white rounded-lg border border-ink-100 p-4">
        <p className="text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">Insurance Premium Projections</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-ink-400 uppercase tracking-wider">
              <th className="text-left pb-2">Policy</th>
              <th className="text-right pb-2">Current</th>
              <th className="text-right pb-2">Year 2 (est.)</th>
              <th className="text-right pb-2">Year 3 (est.)</th>
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
        </div>
        <p className="text-[10px] text-ink-400 italic mt-2">Estimates assume 6.5% annual insurance premium increase.</p>
      </div>

      {/* 3-Year Summary Table */}
      <div className="bg-white rounded-lg border border-ink-100 p-4">
        <p className="text-xs font-bold text-ink-500 uppercase tracking-wider mb-2">3-Year Summary</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-ink-400 uppercase tracking-wider">
              <th className="text-left pb-2" />
              <th className="text-right pb-2">Year 1</th>
              <th className="text-right pb-2">Year 2</th>
              <th className="text-right pb-2">Year 3</th>
            </tr></thead>
            <tbody>
              <tr className="border-t border-ink-50"><td className="py-1.5 text-ink-700">Revenue</td>{years.map(y => <td key={y.year} className="py-1.5 text-right text-sage-700 font-medium">{fmt(y.revenue)}</td>)}</tr>
              <tr className="border-t border-ink-50"><td className="py-1.5 text-ink-700">Operating Expenses</td>{years.map(y => <td key={y.year} className="py-1.5 text-right text-ink-600">{fmt(y.operating)}</td>)}</tr>
              <tr className="border-t border-ink-50"><td className="py-1.5 text-ink-700">Reserve Contribution</td>{years.map(y => <td key={y.year} className="py-1.5 text-right text-ink-600">{fmt(y.reserve)}</td>)}</tr>
              <tr className="border-t border-ink-50"><td className="py-1.5 text-ink-700">Insurance</td>{years.map(y => <td key={y.year} className="py-1.5 text-right text-ink-600">{fmt(y.insurance)}</td>)}</tr>
              {totalCapitalDue > 0 && <tr className="border-t border-ink-50"><td className="py-1.5 text-ink-700">Capital (avg/yr)</td>{years.map(y => <td key={y.year} className="py-1.5 text-right text-ink-600">{fmt(y.capital)}</td>)}</tr>}
              <tr className="border-t-2 border-ink-200"><td className="py-2 text-ink-900 font-semibold">Net Surplus / (Shortfall)</td>{years.map(y => <td key={y.year} className={`py-2 text-right font-bold ${y.net >= 0 ? 'text-sage-700' : 'text-red-600'}`}>{fmt(y.net)}</td>)}</tr>
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-ink-400 italic mt-2">Assumes 4% general inflation, 6.5% insurance inflation, 3% revenue growth.</p>
      </div>
    </div>
  );
}
