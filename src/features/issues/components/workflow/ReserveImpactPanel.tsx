import type { FundingContext } from '@/lib/fundingAnalysis';
import { projectReserveFunding } from '@/lib/fundingAnalysis';

interface ReserveImpactPanelProps {
  ctx: FundingContext;
  drawAmount: number;
}

export function ReserveImpactPanel({ ctx, drawAmount }: ReserveImpactPanelProps) {
  const totalReserveNeeded = ctx.reservePctFunded > 0 ? ctx.reserveBalance / (ctx.reservePctFunded / 100) : 0;
  const afterDrawPct = totalReserveNeeded > 0 ? Math.round(((ctx.reserveBalance - drawAmount) / totalReserveNeeded) * 100) : 0;
  const beforePct = ctx.reservePctFunded;

  // Estimate annual contribution (~2% of total needed per year is typical)
  const annualContrib = totalReserveNeeded > 0 ? Math.round(totalReserveNeeded * 0.03) : 10000;
  const projection = projectReserveFunding(ctx.reserveBalance, drawAmount, annualContrib);

  // Recovery year
  const targetPct = 70;
  const targetBalance = totalReserveNeeded * (targetPct / 100);
  const recoveryEntry = projection.find(p => p.withDraw >= targetBalance);
  const recoveryYear = recoveryEntry?.year;

  // Chart dimensions
  const W = 400, H = 180, PX = 40, PY = 20;
  const chartW = W - PX * 2;
  const chartH = H - PY * 2;
  const maxVal = Math.max(...projection.map(p => Math.max(p.withoutDraw, p.withDraw)), totalReserveNeeded);

  const toX = (i: number) => PX + (i / 10) * chartW;
  const toY = (val: number) => PY + chartH - (val / maxVal) * chartH;

  const withoutDrawLine = projection.map((p, i) => `${toX(i)},${toY(p.withoutDraw)}`).join(' ');
  const withDrawLine = projection.map((p, i) => `${toX(i)},${toY(p.withDraw)}`).join(' ');
  const targetY = toY(targetBalance);

  const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <div className="bg-mist-50 border border-mist-200 rounded-lg p-4 space-y-3">
      <p className="text-[10px] font-bold text-ink-400 uppercase tracking-widest">Reserve Impact Analysis</p>

      {/* Before/After bars */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] text-ink-400 font-medium mb-1">Before Draw</p>
          <div className="w-full h-4 bg-ink-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-sage-500" style={{ width: `${Math.min(beforePct, 100)}%` }} />
          </div>
          <p className="text-xs font-bold text-ink-700 mt-0.5">{beforePct}% funded</p>
        </div>
        <div>
          <p className="text-[10px] text-ink-400 font-medium mb-1">After Draw</p>
          <div className="w-full h-4 bg-ink-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${afterDrawPct >= 50 ? 'bg-sage-500' : afterDrawPct >= 30 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${Math.min(Math.max(afterDrawPct, 0), 100)}%` }} />
          </div>
          <p className={`text-xs font-bold mt-0.5 ${afterDrawPct >= 50 ? 'text-sage-700' : afterDrawPct >= 30 ? 'text-yellow-700' : 'text-red-700'}`}>{afterDrawPct}% funded</p>
        </div>
      </div>

      {/* 10-year projection chart (inline SVG) */}
      <div>
        <p className="text-[10px] font-medium text-ink-500 mb-1">10-Year Projection</p>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
          {/* Grid */}
          {[0, 2, 4, 6, 8, 10].map(y => (
            <g key={y}>
              <line x1={toX(y)} y1={PY} x2={toX(y)} y2={PY + chartH} stroke="#e5e7eb" strokeWidth="0.5" />
              <text x={toX(y)} y={H - 4} fontSize="8" fill="#94a3b8" textAnchor="middle">Yr {y}</text>
            </g>
          ))}

          {/* Target line */}
          <line x1={PX} y1={targetY} x2={W - PX} y2={targetY} stroke="#f59e0b" strokeWidth="1" strokeDasharray="4,3" />
          <text x={W - PX + 3} y={targetY + 3} fontSize="7" fill="#f59e0b">{targetPct}%</text>

          {/* Without draw line (green dashed) */}
          <polyline points={withoutDrawLine} fill="none" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="4,2" />

          {/* With draw line (red solid) */}
          <polyline points={withDrawLine} fill="none" stroke="#ef4444" strokeWidth="2" />

          {/* Legend */}
          <line x1={PX} y1={10} x2={PX + 15} y2={10} stroke="#22c55e" strokeWidth="1.5" strokeDasharray="4,2" />
          <text x={PX + 18} y={13} fontSize="7" fill="#22c55e">Without draw</text>
          <line x1={PX + 80} y1={10} x2={PX + 95} y2={10} stroke="#ef4444" strokeWidth="2" />
          <text x={PX + 98} y={13} fontSize="7" fill="#ef4444">With draw</text>
        </svg>
      </div>

      {/* Text summaries */}
      <div className="space-y-1 text-xs text-ink-600">
        {recoveryYear != null && (
          <p>Returns to {targetPct}% funded by Year {recoveryYear} at current contribution rate ({fmt(annualContrib)}/yr)</p>
        )}
        {recoveryYear == null && (
          <p className="text-red-600 font-medium">Will not recover to {targetPct}% within 10 years at current contribution rate</p>
        )}
        <p>Overall reserve funding would drop from <strong>{beforePct}%</strong> to <strong>{afterDrawPct}%</strong></p>
      </div>
    </div>
  );
}
