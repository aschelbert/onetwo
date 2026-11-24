import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { fmt } from '@/lib/formatters';
import { reviewFailed, reviewPassed, type ReserveReviewData } from '@/lib/actions/reserveReview';
import type { Level } from '@/lib/reservePlan';
import { Button, Chip, Inner, KV, Why, Field, INPUT } from '../../../components';
import { todayIso } from '../../../runbook/adapters';
import { dayLabel } from '../../../home/calendar';
import { FORM, NOTE } from '../ActionShell';
import type { PanelProps } from '../RecordAction';
import BoardVoteRoll from '../../tools/BoardVoteRoll';
import { recordCase } from '../../recordActions';
import { setAssumptions } from '../../reserves';
import { ComponentsEditor, LevelsView, usePlanDoc } from '../../../funds/reserves/ReserveViews';

function Components({ r, patch }: PanelProps<ReserveReviewData>) {
  const plan = usePlanDoc();
  const locked = !!r.data.vote.on || !!r.closedOn;
  return (
    <>
      {r.data.reason && <Inner className="text-xs text-ux2-muted">Opened by: {r.data.reason}</Inner>}
      <ComponentsEditor today={todayIso()} canEdit={!locked} a={plan.assumptions} />
      {r.data.changes.length > 0 && <Inner className="flex flex-col gap-1"><b className="text-xs font-semibold text-ux2-ink">Changed in this review</b>{r.data.changes.map((c, i) => <div key={i} className="flex flex-wrap justify-between gap-2 text-sm text-ux2-ink"><span><b className="font-semibold">{c.name}</b> · {c.what}</span><span className="text-xs text-ux2-muted">{dayLabel(c.on)} · {c.by} · {c.why}</span></div>)}</Inner>}
      {!locked && <div><Button size="sm" onClick={() => patch({ componentsOn: todayIso() })}>{r.data.componentsOn ? 'Confirm them again' : 'The components are right'}</Button></div>}
      <Why>The same table as Funds › Planning › Reserves: a change made in either place is recorded here. Changing a component after confirming asks for the list to be confirmed again.</Why>
    </>
  );
}

function Assumptions({ r, patch, step }: PanelProps<ReserveReviewData>) {
  const plan = usePlanDoc();
  const a = r.data.assumptionsOn && r.data.assumptions ? r.data.assumptions : plan.assumptions;
  const [inflation, setInflation] = useState(String(a.inflationPct));
  const [interest, setInterest] = useState(String(a.interestPct));
  const [growth, setGrowth] = useState(String(a.growthPct));
  const locked = !!r.data.vote.on || !!r.closedOn;
  const save = () => {
    const next = { inflationPct: Number(inflation) || 0, interestPct: Number(interest) || 0, growthPct: Number(growth) || 0 };
    setAssumptions(next);
    patch({ assumptions: next, assumptionsOn: todayIso() });
  };
  return (
    <>
      <div className={FORM}>
        <Field label="Costs rise by, % a year" className="w-[180px]"><input inputMode="decimal" disabled={locked} value={inflation} onChange={e => setInflation(e.target.value)} className={INPUT} /></Field>
        <Field label="Reserves earn, % a year" className="w-[180px]"><input inputMode="decimal" disabled={locked} value={interest} onChange={e => setInterest(e.target.value)} className={INPUT} /></Field>
        <Field label="Contribution grows by, % a year" className="w-[230px]"><input inputMode="decimal" disabled={locked} value={growth} onChange={e => setGrowth(e.target.value)} className={INPUT} /></Field>
        {!locked && <Button size="sm" disabled={!!step.waitsOn} onClick={save}>{r.data.assumptionsOn ? 'Update' : 'These are right'}</Button>}
      </div>
      <Why>Take them from the last reserve study unless the board has reason to change them. Three percent for costs and for the contribution, and two for interest, are common starting figures, not a forecast.</Why>
    </>
  );
}

function Pick({ r, patch, step }: PanelProps<ReserveReviewData>) {
  const plan = usePlanDoc();
  const annual = useFinancialStore(s => s.annualReserveContribution);
  const [effective, setEffective] = useState(r.data.effective);
  const [other, setOther] = useState('');
  const [text, setText] = useState(r.data.recommendation);
  const locked = !!r.data.vote.on || !!r.closedOn;
  const wording = (monthly: number, eff: ReserveReviewData['effective']) => `Set the reserve contribution at ${fmt(monthly)} a month ${eff === 'now' ? 'from now' : "from the start of next fiscal year"}.`;
  const pick = (l: Level) => { patch({ level: l.id, monthly: l.monthly, effective, recommendation: wording(l.monthly, effective) }); setText(wording(l.monthly, effective)); };
  return (
    <>
      {step.waitsOn && <p className={NOTE}>Confirm the components and the assumptions first: the levels are worked out from them.</p>}
      <LevelsView today={todayIso()} a={plan.assumptions} monthly={Math.round(annual / 12)} onPick={locked || step.waitsOn ? undefined : pick} pickLabel="Recommend" picked={r.data.level || undefined} />
      {!locked && !step.waitsOn && (
        <>
          <div className={FORM}>
            <Field label="Or another amount, a month" className="w-[210px]"><input inputMode="numeric" value={other} onChange={e => setOther(e.target.value)} placeholder="$" className={INPUT} /></Field>
            <Button size="sm" variant="ghost" disabled={!Number(other)} onClick={() => { const m = Math.round(Number(other)); patch({ level: 'other', monthly: m, effective, recommendation: wording(m, effective) }); setText(wording(m, effective)); }}>Recommend that</Button>
            <Field label="When it takes effect" className="w-[260px]"><select value={effective} onChange={e => { const eff = e.target.value as ReserveReviewData['effective']; setEffective(eff); if (r.data.level) { patch({ effective: eff, recommendation: wording(r.data.monthly, eff) }); setText(wording(r.data.monthly, eff)); } }} className={INPUT}><option value="next-year">With next year's budget</option><option value="now">Now, changing this year's transfer</option></select></Field>
          </div>
          {r.data.level && <div className={FORM}><Field label="The recommendation, as the board will read it" className="min-w-[280px] flex-1"><input value={text} onChange={e => setText(e.target.value)} onBlur={() => text.trim() && patch({ recommendation: text.trim() })} className={INPUT} /></Field></div>}
        </>
      )}
      {r.data.level && <Inner><KV label="Recommended">{fmt(r.data.monthly)} a month</KV><KV label="Takes effect">{r.data.effective === 'now' ? 'Now' : "With next year's budget"}</KV></Inner>}
      <Why>The same three levels show on Funds › Planning and in the annual budget action. This is the only place one is chosen, and nothing changes until the board's vote carries.</Why>
    </>
  );
}

function Vote({ r, patch, step }: PanelProps<ReserveReviewData>) {
  const cases = useIssuesStore(s => s.cases);
  const c = recordCase(cases, r);
  if (r.data.vote.on) return <Inner><KV label="Motion">{r.data.recommendation}</KV><KV label="Vote">{reviewPassed(r.data) ? <Chip tone="sage">Carried</Chip> : <Chip tone="red">Failed</Chip>} {r.data.vote.inFavor} to {r.data.vote.against} on {r.data.vote.on}</KV></Inner>;
  if (step.waitsOn || !c) return <p className={NOTE}>Recommend a level first.</p>;
  return (
    <>
      <Inner className="text-sm text-ux2-ink">{r.data.recommendation}</Inner>
      <BoardVoteRoll caseId={c.id} motion={r.data.recommendation} onClose={v => patch({ vote: { on: v.on, inFavor: v.inFavor, against: v.against } })} />
    </>
  );
}

function Effect({ r }: PanelProps<ReserveReviewData>) {
  const navigate = useNavigate();
  const d = r.data;
  return (
    <>
      <Inner><KV label="Contribution">{d.level ? `${fmt(d.monthly)} a month` : '—'}</KV><KV label="Standing">{d.appliedOn ? <Chip tone="sage">{d.effective === 'now' ? `In effect since ${d.appliedOn}` : `Set for next year on ${d.appliedOn}`}</Chip> : reviewFailed(d) ? <Chip tone="ghost">No change: the motion failed</Chip> : <Chip tone="amber">Waits on the vote</Chip>}</KV></Inner>
      <div><Button size="sm" variant="ghost" onClick={() => navigate('/funds?tab=planning&section=reserves')}>Open Funds › Planning › Reserves</Button></div>
      <Why>"Now" changes this year's monthly transfer to reserves from the next one posted. "With next year's budget" is held for the annual budget action, which reads it as its reserve line.</Why>
    </>
  );
}

export const RESERVE_REVIEW_PANELS = { components: Components, assumptions: Assumptions, level: Pick, vote: Vote, effect: Effect };
