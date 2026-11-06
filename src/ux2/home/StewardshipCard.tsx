/**
 * The stewardship card from the Home mock: navy, the radar on the first
 * page, one page per dimension behind it (score, bar, points, what was
 * counted, the rule), flipped with the arrows and the dots at the foot.
 */
import { useState } from 'react';
import { cn } from '@/lib/formatters';
import StewardshipRadar from '../components/StewardshipRadar';
import type { ScoreEvent, Scorecard } from '../score/stewardship';
import { bandFor, DIMENSIONS, WEIGHTS, type Dimension } from '../score/stewardship';

const RULES: Record<'board' | 'owners', Record<Dimension, string>> = {
  board: {
    Timeliness: 'Owner requests answered inside the 14-day window earn full credit; one left past it earns none.',
    Compliance: 'Filings on time earn full credit, half 1 to 7 days late, a quarter 8 to 30 days late. Duties count when they are marked done.',
    Oversight: 'A case closed earns credit; a case past its target date loses it.',
    Reach: 'Board meetings you were on the attendance list for, in person, remote or by proxy.',
    Impact: 'Spending decisions you cast a vote on, of the ones the board decided.',
  },
  owners: {
    Timeliness: 'Full credit on time, half 1 to 7 days late, a quarter 8 to 30 days. A payment plan counts as on time.',
    Compliance: 'Special assessments and invoices: full credit on time, half 1 to 7 days late, a quarter 8 to 30.',
    Oversight: 'Acknowledged over offered. Nothing offered means full credit.',
    Reach: 'Annual and special meetings attended, in person, remote or by proxy.',
    Impact: 'Ballots cast, of the elections your unit could vote in.',
  },
};

function lines(events: ScoreEvent[]): { label: string; value: string }[] {
  if (events.length === 0) return [{ label: 'Nothing scored yet', value: '—' }];
  const full = events.filter(e => e.earned >= e.available).length;
  const none = events.filter(e => e.earned === 0).length;
  const partial = events.length - full - none;
  const out = [{ label: 'Full credit', value: `${full} of ${events.length}` }];
  if (partial) out.push({ label: 'Partial credit', value: String(partial) });
  if (none) out.push({ label: 'No credit', value: String(none) });
  for (const e of [...events].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2)) out.push({ label: e.label, value: e.reason ?? `${e.earned} of ${e.available}` });
  return out;
}

export default function StewardshipCard({ you, events, buildingDims, buildingTotal, group, delta }: { you: Scorecard; events: ScoreEvent[]; buildingDims: number[]; buildingTotal: number; group: 'board' | 'owners'; delta?: number }) {
  const [page, setPage] = useState(0);
  const pages = DIMENSIONS.length + 1;
  const dim = page > 0 ? DIMENSIONS[page - 1] : null;
  const d = dim ? you.dimensions.find(x => x.dimension === dim) : null;
  const band = bandFor(you.total);
  return (
    <div data-widget="stewardship-radar" aria-label="Stewardship" className="flex flex-col gap-2.5 rounded-[22px] bg-ux2-navy px-[22px] pb-2 pt-5 text-white">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[2px]">Stewardship</div>
          <div className="mt-0.5 text-sm text-white/[0.55]">{dim ? `${dim} · ${WEIGHTS[dim]} of 100 points` : group === 'board' ? 'Your score as a board member, this year' : 'Your score as an owner, this year'}</div>
        </div>
        <span className="inline-flex items-center whitespace-nowrap rounded-full bg-[rgba(165,243,252,.16)] px-[11px] py-[6px] text-xs font-semibold leading-none text-ux2-cyan">{you.total >= 70 ? `✓ ${band === 'Excellent' || band === 'Good' ? 'Good standing' : 'Fair standing'}` : `${you.total} of 100`}</span>
      </div>

      {dim && d ? (
        <div className="flex min-h-[300px] flex-col justify-center gap-3" data-dimension={dim}>
          <div className="flex items-baseline justify-between"><div className="text-xl font-semibold">{dim}</div><div className="font-display text-5xl font-bold leading-none tracking-[-2px]">{d.pct}</div></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.12]"><i className="block h-full rounded-full bg-ux2-cyan" style={{ width: `${Math.max(0, Math.min(100, d.pct))}%` }} /></div>
          <div className="text-xs text-white/[0.45]">{Math.round(d.points * 10) / 10} of {d.weight} points · Building avg <b className="text-white">{buildingDims[page - 1] ?? 0}</b></div>
          <div className="flex flex-col gap-1.5 text-[13px] text-white/[0.7]">
            {lines(events.filter(e => e.dimension === dim)).map((l, i) => (
              <div key={i} className="flex justify-between gap-3"><span className="min-w-0 truncate">{l.label}</span><strong className="shrink-0 text-white">{l.value}</strong></div>
            ))}
          </div>
          <div className="text-xs leading-relaxed text-white/[0.45]">{RULES[group][dim]}</div>
        </div>
      ) : (
        <StewardshipRadar bare you={you.dimensions.map(x => x.pct)} total={you.total} buildingAvg={buildingDims} buildingTotal={buildingTotal} delta={delta} />
      )}

      <div className="flex items-center justify-center">
        <button type="button" aria-label="Previous page" onClick={() => setPage(p => (p + pages - 1) % pages)} className="grid h-10 w-10 place-items-center text-white/[0.5] hover:text-white">‹</button>
        {['Overview', ...DIMENSIONS].map((label, i) => (
          <button key={label} type="button" aria-label={label} aria-current={page === i ? 'page' : undefined} onClick={() => setPage(i)} className="grid h-10 w-[26px] place-items-center">
            <span className={cn('h-2 w-2 rounded-full', page === i ? 'bg-ux2-cyan' : 'bg-white/[0.25]')} />
          </button>
        ))}
        <button type="button" aria-label="Next page" onClick={() => setPage(p => (p + 1) % pages)} className="grid h-10 w-10 place-items-center text-white/[0.5] hover:text-white">›</button>
      </div>
    </div>
  );
}
