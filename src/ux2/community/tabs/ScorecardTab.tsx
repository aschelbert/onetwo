/**
 * Community › PM scorecard (Property Manager Seat). The board rates the
 * manager each quarter in five categories; everyone in the building sees
 * the result. Reviews are written and deleted through `useScorecardStore`,
 * the same store and tables as before.
 */
import { useMemo, useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useScorecardStore } from '@/store/useScorecardStore';
import { getActiveTenantId } from '@/lib/supabase';
import type { Category, CategoryRatings } from '@/lib/services/scorecard';
import { cn } from '@/lib/formatters';
import { Button, Card, Chip, Inner, PillTabs, SectionLabel, Tile, TileRow } from '../../components';
import { band, CATEGORIES, categoryAverages, deriveOverall, lowestCategory, overallOf, periodsFor, trend, ttm } from '../scorecard';

function StarText({ score }: { score: number }) {
  const n = Math.round(score);
  return <span className="tracking-[0.1em] text-ux2-amber" aria-label={`${score} of 5`}>{'★'.repeat(n)}<span className="text-ux2-line">{'★'.repeat(5 - n)}</span></span>;
}

function StarPicker({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <span className="inline-flex gap-0.5" role="radiogroup" aria-label={`${label} rating`}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${label} ${n} of 5`} onClick={() => onChange(n)} className={cn('text-xl leading-none', n <= value ? 'text-ux2-amber' : 'text-ux2-line hover:text-ux2-amber/60')}>★</button>
      ))}
    </span>
  );
}

function Bar({ value, max = 5, tone }: { value: number; max?: number; tone: 'teal' | 'amber' | 'red' | 'ghost' }) {
  const fill = { teal: 'bg-ux2-teal', amber: 'bg-ux2-amber', red: 'bg-ux2-red', ghost: 'bg-ux2-line' }[tone];
  return <div className="h-2 w-full overflow-hidden rounded-full bg-ux2-surface"><div className={cn('h-full rounded-full', fill)} style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} /></div>;
}

const emptyRatings = (): CategoryRatings => Object.fromEntries(CATEGORIES.map(c => [c.key, { score: 0, notes: '' }])) as CategoryRatings;

export default function ScorecardTab({ isBoard, today }: { isBoard: boolean; today: string }) {
  const reviews = useScorecardStore(s => s.reviews);
  const addReview = useScorecardStore(s => s.addReview);
  const deleteReview = useScorecardStore(s => s.deleteReview);
  const company = useBuildingStore(s => s.management.company);
  const me = useAuthStore(s => s.currentUser);
  const periods = useMemo(() => periodsFor(reviews, today), [reviews, today]);
  const rows = useMemo(() => trend(reviews, periods), [reviews, periods]);
  const [chosen, setChosen] = useState<string | null>(null);
  const period = chosen ?? rows.find(r => r.count > 0)?.period ?? periods[0];
  const row = rows.find(r => r.period === period) ?? rows[0];
  const periodReviews = reviews.filter(r => r.period === period);
  const avgs = useMemo(() => categoryAverages(periodReviews), [periodReviews]);
  const overall = overallOf(avgs);
  const trailing = ttm(rows);
  const low = lowestCategory(avgs);
  const scored = rows.filter(r => r.count > 0);

  const [writing, setWriting] = useState(false);
  const [ratings, setRatings] = useState<CategoryRatings>(emptyRatings);
  const [summary, setSummary] = useState('');
  const [strengths, setStrengths] = useState<string[]>(['']);
  const [improvements, setImprovements] = useState<string[]>(['']);
  const [open, setOpen] = useState<string | null>(null);
  const formOverall = deriveOverall(ratings);
  const setList = (which: 'strengths' | 'improvements', idx: number, value: string | null) => {
    const upd = (list: string[]) => value === null ? list.filter((_, i) => i !== idx) : list.map((s, i) => (i === idx ? value : s));
    if (which === 'strengths') setStrengths(upd); else setImprovements(upd);
  };
  const submit = () => {
    if (formOverall === 0 || !summary.trim()) return;
    addReview({
      period, overallRating: formOverall, summary: summary.trim(),
      strengths: strengths.map(s => s.trim()).filter(Boolean), improvements: improvements.map(s => s.trim()).filter(Boolean),
      categoryRatings: ratings, reviewedBy: me.name,
    }, getActiveTenantId() ?? undefined);
    setWriting(false); setRatings(emptyRatings()); setSummary(''); setStrengths(['']); setImprovements(['']);
  };

  const tone = overall >= 4 ? 'teal' : overall >= 3 ? 'grey' : overall > 0 ? 'red' : 'grey';

  return (
    <div className="flex flex-col gap-5" data-widget="pm-scorecard">
      <TileRow>
        <Tile tone={tone} label="This quarter" meta={period} value={overall > 0 ? overall.toFixed(1) : '—'} unit={overall > 0 ? '/ 5' : undefined} sub={overall > 0 ? `${band(overall).label} · ${periodReviews.length} review${periodReviews.length === 1 ? '' : 's'} · ${company || 'the manager'}` : `No review yet for ${period}${company ? ` · ${company}` : ''}`} className="min-h-[150px]" />
        <Tile tone="grey" label="Trailing year" value={trailing !== null ? trailing.toFixed(1) : '—'} unit={trailing !== null ? '/ 5' : undefined} sub={trailing !== null ? `Average of the last ${Math.min(4, scored.length)} scored quarter${Math.min(4, scored.length) === 1 ? '' : 's'}` : 'Scores build as quarters are reviewed'} className="min-h-[150px]" />
        <Tile tone="grey" label="Watch" value={low ? low.score.toFixed(1) : '—'} unit={low ? '/ 5' : undefined} sub={low ? `${low.label} is the lowest category this quarter` : 'Nothing rated yet'} className="min-h-[150px]" />
      </TileRow>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" aria-label="By category">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionLabel>By category · {period}</SectionLabel>
            <PillTabs size="filter" aria-label="Quarter" value={period} onChange={setChosen} tabs={periods.slice(0, 6).map(p => ({ id: p, label: p.replace('-', ' '), badge: rows.find(r => r.period === p)?.count || undefined }))} />
          </div>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {CATEGORIES.map(c => {
              const v = avgs[c.key];
              const b = band(v);
              return (
                <li key={c.key} data-category={c.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 md:grid-cols-[200px_1fr_auto]">
                  <div><div className="text-sm font-semibold text-ux2-ink">{c.label}</div><div className="text-xs text-ux2-muted">{c.description}</div></div>
                  <div className="order-3 md:order-none md:col-auto col-span-2"><Bar value={v} tone={b.tone === 'teal' ? 'teal' : b.tone === 'amber' ? 'amber' : b.tone === 'red' ? 'red' : 'ghost'} /></div>
                  <div className="flex items-center gap-2 justify-self-end"><span className="text-sm font-semibold text-ux2-ink">{v > 0 ? v.toFixed(1) : '—'}</span><Chip tone={b.tone}>{b.label}</Chip></div>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card aria-label="Trend">
          <SectionLabel>Trend · by quarter</SectionLabel>
          {scored.length === 0 ? <p className="text-sm text-ux2-muted">No quarter has been reviewed yet.</p> : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {scored.map(r => (
                <li key={r.period}>
                  <button type="button" onClick={() => setChosen(r.period)} className={cn('flex w-full items-center gap-3 rounded-[12px] border px-3 py-2 text-left', r.period === period ? 'border-ux2-teal bg-ux2-teal-tint' : 'border-ux2-line bg-white hover:bg-ux2-surface')}>
                    <span className="w-16 shrink-0 text-xs font-semibold text-ux2-ink">{r.period.replace('-', ' ')}</span>
                    <span className="flex-1"><Bar value={r.overall} tone={band(r.overall).tone === 'teal' ? 'teal' : band(r.overall).tone === 'amber' ? 'amber' : 'red'} /></span>
                    <span className="w-8 text-right text-sm font-semibold text-ux2-ink">{r.overall.toFixed(1)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Inner className="text-xs text-ux2-muted">A review's score is the mean of its rated categories; a quarter's is the mean of its reviews. The trailing year averages the last four scored quarters.</Inner>
        </Card>
      </div>

      <Card aria-label="Reviews">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>Reviews · {period} · {periodReviews.length}</SectionLabel>
          {isBoard && !writing && <Button size="sm" onClick={() => setWriting(true)}>Write a review</Button>}
        </div>

        {writing && (
          <Inner aria-label="Write a review" className="flex flex-col gap-4 border-ux2-teal">
            <div className="text-sm font-semibold text-ux2-ink">Review {company || 'the manager'} for {period.replace('-', ' ')}</div>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {CATEGORIES.map(c => (
                <li key={c.key} className="grid grid-cols-1 gap-1.5 md:grid-cols-[200px_auto_1fr] md:items-center md:gap-3">
                  <div><div className="text-sm font-semibold text-ux2-ink">{c.label}</div><div className="text-xs text-ux2-muted">{c.description}</div></div>
                  <StarPicker label={c.label} value={ratings[c.key]?.score ?? 0} onChange={v => setRatings(r => ({ ...r, [c.key]: { score: v, notes: r[c.key]?.notes ?? '' } }))} />
                  <input aria-label={`${c.label} notes`} value={ratings[c.key]?.notes ?? ''} onChange={e => setRatings(r => ({ ...r, [c.key]: { score: r[c.key]?.score ?? 0, notes: e.target.value } }))} placeholder="A line on why" className="h-9 rounded-xl border border-ux2-line bg-white px-3 text-sm text-ux2-ink" />
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2 text-sm"><span className="text-ux2-muted">Overall</span>{formOverall > 0 ? <><StarText score={formOverall} /><b className="text-ux2-ink">{formOverall}</b></> : <span className="text-ux2-dim">rate the categories above</span>}</div>
            <label className="flex flex-col gap-1 text-xs font-semibold text-ux2-muted">Summary
              <textarea aria-label="Summary" value={summary} onChange={e => setSummary(e.target.value)} rows={3} placeholder="How the quarter went, in a few lines" className="rounded-xl border border-ux2-line bg-white px-3 py-2 text-sm font-normal text-ux2-ink" />
            </label>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {([['strengths', 'Strengths', strengths], ['improvements', 'To improve', improvements]] as const).map(([which, label, list]) => (
                <div key={which} className="flex flex-col gap-1.5">
                  <div className="text-xs font-semibold text-ux2-muted">{label}</div>
                  {list.map((s, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <input aria-label={`${label} ${idx + 1}`} value={s} onChange={e => setList(which, idx, e.target.value)} placeholder={which === 'strengths' ? 'What went well' : 'What should change'} className="h-9 min-w-0 flex-1 rounded-xl border border-ux2-line bg-white px-3 text-sm text-ux2-ink" />
                      {list.length > 1 && <button type="button" aria-label={`Remove ${label.toLowerCase()} ${idx + 1}`} onClick={() => setList(which, idx, null)} className="text-ux2-dim hover:text-ux2-ink">×</button>}
                    </div>
                  ))}
                  <button type="button" onClick={() => (which === 'strengths' ? setStrengths(l => [...l, '']) : setImprovements(l => [...l, '']))} className="self-start text-xs font-semibold text-ux2-teal hover:underline">+ Add another</button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={submit} disabled={formOverall === 0 || !summary.trim()}>Submit review</Button>
              <Button variant="ghost" onClick={() => setWriting(false)}>Cancel</Button>
              <span className="text-xs text-ux2-muted">Signed {me.name}</span>
            </div>
          </Inner>
        )}

        {periodReviews.length === 0 ? (
          <p className="text-sm text-ux2-muted">No review for {period.replace('-', ' ')} yet.{isBoard ? ' Write the first one above.' : ''}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {periodReviews.map(r => {
              const expanded = open === r.id;
              return (
                <li key={r.id} data-review={r.id}>
                  <Inner className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-center gap-2"><StarText score={r.overallRating} /><span className="text-sm font-semibold text-ux2-ink">{r.overallRating} / 5</span><Chip tone={band(r.overallRating).tone}>{band(r.overallRating).label}</Chip></div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setOpen(expanded ? null : r.id)} className="text-xs font-semibold text-ux2-teal hover:underline">{expanded ? 'Less' : 'Details'}</button>
                        {isBoard && <button type="button" onClick={() => { if (window.confirm('Delete this review?')) deleteReview(r.id); }} className="text-xs font-semibold text-ux2-red-ink hover:underline">Delete</button>}
                      </div>
                    </div>
                    <p className="m-0 text-sm text-ux2-ink">{r.summary}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {CATEGORIES.map(c => { const cr = r.categoryRatings?.[c.key]; return cr && cr.score > 0 ? <Chip key={c.key} tone={band(cr.score).tone}>{c.label} · {cr.score}</Chip> : null; })}
                    </div>
                    {expanded && (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <div className="text-xs font-semibold text-ux2-muted">By category</div>
                          <ul className="m-0 list-none p-0 text-xs text-ux2-ink">
                            {CATEGORIES.map(c => { const cr = r.categoryRatings?.[c.key as Category]; return cr && cr.score > 0 ? <li key={c.key} className="py-0.5"><b>{c.label} {cr.score}</b>{cr.notes ? ` · ${cr.notes}` : ''}</li> : null; })}
                          </ul>
                        </div>
                        <div className="flex flex-col gap-2">
                          {r.strengths.length > 0 && <div><div className="text-xs font-semibold text-ux2-sage">Strengths</div><ul className="m-0 list-disc pl-4 text-xs text-ux2-ink">{r.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
                          {r.improvements.length > 0 && <div><div className="text-xs font-semibold text-ux2-amber">To improve</div><ul className="m-0 list-disc pl-4 text-xs text-ux2-ink">{r.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
                        </div>
                      </div>
                    )}
                    <div className="text-[11px] text-ux2-dim">Reviewed by {r.reviewedBy}</div>
                  </Inner>
                </li>
              );
            })}
          </ul>
        )}
        <Inner className="text-xs text-ux2-muted">{isBoard ? 'Reviews are the board\'s record for the management contract: renewals, scope changes and, if it comes to it, a termination all start here.' : 'The board reviews the manager each quarter. The score is what the building gets for its management fee.'}</Inner>
      </Card>
    </div>
  );
}
