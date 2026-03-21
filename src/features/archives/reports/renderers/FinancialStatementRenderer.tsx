import type { ReportType } from '@/lib/services/reports';
import { fmt } from '@/lib/formatters';

interface Props {
  type: ReportType;
  snapshot: Record<string, any>;
}

function formatPeriodHeader(period: { start: string; end: string } | undefined, style: 'range' | 'as-of'): string | null {
  if (!period) return null;
  const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (style === 'as-of') return `As of ${fmtDate(period.end)}`;
  return `${fmtDate(period.start)} – ${fmtDate(period.end)}`;
}

export default function FinancialStatementRenderer({ type, snapshot }: Props) {
  if (type === 'balance_sheet'   && snapshot.data) return <BalanceSheet   data={snapshot.data} period={snapshot.period} meta={snapshot.meta} />;
  if (type === 'income_statement' && snapshot.data) return <IncomeStatement data={snapshot.data} period={snapshot.period} meta={snapshot.meta} />;
  if (type === 'budget_vs_actual' && snapshot.rows) return <BudgetVsActual  rows={snapshot.rows} period={snapshot.period} meta={snapshot.meta} />;
  if (type === 'form_1120h' && snapshot.data) return <Form1120H data={snapshot.data} period={snapshot.period} />;
  if (type === 'local_tax_forms' && snapshot.data) return <LocalTaxForms data={snapshot.data} period={snapshot.period} />;
  return <p className="text-sm text-ink-400">No data available for this financial statement.</p>;
}

function FinancialHealthDashboard({ meta }: { meta: any }) {
  if (!meta) return null;

  const {
    collectionRate, monthlyCollected, monthlyExpected,
    operatingCash, reservePct, reserveFunding, reserveRequired,
  } = meta;

  const reserveKnown = reserveRequired > 0;

  const reserveColor  = !reserveKnown ? 'text-ink-400'
    : reservePct >= 80 ? 'text-sage-700'
    : reservePct >= 50 ? 'text-yellow-700'
    : 'text-red-600';

  const reserveBarColor = !reserveKnown ? 'bg-ink-200'
    : reservePct >= 80 ? 'bg-sage-500'
    : reservePct >= 50 ? 'bg-yellow-400'
    : 'bg-red-400';

  const reserveLabel = !reserveKnown ? 'No reserve study on file'
    : reservePct >= 80 ? 'Well-funded'
    : reservePct >= 50 ? 'Partially funded'
    : 'Underfunded — action needed';

  const collectionColor = collectionRate >= 95 ? 'text-sage-700'
    : collectionRate >= 85 ? 'text-yellow-700'
    : 'text-red-600';

  const collectionLabel = collectionRate >= 95 ? 'On target'
    : collectionRate >= 85 ? 'Below target'
    : 'Needs follow-up';

  return (
    <div className="mx-5 mb-5 grid grid-cols-1 sm:grid-cols-3 gap-3">

      {/* Reserve Health */}
      <div className="bg-white border border-ink-100 rounded-xl p-4 shadow-sm">
        <p className="text-[10px] text-ink-400 uppercase tracking-wider font-semibold mb-2">
          Reserve Fund Health
        </p>
        <p className={`text-2xl font-bold font-mono ${reserveColor}`}>
          {reserveKnown ? `${reservePct}%` : '—'}
        </p>
        {reserveKnown && (
          <>
            <div className="mt-2 w-full h-1.5 bg-ink-100 rounded-full overflow-hidden">
              <div
                className={`h-1.5 rounded-full ${reserveBarColor}`}
                style={{ width: `${Math.min(reservePct, 100)}%` }}
              />
            </div>
            <p className="text-[10px] text-ink-400 mt-1.5 tabular-nums">
              {fmt(reserveFunding)} funded of {fmt(reserveRequired)} required
            </p>
          </>
        )}
        <p className={`text-[10px] font-semibold mt-1 ${reserveColor}`}>{reserveLabel}</p>
      </div>

      {/* Collection Rate */}
      <div className="bg-white border border-ink-100 rounded-xl p-4 shadow-sm">
        <p className="text-[10px] text-ink-400 uppercase tracking-wider font-semibold mb-2">
          Assessment Collection Rate
        </p>
        <p className={`text-2xl font-bold font-mono ${collectionColor}`}>
          {collectionRate}%
        </p>
        <p className="text-[10px] text-ink-400 mt-2 tabular-nums">
          {fmt(monthlyCollected)} collected of {fmt(monthlyExpected)} expected
        </p>
        <p className={`text-[10px] font-semibold mt-1 ${collectionColor}`}>{collectionLabel}</p>
      </div>

      {/* Operating Cash */}
      <div className="bg-white border border-ink-100 rounded-xl p-4 shadow-sm">
        <p className="text-[10px] text-ink-400 uppercase tracking-wider font-semibold mb-2">
          Operating Cash Balance
        </p>
        <p className="text-2xl font-bold font-mono text-ink-900">
          {fmt(operatingCash)}
        </p>
        <p className="text-[10px] text-ink-400 mt-2">Current operating account balance</p>
        <p className="text-[10px] font-semibold mt-1 text-ink-400">
          {operatingCash > 0 ? 'Positive balance' : operatingCash === 0 ? 'No balance recorded' : 'Negative — review required'}
        </p>
      </div>

    </div>
  );
}

function ExecSummary({ lines }: { lines: string[] }) {
  return (
    <div className="mx-5 mb-4 bg-mist-50 border border-mist-200 rounded-lg px-4 py-3 space-y-1.5">
      {lines.map((line, i) => (
        <p key={i} className="text-xs text-ink-600 leading-relaxed">{line}</p>
      ))}
    </div>
  );
}

function ReserveHealthBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.min(Math.round((current / total) * 100), 100) : 0;
  const color = pct >= 80 ? 'bg-sage-500' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-400';
  const label = pct >= 80 ? 'Well-funded' : pct >= 50 ? 'Partially funded' : 'Underfunded';
  return (
    <div className="mx-5 mb-4">
      <div className="flex items-center justify-between text-[10px] text-ink-400 mb-1.5">
        <span className="uppercase tracking-wide font-semibold">Reserve Fund Health</span>
        <span className="font-mono tabular-nums">{fmt(current)} of {fmt(total)} — {pct}% funded</span>
      </div>
      <div className="w-full h-2 bg-ink-100 rounded-full overflow-hidden">
        <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className={`text-[10px] mt-1 font-semibold ${
        pct >= 80 ? 'text-sage-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-600'
      }`}>{label}</p>
    </div>
  );
}

function BalanceSheet({ data, period, meta }: { data: any; period?: { start: string; end: string }; meta?: any }) {
  const periodText = formatPeriodHeader(period, 'as-of');
  const totalAssets      = data.assets?.total ?? 0;
  const reserveFund      = data.assets?.reserves ?? 0;
  const totalLiabilities = data.liabilities?.total ?? 0;
  const netEquity        = totalAssets - totalLiabilities;
  const summaryLines = [
    `Total assets of ${fmt(totalAssets)} are offset by liabilities of ${fmt(totalLiabilities)}, resulting in net equity of ${fmt(netEquity)}.`,
    reserveFund > 0
      ? `The reserve fund holds ${fmt(reserveFund)}, representing ${totalAssets > 0 ? Math.round((reserveFund / totalAssets) * 100) : 0}% of total assets.`
      : 'No reserve fund balance is currently recorded.',
  ];
  return (
    <div className="bg-sage-50 border border-sage-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-sage-200">
        <h3 className="font-display text-base font-bold text-ink-900">Balance Sheet{periodText ? ` — ${periodText}` : ''}</h3>
        <p className="text-xs text-ink-400">Snapshot at time of generation</p>
      </div>
      <div className="pt-5">
        <FinancialHealthDashboard meta={meta} />
      </div>
      <ExecSummary lines={summaryLines} />
      {totalAssets > 0 && (
        <ReserveHealthBar current={reserveFund} total={totalAssets} />
      )}
      <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
        <div>
          <h4 className="text-xs font-bold text-sage-600 uppercase tracking-wide mb-3">Assets</h4>
          <div className="space-y-2">
            {[['Operating', data.assets.operating], ['Reserves', data.assets.reserves], ['Assessments AR', data.assets.assessmentsAR], ['Late Fees AR', data.assets.lateFeesAR]].map(([l, v]) => (
              <div key={l as string} className="flex justify-between"><span className="text-ink-500">{l}</span><span className="font-medium">{fmt(v as number)}</span></div>
            ))}
            <div className="flex justify-between border-t border-sage-200 pt-2 font-bold"><span>Total</span><span>{fmt(data.assets.total)}</span></div>
          </div>
        </div>
        <div>
          <h4 className="text-xs font-bold text-accent-600 uppercase tracking-wide mb-3">Liabilities</h4>
          <div className="space-y-2">
            {[['Payable', data.liabilities.payable], ['Prepaid', data.liabilities.prepaidAssessments], ['Deposits', data.liabilities.deposits]].map(([l, v]) => (
              <div key={l as string} className="flex justify-between"><span className="text-ink-500">{l}</span><span className="font-medium">{fmt(v as number)}</span></div>
            ))}
            <div className="flex justify-between border-t border-accent-200 pt-2 font-bold"><span>Total</span><span>{fmt(data.liabilities.total)}</span></div>
          </div>
        </div>
        <div>
          <h4 className="text-xs font-bold text-ink-500 uppercase tracking-wide mb-3">Equity</h4>
          <div className="space-y-2">
            {[['Operating Fund', data.equity.operatingFund], ['Reserve Fund', data.equity.reserveFund], ['Retained', data.equity.retained]].map(([l, v]) => (
              <div key={l as string} className="flex justify-between"><span className="text-ink-500">{l}</span><span className="font-medium">{fmt(v as number)}</span></div>
            ))}
            <div className="flex justify-between border-t border-ink-200 pt-2 font-bold"><span>Total</span><span>{fmt(data.equity.total)}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IncomeStatement({ data, period, meta }: { data: any; period?: { start: string; end: string }; meta?: any }) {
  const periodText = formatPeriodHeader(period, 'range');
  const surplus    = (data.netIncome ?? 0) >= 0;
  const pctOfInc   = data.totalIncome > 0
    ? Math.round((Math.abs(data.netIncome ?? 0) / data.totalIncome) * 100)
    : 0;
  const expenseRatio = data.totalIncome > 0
    ? Math.round((data.totalExpenses / data.totalIncome) * 100)
    : 0;
  const isLines = [
    `Net ${surplus ? 'income' : 'loss'} for the period is ${fmt(data.netIncome ?? 0)}, a ${pctOfInc}% ${surplus ? 'surplus' : 'deficit'} relative to total income of ${fmt(data.totalIncome)}.`,
    `Total expenses of ${fmt(data.totalExpenses)} represent ${expenseRatio}% of income — ${expenseRatio <= 95 ? 'within an acceptable range' : 'exceeding income for the period'}.`,
  ];
  return (
    <div className="bg-mist-50 border border-mist-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-mist-200">
        <h3 className="font-display text-base font-bold text-ink-900">Income Statement (P&L){periodText ? ` — ${periodText}` : ''}</h3>
      </div>
      <div className="pt-5">
        <FinancialHealthDashboard meta={meta} />
      </div>
      <ExecSummary lines={isLines} />
      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
        <div>
          <h4 className="text-xs font-bold text-sage-600 uppercase tracking-wide mb-3">Income</h4>
          <div className="space-y-2">
            {Object.entries(data.income).map(([num, v]: [string, any]) => (
              <div key={num} className="flex justify-between"><span className="text-ink-500">{v.name}</span><span className="font-medium">{fmt(v.amount)}</span></div>
            ))}
            <div className="flex justify-between border-t border-sage-200 pt-2 font-bold text-sage-700"><span>Total Income</span><span>{fmt(data.totalIncome)}</span></div>
          </div>
        </div>
        <div>
          <h4 className="text-xs font-bold text-accent-600 uppercase tracking-wide mb-3">Expenses</h4>
          <div className="space-y-2">
            {Object.entries(data.expenses).map(([num, v]: [string, any]) => (
              <div key={num} className="flex justify-between"><span className="text-ink-500">{v.name}</span><span className="font-medium">{fmt(v.amount)}</span></div>
            ))}
            <div className="flex justify-between border-t border-accent-200 pt-2 font-bold text-accent-700"><span>Total Expenses</span><span>{fmt(data.totalExpenses)}</span></div>
          </div>
        </div>
      </div>
      <div className="px-5 py-3 border-t border-mist-200 bg-white">
        <div className="flex justify-between text-base font-bold"><span>Net Income</span><span className={data.netIncome >= 0 ? 'text-sage-700' : 'text-red-600'}>{fmt(data.netIncome)}</span></div>
      </div>
    </div>
  );
}

function BudgetVsActual({ rows, period, meta }: { rows: any[]; period?: { start: string; end: string }; meta?: any }) {
  const periodText = formatPeriodHeader(period, 'range');
  return (
    <div className="bg-white border border-ink-100 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-ink-100"><h3 className="font-display text-base font-bold text-ink-900">Budget vs Actual{periodText ? ` — ${periodText}` : ''}</h3></div>
      <div className="pt-5">
        <FinancialHealthDashboard meta={meta} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-400 uppercase tracking-wide border-b border-ink-100 bg-mist-50">
              <th className="px-5 py-2">Category</th><th className="px-3 py-2 text-right">Budget</th><th className="px-3 py-2 text-right">Actual</th><th className="px-3 py-2 text-right">Variance</th><th className="px-3 py-2 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b: any) => (
              <tr key={b.id} className="border-b border-ink-50">
                <td className="px-5 py-2 font-medium text-ink-900">{b.name}</td>
                <td className="px-3 py-2 text-right text-ink-500">{fmt(b.budgeted)}</td>
                <td className="px-3 py-2 text-right font-medium">{fmt(b.actual)}</td>
                <td className={`px-3 py-2 text-right font-semibold ${b.variance >= 0 ? 'text-sage-600' : 'text-red-600'}`}>{fmt(b.variance)}</td>
                <td className="px-3 py-2 text-right">
                  <span className={`px-2 py-0.5 rounded text-xs ${b.pct > 100 ? 'bg-red-100 text-red-700' : b.pct > 80 ? 'bg-yellow-100 text-yellow-700' : 'bg-sage-100 text-sage-700'}`}>{b.pct}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    {(() => {
      const overBudget = rows.filter((r: any) => r.pct > 100);
      const worst = [...rows].sort((a: any, b: any) => b.pct - a.pct)[0];
      if (overBudget.length === 0) {
        return (
          <div className="flex items-center gap-2 mx-5 mb-4 mt-1 text-xs text-sage-700 bg-sage-50 border border-sage-100 rounded-lg px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-sage-500 shrink-0" />
            All {rows.length} budget line{rows.length !== 1 ? 's' : ''} are on or under budget.
          </div>
        );
      }
      return (
        <div className="mx-5 mb-4 mt-1 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-xs text-red-700">
          <span className="font-semibold">{overBudget.length} of {rows.length} categories over budget.</span>
          {worst && (
            <span className="text-red-500 ml-1">
              Largest overage: <span className="font-medium">{worst.name}</span> at {worst.pct}% of budget
              ({fmt(worst.actual)} vs. {fmt(worst.budgeted)} budgeted).
            </span>
          )}
        </div>
      );
    })()}
    </div>
  );
}

function Form1120H({ data, period: _period }: { data: any; period?: { start: string; end: string } }) {
  return (
    <div className="bg-white border-2 border-ink-900 rounded-xl overflow-hidden">
      <div className="bg-ink-900 text-white px-5 py-3">
        <p className="text-xs text-ink-300 font-mono">Department of the Treasury — Internal Revenue Service</p>
        <h3 className="font-display text-lg font-bold mt-1">Form 1120-H</h3>
        <p className="text-sm text-ink-200">U.S. Income Tax Return for Homeowners Associations</p>
      </div>
      <div className="p-5 space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3 bg-mist-50 rounded-lg p-3 border border-mist-200">
          <div><p className="text-[10px] text-ink-400 uppercase font-semibold">Association</p><p className="text-sm font-bold text-ink-900">{data.buildingName}</p></div>
          <div><p className="text-[10px] text-ink-400 uppercase font-semibold">Entity Type</p><p className="text-sm text-ink-700">{data.entityType}</p></div>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between py-1"><span className="text-ink-600">Exempt function income (assessments)</span><span className="font-mono">{fmt(data.exemptIncome)}</span></div>
          <div className="flex justify-between py-1"><span className="text-ink-600">Non-exempt income</span><span className="font-mono">{fmt(data.nonExemptIncome)}</span></div>
          <div className="flex justify-between py-1"><span className="text-ink-600">Taxable income</span><span className="font-mono">{fmt(data.taxableIncome)}</span></div>
          <div className="flex justify-between py-2 border-t border-ink-200 bg-sage-50 rounded-lg px-3 -mx-1">
            <span className="text-base font-bold text-ink-900">Total Tax (30%)</span>
            <span className={`text-base font-bold font-mono ${data.taxOwed > 0 ? 'text-red-600' : 'text-sage-600'}`}>{fmt(data.taxOwed)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LocalTaxForms({ data, period }: { data: any; period?: { start: string; end: string } }) {
  const periodText = formatPeriodHeader(period, 'range');
  return (
    <div className="bg-white border border-ink-100 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-ink-100">
        <h3 className="font-display text-base font-bold text-ink-900">Local Tax Forms — {data.state}{periodText ? ` — ${periodText}` : ''}</h3>
      </div>
      <div className="p-5 space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3 bg-mist-50 rounded-lg p-3 border border-mist-200">
          <div><p className="text-[10px] text-ink-400 uppercase font-semibold">Association</p><p className="font-bold text-ink-900">{data.buildingName}</p></div>
          <div><p className="text-[10px] text-ink-400 uppercase font-semibold">Entity Type</p><p className="text-ink-700">{data.entityType}</p></div>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between py-1"><span className="text-ink-600">Total Income</span><span className="font-mono">{fmt(data.totalIncome)}</span></div>
          <div className="flex justify-between py-1"><span className="text-ink-600">Total Expenses</span><span className="font-mono">{fmt(data.totalExpenses)}</span></div>
          <div className="flex justify-between py-1 border-t border-ink-100 font-bold"><span>Net Income</span><span className="font-mono">{fmt(data.netIncome)}</span></div>
        </div>
      </div>
    </div>
  );
}
