import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { fmt } from '@/lib/formatters';
import { componentsOf, levels, type LevelId } from '@/lib/reservePlan';
import { OUTLOOK_YEARS, checkGoals, outlook, suggestedGrowth } from '@/lib/outlook';
import type { YearPlan } from '@/lib/caseTools';
import { Button, Card, Chip, Inner, Table, Th, Td, Why } from '../../components';
import { ensureReview } from '../../boardroom/reserves';
import { usePlanDoc, useReserveBalance } from '../reserves/ReserveViews';
import { savePlanning, usePlanningDoc } from './planningDoc';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useBudgetDraftStore } from '@/store/useBudgetDraftStore';
import { draftTotals } from '../../boardroom/budgetDraft';
import { fiscalLabel, nextFiscalYear } from '../../boardroom/fiscal';

/** The outlook's rows for a reserve level, from the stores. Shared with the Planning tile. */
export function useOutlook(today: string, level: LevelId = 'today') {
  const lines = useFinancialStore(s => s.budgetCategories);
  const units = useFinancialStore(s => s.units);
  const items = useFinancialStore(s => s.reserveItems);
  const annual = useFinancialStore(s => s.annualReserveContribution);
  const plan = usePlanDoc();
  const planning = usePlanningDoc();
  const balance = useReserveBalance();
  const year = Number(today.slice(0, 4));
  const comps = componentsOf(items, year, plan.assumptions);
  const all = levels(balance, Math.round(annual / 12), comps, year, plan.assumptions);
  const picked = all.find(l => l.id === level) ?? all[0];
  // Next year's draft, when the annual budget action has one: the outlook starts from it.
  const fiscalYearEnd = useBuildingStore(s => s.details?.fiscalYearEnd);
  const nextFy = nextFiscalYear(today, fiscalYearEnd);
  const draft = useBudgetDraftStore(s => s.drafts[nextFy.start]);
  const from = draft && draft.lines.length > 0 && !draft.switchedAt ? draft : undefined;
  const dt = from ? draftTotals(from) : null;
  // At "Today", the reserve line is what has been decided for next year: the draft's choice, else a review's vote, else today's.
  const decided = from?.reserve.choice ? Math.round(from.reserve.annual / 12) : plan.nextYearMonthly ?? null;
  const reserveMonthly = level === 'today' && decided != null ? decided : picked.monthly;
  const rows = outlook({
    next: from && dt ? {
      lines: from.lines.filter(l => !l.kind).map(l => ({ id: l.categoryId ?? l.id, name: l.name, budgeted: l.amount })),
      contingencyPct: from.contingencyPct ?? 0, capital: from.lines.filter(l => l.kind === 'capital').reduce((t, l) => t + l.amount, 0),
      duesMonthlyTotal: from.dues.option ? dt.monthly : undefined,
    } : undefined,
    year, lines: lines.map(l => ({ id: l.id, name: l.name, budgeted: l.budgeted })), rates: planning.rates,
    duesNow: units.reduce((t, u) => t + u.monthlyFee * 12, 0), units: units.length,
    reserveBalance: balance, reserveMonthly, reserveMonthlyNow: Math.round(annual / 12), comps, assumptions: plan.assumptions, loans: planning.loans,
  });
  return { rows, levels: all, picked, lines, planning, units: units.length, draft: from, draftLabel: from?.label ?? fiscalLabel(nextFy), decided: level === 'today' ? decided : null, growthLines: from ? from.lines.filter(l => !l.kind).map(l => ({ id: l.categoryId ?? l.id, name: l.name, budgeted: l.amount })) : lines.map(l => ({ id: l.id, name: l.name, budgeted: l.budgeted })) };
}

/**
 * Funds › Planning › Five-year outlook: where today's decisions lead. Worked
 * out, never typed: this year's budget grown line by line, the reserve
 * contribution at the level looked at, loan payments, and the replacements
 * falling due, with the goals checked against it.
 */
export default function OutlookPanel({ today }: { today: string }) {
  const navigate = useNavigate();
  const [level, setLevel] = useState<LevelId>('today');
  const { rows, levels: all, picked, lines, planning, draft, draftLabel, decided, growthLines } = useOutlook(today, level);
  const records = useActionRecordsStore(s => s.records);
  const year = Number(today.slice(0, 4));
  // The goals to check: the newest year's that the board has drafted or adopted.
  const goals = records.filter(r => r.kind === 'objectives').map(r => r.data as unknown as YearPlan).filter(p => p.objectives?.length).sort((a, b) => b.year.localeCompare(a.year))[0];
  const checks = goals ? checkGoals(rows, goals.objectives) : [];
  const short = rows.find(r => r.reservesEnd < 0);
  const setRate = (id: string, v: string) => { const n = Number(v); if (Number.isFinite(n)) savePlanning({ rates: { ...planning.rates, [id]: Math.max(-20, Math.min(50, n)) } }, today); };
  const cell = (f: (r: (typeof rows)[number]) => React.ReactNode) => rows.map(r => <Td key={r.year} num>{f(r)}</Td>);

  return (
    <Card aria-label="Five-year outlook" id="outlook" className="gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-lg font-medium text-ux2-ink">{year} to {year + OUTLOOK_YEARS} · where today's decisions lead</h2>
        <span className="flex flex-wrap gap-1.5" role="group" aria-label="Reserve level">{all.map(l => <button key={l.id} type="button" aria-pressed={level === l.id} onClick={() => setLevel(l.id)} className="rounded-full"><Chip tone={level === l.id ? 'navy' : 'ghost'}>{l.label} · {fmt(l.monthly)}</Chip></button>)}</span>
      </div>

      <Inner className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-ux2-ink" data-outlook-from={draft ? 'draft' : 'this-year'}>
        {draft
          ? <span><Chip tone="navy" className="mr-2">From the {draftLabel} draft</Chip>{year + 1} is the draft budget as it stands{draft.adoptedAt ? `, adopted ${draft.adoptedAt.slice(0, 10)}` : ', not yet adopted'}{draft.dues.option ? '' : '; its dues are not picked yet, so they are worked out from what has to be raised'}. Growth runs from the draft's lines.</span>
          : <span><Chip tone="ghost" className="mr-2">From this year's budget</Chip>There is no {draftLabel} draft yet, so every year grows from this year's lines. Once the annual budget action starts its draft, the outlook starts from that.</span>}
        {decided != null && <Chip tone="sage">Reserves at {fmt(decided)} a month from {year + 1}, as decided</Chip>}
      </Inner>

      {lines.length === 0 ? <Inner className="text-sm text-ux2-muted">There is no budget to look ahead from yet. Add this year's budget lines first.</Inner> : (
        <Table minWidth={900}>
          <thead><tr><Th>A year</Th>{rows.map((r, i) => <Th key={r.year} num>{r.year}{i === 0 && <span className="block text-[11px] font-normal">now</span>}</Th>)}</tr></thead>
          <tbody>
            <tr><Td className="font-semibold">Operating budget</Td>{cell(r => fmt(r.operating))}</tr>
            <tr><Td className="font-semibold">Transfer to reserves</Td>{cell(r => fmt(r.reserve))}</tr>
            <tr><Td className="font-semibold">Loan payments</Td>{cell(r => (r.loans ? fmt(r.loans) : '—'))}</tr>
            <tr className="font-semibold"><Td>To raise from owners</Td>{cell(r => fmt(r.toRaise))}</tr>
            <tr className="bg-ux2-teal-tint/50" data-outlook-dues><Td className="font-semibold">Dues, average unit, a month</Td>{cell(r => fmt(r.dues))}</tr>
            <tr><Td className="font-semibold">Change on the year before</Td>{cell(r => (r.change == null ? '—' : `${r.change}%`))}</tr>
            <tr><Td className="font-semibold">Replacements due, from reserves</Td>{cell(r => (r.replacements.length ? <>{fmt(r.replacements.reduce((t, x) => t + x.cost, 0))}<span className="block text-[11px] text-ux2-muted">{r.replacements.map(x => x.name).join(', ')}</span></> : '—'))}</tr>
            <tr data-outlook-reserves><Td className="font-semibold">Reserves at the year's end</Td>{cell(r => <span className={r.reservesEnd < 0 ? 'font-semibold text-ux2-red-ink' : ''}>{fmt(r.reservesEnd)}{r.pct != null && r.reservesEnd >= 0 && <span className="block text-[11px] text-ux2-muted">{r.pct}% funded</span>}</span>)}</tr>
          </tbody>
        </Table>
      )}

      {(checks.length > 0 || short) && (
        <Inner className="flex flex-col gap-1.5" aria-label="Against the goals">
          <b className="text-xs font-semibold text-ux2-ink">At "{picked.label}", against the goals{goals ? ` for the year starting ${goals.year}` : ''}</b>
          {short && <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ux2-ink"><span>Reserves run short in {short.year}</span><span className="flex items-center gap-2"><Chip tone="red">Short {fmt(-short.reservesEnd)}</Chip><Button size="sm" variant="ghost" onClick={() => { const { caseId } = ensureReview(`Reserves run short in ${short.year}`, today); if (caseId) navigate(`/boardroom?view=case:${caseId}`); }}>Open a reserve funding review</Button></span></div>}
          {checks.map((c, i) => <div key={i} className="flex flex-wrap items-center justify-between gap-2 text-sm text-ux2-ink"><span>{c.text}</span><Chip tone={c.ok ? 'sage' : 'red'}>{c.detail}</Chip></div>)}
        </Inner>
      )}

      {lines.length > 0 && (
        <Inner className="flex flex-col gap-2" aria-label="Growth by line">
          <b className="text-xs font-semibold text-ux2-ink">What each line is assumed to do, a year</b>
          <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 md:grid-cols-2">
            {growthLines.map(l => <label key={l.id} className="flex items-center justify-between gap-2 text-sm text-ux2-ink"><span className="min-w-0 truncate">{l.name} <span className="text-xs text-ux2-muted">· {fmt(l.budgeted)}</span></span><span className="flex shrink-0 items-center gap-1"><input aria-label={`Growth for ${l.name}`} inputMode="decimal" key={planning.rates[l.id] ?? 's'} defaultValue={planning.rates[l.id] ?? suggestedGrowth(l.name)} onBlur={e => { if (Number(e.target.value) !== (planning.rates[l.id] ?? suggestedGrowth(l.name))) setRate(l.id, e.target.value); }} className="w-16 rounded-[8px] border border-ux2-line-strong px-2 py-1 text-right" />%</span></label>)}
          </div>
          <span className="text-xs text-ux2-muted">Starting figures: 7% for insurance, 4% for utilities, 3% for everything else. Change any of them here; a contract with a fixed yearly increase should carry that figure.</span>
        </Inner>
      )}
      <Why>Dues move in step with what has to be raised each year, starting from what owners are billed today, or from next year's dues once the draft budget has picked them. This year is shown as it is; a different reserve level takes effect from next year, so its cost shows as next year's change. The three reserve levels are the same three as on Reserves and only change what is shown here; choosing one is done in a reserve funding review. Beyond five years only reserves are planned, on the 30-year funding plan.</Why>
    </Card>
  );
}
