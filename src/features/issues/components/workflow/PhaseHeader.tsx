import { PHASE_COLORS } from '@/store/useIssuesStore';

interface PhaseHeaderProps {
  label: string;
  colorIndex: number;
  doneChecks: number;
  totalChecks: number;
}

export function PhaseHeader({ label, colorIndex, doneChecks, totalChecks }: PhaseHeaderProps) {
  const color = PHASE_COLORS[colorIndex % PHASE_COLORS.length];
  const pct = totalChecks > 0 ? Math.round((doneChecks / totalChecks) * 100) : 0;

  return (
    <div className="flex items-center gap-3 py-2 px-1">
      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-[10px] font-bold uppercase tracking-widest text-ink-500">{label}</span>
      <div className="w-20 h-1 rounded-full bg-ink-100 overflow-hidden shrink-0">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px] font-semibold text-ink-400">{doneChecks}/{totalChecks}</span>
    </div>
  );
}
