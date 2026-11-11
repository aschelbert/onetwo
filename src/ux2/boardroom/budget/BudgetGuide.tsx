/**
 * The Annual budget action's steps, each one walked through in place for
 * someone who has never made a budget: what the step is for in a sentence,
 * the numbers it needs (live, from Funds and Building), the decisions made
 * right there on next year's draft, and a way to the page where the data
 * lives when it needs changing (the action dock brings you back). The step
 * ticks itself as the draft shows it done.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CaseTrackerCase, CaseStep } from '@/types/issues';
import type { StepAction } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useBudgetDraftStore } from '@/store/useBudgetDraftStore';
import { canStoreFiles, uploadDocumentFile } from '@/lib/services/documentFiles';
import { placeFile } from '@/features/building/documentCatalogue';
import { cn } from '@/lib/formatters';
import { Button, Chip, Inner, KV, Why, Field, INPUT } from '../../components';
import { dayLabel } from '../../home/calendar';
import { todayIso } from '../../runbook/adapters';
import { defaultVote, itemsOf, type AgendaItem } from '../../community/meetingRecord';
import { budgetFyOf, ensureBudgetDraft, switchToBudget, syncBudgetCase, BUDGET_NOTICE_DAYS } from '../annualBudget';
import { CONTINGENCY_OPTIONS, budgetDocument, budgetStepKey, capFromClauses, draftDone, draftTotals, duesByUnit, needsOwnerVote, noticeText, usd, type BudgetDraft, type BudgetStepKey, type DraftLine } from '../budgetDraft';
import { addDays } from '@/lib/billingCycle';

const ROUTE = {
  budget: '/funds?tab=planning&section=budget',
  reserves: '/funds?tab=planning&section=reserves',
  contracts: '/building?tab=contracts',
  insurance: '/building?tab=overview&section=insurance',
  documents: '/building?tab=documents',
  meetings: '/community?tab=meetings',
  notices: '/community?tab=notices',
  units: '/funds?tab=income&section=ledger',
  annual: '/boardroom?tab=runbooks&runbook=annual-meeting',
};

const pct = (n: number) => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;
const num = (s: string) => { const n = Number(String(s).replace(/[$,\s]/g, '')); return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0; };

function Explain({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[14px] bg-ux2-teal-tint/60 px-3.5 py-3">
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ux2-teal">{title}</div>
      <div className="mt-1 text-[13px] leading-relaxed text-ux2-ink">{children}</div>
    </div>
  );
}

function GoTo({ path, children }: { path: string; children: ReactNode }) {
  const navigate = useNavigate();
  return <Button size="sm" variant="ghost" onClick={() => navigate(path)}>{children} ↗</Button>;
}

function MoneyInput({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  return <input aria-label={label} inputMode="decimal" value={text} onChange={e => setText(e.target.value)} onBlur={() => onChange(num(text))} onKeyDown={e => { if (e.key === 'Enter') onChange(num(text)); }} className={cn(INPUT, 'h-9 w-[104px] text-right')} />;
}

const Done = ({ children }: { children: ReactNode }) => <div className="flex items-center gap-2 text-[13px] font-semibold text-ux2-sage"><Chip tone="sage">Done</Chip>{children}</div>;

// ── 1 · Start ────────────────────────────────────────────────────────────────
function StartStep({ d }: { d: BudgetDraft }) {
  const t = draftTotals(d);
  const rows = [...d.lines].sort((a, b) => b.budgeted - a.budgeted);
  return (
    <>
      <Explain title="How this works">
        A budget is next year's plan: what running the building will cost, what goes into reserves for big repairs later, and the dues that pay for it.
        The app has started next year's draft from this year's numbers. Each step after this one is a decision on that draft, made right here, with the numbers beside it.
        Nothing changes in Funds until the board adopts the budget and the year starts.
      </Explain>
      <Inner className="flex flex-col gap-1">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ux2-muted">This year, as the draft starts</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead><tr className="text-left text-xs text-ux2-muted"><th className="py-1.5 font-semibold">Line</th><th className="py-1.5 text-right font-semibold">Budget</th><th className="py-1.5 text-right font-semibold">Spent so far</th><th className="py-1.5 text-right font-semibold">Heading to</th></tr></thead>
            <tbody>
              {rows.map(l => (
                <tr key={l.id} className="border-t border-ux2-line"><td className="py-1.5">{l.name}</td><td className="py-1.5 text-right">{usd(l.budgeted)}</td><td className="py-1.5 text-right">{usd(l.actual)}</td><td className={cn('py-1.5 text-right', l.projected > l.budgeted && 'font-semibold text-ux2-red')}>{usd(l.projected)}</td></tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={4} className="py-2 text-ux2-muted">No budget lines yet. The next steps add them.</td></tr>}
            </tbody>
          </table>
        </div>
        <KV label="Reserve contribution today">{usd(d.base.reserveAnnual)} a year</KV>
        <KV label="The reserve study recommends">{usd(d.base.recommendedReserve)} a year</KV>
        <KV label="Dues today, all units">{usd(d.base.monthlyDues)} a month</KV>
        <KV label="Contracts and policies to check">{d.costs.length}</KV>
      </Inner>
      <div className="flex flex-wrap gap-2"><GoTo path={ROUTE.budget}>See this year in Funds › Planning</GoTo></div>
      <Why>Heading to is this year's spending so far, carried to the end of the year. Red means the line is heading over its budget, the first thing to look at in step 3. Draft total so far: {usd(t.needed)}.</Why>
    </>
  );
}

// ── 2 · Contracts and insurance ─────────────────────────────────────────────
function CostsStep({ d, edit }: { d: BudgetDraft; edit: (fn: (d: BudgetDraft) => BudgetDraft) => void }) {
  const confirm = (id: string, patch: Partial<BudgetDraft['costs'][number]> = {}) => edit(x => {
    let lines = x.lines;
    const costs = x.costs.map(c => c.id === id ? { ...c, ...patch, confirmed: true } : c);
    const cost = costs.find(c => c.id === id)!;
    let lineId = cost.lineId;
    if (lineId === '__new') {
      const nl: DraftLine = { id: `line-${Date.now().toString(36)}`, name: cost.kind === 'insurance' ? 'Insurance' : cost.detail.split(' · ')[0] || cost.name, budgeted: 0, actual: 0, projected: 0, suggested: cost.annual, why: `From ${cost.name}`, amount: cost.annual, reviewed: false };
      lines = [...lines, nl];
      lineId = nl.id;
    }
    const final = costs.map(c => c.id === id ? { ...c, lineId } : c);
    // A line is at least what its confirmed contracts and premiums add up to.
    const floor = final.filter(c => c.confirmed && c.lineId === lineId).reduce((t, c) => t + c.annual, 0);
    lines = lines.map(l => l.id === lineId && l.amount < floor ? { ...l, amount: floor, suggested: Math.max(l.suggested, floor), why: 'At least what its contracts and premiums cost' } : l);
    return { ...x, costs: final, lines };
  });
  const open = d.costs.filter(c => !c.confirmed);
  return (
    <>
      <Explain title="Why this comes first">
        Contracts and insurance are the costs you already know for next year. Check each one's price and the budget line that pays for it.
        When a price is wrong, change it on the contract or the policy so the record is right too, then come back here.
      </Explain>
      <div className="flex flex-col gap-2">
        {d.costs.map(c => (
          <Inner key={c.id} data-cost={c.id} className={cn('flex flex-wrap items-end gap-3', c.confirmed && 'bg-ux2-sage-tint/40')}>
            <div className="min-w-[200px] flex-1">
              <div className="text-sm font-semibold text-ux2-ink">{c.name}</div>
              <div className="text-xs text-ux2-muted">{c.detail}</div>
            </div>
            <Field label="A year" className="w-[130px]"><MoneyInput label={`${c.name} a year`} value={c.annual} onChange={n => edit(x => ({ ...x, costs: x.costs.map(y => y.id === c.id ? { ...y, annual: n } : y) }))} /></Field>
            <Field label="Paid from" className="w-[190px]">
              <select aria-label={`${c.name} paid from`} value={c.lineId ?? ''} onChange={e => edit(x => ({ ...x, costs: x.costs.map(y => y.id === c.id ? { ...y, lineId: e.target.value || null } : y) }))} className={cn(INPUT, 'h-9')}>
                <option value="">Pick a line</option>
                {d.lines.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                <option value="__new">A new line for it</option>
              </select>
            </Field>
            {c.confirmed ? <Chip tone="sage">Checked</Chip> : <Button size="sm" disabled={!c.lineId} onClick={() => confirm(c.id)}>Looks right</Button>}
          </Inner>
        ))}
        {d.costs.length === 0 && <Inner className="text-sm text-ux2-muted">No contracts or policies on file. Add them under Building so next year's draft picks them up, or go on: step 3 covers every line.</Inner>}
      </div>
      <div className="flex flex-wrap gap-2">
        {open.length > 1 && open.every(c => c.lineId) && <Button size="sm" onClick={() => open.forEach(c => confirm(c.id))}>All {open.length} look right</Button>}
        <GoTo path={ROUTE.contracts}>Change a contract in Building › Contracts</GoTo>
        <GoTo path={ROUTE.insurance}>Change a policy in Building › Insurance</GoTo>
      </div>
      <Why>A year is read from the contract or the premium on file ({'"$650/mo"'} is $7,800 a year). On-call vendors have no fixed price; their line in step 3 covers them.</Why>
    </>
  );
}

// ── 3 · Every line ──────────────────────────────────────────────────────────
function LinesStep({ d, edit }: { d: BudgetDraft; edit: (fn: (d: BudgetDraft) => BudgetDraft) => void }) {
  const [name, setName] = useState('');
  const setLine = (id: string, patch: Partial<DraftLine>) => edit(x => ({ ...x, lines: x.lines.map(l => l.id === id ? { ...l, ...patch } : l) }));
  const t = draftTotals(d);
  const left = d.lines.filter(l => !l.reviewed);
  return (
    <>
      <Explain title="How to set a line">
        Each line shows this year's budget, what has been spent, where the year is heading, and a suggestion for next year with the reason.
        If the suggestion looks right, accept it. If you know something the numbers don't (a contract ending, a repair already done), type your own amount.
      </Explain>
      <div className="overflow-x-auto rounded-[14px] border border-ux2-line bg-white">
        <table className="w-full min-w-[600px] text-sm">
          <thead><tr className="text-left text-xs text-ux2-muted"><th className="px-3 py-2 font-semibold">Line</th><th className="px-3 py-2 text-right font-semibold">This year</th><th className="px-3 py-2 text-right font-semibold">Heading to</th><th className="px-3 py-2 font-semibold">Suggested</th><th className="px-3 py-2 text-right font-semibold">Next year</th><th className="px-3 py-2" /></tr></thead>
          <tbody>
            {d.lines.map(l => (
              <tr key={l.id} data-line={l.id} className="border-t border-ux2-line">
                <td className="px-3 py-2 font-semibold text-ux2-ink">{l.name}</td>
                <td className="px-3 py-2 text-right">{usd(l.budgeted)}</td>
                <td className={cn('px-3 py-2 text-right', l.projected > l.budgeted && 'font-semibold text-ux2-red')}>{usd(l.projected)}</td>
                <td className="px-3 py-2"><b className="font-semibold">{usd(l.suggested)}</b><span className="block max-w-[220px] text-xs text-ux2-muted">{l.why}</span></td>
                <td className="px-3 py-2 text-right"><MoneyInput label={`${l.name} next year`} value={l.amount} onChange={n => setLine(l.id, { amount: n, reviewed: true })} /></td>
                <td className="px-3 py-2 text-right">{l.reviewed ? <Chip tone="sage">Set</Chip> : <Button size="sm" onClick={() => setLine(l.id, { amount: l.suggested, reviewed: true })}>Accept</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form aria-label="Add a line" onSubmit={e => { e.preventDefault(); if (!name.trim()) return; edit(x => ({ ...x, lines: [...x.lines, { id: `line-${Date.now().toString(36)}`, name: name.trim(), budgeted: 0, actual: 0, projected: 0, suggested: 0, why: 'A new line', amount: 0, reviewed: false }] })); setName(''); }} className="flex flex-wrap items-end gap-2">
        <Field label="A line this year didn't have" className="min-w-[220px] flex-1"><input value={name} onChange={e => setName(e.target.value)} placeholder="Window cleaning" className={INPUT} /></Field>
        <Button type="submit" size="sm" variant="ghost" disabled={!name.trim()}>Add the line</Button>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        {left.length > 0 && <Button size="sm" onClick={() => edit(x => ({ ...x, lines: x.lines.map(l => l.reviewed ? l : { ...l, amount: l.suggested, reviewed: true }) }))}>Accept the {left.length} suggestion{left.length === 1 ? '' : 's'} left</Button>}
        <span className="text-sm text-ux2-muted">Running the building next year: <b className="font-semibold text-ux2-ink">{usd(t.operating)}</b>{left.length ? ` · ${left.length} to look at` : ''}</span>
      </div>
    </>
  );
}

// ── 4 · Reserves and a cushion ──────────────────────────────────────────────
function ReserveStep({ d, edit }: { d: BudgetDraft; edit: (fn: (d: BudgetDraft) => BudgetDraft) => void }) {
  const reserveItems = useFinancialStore(s => s.reserveItems);
  const next = [...reserveItems].filter(r => !r.isContingency).sort((a, b) => a.yearsRemaining - b.yearsRemaining)[0];
  const [custom, setCustom] = useState(d.reserve.choice === 'custom');
  const t = draftTotals(d);
  const set = (choice: 'recommended' | 'keep', annual: number) => { setCustom(false); edit(x => ({ ...x, reserve: { choice, annual } })); };
  const opt = (on: boolean, label: string, sub: string, onClick: () => void) => (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn('flex min-w-[200px] flex-1 flex-col gap-0.5 rounded-[14px] border px-3.5 py-3 text-left', on ? 'border-ux2-navy bg-ux2-navy text-white' : 'border-ux2-line bg-white hover:border-ux2-line-strong')}>
      <span className="text-sm font-semibold">{label}</span><span className={cn('text-xs', on ? 'text-white/[0.78]' : 'text-ux2-muted')}>{sub}</span>
    </button>
  );
  return (
    <>
      <Explain title="Two kinds of money set aside">
        Reserves are saved for big repairs years from now (a roof, the elevator). The reserve study says how much to save each year so the money is there in time; saving less now usually means a special assessment later.
        The cushion (contingency) is for this year's surprises. 3 to 5% of running costs is usual.
      </Explain>
      <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ux2-muted">Reserve contribution for {d.label}</div>
        <div className="flex flex-wrap gap-2">
          {opt(d.reserve.choice === 'recommended' && !custom, `The study's ${usd(d.base.recommendedReserve)} a year`, next ? `${next.name} is due in about ${Math.round(next.yearsRemaining)} years` : 'Funds the reserve study on schedule', () => set('recommended', d.base.recommendedReserve))}
          {opt(d.reserve.choice === 'keep' && !custom, `Keep today's ${usd(d.base.reserveAnnual)} a year`, d.base.reserveAnnual < d.base.recommendedReserve ? `${usd(d.base.recommendedReserve - d.base.reserveAnnual)} a year short of the study` : 'At or above the study', () => set('keep', d.base.reserveAnnual))}
          {opt(custom || d.reserve.choice === 'custom', 'Another amount', 'Type it below', () => { setCustom(true); edit(x => ({ ...x, reserve: { choice: 'custom', annual: x.reserve.annual } })); })}
        </div>
        {(custom || d.reserve.choice === 'custom') && <Field label="A year into reserves" className="w-[160px]"><MoneyInput label="Reserve contribution a year" value={d.reserve.annual} onChange={n => edit(x => ({ ...x, reserve: { choice: 'custom', annual: n } }))} /></Field>}
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ux2-muted">Cushion for surprises</div>
        <div role="group" aria-label="Contingency" className="flex flex-wrap gap-1.5">
          {[0, ...CONTINGENCY_OPTIONS].map(p => (
            <button key={p} type="button" aria-pressed={d.contingencyPct === p} onClick={() => edit(x => ({ ...x, contingencyPct: p }))} className="rounded-full">
              <Chip tone={d.contingencyPct === p ? 'navy' : 'ghost'}>{p === 0 ? 'None' : `${p}% · ${usd(Math.round(t.operating * p / 100))}`}</Chip>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2"><GoTo path={ROUTE.reserves}>See the reserve study in Funds › Planning</GoTo></div>
      <Why>The reserve study lives under Funds › Planning › Reserves; update it there when a component's cost or timing changes and the recommendation here follows.</Why>
    </>
  );
}

// ── 5 · Dues ────────────────────────────────────────────────────────────────
function DuesStep({ d, edit }: { d: BudgetDraft; edit: (fn: (d: BudgetDraft) => BudgetDraft) => void }) {
  const units = useFinancialStore(s => s.units);
  const clauses = useBuildingStore(s => s.governingClauses);
  const cap = useMemo(() => capFromClauses(clauses ?? []), [clauses]);
  const [all, setAll] = useState(false);
  const t = draftTotals(d);
  const keepShort = Math.max(0, t.needed - d.base.monthlyDues * 12);
  const choose = (option: 'needed' | 'keep' | 'custom', monthlyTotal: number) => edit(x => ({ ...x, dues: { option, monthlyTotal } }));
  const per = duesByUnit(units, t.monthly);
  const shown = all ? per : per.slice(0, 6);
  const neededChange = d.base.monthlyDues > 0 ? (t.neededMonthly - d.base.monthlyDues) / d.base.monthlyDues : 0;
  return (
    <>
      <Explain title="What the dues have to pay for">
        The dues are the budget divided across the units, each by its share (percentage interest). The first option covers everything you set in steps 2 to 4.
        Keeping dues flat is allowed, but the gap has to come from somewhere: savings, or less going into reserves.
      </Explain>
      <Inner className="flex flex-col gap-0.5">
        <KV label="Running the building">{usd(t.operating)}</KV>
        <KV label={d.contingencyPct == null ? 'Cushion' : `Cushion, ${d.contingencyPct}%`}>{d.contingencyPct == null ? 'none until step 4' : usd(t.contingency)}</KV>
        <KV label="Into reserves">{usd(t.reserve)}{d.reserve.choice ? '' : " · the study's, until step 4"}</KV>
        <KV label="The year, in all"><b className="font-semibold">{usd(t.needed)}</b> · {usd(t.neededMonthly)} a month</KV>
      </Inner>
      <div role="radiogroup" aria-label="Dues" className="flex flex-col gap-2">
        {[
          { id: 'needed' as const, label: `Cover the budget: ${usd(t.neededMonthly)} a month`, sub: `${pct(neededChange)} on today's ${usd(d.base.monthlyDues)}`, total: t.neededMonthly },
          { id: 'keep' as const, label: `Keep today's ${usd(d.base.monthlyDues)} a month`, sub: keepShort > 0 ? `Short by ${usd(keepShort)} for the year` : 'Covers the budget', total: d.base.monthlyDues },
        ].map(o => (
          <label key={o.id} className={cn('flex cursor-pointer items-start gap-2.5 rounded-[14px] border px-3.5 py-3', d.dues.option === o.id ? 'border-ux2-navy bg-ux2-surface' : 'border-ux2-line bg-white')}>
            <input type="radio" name="dues" checked={d.dues.option === o.id} onChange={() => choose(o.id, o.total)} className="mt-1" />
            <span><span className="block text-sm font-semibold text-ux2-ink">{o.label}</span><span className={cn('text-xs', o.id === 'keep' && keepShort > 0 ? 'font-semibold text-ux2-red' : 'text-ux2-muted')}>{o.sub}</span></span>
          </label>
        ))}
        <label className={cn('flex cursor-pointer flex-wrap items-center gap-2.5 rounded-[14px] border px-3.5 py-3', d.dues.option === 'custom' ? 'border-ux2-navy bg-ux2-surface' : 'border-ux2-line bg-white')}>
          <input type="radio" name="dues" checked={d.dues.option === 'custom'} onChange={() => choose('custom', d.dues.monthlyTotal || t.neededMonthly)} />
          <span className="text-sm font-semibold text-ux2-ink">Another amount a month, all units</span>
          {d.dues.option === 'custom' && <MoneyInput label="Dues a month, all units" value={d.dues.monthlyTotal} onChange={n => choose('custom', n)} />}
        </label>
      </div>
      {t.shortfall > 0 && d.dues.option && <p className="m-0 rounded-xl bg-ux2-red-tint/60 px-3 py-2 text-[13px] text-ux2-ink">These dues leave the budget {usd(t.shortfall)} short for the year. Lower a line in step 3 or the reserves in step 4, or pick the first option.</p>}
      <Inner className="flex flex-col gap-1.5">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ux2-muted">Does it need an owner vote?</div>
        {cap
          ? <div className="text-[13px] text-ux2-ink">Your bylaws ({cap.ref}) allow an increase up to {cap.pct}% without an owner vote.</div>
          : (
            <div className="flex flex-wrap items-end gap-2 text-[13px]">
              <span className="min-w-[220px] flex-1 text-ux2-ink">The bylaws on file don't state a limit the app can read. Many limit an increase without an owner vote to 10 to 15%. Check yours and enter it:</span>
              <Field label="Limit, %" className="w-[110px]"><input aria-label="Increase limit, percent" inputMode="decimal" defaultValue={d.capPct ?? ''} onBlur={e => edit(x => ({ ...x, capPct: e.target.value === '' ? null : Number(e.target.value) }))} className={cn(INPUT, 'h-9')} /></Field>
              <GoTo path={ROUTE.documents}>Read the bylaws</GoTo>
            </div>
          )}
        {d.dues.option && (needsOwnerVote({ ...d, capPct: cap?.pct ?? d.capPct })
          ? <div className="rounded-xl bg-ux2-amber-tint/70 px-3 py-2 text-[13px] text-ux2-ink"><b className="font-semibold">{pct(t.change)} is over the limit: owners have to approve it.</b> The board still adopts it first (steps 6 and 7); then owners ratify it, usually at the annual meeting. <GoTo path={ROUTE.annual}>See the Annual meeting runbook</GoTo></div>
          : (cap?.pct ?? d.capPct) != null && <div className="text-[13px] text-ux2-sage">{pct(t.change)} is within the limit: the board can adopt it on its own.</div>)}
      </Inner>
      <Inner className="flex flex-col gap-1">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ux2-muted">What each unit pays, a month</div>
        {shown.map(u => <KV key={u.unit} label={`Unit ${u.unit}`}>{usd(u.now)} → <b className="font-semibold">{usd(u.next)}</b></KV>)}
        {per.length > 6 && <button type="button" onClick={() => setAll(a => !a)} className="self-start text-xs font-semibold text-ux2-teal hover:underline">{all ? 'Show fewer' : `Show all ${per.length} units`}</button>}
      </Inner>
    </>
  );
}

// ── 6 · On a board meeting's agenda ─────────────────────────────────────────
function ReviewStep({ d, edit }: { d: BudgetDraft; edit: (fn: (d: BudgetDraft) => BudgetDraft) => void }) {
  const meetings = useMeetingsStore(s => s.meetings);
  const setItems = useMeetingsStore(s => s.setItems);
  const user = useAuthStore(s => s.currentUser?.name) || 'Treasurer';
  const today = todayIso();
  const navigate = useNavigate();
  const upcoming = meetings.filter(m => m.status !== 'CANCELLED' && m.status !== 'COMPLETED' && m.date >= today && m.type !== 'ANNUAL').sort((a, b) => a.date.localeCompare(b.date));
  const on = d.review ? meetings.find(m => m.id === d.review!.meetingId) : undefined;
  const t = draftTotals(d);
  const ready = draftDone(d);
  const missing = (['costs', 'lines', 'reserve', 'dues'] as BudgetStepKey[]).filter(k => !ready[k]);
  const add = (meetingId: string) => {
    const m = useMeetingsStore.getState().meetings.find(x => x.id === meetingId);
    if (!m) return;
    const itemId = `budget-${d.fyStart}`;
    const title = `Adopt the ${d.label} budget`;
    const item: AgendaItem = {
      id: itemId, title, kind: 'decision', minutes: '',
      attachments: [{
        id: `att-${itemId}`, itemId, name: `Proposed ${d.label} budget`, source: 'report', report: 'proposed_budget', asOf: today, mode: 'frozen', audience: 'all', capturedAt: new Date().toISOString(), capturedBy: user,
        snapshot: { title: `Proposed ${d.label} budget, as of ${today}`, columns: ['Line', 'This year', d.label], rows: [...d.lines.map(l => [l.name, usd(l.budgeted), usd(l.amount)]), ['Cushion', '', usd(t.contingency)], ['Into reserves', usd(d.base.reserveAnnual), usd(t.reserve)], ['Total', '', usd(t.needed)], ['Dues a month, all units', usd(d.base.monthlyDues), usd(t.monthly)]] },
      }],
      vote: { ...defaultVote('board', { title, kind: 'decision' }), question: `Adopt the ${d.label} budget: ${usd(t.needed)} for the year, dues of ${usd(t.monthly)} a month for the building?` },
    };
    const items = itemsOf(m).filter(i => i.id !== itemId);
    setItems(meetingId, [...items, item]);
    edit(x => ({ ...x, review: { meetingId, itemId } }));
  };
  return (
    <>
      <Explain title="Why a meeting">
        The board adopts the budget by voting at a meeting, so owners can see it and ask questions first.
        Putting it on an agenda adds a decision with the board vote already set up, and attaches the proposed budget as it stands today.
        Leave enough time: owners hear the adopted budget by {dayLabel(addDays(d.fyStart, -BUDGET_NOTICE_DAYS))}, and check how much notice your bylaws want before the vote.
      </Explain>
      {missing.length > 0 && <p className="m-0 rounded-xl bg-ux2-amber-tint/70 px-3 py-2 text-[13px] text-ux2-ink">Steps {missing.map(k => ({ costs: 2, lines: 3, reserve: 4, dues: 5 } as Record<string, number>)[k]).join(', ')} {missing.length === 1 ? "isn't" : "aren't"} done yet. You can still put it on the agenda; the attached budget is the draft as it is now.</p>}
      {on ? (
        <div className="flex flex-col gap-2">
          <Done>On the agenda of the {on.title}, {dayLabel(on.date)}{on.time ? ` at ${on.time}` : ''}</Done>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => navigate(`${ROUTE.meetings}&meeting=${on.id}`)}>Open the meeting</Button>
            <Button size="sm" variant="ghost" onClick={() => add(on.id)}>Attach the draft as it is now</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {upcoming.slice(0, 4).map(m => (
            <Inner key={m.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm"><b className="font-semibold text-ux2-ink">{m.title}</b><span className="text-ux2-muted"> · {dayLabel(m.date)}{m.date > addDays(d.fyStart, -BUDGET_NOTICE_DAYS) ? ' · after owners must hear the budget' : ''}</span></span>
              <Button size="sm" onClick={() => add(m.id)}>Put it on this agenda</Button>
            </Inner>
          ))}
          {upcoming.length === 0 && <Inner className="text-sm text-ux2-muted">No board meeting is scheduled. Schedule one under Community › Meetings, then come back to put the budget on it.</Inner>}
          <div><GoTo path={ROUTE.meetings}>Schedule a board meeting</GoTo></div>
        </div>
      )}
    </>
  );
}

// ── 7 · Adopt ───────────────────────────────────────────────────────────────
function AdoptStep({ d, onAction, stepIndex }: { d: BudgetDraft; onAction?: (a: StepAction, i: number) => void; stepIndex: number }) {
  const meetings = useMeetingsStore(s => s.meetings);
  const navigate = useNavigate();
  const m = d.review ? meetings.find(x => x.id === d.review!.meetingId) : undefined;
  const item = m ? itemsOf(m).find(i => i.id === d.review!.itemId) : undefined;
  const v = item?.vote;
  return (
    <>
      <Explain title="At the meeting">
        When the meeting reaches the budget, someone moves to adopt it, someone seconds, and each board member votes. The Secretary records it on the meeting as it happens.
        When the motion passes, this step ticks itself and the rest of the budget follows from it.
      </Explain>
      {d.adoptedAt ? <Done>Adopted {dayLabel(d.adoptedAt)}{d.adoptedHow ? ` · ${d.adoptedHow}` : ''}</Done> : m ? (
        <Inner className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm"><b className="font-semibold text-ux2-ink">{m.title}</b><span className="text-ux2-muted"> · {dayLabel(m.date)} · {v?.result ? (v.result.passed ? 'passed' : 'did not pass') : v?.status === 'open' ? 'vote open' : 'vote not taken yet'}</span></span>
          <Button size="sm" onClick={() => navigate(`${ROUTE.meetings}&meeting=${m.id}`)}>Open the meeting</Button>
        </Inner>
      ) : <Inner className="text-sm text-ux2-muted">Put the budget on a board meeting's agenda first (step 6).</Inner>}
      {v?.result && !v.result.passed && <p className="m-0 rounded-xl bg-ux2-red-tint/60 px-3 py-2 text-[13px] text-ux2-ink">The motion didn't pass. Change the draft in steps 3 to 5 with what the board asked for, and put it on the next meeting.</p>}
      {!d.adoptedAt && <div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" onClick={() => onAction?.({ type: 'modal', target: 'board-vote', label: 'Record the board vote' }, stepIndex)}>The vote was taken elsewhere: record it here</Button></div>}
    </>
  );
}

// ── 8 · Tell owners ─────────────────────────────────────────────────────────
function NotifyStep({ d, edit }: { d: BudgetDraft; edit: (fn: (d: BudgetDraft) => BudgetDraft) => void }) {
  const units = useFinancialStore(s => s.units);
  const add = useComplianceStore(s => s.addAnnouncement);
  const user = useAuthStore(s => s.currentUser?.name) || 'Board';
  const draft = noticeText(d, units);
  const [title, setTitle] = useState(draft.title);
  const [body, setBody] = useState(draft.body);
  const due = addDays(d.fyStart, -BUDGET_NOTICE_DAYS);
  return (
    <>
      <Explain title="What owners need to hear">
        The adopted budget, the new dues and when they start. The notice below is written from the budget; change any words you like before posting it.
        It posts under Community › Notices for every owner, by {dayLabel(due)}.
      </Explain>
      {d.noticeAt ? <Done>Posted {dayLabel(d.noticeAt)}</Done> : (
        <form aria-label="Owner notice" onSubmit={e => { e.preventDefault(); add({ title, body, category: 'financial', postedBy: user, postedDate: todayIso(), pinned: true }); edit(x => ({ ...x, noticeAt: todayIso() })); }} className="flex flex-col gap-2">
          {!d.adoptedAt && <p className="m-0 rounded-xl bg-ux2-amber-tint/70 px-3 py-2 text-[13px] text-ux2-ink">The board hasn't adopted the budget yet (step 7). Post this after the vote.</p>}
          <Field label="Title"><input value={title} onChange={e => setTitle(e.target.value)} className={INPUT} /></Field>
          <Field label="Notice"><textarea value={body} onChange={e => setBody(e.target.value)} rows={8} className="w-full rounded-[14px] border border-ux2-line-strong bg-white px-3.5 py-2.5 text-sm font-normal text-ux2-ink" /></Field>
          <div className="flex flex-wrap gap-2"><Button type="submit" size="sm" disabled={!d.adoptedAt}>Post it to every owner</Button><GoTo path={ROUTE.notices}>See Community › Notices</GoTo></div>
        </form>
      )}
    </>
  );
}

// ── 9 · Switch over ─────────────────────────────────────────────────────────
function SwitchStep({ d }: { d: BudgetDraft }) {
  const units = useFinancialStore(s => s.units);
  const t = draftTotals(d);
  const changing = duesByUnit(units, t.monthly).filter(u => u.next !== u.now).length;
  const [sure, setSure] = useState(false);
  return (
    <>
      <Explain title="Nothing to do on the day">
        On {dayLabel(d.fyStart)} the app switches Funds to the adopted budget: the {d.lines.length} lines in Funds › Planning, the new dues on {changing} unit{changing === 1 ? '' : 's'}' accounts (billing uses them from then on), and {usd(t.reserve)} a year into reserves.
      </Explain>
      {d.switchedAt ? <Done>Switched {dayLabel(d.switchedAt)}</Done> : (
        <div className="flex flex-col gap-2">
          <Inner className="flex flex-col gap-0.5">
            <KV label="Budget lines">{d.lines.length} · {usd(t.operating)}{t.contingency ? ` + ${usd(t.contingency)} cushion` : ''}</KV>
            <KV label="Dues, all units">{usd(d.base.monthlyDues)} → {usd(t.monthly)} a month</KV>
            <KV label="Reserve transfer">{usd(d.base.reserveAnnual)} → {usd(t.reserve)} a year</KV>
          </Inner>
          {d.adoptedAt && (sure
            ? <div className="flex flex-wrap items-center gap-2 text-[13px]"><span className="text-ux2-ink">The next billing run uses the new dues. Switch now?</span><Button size="sm" onClick={() => switchToBudget(d.fyStart)}>Yes, switch now</Button><Button size="sm" variant="ghost" onClick={() => setSure(false)}>No, wait for {dayLabel(d.fyStart)}</Button></div>
            : <div><Button size="sm" variant="ghost" onClick={() => setSure(true)}>Switch now instead</Button></div>)}
          {!d.adoptedAt && <Why>The switch waits for the board's vote (step 7).</Why>}
        </div>
      )}
      <div className="flex flex-wrap gap-2"><GoTo path={ROUTE.budget}>See Funds › Planning</GoTo><GoTo path={ROUTE.units}>See each unit's account</GoTo></div>
    </>
  );
}

// ── 10 · File it ────────────────────────────────────────────────────────────
function FileStep({ d, edit }: { d: BudgetDraft; edit: (fn: (d: BudgetDraft) => BudgetDraft) => void }) {
  const units = useFinancialStore(s => s.units);
  const building = useBuildingStore(s => s.name) || 'The association';
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const html = () => budgetDocument(d, building, units);
  const file = async () => {
    setBusy(true); setErr('');
    const name = `${d.label} budget${d.adoptedAt ? ' (adopted)' : ''}.html`;
    const blob = new File([html()], name, { type: 'text/html' });
    const fileId = `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    let path: string | undefined;
    if (canStoreFiles()) {
      path = (await uploadDocumentFile(fileId, blob)) ?? undefined;
      if (!path) { setBusy(false); setErr("The file couldn't be uploaded. Check your connection and try again."); return; }
    }
    placeFile(['Budgets'], { name, size: `${Math.max(1, Math.round(blob.size / 1024))} KB`, type: 'text/html', fileId, path }, { version: d.label });
    edit(x => ({ ...x, filedAt: todayIso() }));
    setBusy(false);
  };
  const download = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html()], { type: 'text/html' })); a.download = `${d.label} budget.html`; a.click(); };
  return (
    <>
      <Explain title="Keep the record">
        The adopted budget belongs with the association's records, where owners and buyers can read it. The app writes it from the draft (every line, the cushion, the reserves, each unit's dues) and files it under Building › Documents › Budgets.
      </Explain>
      {d.filedAt ? <Done>Filed {dayLabel(d.filedAt)} under Budgets</Done> : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy || !d.adoptedAt} onClick={file}>{busy ? 'Filing…' : 'File the adopted budget'}</Button>
          <Button size="sm" variant="ghost" onClick={download}>Download a copy</Button>
          <GoTo path={ROUTE.documents}>See Building › Documents</GoTo>
        </div>
      )}
      {!d.adoptedAt && !d.filedAt && <Why>Filing waits for the board's vote (step 7); a copy can be downloaded any time.</Why>}
      {err && <p className="m-0 text-[13px] text-ux2-red">{err}</p>}
    </>
  );
}

/** The guide under one step of an Annual budget action. Renders nothing for any other step or action. */
export function BudgetGuide({ c, step, stepIndex, onAction }: { c: CaseTrackerCase; step: CaseStep; stepIndex: number; onAction?: (a: StepAction, i: number) => void }) {
  const fy = budgetFyOf(c);
  const key = budgetStepKey(step.s);
  const draft = useBudgetDraftStore(s => (fy ? s.drafts[fy.start] : undefined));
  const loaded = useBudgetDraftStore(s => s.loaded);
  const update = useBudgetDraftStore(s => s.update);
  useEffect(() => { if (fy && !draft) ensureBudgetDraft(fy); }, [fy?.start, draft, loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  // Tick what the draft now shows done.
  useEffect(() => { if (draft) syncBudgetCase(c); }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!fy || !key) return null;
  if (!draft) return <div data-budget-guide={key} className="ux2 rounded-[18px] border border-ux2-line bg-ux2-surface px-4 py-3 text-sm text-ux2-muted">Loading next year's draft…</div>;
  const edit = (fn: (d: BudgetDraft) => BudgetDraft) => update(fy.start, fn);
  const body = {
    start: <StartStep d={draft} />,
    costs: <CostsStep d={draft} edit={edit} />,
    lines: <LinesStep d={draft} edit={edit} />,
    reserve: <ReserveStep d={draft} edit={edit} />,
    dues: <DuesStep d={draft} edit={edit} />,
    review: <ReviewStep d={draft} edit={edit} />,
    adopt: <AdoptStep d={draft} onAction={onAction} stepIndex={stepIndex} />,
    notify: <NotifyStep d={draft} edit={edit} />,
    switch: <SwitchStep d={draft} />,
    file: <FileStep d={draft} edit={edit} />,
  }[key];
  return <section data-budget-guide={key} aria-label={`Budget step: ${step.s}`} className="ux2 flex flex-col gap-3 rounded-[18px] border border-ux2-line bg-ux2-surface px-4 py-4">{body}</section>;
}
