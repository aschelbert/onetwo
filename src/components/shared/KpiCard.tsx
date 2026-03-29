interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  variant?: 'default' | 'warn' | 'ok';
  className?: string;
  onClick?: () => void;
}

const VARIANT_STYLES = {
  default: 'bg-white border-ink-200',
  warn: 'bg-warn-bg border-warn-border',
  ok: 'bg-status-ok-bg border-status-ok-border',
} as const;

export default function KpiCard({ label, value, sub, variant = 'default', className = '', onClick }: KpiCardProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-4 ${onClick ? 'cursor-pointer hover:shadow-sm' : ''} transition-all ${VARIANT_STYLES[variant]} ${className}`}
    >
      <p className="text-[11px] text-ink-400 font-medium">{label}</p>
      <p className="font-display text-[1.6rem] font-bold text-ink-900 mt-1 leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-ink-400 mt-0.5">{sub}</p>}
    </div>
  );
}
