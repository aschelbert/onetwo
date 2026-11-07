import type { ReactNode } from 'react';

/**
 * The small progress ring from the Funds tiles: a percentage in a 64px
 * circle with a line of text beside it. `light` draws it for a grey tile
 * (teal on a pale track); otherwise it is aqua on a dark tile.
 */
export function Ring({ pct, light, children }: { pct: number; light?: boolean; children?: ReactNode }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3">
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" stroke={light ? '#E3E8EE' : 'rgba(255,255,255,0.18)'} strokeWidth="6" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={light ? '#155E75' : '#A5F3FC'} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(Math.max(0, Math.min(100, pct)) / 100) * c} ${c}`} transform="rotate(-90 32 32)" />
        <text x="32" y="37" textAnchor="middle" fontSize="14" fontWeight="700" fill={light ? '#1A1F25' : '#fff'}>{pct}%</text>
      </svg>
      {children !== undefined && <div className="text-sm">{children}</div>}
    </div>
  );
}

export default Ring;
