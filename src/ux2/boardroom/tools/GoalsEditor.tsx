import { useState } from 'react';
import { MEASURES, blankPlan, met, showMeasure, type Measure, type Objective, type YearPlan } from '@/lib/caseTools';
import { Button, Chip, Inner, Field, INPUT } from '../../components';
import { todayIso } from '../../runbook/adapters';
import { useToolDoc } from './docs';
import { measuredNow } from './planNumbers';

const FORM = 'flex flex-wrap items-end gap-3';
const bound = (m: Measure) => (MEASURES[m].direction === 'at-most' ? 'at most' : 'at least');
const unit = (m: Measure) => (MEASURES[m].unit === 'pct' ? ', %' : MEASURES[m].unit === 'usd' ? ', $' : '');

/** One line for a goal: its target, any longer target, and where it stands today from the app's own records. */
export function goalLine(o: Objective, now: Partial<Record<Measure, number>>): string {
  const long = o.longTarget != null && o.longBy ? ` · ${showMeasure(o.measure, o.longTarget)} by ${o.longBy}` : '';
  const today = now[o.measure] != null ? ` · today ${showMeasure(o.measure, now[o.measure]!)}` : '';
  return `Target ${bound(o.measure)} ${showMeasure(o.measure, o.target)}${long}${today}`;
}

/**
 * The year's goals, editable until the board has voted them: add one, change
 * a target, give it a longer target with a year, or drop it. Last year's
 * goals can be carried forward with their results beside them.
 */
export default function GoalsEditor({ year, lastYear, locked }: { year: string; lastYear?: string; locked?: boolean }) {
  const [plan, save] = useToolDoc<YearPlan>('objectives', year, blankPlan(year));
  const [last] = useToolDoc<YearPlan>('objectives', lastYear ?? '', blankPlan(lastYear ?? ''));
  const [measure, setMeasure] = useState<Measure>('reserve-funded');
  const [text, setText] = useState('');
  const [target, setTarget] = useState('');
  const [longTarget, setLongTarget] = useState('');
  const [longBy, setLongBy] = useState('');
  const now = measuredNow(year);
  const frozen = locked || !!plan.adoptedOn || !!plan.outcomeOn;
  const put = (objectives: Objective[]) => save({ objectives, setOn: plan.setOn || todayIso() });
  const add = () => {
    put([...plan.objectives, { id: 'o' + Date.now().toString(36), measure, text: text.trim() || MEASURES[measure].label, target: Number(target) || 0, result: null, note: '', longTarget: longTarget === '' ? null : Number(longTarget) || 0, longBy: longTarget === '' ? '' : longBy.trim() }]);
    setText(''); setTarget(''); setLongTarget(''); setLongBy('');
  };
  const set = (id: string, c: Partial<Objective>) => put(plan.objectives.map(o => (o.id === id ? { ...o, ...c } : o)));
  const carry = () => put([...plan.objectives, ...last.objectives.filter(o => !plan.objectives.some(x => x.measure === o.measure && x.text === o.text)).map((o, i) => ({ ...o, id: 'o' + Date.now().toString(36) + i, result: null, note: '' }))]);
  const carriable = !frozen && last.objectives.some(o => !plan.objectives.some(x => x.measure === o.measure && x.text === o.text));
  return (
    <div className="flex flex-col gap-3" data-goals={year}>
      {carriable && <Inner className="flex flex-wrap items-center justify-between gap-2 text-sm text-ux2-ink"><span>Last year had {last.objectives.length} goal{last.objectives.length === 1 ? '' : 's'}{last.outcomeOn ? `, ${last.objectives.filter(o => met(o)).length} met` : ''}.</span><Button size="sm" variant="ghost" onClick={carry}>Carry them forward</Button></Inner>}
      {plan.objectives.length === 0 ? <Inner className="text-sm text-ux2-muted">No goals drafted for the year starting {year} yet.</Inner> : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {plan.objectives.map(o => (
            <li key={o.id} data-goal={o.id}><Inner className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm text-ux2-ink"><b className="font-semibold">{o.text}</b><span className="block text-xs text-ux2-muted">{goalLine(o, now)} · {MEASURES[o.measure].from}</span></span>{!frozen && <Button size="sm" variant="ghost" aria-label={`Drop ${o.text}`} onClick={() => put(plan.objectives.filter(x => x.id !== o.id))}>Drop</Button>}</div>
              {!frozen && (
                <div className={FORM}>
                  <Field label={`Target, ${bound(o.measure)}${unit(o.measure)}`} className="w-[170px]"><input key={`t${o.target}`} aria-label={`Target for ${o.text}`} inputMode="decimal" defaultValue={o.target} onBlur={e => { const n = Number(e.target.value) || 0; if (n !== o.target) set(o.id, { target: n }); }} className={INPUT} /></Field>
                  <Field label={`A longer target${unit(o.measure)} (optional)`} className="w-[210px]"><input key={`l${o.longTarget}`} aria-label={`Longer target for ${o.text}`} inputMode="decimal" defaultValue={o.longTarget ?? ''} onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value) || 0; if (v !== (o.longTarget ?? null)) set(o.id, { longTarget: v }); }} className={INPUT} /></Field>
                  <Field label="By the year" className="w-[120px]"><input key={`y${o.longBy}`} aria-label={`Year for the longer target of ${o.text}`} inputMode="numeric" defaultValue={o.longBy ?? ''} placeholder={String(Number(year.slice(0, 4)) + 3)} onBlur={e => { const v = e.target.value.trim(); if (v !== (o.longBy ?? '')) set(o.id, { longBy: v }); }} className={INPUT} /></Field>
                </div>
              )}
            </Inner></li>
          ))}
        </ul>
      )}
      {!frozen && (
        <Inner className="flex flex-col gap-2">
          <b className="text-xs font-semibold text-ux2-ink">Add a goal</b>
          <div className={FORM}>
            <Field label="Measured by" className="w-[240px]"><select value={measure} onChange={e => setMeasure(e.target.value as Measure)} className={INPUT}>{(Object.keys(MEASURES) as Measure[]).map(m => <option key={m} value={m}>{MEASURES[m].label}</option>)}</select></Field>
            <Field label="In the board's words (optional)" className="min-w-[200px] flex-1"><input value={text} onChange={e => setText(e.target.value)} placeholder={MEASURES[measure].label} className={INPUT} /></Field>
            <Field label={`Target, ${bound(measure)}${unit(measure)}`} className="w-[170px]"><input inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} className={INPUT} /></Field>
            <Field label="Longer target" className="w-[130px]"><input inputMode="decimal" value={longTarget} onChange={e => setLongTarget(e.target.value)} placeholder="Optional" className={INPUT} /></Field>
            <Field label="By the year" className="w-[110px]"><input inputMode="numeric" value={longBy} onChange={e => setLongBy(e.target.value)} className={INPUT} /></Field>
            <Button size="sm" disabled={target === '' || (measure === 'custom' && !text.trim())} onClick={add}>Add the goal</Button>
          </div>
          {now[measure] != null && <span className="text-xs text-ux2-muted">Today: {showMeasure(measure, now[measure]!)} · {MEASURES[measure].from}</span>}
        </Inner>
      )}
      {plan.adoptedOn && <Chip tone="sage" className="self-start">Adopted {plan.adoptedOn}</Chip>}
    </div>
  );
}
