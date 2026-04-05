import { fmt } from '@/lib/formatters';

interface Props {
  snapshot: Record<string, any>;
}

function formatPeriodLabel(period: { start: string; end: string }): string {
  const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const s = new Date(period.start + 'T00:00:00');
  const e = new Date(period.end + 'T00:00:00');

  // Same month → "March 2025"
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return fmtDate(period.start);
  }

  // Check for quarter boundaries
  const startMonth = s.getMonth();
  const endMonth = e.getMonth();
  if (s.getFullYear() === e.getFullYear() && (endMonth - startMonth === 2) && startMonth % 3 === 0) {
    return `Q${Math.floor(startMonth / 3) + 1} ${s.getFullYear()}`;
  }

  // Full year → "FY 2025"
  if (startMonth === 0 && endMonth === 11 && s.getDate() === 1 && e.getDate() === 31 && s.getFullYear() === e.getFullYear()) {
    return `FY ${s.getFullYear()}`;
  }

  // Fallback
  const fmtShort = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  return `${fmtShort(period.start)} – ${fmtShort(period.end)}`;
}

export default function ExecutiveSummaryRenderer({ snapshot }: Props) {
  const period = snapshot.period as { start: string; end: string } | undefined;
  const periodLabel = period ? formatPeriodLabel(period) : '';
  const data = snapshot;

  // Determine operating balance status
  const opBalance = data.operatingBalance ?? 0;
  const opBalanceLabel = opBalance > 0 ? 'positive' : opBalance === 0 ? 'neutral' : 'negative';

  // Build narrative paragraphs
  const narrativeLines = buildNarrative(data);

  // Action items
  const actions = buildActionItems(data);

  return (
    <div className="bg-white border border-ink-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-ink-900 text-white px-6 py-4">
        <h3 className="font-display text-lg font-bold">
          Executive Summary{periodLabel ? ` — ${periodLabel}` : ''}
        </h3>
        <p className="text-sm text-ink-300 mt-0.5">{data.buildingName}</p>
      </div>

      {/* Key metrics bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-ink-100">
        <MetricCard
          label="Operating Balance"
          value={fmt(opBalance)}
          status={opBalanceLabel === 'positive' ? 'good' : opBalanceLabel === 'negative' ? 'bad' : 'neutral'}
        />
        <MetricCard
          label="Collection Rate"
          value={`${data.collections?.collectionRate ?? 0}%`}
          status={(data.collections?.collectionRate ?? 0) >= 95 ? 'good' : (data.collections?.collectionRate ?? 0) >= 85 ? 'warn' : 'bad'}
        />
        <MetricCard
          label="Reserve Funded"
          value={`${data.reserves?.pctFunded ?? 0}%`}
          status={(data.reserves?.pctFunded ?? 0) >= 80 ? 'good' : (data.reserves?.pctFunded ?? 0) >= 50 ? 'warn' : 'bad'}
        />
        <MetricCard
          label="Net Income"
          value={fmt(data.pnl?.netIncome ?? 0)}
          status={(data.pnl?.netIncome ?? 0) >= 0 ? 'good' : 'bad'}
        />
      </div>

      {/* Narrative body */}
      <div className="px-6 py-5 space-y-3">
        {narrativeLines.map((line, i) => (
          <p key={i} className="text-sm text-ink-700 leading-relaxed">{line}</p>
        ))}
      </div>

      {/* Budget variance callout */}
      {data.budget?.overBudgetCategories?.length > 0 && (
        <div className="mx-6 mb-4 bg-red-50 border border-red-100 rounded-lg p-4">
          <p className="text-xs font-bold text-red-700 uppercase tracking-wide mb-2">Budget Overages</p>
          <div className="space-y-1.5">
            {data.budget.overBudgetCategories.map((cat: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-red-700 font-medium">{cat.name}</span>
                <span className="text-xs text-red-600 font-mono">
                  {fmt(cat.actual)} / {fmt(cat.budgeted)} ({cat.pct}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reserve funding bar */}
      <div className="mx-6 mb-4">
        <div className="flex items-center justify-between text-[10px] text-ink-400 mb-1.5">
          <span className="uppercase tracking-wide font-semibold">Capital Reserve Status</span>
          <span className="font-mono tabular-nums">
            {fmt(data.reserves?.totalFunding ?? 0)} of {fmt(data.reserves?.totalRequired ?? 0)} — {data.reserves?.pctFunded ?? 0}% funded
          </span>
        </div>
        <div className="w-full h-2 bg-ink-100 rounded-full overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all ${
              (data.reserves?.pctFunded ?? 0) >= 80 ? 'bg-sage-500' :
              (data.reserves?.pctFunded ?? 0) >= 50 ? 'bg-yellow-400' : 'bg-red-400'
            }`}
            style={{ width: `${Math.min(data.reserves?.pctFunded ?? 0, 100)}%` }}
          />
        </div>
        {data.reserves?.gap > 0 && (
          <p className="text-[10px] text-red-600 font-semibold mt-1">
            Annual contribution gap: {fmt(data.reserves.gap)} ({fmt(data.reserves.currentAnnual)}/yr vs. {fmt(data.reserves.recommendedAnnual)}/yr recommended)
          </p>
        )}
      </div>

      {/* Financial summary table */}
      <div className="mx-6 mb-4">
        <div className="bg-mist-50 border border-mist-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] text-ink-400 uppercase tracking-wide border-b border-mist-200">
                <th className="px-4 py-2">Metric</th>
                <th className="px-4 py-2 text-right">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist-100">
              <SummaryRow label="Total Income" value={fmt(data.pnl?.totalIncome ?? 0)} />
              <SummaryRow label="Total Expenses" value={fmt(data.pnl?.totalExpenses ?? 0)} />
              <SummaryRow label="Net Income" value={fmt(data.pnl?.netIncome ?? 0)} bold color={(data.pnl?.netIncome ?? 0) >= 0 ? 'text-sage-700' : 'text-red-600'} />
              <SummaryRow label="Operating Cash" value={fmt(opBalance)} />
              <SummaryRow label="Reserve Balance" value={fmt(data.reserves?.totalFunding ?? 0)} />
              <SummaryRow label="Outstanding Receivables" value={fmt(data.collections?.totalOutstanding ?? 0)} color={(data.collections?.totalOutstanding ?? 0) > 0 ? 'text-yellow-700' : undefined} />
              <SummaryRow label="Insurance Premium (Annual)" value={fmt(data.insurance?.totalPremium ?? 0)} />
              <SummaryRow label="Open Issues" value={String(data.issues?.openCount ?? 0)} color={(data.issues?.urgentCount ?? 0) > 0 ? 'text-red-600' : undefined} />
            </tbody>
          </table>
        </div>
      </div>

      {/* Board action items */}
      {actions.length > 0 && (
        <div className="mx-6 mb-5 bg-accent-50 border border-accent-200 rounded-lg p-4">
          <p className="text-xs font-bold text-accent-700 uppercase tracking-wide mb-2">Board Action Items</p>
          <ul className="space-y-1.5">
            {actions.map((action, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-accent-800">
                <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-accent-500 shrink-0" />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, status }: { label: string; value: string; status: 'good' | 'warn' | 'bad' | 'neutral' }) {
  const colorMap = {
    good: 'text-sage-700',
    warn: 'text-yellow-700',
    bad: 'text-red-600',
    neutral: 'text-ink-600',
  };
  return (
    <div className="bg-white p-4">
      <p className="text-[10px] text-ink-400 uppercase tracking-wider font-semibold mb-1">{label}</p>
      <p className={`text-xl font-bold font-mono ${colorMap[status]}`}>{value}</p>
    </div>
  );
}

function SummaryRow({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <tr>
      <td className={`px-4 py-2 ${bold ? 'font-semibold text-ink-900' : 'text-ink-600'}`}>{label}</td>
      <td className={`px-4 py-2 text-right font-mono ${bold ? 'font-bold' : 'font-medium'} ${color || 'text-ink-900'}`}>{value}</td>
    </tr>
  );
}

function buildNarrative(data: Record<string, any>): string[] {
  const lines: string[] = [];
  const reserves = data.reserves || {};
  const budget = data.budget || {};
  const collections = data.collections || {};

  // Opening — operating position
  const opBalance = data.operatingBalance ?? 0;
  const opStatus = opBalance > 10000 ? 'within target range' : opBalance > 0 ? 'below optimal levels' : 'in a deficit position';
  lines.push(
    `The association ended the period with an operating balance of ${fmt(opBalance)}, ${opStatus}.`
  );

  // Budget variance
  const overCount = budget.overBudgetCategories?.length ?? 0;
  if (overCount > 0) {
    const names = budget.overBudgetCategories.slice(0, 3).map((c: any) => c.name).join(', ');
    lines.push(
      `${overCount} of ${budget.totalCategories} vendor categories came in over budget: ${names}. Total spending of ${fmt(budget.totalActual)} exceeded the ${fmt(budget.totalBudgeted)} budget.`
    );
  } else {
    lines.push(
      `All ${budget.totalCategories} budget categories are on or under budget, with total spending of ${fmt(budget.totalActual)} against a ${fmt(budget.totalBudgeted)} budget.`
    );
  }

  // Collections
  if (collections.collectionRate < 95) {
    lines.push(
      `Assessment collection rate stands at ${collections.collectionRate}%, with ${fmt(collections.totalOutstanding)} outstanding across ${collections.delinquentUnits} unit${collections.delinquentUnits !== 1 ? 's' : ''}.`
    );
  }

  // Reserves
  lines.push(
    `Reserve contributions remain ${reserves.gap <= 0 ? 'on schedule' : 'below the recommended level'}, with the capital reserve funded at ${reserves.pctFunded}% of the recommended level.${
      reserves.gap > 0
        ? ` At the current contribution rate, the annual shortfall is ${fmt(reserves.gap)}.`
        : ''
    }`
  );

  // Insurance
  if (data.insurance?.expiredCount > 0) {
    lines.push(
      `${data.insurance.expiredCount} insurance ${data.insurance.expiredCount === 1 ? 'policy has' : 'policies have'} expired and require${data.insurance.expiredCount === 1 ? 's' : ''} immediate renewal.`
    );
  }

  return lines;
}

function buildActionItems(data: Record<string, any>): string[] {
  const actions: string[] = [];
  const reserves = data.reserves || {};
  const recs = data.recommendations || {};

  // Reserve gap recommendation
  if (reserves.gap > 0 && recs.monthlyIncreasePerUnit > 0) {
    actions.push(
      `Review capital reserve contribution rate at next meeting. A ${fmt(recs.monthlyIncreasePerUnit)}/unit/month increase closes the projected gap${recs.monthsToClose ? ` within ${recs.monthsToClose} months` : ''} without a special assessment.`
    );
  }

  // Delinquency follow-up
  const collections = data.collections || {};
  if (collections.delinquentUnits > 0 && collections.collectionRate < 90) {
    actions.push(
      `Initiate collection follow-up for ${collections.delinquentUnits} delinquent unit${collections.delinquentUnits !== 1 ? 's' : ''} (${fmt(collections.totalOutstanding)} outstanding).`
    );
  }

  // Expired insurance
  if (data.insurance?.expiredCount > 0) {
    actions.push(
      `Renew ${data.insurance.expiredCount} expired insurance ${data.insurance.expiredCount === 1 ? 'policy' : 'policies'} immediately to maintain coverage.`
    );
  }

  // Urgent issues
  if (data.issues?.urgentCount > 0) {
    actions.push(
      `Address ${data.issues.urgentCount} high-priority open issue${data.issues.urgentCount !== 1 ? 's' : ''} requiring board attention.`
    );
  }

  // Expiring vendor contracts
  if (data.vendors?.expiringContracts > 0) {
    actions.push(
      `Review ${data.vendors.expiringContracts} vendor contract${data.vendors.expiringContracts !== 1 ? 's' : ''} expiring within 90 days.`
    );
  }

  // Budget overages
  if (data.budget?.overBudgetCategories?.length > 0) {
    actions.push(
      `Review ${data.budget.overBudgetCategories.length} over-budget spending ${data.budget.overBudgetCategories.length === 1 ? 'category' : 'categories'} and consider mid-year budget adjustments.`
    );
  }

  return actions;
}
