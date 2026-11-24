import { useNavigate } from 'react-router-dom';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { fmt } from '@/lib/formatters';
import { blankPlan, met, outcomeLine, type YearPlan } from '@/lib/caseTools';
import { goalsFailed, goalsPassed, type GoalsData } from '@/lib/actions/goals';
import { Button, Chip, Inner, KV, Why } from '../../../components';
import { todayIso } from '../../../runbook/adapters';
import { NOTE } from '../ActionShell';
import type { PanelProps } from '../RecordAction';
import BoardVoteRoll from '../../tools/BoardVoteRoll';
import GoalsEditor from '../../tools/GoalsEditor';
import { useToolDoc } from '../../tools/docs';
import { recordCase } from '../../recordActions';
import { standingNow } from '../../reserves';

const yearBefore = (year: string) => `${Number(year.slice(0, 4)) - 1}${year.slice(4)}`;

function Last({ r, patch }: PanelProps<GoalsData>) {
  const [last] = useToolDoc<YearPlan>('objectives', yearBefore(r.data.year), blankPlan(yearBefore(r.data.year)));
  return (
    <>
      {last.objectives.length === 0 ? <Inner className="text-sm text-ux2-muted">No goals were set for the year before, so there is no outcome to read. This is the first year.</Inner> : (
        <Inner>{last.objectives.map(o => <KV key={o.id} label={outcomeLine(o)}>{met(o) == null ? <Chip tone="ghost">No result yet</Chip> : <Chip tone={met(o) ? 'sage' : 'red'}>{met(o) ? 'Met' : 'Missed'}</Chip>}</KV>)}{last.objectives.some(o => o.note) && <p className="m-0 mt-2 text-xs text-ux2-muted">{last.objectives.filter(o => o.note).map(o => `${o.text}: ${o.note}`).join(' · ')}</p>}</Inner>
      )}
      {!r.data.reviewedLastOn && <div><Button size="sm" onClick={() => patch({ reviewedLastOn: todayIso() })}>Read: go on</Button></div>}
      <Why>Results come from the year-end close's outcome report. A year still running shows no result yet; the goals can be set before it ends.</Why>
    </>
  );
}

function Stand({ r, patch }: PanelProps<GoalsData>) {
  const fin = useFinancialStore();
  const st = standingNow();
  const variance = fin.getBudgetVariance();
  const over = variance.filter(v => v.variance < 0);
  const owed = fin.units.reduce((t, u) => t + Math.max(0, u.balance), 0);
  const yearDues = fin.units.reduce((t, u) => t + u.monthlyFee * 12, 0);
  return (
    <>
      <Inner>
        <KV label="Reserves">{st.pct == null ? 'No components listed' : `${st.pct}% funded`}{st.short ? ` · short in ${st.short.year} at today's contribution` : ''}</KV>
        <KV label="This year's budget">{over.length ? `${over.length} line${over.length === 1 ? '' : 's'} over: ${over.slice(0, 3).map(v => `${v.name} by ${fmt(-v.variance)}`).join(', ')}` : 'Every line inside its budget'}</KV>
        <KV label="Dues owed">{fmt(owed)}{yearDues > 0 ? ` · ${Math.round((owed / yearDues) * 1000) / 10}% of a year's dues` : ''}</KV>
        <KV label="Replacements inside five years">{st.comps.filter(c => c.replaceYear - Number(todayIso().slice(0, 4)) <= 5).map(c => `${c.name} ${c.replaceYear}`).join(', ') || 'None'}</KV>
      </Inner>
      {!r.data.stoodOn && <div><Button size="sm" onClick={() => patch({ stoodOn: todayIso() })}>Read: go on</Button></div>}
      <Why>Read from the app's own records as of today, so the goals start from where the building is.</Why>
    </>
  );
}

function Pick({ r, patch }: PanelProps<GoalsData>) {
  const locked = !!r.data.vote.on || !!r.closedOn;
  return (
    <>
      <GoalsEditor year={r.data.year} lastYear={yearBefore(r.data.year)} locked={locked} />
      {!locked && <div><Button size="sm" disabled={r.data.goalCount === 0} onClick={() => patch({ sentOn: todayIso() })}>{r.data.sentOn ? 'Send the changed list to the board' : 'Send to the board for a vote'}</Button></div>}
      <Why>A goal measured by something the app keeps needs no reporting later. A longer target carries a year, and the five-year outlook under Funds › Planning shows whether today's decisions reach it.</Why>
    </>
  );
}

function Vote({ r, patch, step }: PanelProps<GoalsData>) {
  const cases = useIssuesStore(s => s.cases);
  const [plan] = useToolDoc<YearPlan>('objectives', r.data.year, blankPlan(r.data.year));
  const c = recordCase(cases, r);
  const motion = `Adopt ${plan.objectives.length} goal${plan.objectives.length === 1 ? '' : 's'} for the fiscal year starting ${r.data.year}: ${plan.objectives.map(o => o.text).join('; ')}.`;
  if (r.data.vote.on) return <Inner><KV label="Vote">{goalsPassed(r.data) ? <Chip tone="sage">Adopted</Chip> : <Chip tone="red">Not adopted</Chip>} {r.data.vote.inFavor} to {r.data.vote.against} on {r.data.vote.on}</KV></Inner>;
  if (step.waitsOn || !c) return <p className={NOTE}>Send the goals to the board first.</p>;
  return (
    <>
      <Inner className="text-sm text-ux2-ink">{motion}</Inner>
      <BoardVoteRoll caseId={c.id} motion={motion} onClose={v => patch({ vote: { on: v.on, inFavor: v.inFavor, against: v.against } })} />
      <Why>Once adopted, the goals are fixed for the year. A change later is a new vote in another goals action.</Why>
    </>
  );
}

function Tell({ r }: PanelProps<GoalsData>) {
  const navigate = useNavigate();
  const d = r.data;
  return (
    <>
      <Inner><KV label="Standing">{d.publishedOn ? <Chip tone="sage">On Building › Goals since {d.publishedOn}</Chip> : goalsFailed(d) ? <Chip tone="ghost">Not adopted: nothing published</Chip> : <Chip tone="amber">Waits on the vote</Chip>}</KV></Inner>
      <div><Button size="sm" variant="ghost" onClick={() => navigate('/building?tab=plan')}>Open Building › Goals</Button></div>
      <Why>Adopted goals show to every owner on Building › Goals. Include them in the budget notice; the year-end close then reports the outcome against each.</Why>
    </>
  );
}

export const GOALS_PANELS = { last: Last, stand: Stand, pick: Pick, vote: Vote, tell: Tell };
