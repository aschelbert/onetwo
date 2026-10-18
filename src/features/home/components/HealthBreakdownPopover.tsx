import { X } from 'lucide-react';
import type { HealthResult, HealthBreakdownLine } from '@/lib/boardHealth';

interface HealthBreakdownPopoverProps {
  health: HealthResult;
  onClose: () => void;
}

function BreakdownRow({ line }: { line: HealthBreakdownLine }) {
  if (line.max === 0) {
    return (
      <div className="flex items-center justify-between py-1.5 text-xs text-ink-400">
        <span>{line.label}</span>
        <span className="italic">Not tracked</span>
      </div>
    );
  }
  const pct = Math.round((line.points / line.max) * 100);
  const color = pct >= 80 ? 'bg-brand-cyan' : pct >= 60 ? 'bg-amber-400' : 'bg-red-500';

  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between text-xs mb-0.5">
        <span className="text-ink-700 font-medium">{line.label}</span>
        <span className="text-ink-500">{line.points}/{line.max}</span>
      </div>
      <div className="w-full h-1.5 bg-ink-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-ink-400 mt-0.5">{line.detail}</p>
    </div>
  );
}

function CategoryScore({ label, score }: { label: string; score: number }) {
  return (
    <div className="text-center">
      <p className="text-sm font-bold text-ink-800">{score}%</p>
      <p className="text-[10px] text-ink-400">{label}</p>
    </div>
  );
}

export default function HealthBreakdownPopover({ health, onClose }: HealthBreakdownPopoverProps) {
  return (
    <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-ink-100 z-50">
      <div className="flex items-center justify-between p-4 border-b border-ink-100">
        <h3 className="text-sm font-bold text-ink-800">Board Health Breakdown</h3>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-ink-50 text-ink-400"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Category scores */}
      <div className="grid grid-cols-4 gap-2 px-4 py-3 border-b border-ink-50">
        <CategoryScore label="Compliance" score={health.compliance} />
        <CategoryScore label="Financial" score={health.financial} />
        <CategoryScore label="Governance" score={health.governance} />
        <CategoryScore label="Records" score={health.records} />
      </div>

      {/* Breakdown lines */}
      <div className="px-4 py-3 max-h-60 overflow-y-auto divide-y divide-ink-50">
        {health.breakdown.map((line, i) => (
          <BreakdownRow key={i} line={line} />
        ))}
      </div>
    </div>
  );
}
