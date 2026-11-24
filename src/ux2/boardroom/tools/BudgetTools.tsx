import { useState } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useCapitalProjectsStore } from '@/store/useCapitalProjectsStore';
import { useAuthStore } from '@/store/useAuthStore';
import { budgetLineAccounts } from '@/lib/ledger';
import { fmt } from '@/lib/formatters';
import { projectCost } from '@/lib/capitalProject';
import { MEASURES, blankPlan, showMeasure, spread, type Measure, type Objective, type YearPlan } from '@/lib/caseTools';
import { Button, Card, Chip, Inner, KV, SectionLabel, Why, Field, INPUT } from '../../components';
import { todayIso } from '../../runbook/adapters';
import { useToolDoc } from './docs';
import { useNavigate } from 'react-router-dom';
import { ensureReview } from '../reserves';
import { startGoals } from '../goals';
import { goalLine } from './GoalsEditor';
import { LevelsView, usePlanDoc } from '../../funds/reserves/ReserveViews';
import { measuredNow } from './planNumbers';

const FORM = 'flex flex-wrap items-end gap-3';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function Objectives({ year }: { year: string }) {
  const navigate = useNavigate();
  const [plan] = useToolDoc<YearPlan>('objectives', year, blankPlan(year));
  const now = measuredNow(year);
  const open = () => { const { caseId } = startGoals(year); if (caseId) navigate(`/boardroom?view=case:${caseId}`); };
  return (
    <Inner className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm font-semibold text-ux2-ink">The year's goals</b><span className="flex items-center gap-2">{plan.adoptedOn ? <Chip tone="sage">Adopted {plan.adoptedOn}</Chip> : <Chip tone="amber">{plan.objectives.length ? 'Drafted, not adopted' : 'Not set'}</Chip>}<Button size="sm" variant="ghost" onClick={open}>Open the goals action</Button></span></div>
      {plan.objectives.map(o => <div key={o.id} className="text-sm text-ux2-ink">{o.text}<span className="block text-xs text-ux2-muted">{goalLine(o, now)}</span></div>)}
      <span className="text-xs text-ux2-muted">Goals come before the money. They are set and voted in their own action, which opens with this one; pick the dues once they are adopted, so each option can be checked against them.</span>
    </Inner>
  );
}

function ReserveContribution() {
  const navigate = useNavigate();
  const annual = useFinancialStore(st => st.annualReserveContribution);
  const plan = usePlanDoc();
  const today = todayIso();
  const take = (reason: string) => { const { caseId } = ensureReview(reason, today); if (caseId) navigate(`/boardroom?view=case:${caseId}`); };
  return (
    <Inner className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm font-semibold text-ux2-ink">The reserve contribution</b>{plan.nextYearMonthly != null ? <Chip tone="sage">Next year: {fmt(plan.nextYearMonthly)} a month · voted {plan.nextYearSetOn}</Chip> : <Chip tone="amber">Not set for next year</Chip>}</div>
      <LevelsView today={today} a={plan.assumptions} monthly={Math.round(annual / 12)} onPick={l => take(`Contribution to ${fmt(l.monthly)} a month, with the budget`)} pickLabel="Take to a review" />
      <span className="text-xs text-ux2-muted">The same three levels as Funds › Planning › Reserves. The level is chosen and voted in a reserve funding review; once it carries "with next year's budget", it shows here as the draft's reserve line.</span>
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
