import type { ReactNode } from 'react';

interface Grade {
  value: string;
  label: string;
  color?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  grades?: Grade[];
  action?: ReactNode;
}

export default function PageHeader({ title, subtitle, grades, action }: PageHeaderProps) {
  return (
    <div
      className="rounded-xl p-6 text-white shadow-sm"
      style={{ background: 'linear-gradient(135deg, #0D1B2E 0%, #123352 55%, #155E75 100%)' }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">{title}</h1>
          {subtitle && <p className="text-white/60 text-sm mt-1">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3">
          {grades?.map((g) => (
            <div key={g.label} className="text-center bg-white/[0.10] rounded-lg px-4 py-2">
              <p className="text-[10px] text-white/60">{g.label}</p>
              <p className={`text-lg font-bold ${g.color || 'text-white'}`}>{g.value}</p>
            </div>
          ))}
          {action}
        </div>
      </div>
    </div>
  );
}
