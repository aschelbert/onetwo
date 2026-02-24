import { useState } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { fmt } from '@/lib/formatters';

type ReportTab = 'balanceSheet' | 'incomeStatement' | 'budgetVariance' | 'form1120h' | 'localTax';

// DC jurisdiction logic
function getLocalTaxInfo(state: string, entityType: 'incorporated' | 'unincorporated') {
  if (state === 'District of Columbia' || state === 'DC') {
    if (entityType === 'incorporated') {
      return {
        formName: 'Form D-20',
        formTitle: 'Corporation Franchise Tax Return',
        description: 'District of Columbia Corporation Franchise Tax Return for incorporated entities.',
        filingDeadline: 'April 15 (or 15th day of 4th month after fiscal year end)',
        taxRate: '8.25% of DC taxable income',
        agency: 'DC Office of Tax and Revenue (OTR)',
        portalUrl: 'https://mytax.dc.gov',
        portalName: 'MyTax.DC.gov',
        legalRef: 'DC Code § 47-1807 et seq.',
      };
    } else {
      return {
        formName: 'Form D-30',
        formTitle: 'Unincorporated Business Franchise Tax Return',
        description: 'District of Columbia Unincorporated Business Franchise Tax Return for unincorporated entities.',
        filingDeadline: 'April 15 (or 15th day of 4th month after fiscal year end)',
        taxRate: '8.25% of DC taxable income (first $12,500 exempt)',
        agency: 'DC Office of Tax and Revenue (OTR)',
        portalUrl: 'https://mytax.dc.gov',
        portalName: 'MyTax.DC.gov',
        legalRef: 'DC Code § 47-1808 et seq.',
      };
    }
  }
  // Default / other states
  return {
    formName: `State Income Tax Return`,
    formTitle: `${state} Entity Tax Return`,
    description: `State-level tax return for HOA entities in ${state}.`,
    filingDeadline: 'Varies by state',
    taxRate: 'Varies by state',
    agency: `${state} Department of Revenue`,
    portalUrl: '#',
    portalName: 'State Tax Portal',
    legalRef: 'State tax code',
  };
}

export default function FLReports() {
  const { getBalanceSheet, getIncomeStatement, getBudgetVariance } = useFinancialStore();
  const building = useBuildingStore();
  const bs = getBalanceSheet();
  const pnl = getIncomeStatement('2026-01-01', '2026-12-31');
  const bv = getBudgetVariance();

  const [tab, setTab] = useState<ReportTab>('balanceSheet');

  const state = building.address.state;
  const entityType = building.details.entityType || 'incorporated';
  const localTax = getLocalTaxInfo(state, entityType);

  // 1120-H calculations from GL
  const exemptIncome = pnl.totalIncome; // assessments are exempt function income
  const nonExemptIncome = 0; // Interest, rental, etc. — would come from specific GL accts
  const totalIncome1120h = exemptIncome + nonExemptIncome;
  const deductions = pnl.totalExpenses;
  const taxableIncome = Math.max(0, nonExemptIncome - (deductions * (nonExemptIncome / (totalIncome1120h || 1))));
  const taxRate1120h = 0.30; // 30% flat rate for 1120-H
  const taxOwed = Math.round(taxableIncome * taxRate1120h);

  const tabs: { id: ReportTab; label: string }[] = [
    { id: 'balanceSheet', label: 'Balance Sheet' },
    { id: 'incomeStatement', label: 'Income Statement' },
    { id: 'budgetVariance', label: 'Budget Variance' },
    { id: 'form1120h', label: 'Form 1120-H' },
    { id: 'localTax', label: 'Local Tax Forms' },
  ];

  return (
    <div className="space-y-6">
      {/* Report selector */}
      <div className="flex gap-1 bg-mist-50 rounded-lg p-1 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-white shadow-sm text-ink-900' : 'text-ink-500 hover:text-ink-700'}`}>{t.label}</button>
        ))}
      </div>

      {/* Balance Sheet */}
      {tab === 'balanceSheet' && (
        <div className="bg-sage-50 border border-sage-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-sage-200">
            <h3 className="font-display text-lg font-bold text-ink-900">Balance Sheet</h3>
            <p className="text-xs text-ink-400">As of {new Date().toLocaleDateString()}</p>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h4 className="text-xs font-bold text-sage-600 uppercase tracking-wide mb-3">Assets</h4>
              <div className="space-y-2 text-sm">
                {[['Operating Checking', bs.assets.operating], ['Reserve Savings', bs.assets.reserves], ['Assessments Receivable', bs.assets.assessmentsAR], ['Late Fees Receivable', bs.assets.lateFeesAR]].map(([label, val]) => (
                  <div key={label as string} className="flex justify-between"><span className="text-ink-500">{label}</span><span className="font-medium">{fmt(val as number)}</span></div>
                ))}
                <div className="flex justify-between border-t border-sage-200 pt-2 font-bold"><span>Total Assets</span><span>{fmt(bs.assets.total)}</span></div>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-bold text-accent-600 uppercase tracking-wide mb-3">Liabilities</h4>
              <div className="space-y-2 text-sm">
                {[['Accounts Payable', bs.liabilities.payable], ['Prepaid Assessments', bs.liabilities.prepaidAssessments], ['Security Deposits', bs.liabilities.deposits]].map(([label, val]) => (
                  <div key={label as string} className="flex justify-between"><span className="text-ink-500">{label}</span><span className="font-medium">{fmt(val as number)}</span></div>
                ))}
                <div className="flex justify-between border-t border-accent-200 pt-2 font-bold"><span>Total Liabilities</span><span>{fmt(bs.liabilities.total)}</span></div>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-bold text-ink-500 uppercase tracking-wide mb-3">Fund Balances</h4>
              <div className="space-y-2 text-sm">
                {[['Operating Fund', bs.equity.operatingFund], ['Reserve Fund', bs.equity.reserveFund], ['Retained Surplus', bs.equity.retained]].map(([label, val]) => (
                  <div key={label as string} className="flex justify-between"><span className="text-ink-500">{label}</span><span className="font-medium">{fmt(val as number)}</span></div>
                ))}
                <div className="flex justify-between border-t border-ink-200 pt-2 font-bold"><span>Total Equity</span><span>{fmt(bs.equity.total)}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Income Statement */}
      {tab === 'incomeStatement' && (
        <div className="bg-mist-50 border border-mist-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-mist-200">
            <h3 className="font-display text-lg font-bold text-ink-900">Income Statement (P&L)</h3>
            <p className="text-xs text-ink-400">Jan 1 – Dec 31, 2026 (YTD)</p>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-xs font-bold text-sage-600 uppercase tracking-wide mb-3">Income</h4>
              <div className="space-y-2 text-sm">
                {Object.entries(pnl.income).map(([num, v]: [string, any]) => (
                  <div key={num} className="flex justify-between"><span className="text-ink-500">{v.name}</span><span className="font-medium">{fmt(v.amount)}</span></div>
                ))}
                <div className="flex justify-between border-t border-sage-200 pt-2 font-bold text-sage-700"><span>Total Income</span><span>{fmt(pnl.totalIncome)}</span></div>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-bold text-accent-600 uppercase tracking-wide mb-3">Expenses</h4>
              <div className="space-y-2 text-sm">
                {Object.entries(pnl.expenses).map(([num, v]: [string, any]) => (
                  <div key={num} className="flex justify-between"><span className="text-ink-500">{v.name}</span><span className="font-medium">{fmt(v.amount)}</span></div>
                ))}
                <div className="flex justify-between border-t border-accent-200 pt-2 font-bold text-accent-700"><span>Total Expenses</span><span>{fmt(pnl.totalExpenses)}</span></div>
              </div>
            </div>
          </div>
          <div className="px-5 py-4 border-t border-mist-200 bg-white">
            <div className="flex justify-between text-lg font-bold"><span>Net Income</span><span className={pnl.netIncome >= 0 ? 'text-sage-700' : 'text-red-600'}>{fmt(pnl.netIncome)}</span></div>
          </div>
        </div>
      )}

      {/* Budget Variance */}
      {tab === 'budgetVariance' && (
        <div className="bg-white border border-ink-100 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-ink-100"><h3 className="font-display text-lg font-bold text-ink-900">Budget Variance Report</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-400 uppercase tracking-wide border-b border-ink-100 bg-mist-50">
                  <th className="px-5 py-2">Category</th><th className="px-3 py-2 text-right">Budget</th><th className="px-3 py-2 text-right">Actual</th><th className="px-3 py-2 text-right">Variance</th><th className="px-3 py-2 text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {bv.map(b => (
                  <tr key={b.id} className="border-b border-ink-50 hover:bg-mist-50">
                    <td className="px-5 py-2.5 font-medium text-ink-900">{b.name}</td>
                    <td className="px-3 py-2.5 text-right text-ink-500">{fmt(b.budgeted)}</td>
                    <td className="px-3 py-2.5 text-right font-medium">{fmt(b.actual)}</td>
                    <td className={`px-3 py-2.5 text-right font-semibold ${b.variance >= 0 ? 'text-sage-600' : 'text-red-600'}`}>{b.variance >= 0 ? '+' : ''}{fmt(b.variance)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`pill px-2 py-0.5 rounded ${b.pct > 100 ? 'bg-red-100 text-red-700' : b.pct > 80 ? 'bg-yellow-100 text-yellow-700' : 'bg-sage-100 text-sage-700'}`}>{b.pct}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Form 1120-H */}
      {tab === 'form1120h' && (
        <div className="space-y-5">
          <div className="bg-white border-2 border-ink-900 rounded-xl overflow-hidden">
            <div className="bg-ink-900 text-white px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-ink-300 font-mono">Department of the Treasury — Internal Revenue Service</p>
                  <h3 className="font-display text-xl font-bold mt-1">Form 1120-H</h3>
                  <p className="text-sm text-ink-200">U.S. Income Tax Return for Homeowners Associations</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-ink-300">Tax Year</p>
                  <p className="text-2xl font-bold">2026</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Entity Info */}
              <div className="grid grid-cols-2 gap-4 bg-mist-50 rounded-lg p-4 border border-mist-200">
                <div><p className="text-[10px] text-ink-400 uppercase font-semibold">Association Name</p><p className="text-sm font-bold text-ink-900">{building.name}</p></div>
                <div><p className="text-[10px] text-ink-400 uppercase font-semibold">Address</p><p className="text-sm text-ink-700">{building.address.street}, {building.address.city}, {building.address.state} {building.address.zip}</p></div>
                <div><p className="text-[10px] text-ink-400 uppercase font-semibold">Entity Type</p><p className="text-sm text-ink-700">{entityType === 'incorporated' ? 'Incorporated' : 'Unincorporated'}</p></div>
                <div><p className="text-[10px] text-ink-400 uppercase font-semibold">Filing Deadline</p><p className="text-sm text-ink-700">March 15, 2027 (or 15th day of 3rd month after fiscal year end)</p></div>
              </div>

              {/* Part I - Exempt Function Income */}
              <div>
                <h4 className="text-xs font-bold text-ink-900 uppercase tracking-wider mb-3 pb-2 border-b border-ink-200">Part I — Exempt Function Income</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1"><span className="text-ink-600">1. Assessments and dues from members</span><span className="font-mono font-medium">{fmt(exemptIncome)}</span></div>
                  <div className="flex justify-between py-1"><span className="text-ink-600">2. Other exempt function income</span><span className="font-mono font-medium">{fmt(0)}</span></div>
                  <div className="flex justify-between py-1 border-t border-ink-100 font-bold"><span className="text-ink-900">3. Total exempt function income</span><span className="font-mono">{fmt(exemptIncome)}</span></div>
                </div>
              </div>

              {/* Part II - Non-Exempt Income */}
              <div>
                <h4 className="text-xs font-bold text-ink-900 uppercase tracking-wider mb-3 pb-2 border-b border-ink-200">Part II — Taxable Income</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1"><span className="text-ink-600">4. Gross income (non-exempt: interest, rents, etc.)</span><span className="font-mono font-medium">{fmt(nonExemptIncome)}</span></div>
                  <div className="flex justify-between py-1"><span className="text-ink-600">5. Less: Deductions directly connected</span><span className="font-mono font-medium">({fmt(0)})</span></div>
                  <div className="flex justify-between py-1"><span className="text-ink-600">6. Taxable income before $100 exemption</span><span className="font-mono font-medium">{fmt(taxableIncome)}</span></div>
                  <div className="flex justify-between py-1"><span className="text-ink-600">7. Less: Specific deduction</span><span className="font-mono font-medium">($100)</span></div>
                  <div className="flex justify-between py-1 border-t border-ink-100 font-bold"><span className="text-ink-900">8. Taxable income</span><span className="font-mono">{fmt(Math.max(0, taxableIncome - 100))}</span></div>
                </div>
              </div>

              {/* Part III - Tax Computation */}
              <div>
                <h4 className="text-xs font-bold text-ink-900 uppercase tracking-wider mb-3 pb-2 border-b border-ink-200">Part III — Tax Computation</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1"><span className="text-ink-600">9. Tax rate (flat 30% for 1120-H filers)</span><span className="font-mono font-medium">30%</span></div>
                  <div className="flex justify-between py-2 border-t border-ink-200 bg-sage-50 rounded-lg px-3 -mx-1">
                    <span className="text-lg font-bold text-ink-900">10. Total Tax</span>
                    <span className={`text-lg font-bold font-mono ${taxOwed > 0 ? 'text-red-600' : 'text-sage-600'}`}>{fmt(taxOwed)}</span>
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-mist-50 border border-mist-200 rounded-lg p-4">
                <p className="text-xs text-ink-500">
                  <strong>Note:</strong> This form is auto-generated from your General Ledger data. All assessment income qualifies as exempt function income under IRC § 528. 
                  Non-exempt income (interest, rental, etc.) is taxed at a flat 30% rate. Review with your tax advisor before filing. The $100 specific deduction is available for HOAs filing Form 1120-H.
                </p>
              </div>
            </div>
          </div>

          {/* EFTPS Link */}
          <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-indigo-900">Electronic Federal Tax Payment System (EFTPS)</h4>
                <p className="text-xs text-indigo-600 mt-1">File and pay federal taxes online. IRS-authorized payment system.</p>
              </div>
              <a href="https://www.eftps.gov" target="_blank" rel="noopener noreferrer" className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 flex items-center gap-2">
                Go to EFTPS ↗
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Local Tax Forms */}
      {tab === 'localTax' && (
        <div className="space-y-5">
          <div className="bg-white border-2 border-ink-900 rounded-xl overflow-hidden">
            <div className="bg-ink-900 text-white px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-ink-300 font-mono">{localTax.agency}</p>
                  <h3 className="font-display text-xl font-bold mt-1">{localTax.formName}</h3>
                  <p className="text-sm text-ink-200">{localTax.formTitle}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-ink-300">Tax Year</p>
                  <p className="text-2xl font-bold">2026</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Entity Info */}
              <div className="grid grid-cols-2 gap-4 bg-mist-50 rounded-lg p-4 border border-mist-200">
                <div><p className="text-[10px] text-ink-400 uppercase font-semibold">Association Name</p><p className="text-sm font-bold text-ink-900">{building.name}</p></div>
                <div><p className="text-[10px] text-ink-400 uppercase font-semibold">Jurisdiction</p><p className="text-sm text-ink-700">{state}</p></div>
                <div><p className="text-[10px] text-ink-400 uppercase font-semibold">Entity Type</p><p className="text-sm text-ink-700">{entityType === 'incorporated' ? 'Incorporated' : 'Unincorporated'}</p></div>
                <div><p className="text-[10px] text-ink-400 uppercase font-semibold">Filing Deadline</p><p className="text-sm text-ink-700">{localTax.filingDeadline}</p></div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <span className="text-xl">📋</span>
                  <div>
                    <p className="text-sm font-semibold text-amber-900">Why {localTax.formName}?</p>
                    <p className="text-xs text-amber-700 mt-1">
                      {entityType === 'incorporated'
                        ? `${building.name} is an incorporated entity. Incorporated associations in ${state} file ${localTax.formName} (${localTax.formTitle}).`
                        : `${building.name} is an unincorporated entity. Unincorporated associations in ${state} file ${localTax.formName} (${localTax.formTitle}).`
                      }
                    </p>
                    <p className="text-xs text-amber-600 font-mono mt-1">{localTax.legalRef}</p>
                  </div>
                </div>
              </div>

              {/* Income Summary from GL */}
              <div>
                <h4 className="text-xs font-bold text-ink-900 uppercase tracking-wider mb-3 pb-2 border-b border-ink-200">Income Summary (from General Ledger)</h4>
                <div className="space-y-2 text-sm">
                  {Object.entries(pnl.income).map(([num, v]: [string, any]) => (
                    <div key={num} className="flex justify-between py-1"><span className="text-ink-600">{v.name}</span><span className="font-mono font-medium">{fmt(v.amount)}</span></div>
                  ))}
                  <div className="flex justify-between py-1 border-t border-ink-100 font-bold"><span>Total Gross Income</span><span className="font-mono">{fmt(pnl.totalIncome)}</span></div>
                </div>
              </div>

              {/* Expense Summary */}
              <div>
                <h4 className="text-xs font-bold text-ink-900 uppercase tracking-wider mb-3 pb-2 border-b border-ink-200">Deductions (from General Ledger)</h4>
                <div className="space-y-2 text-sm">
                  {Object.entries(pnl.expenses).map(([num, v]: [string, any]) => (
                    <div key={num} className="flex justify-between py-1"><span className="text-ink-600">{v.name}</span><span className="font-mono font-medium">{fmt(v.amount)}</span></div>
                  ))}
                  <div className="flex justify-between py-1 border-t border-ink-100 font-bold"><span>Total Deductions</span><span className="font-mono">{fmt(pnl.totalExpenses)}</span></div>
                </div>
              </div>

              {/* Tax Computation */}
              <div>
                <h4 className="text-xs font-bold text-ink-900 uppercase tracking-wider mb-3 pb-2 border-b border-ink-200">Tax Computation</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1"><span className="text-ink-600">Net Income (Loss)</span><span className="font-mono font-medium">{fmt(pnl.netIncome)}</span></div>
                  <div className="flex justify-between py-1"><span className="text-ink-600">Tax Rate</span><span className="font-mono font-medium">{localTax.taxRate}</span></div>
                  <div className="flex justify-between py-2 border-t border-ink-200 bg-sage-50 rounded-lg px-3 -mx-1">
                    <span className="text-lg font-bold text-ink-900">Estimated Tax</span>
                    <span className={`text-lg font-bold font-mono ${pnl.netIncome > 0 ? 'text-red-600' : 'text-sage-600'}`}>
                      {pnl.netIncome > 0 ? fmt(Math.round(pnl.netIncome * 0.0825)) : fmt(0)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-mist-50 border border-mist-200 rounded-lg p-4">
                <p className="text-xs text-ink-500">
                  <strong>Note:</strong> This is an auto-generated estimate from your General Ledger. HOAs that file federal Form 1120-H and have no DC-sourced non-exempt income 
                  may have a $0 local tax liability. Consult your tax advisor for guidance on {localTax.formName} filing requirements and exemptions.
                </p>
              </div>
            </div>
          </div>

          {/* Local Tax Portal Link */}
          <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-indigo-900">{localTax.agency}</h4>
                <p className="text-xs text-indigo-600 mt-1">File {localTax.formName} and pay {state} taxes online.</p>
              </div>
              <a href={localTax.portalUrl} target="_blank" rel="noopener noreferrer" className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 flex items-center gap-2">
                Go to {localTax.portalName} ↗
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

