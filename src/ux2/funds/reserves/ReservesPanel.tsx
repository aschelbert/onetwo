import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useAuthStore } from '@/store/useAuthStore';
import { fmt } from '@/lib/formatters';
import { reserveStanding } from '@/lib/reservePlan';
import { stageOf } from '@/lib/actions';
import { Bar, Button, Card, Chip, Inner, KV, Why, Field, INPUT } from '../../components';
import { ensureReview } from '../../boardroom/reserves';
import { recordCase } from '../../boardroom/recordActions';
import { everyYears, lastStudyDate, addYears } from '../../boardroom/reserveStudy';
import { dayLabel } from '../../home/calendar';
import { ComponentsEditor, LevelsView, usePlanDoc, useReserveBalance } from './ReserveViews';

/**
 * Funds › Planning › Reserves: where the reserves stand, what they are for,
 * and the 30-year plan. The components are edited here; the contribution is
 * not, because it is the board's to vote: picking a level here hands it to
 * the reserve funding review.
 */
export default function ReservesPanel({ today }: { today: string }) {
  const navigate = useNavigate();
  const me = useAuthStore(s => s.currentUser);
  const isBoard = me.role !== 'RESIDENT';
  const items = useFinancialStore(s => s.reserveItems);
  const annual = useFinancialStore(s => s.annualReserveContribution);
  const studyDate = useFinancialStore(s => s.reserveStudyDate);
  const studyEvery = useFinancialStore(s => s.reserveStudyEveryYears);
  const setStudy = useFinancialStore(s => s.setReserveStudy);
  const records = useActionRecordsStore(s => s.records);
  const cases = useIssuesStore(s => s.cases);
  const plan = usePlanDoc();
  const balance = useReserveBalance();
  const st = reserveStanding(items, balance, annual, Number(today.slice(0, 4)), plan.assumptions);
  const review = records.find(r => r.kind === 'reserve-review' && !r.closedOn);
  const [date, setDate] = useState(studyDate ?? '');
  const [years, setYears] = useState(String(studyEvery || 3));
  const last = lastStudyDate();
  const openReview = (reason: string) => { const { caseId } = ensureReview(reason, today); if (caseId) navigate(`/boardroom?view=case:${caseId}`); };
  const reviewCase = review ? recordCase(cases, review) : undefined;

  return (
    <Card aria-label="Reserves" id="reserves" className="gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-lg font-medium text-ux2-ink">Reserves</h2>
        {isBoard && (review
          ? <Button size="sm" onClick={() => reviewCase && navigate(`/boardroom?view=case:${reviewCase.id}`)}>Open the review · {stageOf(review).split(' · ')[0].toLowerCase()}</Button>
          : <Button size="sm" onClick={() => openReview('Started from Funds › Planning')}>Start a reserve funding review</Button>)}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Inner className="flex flex-col gap-1.5" data-percent-funded={st.pct ?? ''}>
          <span className="text-xs font-semibold uppercase tracking-wider text-ux2-muted">Percent funded</span>
          <span className="text-[28px] font-semibold tracking-[-0.03em] text-ux2-ink">{st.pct == null ? '—' : `${st.pct}%`}</span>
          <Bar pct={Math.min(100, st.pct ?? 0)} tone={(st.pct ?? 0) < 50 ? 'red' : 'teal'} label={`${st.pct ?? 0} percent funded`} />
          <span className="text-xs text-ux2-muted">{fmt(balance)} in the reserve account against {fmt(st.shouldHave)} that should be set aside by now.</span>
        </Inner>
        <Inner className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-ux2-muted">Contribution</span>
          <span className="text-[28px] font-semibold tracking-[-0.03em] text-ux2-ink">{fmt(st.monthly)}<span className="text-sm font-medium text-ux2-muted"> a month</span></span>
          {plan.nextYearMonthly != null && <KV label="Next year, as voted">{fmt(plan.nextYearMonthly)} a month</KV>}
          <span className="text-xs text-ux2-muted">Changed by a board vote at the end of a reserve funding review.</span>
        </Inner>
        <Inner className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-ux2-muted">First year short</span>
          <span className="text-[28px] font-semibold tracking-[-0.03em] text-ux2-ink">{st.short ? st.short.year : 'None'}</span>
          <span className="text-xs text-ux2-muted">{st.short ? `At today's contribution the reserves are ${fmt(st.short.by)} short${st.short.what ? ` when ${st.short.what.toLowerCase()} is replaced` : ''}.` : st.comps.length ? 'No year in the 30-year plan runs short at today\'s contribution.' : 'Nothing to fund yet.'}</span>
        </Inner>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[17px] font-semibold text-ux2-ink">What the reserves are for</span>
        <ComponentsEditor today={today} canEdit={isBoard} a={plan.assumptions} />
      </div>

      {st.comps.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[17px] font-semibold text-ux2-ink">Funding plan, 30 years</span><span className="text-xs text-ux2-muted">Costs rise {plan.assumptions.inflationPct}% a year · reserves earn {plan.assumptions.interestPct}% · contribution grows {plan.assumptions.growthPct}%</span></div>
          <LevelsView today={today} a={plan.assumptions} monthly={st.monthly} onPick={isBoard ? l => openReview(`Contribution to ${fmt(l.monthly)} a month`) : undefined} pickLabel="Take to a review" />
        </div>
      )}

      {plan.changes.length > 0 && (
        <Inner className="flex flex-col gap-1" aria-label="Changes to components">
          <b className="text-xs font-semibold text-ux2-ink">Changes to components</b>
          {plan.changes.slice(0, 6).map((c, i) => <div key={i} className="flex flex-wrap justify-between gap-2 text-sm text-ux2-ink"><span><b className="font-semibold">{c.name}</b> · {c.what}</span><span className="text-xs text-ux2-muted">{dayLabel(c.on)} · {c.by} · {c.why}</span></div>)}
        </Inner>
      )}

      {isBoard && (
        <Inner className="flex flex-wrap items-end justify-between gap-3" aria-label="Reserve study">
          <div className="min-w-0"><div className="text-sm font-semibold text-ux2-ink">Reserve study · {last ? `last ${dayLabel(last)}, next due ${dayLabel(addYears(last, everyYears(studyEvery)))}` : 'none on record'}</div><p className="m-0 text-xs text-ux2-muted">A new study date opens a reserve funding review, so its figures are brought into the components above.</p></div>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Last study" className="w-[150px]"><input type="date" aria-label="Last reserve study" value={date} onChange={e => setDate(e.target.value)} className={INPUT} /></Field>
            <Field label="Lasts (years)" className="w-[110px]"><input inputMode="numeric" aria-label="Years a study lasts" value={years} onChange={e => setYears(e.target.value)} className={INPUT} /></Field>
            <Button size="sm" variant="ghost" onClick={() => setStudy(date || null, Number(years) || undefined)}>Save</Button>
          </div>
        </Inner>
      )}
      <Why>Percent funded here is the figure used everywhere else in the app. The plan replays each component's replacement in its year at its inflated cost, adds contributions and interest, and reports the first year the balance would go below zero. It keeps the board current between professional reserve studies; it does not replace one.</Why>
    </Card>
  );
}
