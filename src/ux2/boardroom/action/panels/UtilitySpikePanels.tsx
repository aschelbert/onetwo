import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmt } from '@/lib/formatters';
import { monthLabel } from '@/lib/utilities';
import type { UtilitySpikeData } from '@/lib/actions/utilitySpike';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { Button, Inner, KV, Why, Field, INPUT } from '../../../components';
import { AREA, FORM, NOTE } from '../ActionShell';
import type { PanelProps } from '../RecordAction';
import { recordCase, startAction } from '../../recordActions';

const Facts = ({ d }: { d: UtilitySpikeData }) => (
  <Inner><KV label={`${d.meterName} · ${d.month ? monthLabel(d.month) : ''}`}>{d.use.toLocaleString('en-US')} {d.unit}</KV><KV label="Usual for the month">{d.usual.toLocaleString('en-US')} {d.unit}</KV><KV label="The bill">{fmt(d.cost)}</KV><KV label="Extra cost">{fmt(d.extraCost)}</KV></Inner>
);

function Confirm({ r, patch }: PanelProps<UtilitySpikeData>) {
  const [note, setNote] = useState(r.data.billNote);
  return (
    <>
      <Facts d={r.data} />
      {r.data.billRight ? <Inner className="text-sm text-ux2-ink">{r.data.billRight === 'yes' ? 'The bill is right: an actual read for a normal period.' : `The bill was wrong. ${r.data.billNote}`}</Inner> : (
        <>
          <Field label="If the bill is wrong, what is wrong with it"><input value={note} onChange={e => setNote(e.target.value)} placeholder="Estimated read; 38-day billing period; another building's meter" className={INPUT} /></Field>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => patch({ billRight: 'yes' })}>The bill is right</Button>
            <Button size="sm" variant="ghost" disabled={!note.trim()} onClick={() => patch({ billRight: 'no', billNote: note.trim() })}>The bill is wrong: close this</Button>
          </div>
        </>
      )}
      <Why>Check it is an actual read and not an estimate, that the billing period is about a month, and that it is this building's meter. A wrong bill is taken up with the utility, and corrected under Building › Utilities.</Why>
    </>
  );
}

function Cause({ r, patch, step }: PanelProps<UtilitySpikeData>) {
  const [cause, setCause] = useState(r.data.cause);
  const set = (i: number, c: Partial<UtilitySpikeData['checks'][number]>) => patch({ checks: r.data.checks.map((x, j) => (j === i ? { ...x, ...c } : x)) });
  return (
    <>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {r.data.checks.map((c, i) => (
          <li key={i}><Inner className="flex flex-wrap items-center gap-3"><label className="flex min-w-[240px] flex-1 items-start gap-2.5 text-sm text-ux2-ink"><input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={c.done} onChange={e => set(i, { done: e.target.checked })} /><span>{c.label}</span></label><input aria-label={`Note: ${c.label}`} defaultValue={c.note} onBlur={e => { if (e.target.value.trim() !== c.note) set(i, { note: e.target.value.trim(), done: c.done || !!e.target.value.trim() }); }} placeholder="What was seen" className={`${INPUT} min-w-[200px] flex-1`} /></Inner></li>
        ))}
      </ul>
      <Field label="What was found"><textarea aria-label="What was found" rows={2} value={cause} onChange={e => setCause(e.target.value)} className={AREA} /></Field>
      <div><Button size="sm" disabled={!!step.waitsOn || !cause.trim()} onClick={() => patch({ cause: cause.trim() })}>Save what was found</Button></div>
      <Why>The checklist is the one for this kind of meter. Not every line has to be checked: the step is done when the cause is written down.</Why>
    </>
  );
}

function Fix({ r, patch, step }: PanelProps<UtilitySpikeData>) {
  const navigate = useNavigate();
  const records = useActionRecordsStore(s => s.records);
  const cases = useIssuesStore(s => s.cases);
  const [why, setWhy] = useState(r.data.expectedWhy);
  const repair = records.find(x => x.id === r.data.repairId);
  if (r.data.outcome === 'repair') { const c = repair && recordCase(cases, repair); return <Inner className="flex flex-wrap items-center justify-between gap-2 text-sm text-ux2-ink"><span>A maintenance repair was opened for it{repair?.closedOn ? `, and closed ${repair.closedOn}` : ''}.</span>{c && <Button size="sm" variant="ghost" onClick={() => navigate(`/boardroom?view=case:${c.id}`)}>Open the repair</Button>}</Inner>; }
  if (r.data.outcome === 'expected') return <Inner className="text-sm text-ux2-ink">Expected: {r.data.expectedWhy}</Inner>;
  return (
    <>
      <Inner className="text-sm text-ux2-ink">Found: {r.data.cause || '—'}</Inner>
      <div className={FORM}>
        <Button size="sm" disabled={!!step.waitsOn} onClick={() => { const { recordId } = startAction('repair', `${r.data.meterName}: ${r.data.cause}`.slice(0, 90), { what: r.data.cause, from: `Utility spike · ${r.title}` }); patch({ outcome: 'repair', repairId: recordId }); }}>Open a repair for it</Button>
        <Field label="Or, why it was expected" className="min-w-[240px] flex-1"><input value={why} onChange={e => setWhy(e.target.value)} placeholder="Pool refilled after resurfacing" className={INPUT} /></Field>
        <Button size="sm" variant="ghost" disabled={!!step.waitsOn || !why.trim()} onClick={() => patch({ outcome: 'expected', expectedWhy: why.trim() })}>It was expected</Button>
      </div>
      <Why>A repair opens as its own maintenance repair action, with the cause already written in. Either way the reason stays with the month.</Why>
    </>
  );
}

function Next({ r }: PanelProps<UtilitySpikeData>) {
  const navigate = useNavigate();
  const d = r.data;
  return (
    <>
      {d.nextMonth ? <Inner><KV label={`${monthLabel(d.nextMonth)}`}>{d.nextUse.toLocaleString('en-US')} {d.unit}</KV><KV label="Against usual">{d.nextUse <= d.usual * 1.5 ? 'Back in range' : 'Still high: a new spike action opens for that month'}</KV></Inner> : <p className={NOTE}>Waiting on the next bill for {d.meterName}. Enter it under Building › Utilities and this closes.</p>}
      <div><Button size="sm" variant="ghost" onClick={() => navigate('/building?tab=utilities')}>Open Building › Utilities</Button></div>
      <Why>The next bill shows whether the fix worked. If it is still far above usual, that month opens its own action.</Why>
    </>
  );
}

export const UTILITY_SPIKE_PANELS = { confirm: Confirm, cause: Cause, fix: Fix, next: Next };
