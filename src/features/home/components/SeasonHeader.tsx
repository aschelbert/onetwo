import { useState, useRef, useEffect, useMemo } from 'react';
import { Info } from 'lucide-react';
import type { SeasonState, MilestoneState } from '@/lib/seasons';
import type { HealthResult } from '@/lib/boardHealth';
import HealthBreakdownPopover from './HealthBreakdownPopover';

interface SeasonHeaderProps {
  season: SeasonState;
  firstName: string;
  urgentCount: number;
  health: HealthResult;
}

const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function MilestonePill({ ms }: { ms: MilestoneState }) {
  const base = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap';
  if (ms.status === 'complete') {
    return (
      <span className={`${base} bg-brand-cyan/20 border-brand-cyan/40 text-white`}>
        <span className="w-1.5 h-1.5 rounded-full bg-brand-cyan" />
        {ms.title}
      </span>
    );
  }
  if (ms.status === 'active' || ms.status === 'overdue') {
    return (
      <span className={`${base} bg-brand-cyan/10 border-brand-cyan text-white`}>
        <span className="w-1.5 h-1.5 rounded-full bg-brand-cyan animate-pulse" />
        {ms.title}
      </span>
    );
  }
  // upcoming
  return (
    <span className={`${base} bg-transparent border-white/30 text-white/60`}>
      {ms.title}
    </span>
  );
}

function HealthRing({ score, onInfoClick }: { score: number; onInfoClick: () => void }) {
  const pct = Math.min(Math.max(score, 0), 100);
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (pct / 100) * circumference;
  const color = score >= 80 ? '#00D4AA' : score >= 60 ? '#FFC107' : '#FF5252';

  return (
    <div className="relative flex flex-col items-center">
      <svg width="88" height="88" viewBox="0 0 88 88" className="transform -rotate-90">
        <circle cx="44" cy="44" r="36" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="6" />
        <circle
          cx="44" cy="44" r="36" fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-white">{score}</span>
        <span className="text-[10px] text-white/60">Health</span>
      </div>
      <button
        onClick={onInfoClick}
        className="mt-1 text-[10px] text-brand-cyan hover:underline flex items-center gap-0.5"
      >
        <Info className="w-3 h-3" />
        How is this scored?
      </button>
    </div>
  );
}

export default function SeasonHeader({ season, firstName, urgentCount, health }: SeasonHeaderProps) {
  const [healthOpen, setHealthOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!healthOpen) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setHealthOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [healthOpen]);

  const isSetup = season.seasonId === 'setup';
  const startLabel = MONTH_ABBR[(season.startMonth - 1) % 12] || '';
  const endLabel = MONTH_ABBR[(season.endMonth - 1) % 12] || '';

  const seasonLine = isSetup
    ? 'SETUP SEASON'
    : `${season.label.toUpperCase()} \u00B7 ${startLabel} TO ${endLabel} \u00B7 ${season.daysLeft} DAYS LEFT`;

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const headline = urgentCount > 0
    ? `${greeting}, ${firstName}. ${urgentCount} thing${urgentCount !== 1 ? 's' : ''} this week.`
    : `${greeting}, ${firstName}. You're all caught up.`;

  return (
    <div className="bg-navy rounded-2xl p-6 md:p-8 relative overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
        {/* Left side */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white/50 tracking-widest mb-2">
            {seasonLine}
          </p>
          <h1 className="font-display text-xl md:text-2xl text-white leading-snug mb-4">
            {headline}
          </h1>

          {/* Milestone pills */}
          {season.milestones.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {season.milestones.map((ms) => (
                <MilestonePill key={ms.id} ms={ms} />
              ))}
            </div>
          )}
        </div>

        {/* Right side: Health ring or setup placeholder */}
        <div className="relative shrink-0 flex items-start justify-center" ref={popoverRef}>
          {isSetup ? (
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-4" style={{ padding: '14px 18px', background: '#ffffff', borderRadius: 14, border: '1px solid #e3e8ee' }}>
                <div className="flex flex-col items-end">
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4b5a6b' }}>Board Health</span>
                  <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 34, fontWeight: 700, lineHeight: 1, color: '#8fa0b3' }}>&ndash;&ndash;</span>
                </div>
                <p style={{ fontSize: 12, maxWidth: 160, lineHeight: 1.4, color: '#4b5a6b', margin: 0 }}>
                  Scores once the units and the first close are in.
                </p>
              </div>
            </div>
          ) : (
            <>
              <HealthRing score={health.score} onInfoClick={() => setHealthOpen(!healthOpen)} />
              {healthOpen && (
                <HealthBreakdownPopover health={health} onClose={() => setHealthOpen(false)} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
