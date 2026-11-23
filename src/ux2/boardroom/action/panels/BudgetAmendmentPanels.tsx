import { useState } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { fmt } from '@/lib/formatters';
import { failed, motionText, moved, passed, type BudgetAmendmentData, type BudgetMove } from '@/lib/actions/budgetAmendment';
import { Button, Chip, Inner, KV, Why, Field, INPUT } from '../../../components';
import { todayIso } from '../../../runbook/adapters';
import { AREA, FORM, NOTE, money } from '../ActionShell';
import type { PanelProps } from '../RecordAction';

function Say({ r, patch, close }: PanelProps<BudgetAmendmentData>) {
  const getVariance = useFinancialStore(s => s.getBudgetVariance);
  useFinancialStore(s => s.budgetCategories); useFinancialStore(s => s.generalLedger);
  const lines = getVariance();
  const [lineId, setLineId] = useState(r.data.lineId);
  const [why, setWhy] = useState(r.data.why);
  const [amounts, setAmounts] = useState<Record<string, string>>(Object.fromEntries(r.data.moves.map(m => [m.fromId, String(m.amount)])));
  const line = lines.find(l => l.id === lineId);
  const sources = lines.filter(l => l.id !== lineId && l.variance > 0);
  const moves: BudgetMove[] = sources.map(l => ({ fromId: l.id, fromName: l.name, amount: Math.min(money(amounts[l.id] ?? ''), l.variance) })).filter(m => m.amount > 0);
  const total = moves.reduce((t, m) => t + m.amount, 0);
  if (r.data.vote.on || r.data.leaveOver) return <Inner><KV label="Line">{r.data.lineName}</KV><KV label="Why">{r.data.why}</KV>{r.data.leaveOver ? <KV label="Decision">Left over; nothing moved</KV> : r.data.moves.map(m => <KV key={m.fromId} label={`From ${m.fromName}`}>{fmt(m.amount)}</KV>)}</Inner>;
  return (
    <>
      <div className={FORM}>
        <Field label="The line that needs more" className="w-[280px]"><select value={lineId} onChange={e => setLineId(e.target.value)} className={INPUT}><option value="">Choose</option>{lines.map(l => <option key={l.id} value={l.id}>{l.name}{l.variance < 0 ? ` · ${fmt(-l.variance)} over` : ''}</option>)}</select></Field>
        <Field label="Why" className="min-w-[260px] flex-1"><input value={why} onChange={e => setWhy(e.target.value)} placeholder="October water leak; a colder February" className={INPUT} /></Field>
      </div>
      {line && <Inner><KV label="Budget">{fmt(line.budgeted)}</KV><KV label="Spent so far this year">{fmt(line.actual)}</KV><KV label="Standing">{line.variance < 0 ? <Chip tone="red">{fmt(-line.variance)} over</Chip> : <Chip tone="sage">{fmt(line.variance)} left</Chip>}</KV></Inner>}
      {line && (
        <Inner className="flex flex-col gap-2">
          <b className="text-xs font-semibold text-ux2-ink">Where it could come from · lines with room left</b>
          {sources.length === 0 && <span className="text-sm text-ux2-muted">No other line has room left this year.</span>}
          {sources.map(l => (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-ux2-ink"><span>{l.name} <span className="text-xs text-ux2-muted">· {fmt(l.variance)} room of {fmt(l.budgeted)}</span></span><input aria-label={`Move from ${l.name}`} inputMode="decimal" value={amounts[l.id] ?? ''} onChange={e => setAmounts(a => ({ ...a, [l.id]: e.target.value }))} placeholder="$0" className={`${INPUT} w-[120px]`} /></div>
          ))}
          <div className="flex justify-between border-t border-ux2-line pt-2 text-sm font-semibold text-ux2-ink"><span>Moved to {line.name}</span><span>{fmt(total)}</span></div>
        </Inner>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!line || !why.trim() || total <= 0} onClick={() => { const d = { ...r.data, lineId, lineName: line!.name, why: why.trim(), moves }; patch({ lineId, lineName: line!.name, why: why.trim(), moves, motion: motionText(d) }); }}>Save and write the motion</Button>
        <Button size="sm" variant="ghost" disabled={!line || !why.trim()} onClick={() => { patch({ lineId, lineName: line!.name, why: why.trim(), moves: [], leaveOver: true }); close(todayIso()); }}>Leave the line over, with this reason</Button>
      </div>
      <Why>Only lines with money left this year are offered, and no more than each has left. Leaving a line over is a decision too, and is kept with its reason.</Why>
    </>
  );
}

function Vote({ r, patch, step }: PanelProps<BudgetAmendmentData>) {
  const [motion, setMotion] = useState(r.data.motion || motionText(r.data));
  const [on, setOn] = useState(todayIso());
  const [yes, setYes] = useState('');
  const [no, setNo] = useState('0');
  if (r.data.vote.on) return <Inner><KV label="Motion">{r.data.motion}</KV><KV label="Vote">{passed(r.data) ? <Chip tone="sage">Passed</Chip> : <Chip tone="red">Failed</Chip>} {r.data.vote.inFavor} to {r.data.vote.against} on {r.data.vote.on}</KV></Inner>;
  return (
    <>
      <Field label="The motion, as it goes on the agenda"><textarea aria-label="The motion" rows={3} value={motion} onChange={e => setMotion(e.target.value)} className={AREA} /></Field>
      <div className={FORM}>
        <Field label="Voted on" className="w-[170px]"><input type="date" value={on} max={todayIso()} onChange={e => setOn(e.target.value)} className={INPUT} /></Field>
        <Field label="In favour" className="w-[110px]"><input inputMode="numeric" value={yes} onChange={e => setYes(e.target.value)} className={INPUT} /></Field>
        <Field label="Against" className="w-[110px]"><input inputMode="numeric" value={no} onChange={e => setNo(e.target.value)} className={INPUT} /></Field>
        <Button size="sm" disabled={!!step.waitsOn || !on || yes === ''} onClick={() => patch({ motion: motion.trim(), vote: { on, inFavor: Math.max(0, Number(yes) || 0), against: Math.max(0, Number(no) || 0) } })}>Record the vote</Button>
      </div>
      <Why>The vote is taken at a board meeting and recorded here from the minutes. If it passes, the budget lines change by themselves.</Why>
    </>
  );
}

function Tell({ r, patch, step }: PanelProps<BudgetAmendmentData>) {
  const total = useFinancialStore(s => s.budgetCategories).reduce((t, c) => t + c.budgeted, 0);
  const share = total > 0 ? (moved(r.data) / total) * 100 : 0;
  if (failed(r.data)) return <Inner className="text-sm text-ux2-muted">The motion failed, so there is nothing to tell owners.</Inner>;
  if (r.data.ownersNotice) return <Inner className="text-sm text-ux2-ink">{r.data.ownersNotice === 'sent' ? `Owners were told on ${r.data.ownersNoticeOn}.` : 'The bylaws do not ask for owners to be told of this change.'}</Inner>;
  return (
    <>
      <p className={NOTE}>This moves {fmt(moved(r.data))}, {share.toFixed(1)}% of the year's budget, between lines. The total budget and owners' dues do not change.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!!step.waitsOn} onClick={() => patch({ ownersNotice: 'sent', ownersNoticeOn: todayIso() })}>Owners were told today</Button>
        <Button size="sm" variant="ghost" disabled={!!step.waitsOn} onClick={() => patch({ ownersNotice: 'not-needed' })}>The bylaws do not ask for it</Button>
      </div>
      <Why>Check the bylaws: some ask for owners to be told when the budget changes by more than a set share. Either answer is recorded.</Why>
    </>
  );
}

function Apply({ r }: PanelProps<BudgetAmendmentData>) {
  const d = r.data;
  return (
    <>
      <Inner>{d.moves.map(m => <KV key={m.fromId} label={m.fromName}>− {fmt(m.amount)}</KV>)}<KV label={d.lineName || 'Target line'}>+ {fmt(moved(d))}</KV><KV label="Standing">{d.appliedOn ? <Chip tone="sage">Budget changed {d.appliedOn}</Chip> : failed(d) ? <Chip tone="ghost">No change: the motion failed</Chip> : <Chip tone="amber">Waits on the vote</Chip>}</KV></Inner>
      <Why>The lines change once, when the vote passes. This action is the amendment's record: the motion, the vote and the amounts.</Why>
    </>
  );
}

export const BUDGET_AMENDMENT_PANELS = { say: Say, vote: Vote, tell: Tell, apply: Apply };
