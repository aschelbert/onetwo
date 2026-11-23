import { useState } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useCapitalProjectsStore } from '@/store/useCapitalProjectsStore';
import { useAuthStore } from '@/store/useAuthStore';
import { budgetLineAccounts } from '@/lib/ledger';
import { fmt } from '@/lib/formatters';
import { projectCost } from '@/lib/capitalProject';
import { MEASURES, blankPlan, contributionLevels, showMeasure, spread, type Measure, type Objective, type YearPlan } from '@/lib/caseTools';
import { Button, Card, Chip, Inner, KV, SectionLabel, Why, Field, INPUT } from '../../components';
import { todayIso } from '../../runbook/adapters';
import { useToolDoc } from './docs';
import { measuredNow } from './planNumbers';

const FORM = 'flex flex-wrap items-end gap-3';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function Objectives({ year }: { year: string }) {
  const me = useAuthStore(s => s.currentUser.name);
  const [plan, save] = useToolDoc<YearPlan>('objectives', year, blankPlan(year));
  const [measure, setMeasure] = useState<Measure>('reserve-funded');
  const [text, setText] = useState('');
  const [target, setTarget] = useState('');
  const now = measuredNow(year);
  const add = () => {
    const o: Objective = { id: 'o' + Date.now().toString(36), measure, text: text.trim() || MEASURES[measure].label, target: Number(target) || 0, result: null, note: '' };
    save({ objectives: [...plan.objectives, o], setOn: plan.setOn || todayIso() });
    setText(''); setTarget('');
  };
  return (
    <Inner className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm font-semibold text-ux2-ink">What the board is trying to do in the year starting {year}</b>{plan.setOn && <Chip tone="sage">{plan.objectives.length} set</Chip>}</div>
      {plan.objectives.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">{plan.objectives.map(o => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-ux2-ink"><span>{o.text}<span className="block text-xs text-ux2-muted">Target {MEASURES[o.measure].direction === 'at-most' ? 'at most' : 'at least'} {showMeasure(o.measure, o.target)}{now[o.measure] != null ? ' · today ' + showMeasure(o.measure, now[o.measure]!) : ''} · {MEASURES[o.measure].from}</span></span>{!plan.outcomeOn && <button type="button" onClick={() => save({ objectives: plan.objectives.filter(x => x.id !== o.id) })} className="text-xs font-semibold text-ux2-red-ink hover:underline">Remove</button>}</li>
        ))}</ul>
      )}
      {!plan.outcomeOn && (
        <div className={FORM}>
          <Field label="Measured by" className="w-[240px]"><select value={measure} onChange={e => setMeasure(e.target.value as Measure)} className={INPUT}>{(Object.keys(MEASURES) as Measure[]).map(m => <option key={m} value={m}>{MEASURES[m].label}</option>)}</select></Field>
          <Field label="In the board's words (optional)" className="min-w-[200px] flex-1"><input value={text} onChange={e => setText(e.target.value)} placeholder={MEASURES[measure].label} className={INPUT} /></Field>
          <Field label={'Target' + (MEASURES[measure].unit === 'pct' ? ', %' : MEASURES[measure].unit === 'usd' ? ', $' : '')} className="w-[130px]"><input inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} className={INPUT} /></Field>
          <Button size="sm" disabled={target === '' || (measure === 'custom' && !text.trim())} onClick={add}>Add the objective</Button>
        </div>
      )}
      <span className="text-xs text-ux2-muted">Set by {plan.setOn ? me + ' and the board' : 'the board'} once a year, when the money is decided. Owners read them on Building › Plan, and the year-end close reports the outcome against each.</span>
    </Inner>
  );
}

function ReserveContribution() {
  const items = useFinancialStore(s => s.reserveItems);
  const current = useFinancialStore(s => s.annualReserveContribution);
  const set = useFinancialStore(s => s.setAnnualReserveContribution);
  const levels = contributionLevels(items, current);
  return (
    <Inner className="flex flex-col gap-2">
      <b className="text-sm font-semibold text-ux2-ink">Pick the reserve contribution</b>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">{levels.map(l => (
        <button key={l.id} type="button" aria-pressed={current === l.amount} onClick={() => set(l.amount)} className={'rounded-[14px] border bg-white px-3.5 py-3 text-left ' + (current === l.amount ? 'border-ux2-navy' : 'border-ux2-line hover:border-ux2-line-strong')}>
          <span className="block text-xs text-ux2-muted">{l.label}</span><span className="block text-lg font-semibold text-ux2-ink">{fmt(l.amount)} a year</span><span className="block text-xs text-ux2-muted">{l.note}</span>
        </button>
      ))}</div>
      <span className="text-xs text-ux2-muted">Full funding is each reserve item's gap divided by the years it has left, added up. It does not allow for inflation or interest; a reserve study does.</span>
    </Inner>
  );
}

interface Spread { lines: Record<string, 'even' | 'seasonal'> }

function MonthlySpread({ year }: { year: string }) {
  const lines = useFinancialStore(s => s.budgetCategories);
  const chart = useFinancialStore(s => s.chartOfAccounts);
  const gl = useFinancialStore(s => s.generalLedger);
  const [doc, save] = useToolDoc<Spread>('budget-spread', year, { lines: {} });
  const lastYear = String(Number(year.slice(0, 4)) - 1);
  const shapeOf = (line: { id: string; name: string }) => {
    const accts = new Set(budgetLineAccounts(line, chart).map(a => a.num));
    const months = Array(12).fill(0) as number[];
    for (const e of gl) if (e.status !== 'void' && e.date.startsWith(lastYear) && accts.has(e.debitAcct)) months[Number(e.date.slice(5, 7)) - 1] += e.amount;
    return months;
  };
  return (
    <Inner className="flex flex-col gap-2">
      <b className="text-sm font-semibold text-ux2-ink">Spread each line by month</b>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-xs text-ux2-ink"><thead><tr><th className="py-1 text-left font-semibold text-ux2-muted">Line</th><th className="py-1 text-left font-semibold text-ux2-muted">Shape</th>{MONTHS.map(m => <th key={m} className="py-1 text-right font-semibold text-ux2-muted">{m}</th>)}</tr></thead>
        <tbody>{lines.map(l => { const shape = shapeOf(l); const has = shape.some(n => n > 0); const mode = doc.lines[l.id] === 'seasonal' && has ? 'seasonal' : 'even'; const months = spread(l.budgeted, mode === 'seasonal' ? shape : undefined);
          return <tr key={l.id} data-spread={l.id}><td className="py-1 pr-2 font-semibold">{l.name}<span className="block font-normal text-ux2-muted">{fmt(l.budgeted)}</span></td><td className="py-1 pr-2"><select aria-label={'Shape for ' + l.name} value={mode} onChange={e => save({ lines: { ...doc.lines, [l.id]: e.target.value as 'even' | 'seasonal' } })} className="rounded-[8px] border border-ux2-line-strong px-2 py-1"><option value="even">Even</option><option value="seasonal" disabled={!has}>As spent in {lastYear}</option></select></td>{months.map((n, i) => <td key={i} className="py-1 text-right tabular-nums">{n.toLocaleString('en-US')}</td>)}</tr>; })}</tbody></table></div>
      <span className="text-xs text-ux2-muted">A line that is spent unevenly (heating, snow, insurance) is compared month by month against the shape of last year's spending, so a January gas bill does not read as an overrun. Every row adds up to the line's yearly figure.</span>
    </Inner>
  );
}

function CapitalLines() {
  const projects = useCapitalProjectsStore(s => s.projects).filter(p => !p.closedOn);
  if (!projects.length) return null;
  return <Inner><b className="text-sm font-semibold text-ux2-ink">Capital lines · from open capital improvement actions</b>{projects.map(p => <KV key={p.id} label={p.title}>{projectCost(p) ? fmt(projectCost(p)) : 'Not costed yet'}</KV>)}</Inner>;
}

/** Annual budget: the year's objectives, the capital lines, the reserve contribution and the monthly spread. */
export default function BudgetTools({ year }: { year: string }) {
  return (
    <Card aria-label="Objectives, reserves and the monthly spread" className="gap-3">
      <SectionLabel>Before the lines are set · year starting {year}</SectionLabel>
      <Objectives year={year} />
      <CapitalLines />
      <ReserveContribution />
      <MonthlySpread year={year} />
      <Why>These sit beside the budget action's own steps: objectives first, then the capital work already decided, the reserve contribution, and how each line falls across the year.</Why>
    </Card>
  );
}
