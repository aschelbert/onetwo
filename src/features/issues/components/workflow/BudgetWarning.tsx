import type { FundingContext } from '@/lib/fundingAnalysis';

interface BudgetWarningProps {
  ctx: FundingContext;
  categoryName?: string;
}

export function BudgetWarning({ ctx, categoryName }: BudgetWarningProps) {
  if (ctx.totalBudgeted <= 0) return null;
  const pctUsed = Math.round((ctx.totalSpent / ctx.totalBudgeted) * 100);
  if (pctUsed < 75) return null;

  const level = pctUsed >= 100 ? 'critical' : pctUsed >= 95 ? 'high' : pctUsed >= 85 ? 'medium' : 'low';
  const colors: Record<string, string> = {
    low: 'bg-yellow-50 border-yellow-200',
    medium: 'bg-amber-50 border-amber-200',
    high: 'bg-orange-50 border-orange-200',
    critical: 'bg-red-50 border-red-200',
  };
  const barColors: Record<string, string> = {
    low: 'bg-yellow-400',
    medium: 'bg-amber-400',
    high: 'bg-orange-500',
    critical: 'bg-red-500',
  };
  const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <div className={`${colors[level]} border rounded-lg p-3 mb-3`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-ink-700">{categoryName || 'Overall Budget'}: {pctUsed}% used</span>
        <span className="text-xs text-ink-500">{fmt(ctx.totalBudgeted - ctx.totalSpent)} remaining</span>
      </div>
      <div className="w-full h-2 bg-white rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColors[level]}`} style={{ width: `${Math.min(pctUsed, 100)}%` }} />
      </div>
    </div>
  );
}
