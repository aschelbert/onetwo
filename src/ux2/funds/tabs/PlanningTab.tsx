import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { fmt } from '@/lib/formatters';
import { Button, Card, Chip, Inner, PillTabs, TileSwitcher, type TileSection, Table, Th, Td, RowMenu, Bar, KV, Why, Field, INPUT } from '../../components';
import { dayLabel } from '../../home/calendar';
import { budgetSummary, nextYearScenarios, reserveSummary, type BudgetLine, type FundsSnapshot } from '../metrics';
import type { FundsTab } from '../FundsPage';
import { addYears, everyYears, lastStudyDate } from '../../boardroom/reserveStudy';

type Section = 'budget' | 'draft' | 'reserves';
const SECTIONS: Section[] = ['budget', 'draft', 'reserves'];

function lineStatus(b: BudgetLine) {
  if (b.budgeted <= 0) return <Chip tone="ghost">No budget</Chip>;
  const pct = Math.round((b.actual / b.budgeted) * 100);
  if (b.actual > b.budgeted) return <Chip tone="red">Over by {fmt(b.actual - b.budgeted)}</Chip>;
  if (pct >= 100) return <Chip tone="ghost">Paid in full</Chip>;
  return <Chip tone="sage">On track · {pct}%</Chip>;
}

function BudgetLineForm({ onClose }: { onClose: () => void }) {
  const add = useFinancialStore(s => s.addBudgetCategory);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  return (
    <form aria-label="Add a budget line" onSubmit={e => { e.preventDefault(); if (!name) return; add(name, Number(amount) || 0); onClose(); }} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <Field label="Line" className="min-w-[220px] flex-1"><input value={name} onChange={e => setName(e.target.value)} placeholder="Snow removal" className={INPUT} /></Field>
      <Field label="Budget for the year" className="w-[160px]"><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="$" className={INPUT} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={!name}>Add</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

function EditAmountForm({ line, onClose }: { line: BudgetLine; onClose: () => void }) {
  const update = useFinancialStore(s => s.updateBudgetCategory);
  const [amount, setAmount] = useState(String(line.budgeted));
  return (
    <form aria-label={`Edit ${line.name}`} onSubmit={e => { e.preventDefault(); if (line.id) update(line.id, { budgeted: Number(amount) || 0 }); onClose(); }} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <div className="w-full text-sm font-semibold text-ux2-ink">{line.name} · change the amount</div>
      <Field label="Budget for the year" className="w-[160px]"><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} className={INPUT} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm">Save</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

type BudgetFilter = 'biggest' | 'over' | 'all';

function BudgetCard({ snap, onSection, onGo }: { snap: FundsSnapshot; onSection: (s: string) => void; onGo: (tab: FundsTab, section?: string) => void }) {
  const bud = budgetSummary(snap);
  const [filter, setFilter] = useState<BudgetFilter>('biggest');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<BudgetLine | null>(null);
  const year = snap.today.slice(0, 4);
  const sorted = useMemo(() => [...snap.budget].sort((a, b) => b.budgeted - a.budgeted), [snap.budget]);
  const over = sorted.filter(b => b.budgeted > 0 && b.actual > b.budgeted);
  const rows = filter === 'all' ? sorted : filter === 'over' ? over : sorted.slice(0, 8);
  const rest = sorted.slice(8);
  const dues = snap.units.reduce((t, u) => t + u.monthlyFee, 0) * 12;
  const reserve = snap.annualReserveContribution;
  const pct = (n: number) => (dues > 0 ? Math.round((n / dues) * 100) : 0);
  const monthEnd = new Date(Number(year), Number(snap.today.slice(5, 7)) - 1, 0);
  const through = `${monthEnd.toLocaleDateString('en-US', { month: 'short' })} ${monthEnd.getDate()}`;
  return (
    <Card aria-label="Budget against actual" id="budget">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3"><h2 className="m-0 text-lg font-medium text-ux2-ink">Budget against actual, {year}</h2><span className="text-[13px] text-ux2-muted">{bud.lines} lines · {fmt(bud.spent)} spent of {fmt(bud.total)} · through {through}</span></div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <PillTabs size="filter" surface="white" aria-label="Show lines" value={filter} onChange={setFilter} tabs={[{ id: 'biggest', label: `Biggest ${Math.min(8, sorted.length)}` }, { id: 'over', label: `Over · ${over.length}` }, { id: 'all', label: `All ${sorted.length}` }]} />
          <Button size="sm" className="h-9" variant="ghost" onClick={() => setAdding(true)}>Add a budget line</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-ux2-line bg-ux2-surface px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-2.5 text-[13px]">
          <span className="font-semibold text-ux2-muted">Where the dues go</span>
          <Chip tone="ghost">Dues {fmt(dues)}</Chip><span className="text-ux2-muted">→</span>
          <Chip tone="navy">Reserves {fmt(reserve)} · {pct(reserve)}%</Chip><span className="text-ux2-muted">→</span>
          <Chip tone="ghost">The {bud.lines} lines {fmt(bud.total)} · {pct(bud.total)}%</Chip>
        </div>
        <Button size="sm" variant="ghost" className="h-9 !text-xs" onClick={() => onSection('reserves')}>Reserve contribution is set on Reserves ›</Button>
      </div>
      {adding && <BudgetLineForm onClose={() => setAdding(false)} />}
      {editing && <EditAmountForm key={editing.id} line={editing} onClose={() => setEditing(null)} />}
      {rows.length === 0 ? <Inner className="text-sm text-ux2-muted">{filter === 'over' ? 'No line is over its budget.' : 'No budget lines yet.'}</Inner> : (
        <Table>
          <thead><tr><Th>Budget line</Th><Th num>Budget</Th><Th num>Spent</Th><Th num>Left</Th><Th style={{ width: '22%' }}>Used</Th><Th>Status</Th><Th aria-label="Actions" /></tr></thead>
          <tbody>
            {rows.map(b => {
              const used = b.budgeted > 0 ? Math.round((b.actual / b.budgeted) * 100) : 0;
              const isOver = b.budgeted > 0 && b.actual > b.budgeted;
              return (
                <tr key={b.id ?? b.name} className={isOver ? 'bg-ux2-red-tint/60' : ''}>
                  <Td className="font-semibold">{b.name}{b.acctNum && <span className="text-xs font-normal text-ux2-muted"> · {b.acctNum}</span>}</Td>
                  <Td num>{fmt(b.budgeted)}</Td>
                  <Td num className={isOver ? 'font-semibold text-ux2-red-ink' : ''}>{fmt(b.actual)}</Td>
                  <Td num className={isOver ? 'text-ux2-red-ink' : ''}>{isOver ? `−${fmt(b.actual - b.budgeted)}` : fmt(b.budgeted - b.actual)}</Td>
                  <Td><Bar pct={Math.min(100, used)} mark={bud.expectedPct} tone={isOver ? 'red' : 'teal'} label={`${used} percent used`} /></Td>
                  <Td>{lineStatus(b)}</Td>
                  <Td num><RowMenu label={`More for ${b.name}`} items={[{ label: 'Change the amount', onSelect: () => setEditing(b) }, { label: 'Show its bills', onSelect: () => onGo('expenses', 'bills') }]} /></Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <div className="flex flex-wrap items-start gap-3">
        {filter === 'biggest' && rest.length > 0 && <button type="button" onClick={() => setFilter('all')} className="shrink-0"><Chip tone="ghost">{rest.length} more lines · {fmt(rest.reduce((t, b) => t + b.budgeted, 0))} budget · {fmt(rest.reduce((t, b) => t + b.actual, 0))} spent</Chip></button>}
        <Why>{rest.length > 0 && filter === 'biggest' ? `${rest.map(b => b.name).join(', ')}. ` : ''}The mark on each bar is where {bud.expectedPct}% sits. Each line is edited from its own row: the ··· menu changes the amount or shows its bills.</Why>
      </div>
    </Card>
  );
}

function NextYearCard({ snap }: { snap: FundsSnapshot }) {
  const draft = nextYearScenarios(snap);
  const res = reserveSummary(snap);
  const [pick, setPick] = useState<'keep' | 'recommended' | 'minimum'>('keep');
  const chosen = draft.scenarios.find(s => s.id === pick)!;
  const navigate = useNavigate();
  const meetings = useMeetingsStore(s => s.meetings);
  const units = Math.max(1, snap.units.length);
  const year = Number(snap.today.slice(0, 4));
  const lines = [...snap.budget].sort((a, b) => b.budgeted - a.budgeted).slice(0, 3);
  const nextMeeting = meetings.map(m => m.date).filter(d => d >= snap.today).sort()[0];
  const gapAfter = res.next ? Math.max(0, res.next.cost - (res.next.funded + chosen.reserveAnnual * Math.max(0, res.next.year - year))) : 0;
  return (
    <Card aria-label="Next year draft" id="draft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2"><h2 className="m-0 text-lg font-medium text-ux2-ink">Next year: {draft.year} draft</h2><Chip tone="ghost">Runbook · annual budget</Chip></div>
        <Chip tone="ghost">Drafted for you · refreshed from this year's actuals</Chip>
      </div>
      <PillTabs size="filter" surface="white" aria-label="Dues options" value={pick} onChange={setPick} tabs={draft.scenarios.map(s => ({ id: s.id, label: `${s.id === 'keep' ? `Dues stay at ${fmt(s.dues)}` : `${fmt(s.dues)} · ${s.id === 'recommended' ? (res.next ? `${res.next.name.toLowerCase()} funded on time` : 'reserves funded') : 'the minimum'}`}` }))} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Inner className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2"><div className="text-xs font-semibold uppercase tracking-[0.08em] text-ux2-muted">If dues {pick === 'keep' ? 'stay at' : 'move to'} {fmt(chosen.dues)}</div><Chip tone="ghost">Computed</Chip></div>
          <KV label={`Dues, ${units} units`}>{fmt(chosen.dues * 12 * units)}</KV>
          <KV label="Reserves">{fmt(chosen.reserveAnnual)}{chosen.reserveAnnual === snap.annualReserveContribution ? ' · unchanged' : ''}</KV>
          <KV label={`The ${snap.budget.length} lines`}>{fmt(chosen.linesAnnual)}</KV>
          {res.next && <KV label={`${res.next.name} in ${res.next.year}`}>{gapAfter > 0 ? `special assessment ≈ ${fmt(Math.round(gapAfter / units))} a unit` : 'funded'}</KV>}
        </Inner>
        <Inner className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2"><div className="text-xs font-semibold uppercase tracking-[0.08em] text-ux2-muted">What changes from {year}</div><Chip tone="amber">{lines.length ? 1 : 0} needs you</Chip></div>
          {lines.map((b, i) => (
            <div key={b.id ?? b.name} className="flex items-center justify-between gap-2 border-b border-ux2-line py-2 text-sm last:border-b-0">
              <span className="min-w-0"><span className="text-ux2-ink">{b.name}</span><span className="text-xs text-ux2-muted"> · {i === 0 ? `suggested, this year's ${fmt(b.actual)} plus 3%` : 'rolled forward from this year'}</span></span>
              <span className="flex shrink-0 items-center gap-2"><b className="font-semibold">{fmt(Math.round((i === 0 ? b.actual : b.budgeted) * 1.03))}</b>{i === 0 ? <Chip tone="ghost">Accept</Chip> : <Chip tone="sage">Filled</Chip>}</span>
            </div>
          ))}
          {lines.length === 0 && <div className="text-sm text-ux2-muted">No lines yet.</div>}
        </Inner>
        <Inner className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2"><div className="text-xs font-semibold uppercase tracking-[0.08em] text-ux2-muted">Where it stands</div><Chip tone="teal">Live</Chip></div>
          <KV label="Sent to owners">30 days before FY · Dec 1</KV>
          <KV label="Owner vote">opens when sent</KV>
          <KV label="Board vote">{nextMeeting ? `${dayLabel(nextMeeting)} meeting` : 'next meeting'}</KV>
          <KV label="Adopt by">Jan 1</KV>
          <div className="mt-2 flex gap-2"><Button size="sm" onClick={() => navigate('/issues?view=new')}>Open the draft</Button><Button size="sm" variant="ghost" onClick={() => navigate('/community?tab=votes')}>Owner vote</Button></div>
        </Inner>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="font-semibold text-ux2-muted">Done for you</span>
        {[`Rolled forward from ${year} actuals`, 'Dues from the fee schedule', res.next ? `${res.next.name} gap from the funding model` : 'Reserve gap from the funding model', 'Vote counts and dates live', 'Sent to owners 30 days before FY'].map(t => <Chip key={t} tone="ghost">{t}</Chip>)}
      </div>
      <Why>Yours to decide: the dues option{lines[0] ? ` and the ${lines[0].name.toLowerCase()} line` : ''}. Picking a dues pill rewrites the reserve line and the plan above; the choice is recorded in the case and the minutes. Next year the draft appears again with {draft.year} actuals, without anyone setting it up.</Why>
    </Card>
  );
}

function AssetForm({ onClose }: { onClose: () => void }) {
  const add = useFinancialStore(s => s.addReserveItem);
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [years, setYears] = useState('');
  const [life, setLife] = useState('');
  return (
    <form aria-label="Add an asset" onSubmit={e => { e.preventDefault(); if (!name) return; add({ name, estimatedCost: Number(cost) || 0, currentFunding: 0, usefulLife: Number(life) || Number(years) || 10, lastReplaced: '', yearsRemaining: Number(years) || 10, isContingency: false }); onClose(); }} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <Field label="Asset" className="min-w-[200px] flex-1"><input value={name} onChange={e => setName(e.target.value)} placeholder="Boiler" className={INPUT} /></Field>
      <Field label="Replacement cost" className="w-[150px]"><input inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} placeholder="$" className={INPUT} /></Field>
      <Field label="Years left" className="w-[110px]"><input inputMode="numeric" value={years} onChange={e => setYears(e.target.value)} className={INPUT} /></Field>
      <Field label="Useful life" className="w-[110px]"><input inputMode="numeric" value={life} onChange={e => setLife(e.target.value)} className={INPUT} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={!name}>Add</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

/** The reserve card: funding table, the replacement warning, and the monthly contribution lever. Same store action as the Budget editor. */
export function ReservesCard({ snap }: { snap: FundsSnapshot }) {
  const res = reserveSummary(snap);
  const setAnnual = useFinancialStore(s => s.setAnnualReserveContribution);
  const addItem = useFinancialStore(s => s.addReserveItem);
  const reserveStudyDate = useFinancialStore(s => s.reserveStudyDate);
  const reserveStudyEveryYears = useFinancialStore(s => s.reserveStudyEveryYears);
  const setReserveStudy = useFinancialStore(s => s.setReserveStudy);
  const [studyDate, setStudyDate] = useState(reserveStudyDate ?? '');
  const [studyYears, setStudyYears] = useState(String(reserveStudyEveryYears || 3));
  const studyLast = lastStudyDate();
  const studyNext = studyLast ? addYears(studyLast, everyYears(reserveStudyEveryYears)) : null;
  const year = Number(snap.today.slice(0, 4));
  const [choice, setChoice] = useState<'today' | 'recommended' | 'custom'>('today');
  const [custom, setCustom] = useState('');
  const [adding, setAdding] = useState(false);
  const monthly = choice === 'today' ? res.monthly : choice === 'recommended' ? res.recommendedMonthly : Number(custom) || 0;
  const units = Math.max(1, snap.units.length);
  const yearsOut = res.next ? Math.max(0, res.next.year - year) : 0;
  const reachBy = (m: number) => (res.next ? res.next.funded + m * 12 * yearsOut : 0);
  const avgDues = Math.round(snap.units.reduce((t, u) => t + u.monthlyFee, 0) / units) || 0;
  const hasContingency = snap.reserves.some(r => r.isContingency);
  const items = snap.reserves.filter(r => !r.isContingency);
  return (
    <Card aria-label="Reserves" id="reserves">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-lg font-medium text-ux2-ink">Reserves</h2>
        <Chip tone="ghost">Reserve study {res.next ? `· next update due Mar 31` : ''}</Chip>
      </div>
      <div><span className="text-[28px] font-semibold tracking-[-0.03em] text-ux2-ink">{fmt(res.funded)}</span><span className="text-sm text-ux2-muted"> in the reserve account · {res.pct}% of {fmt(res.needed)}</span></div>
      <Bar pct={res.pct} tone={res.pct < 50 ? 'red' : 'teal'} label={`${res.pct} percent funded`} />
      {res.unallocated !== 0 && (
        <Inner className="text-[13px] text-ux2-ink" aria-label="Reserve allocation">
          {res.unallocated > 0
            ? <><b className="font-semibold">{fmt(res.unallocated)} not yet set aside for a component.</b> <span className="text-ux2-muted">The reserve account holds {fmt(res.funded)}; the items below claim {fmt(res.allocated)}. Edit an item's set-aside so the split adds up.</span></>
            : <><b className="font-semibold text-ux2-red-ink">The items claim {fmt(-res.unallocated)} more than the reserve account holds.</b> <span className="text-ux2-muted">The account has {fmt(res.funded)} in the ledger{res.funded === 0 ? ' (enter the opening balances under Accounts and ledger if the money is there)' : ''}; the set-asides below add up to {fmt(res.allocated)}.</span></>}
        </Inner>
      )}
      {items.length === 0 ? <Inner className="text-sm text-ux2-muted">No reserve items yet. Add the roof, boiler and elevator with their replacement year.</Inner> : (
        <Table minWidth={640}>
          <thead><tr><Th>Asset</Th><Th>Replace</Th><Th num>Cost</Th><Th num>Set aside</Th><Th num>Funded</Th></tr></thead>
          <tbody>
            {[...items].sort((a, b) => a.yearsRemaining - b.yearsRemaining).map(r => {
              const p = r.estimatedCost > 0 ? Math.round((r.currentFunding / r.estimatedCost) * 100) : 0;
              const yrs = Math.max(0, Math.round(r.yearsRemaining));
              return (
                <tr key={r.id} className={r.currentFunding > 0 && p < 50 ? 'bg-ux2-red-tint/60' : ''}>
                  <Td className="font-semibold">{r.name}</Td>
                  <Td>{year + yrs} <span className="text-xs text-ux2-muted">· {yrs} year{yrs === 1 ? '' : 's'}</span></Td>
                  <Td num>{fmt(r.estimatedCost)}</Td>
                  <Td num>{fmt(r.currentFunding)}</Td>
                  <Td num>{r.currentFunding > 0 ? <Chip tone={p < 50 ? 'red' : 'sage'}>{p}%</Chip> : <Chip tone="ghost">Not reserved</Chip>}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      {res.next && res.gap > 0 && (
        <div className="rounded-[14px] bg-ux2-red-tint px-3.5 py-3 text-[13px] text-ux2-ink">
          <b className="font-semibold text-ux2-red-ink">Approaching replacement.</b> The {res.next.name.toLowerCase()} is {yearsOut} year{yearsOut === 1 ? '' : 's'} out with a {fmt(Math.max(0, res.next.cost - res.next.funded))} gap. At {fmt(res.monthly)} a month the reserves reach {fmt(reachBy(res.monthly))} by {res.next.year}, so {reachBy(res.monthly) >= res.next.cost ? 'it is covered from dues alone' : 'the rest comes from a special assessment, a loan, or higher dues'}.
        </div>
      )}
      {adding && <AssetForm onClose={() => setAdding(false)} />}
      <div className="flex flex-col gap-2.5 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3" aria-label="Reserve contribution">
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-base font-semibold text-ux2-ink">Monthly reserve contribution · the lever you control</div><Chip tone="ghost">Taken from dues before the {snap.budget.length} lines · changes Jan 1</Chip></div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {([
            { id: 'today' as const, amount: res.monthly, title: `${fmt(res.monthly)} a month`, sub: 'today', note: `${fmt(res.monthly * 12)} a year.${res.next ? ` Reserves reach ${fmt(reachBy(res.monthly))} by ${res.next.year}${reachBy(res.monthly) < res.next.cost ? `, ${fmt(res.next.cost - reachBy(res.monthly))} short for the ${res.next.name.toLowerCase()}` : ''}.` : ''} Dues stay at ${fmt(avgDues)}.`, chip: res.onSchedule ? <Chip tone="sage">Funded</Chip> : <Chip tone="red">Short</Chip> },
            { id: 'recommended' as const, amount: res.recommendedMonthly, title: `${fmt(res.recommendedMonthly)} a month`, sub: 'recommended', note: `${fmt(res.recommendedMonthly * 12)} a year.${res.next ? ` ${res.next.name} fully funded by ${res.next.year} from dues alone.` : ''} Needs dues of about ${fmt(avgDues + Math.max(0, Math.round((res.recommendedMonthly - res.monthly) / units)))}, or ${fmt(Math.max(0, Math.round((res.recommendedMonthly - res.monthly) / units)))} a unit more.`, chip: <Chip tone="sage">Funded</Chip> },
          ]).map(o => (
            <label key={o.id} className={`flex cursor-pointer items-start justify-between gap-2 rounded-[14px] border bg-white px-3.5 py-3 text-sm ${choice === o.id ? 'border-ux2-navy' : 'border-ux2-line'}`}>
              <span><input type="radio" name="contrib" checked={choice === o.id} onChange={() => setChoice(o.id)} className="mr-2 align-middle" /><b className="font-semibold">{o.title}</b> · {o.sub}<div className="mt-1 text-xs text-ux2-muted">{o.note}</div></span>
              {o.chip}
            </label>
          ))}
          <label className={`flex cursor-pointer items-start justify-between gap-2 rounded-[14px] border bg-white px-3.5 py-3 text-sm ${choice === 'custom' ? 'border-ux2-navy' : 'border-ux2-line'}`}>
            <span><input type="radio" name="contrib" checked={choice === 'custom'} onChange={() => setChoice('custom')} className="mr-2 align-middle" /><b className="font-semibold">Another amount</b><div className="mt-1 text-xs text-ux2-muted">Type a monthly figure; the plan and the dues number update as you go.</div></span>
            <input aria-label="Custom monthly contribution" inputMode="numeric" placeholder="$" value={custom} onFocus={() => setChoice('custom')} onChange={e => { setCustom(e.target.value); setChoice('custom'); }} className="h-10 w-[110px] shrink-0 rounded-full border border-ux2-line-strong px-3.5 text-sm" />
          </label>
        </div>
        <Inner className="flex flex-wrap items-end justify-between gap-3" aria-label="Reserve study">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ux2-ink">Reserve study · {studyLast ? `last ${dayLabel(studyLast)}, next due ${dayLabel(studyNext!)}` : 'none on record'}</div>
            <p className="m-0 text-xs text-ux2-muted">The Reserve study update runbook opens its case 90 days before the next one is due{reserveStudyDate ? '' : studyLast ? ', reading the date from the newest reserve study file under Building › Documents until one is set here' : ', or at once while none is on record'}. Enter the study's date when a new one arrives.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Last study" className="w-[150px]"><input type="date" aria-label="Last reserve study" value={studyDate} onChange={e => setStudyDate(e.target.value)} className={INPUT} /></Field>
            <Field label="Lasts (years)" className="w-[110px]"><input inputMode="numeric" aria-label="Years a study lasts" value={studyYears} onChange={e => setStudyYears(e.target.value)} className={INPUT} /></Field>
            <Button size="sm" variant="ghost" onClick={() => setReserveStudy(studyDate || null, Number(studyYears) || undefined)}>Save</Button>
          </div>
        </Inner>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-ux2-muted">Whatever you set here is the reserve line in next year's draft. Contingency fund: {hasContingency ? 'set up' : 'none set up'}.</span>
          <span className="flex flex-wrap gap-2">
            {!hasContingency && <Button size="sm" variant="ghost" onClick={() => addItem({ name: 'Contingency fund', estimatedCost: Math.round(snap.budget.reduce((t, b) => t + b.budgeted, 0) * 0.1), currentFunding: 0, usefulLife: 1, lastReplaced: '', yearsRemaining: 1, isContingency: true })}>Create a contingency fund</Button>}
            <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>Add an asset</Button>
            <Button size="sm" onClick={() => setAnnual(Math.max(0, Math.round(monthly * 12)))} disabled={choice === 'custom' && !custom}>Save contribution</Button>
          </span>
        </div>
      </div>
      <Why>Funded is the reserve account's balance in the ledger; Set aside is how that money is split across the items, a plan rather than a posting. Recommended means: fund the next replacement fully from dues alone, based on remaining life and the gap. Items with nothing set aside are treated as repairs until they are reserved.</Why>
    </Card>
  );
}

export default function PlanningTab({ snap, section, onSection, onGo }: { snap: FundsSnapshot; section?: string; onSection: (s: string) => void; onGo: (tab: FundsTab, section?: string) => void }) {
  const bud = budgetSummary(snap);
  const res = reserveSummary(snap);
  const draft = nextYearScenarios(snap);
  const current: Section = (SECTIONS as string[]).includes(section ?? '') ? (section as Section) : 'budget';
  const year = snap.today.slice(0, 4);
  const monthEnd = new Date(Number(year), Number(snap.today.slice(5, 7)) - 1, 0);

  const sections: TileSection<Section>[] = [
    {
      id: 'budget',
      tile: {
        tone: 'grey',
        label: `This year · budget`,
        meta: `through ${monthEnd.toLocaleDateString('en-US', { month: 'short' })} ${monthEnd.getDate()}`,
        value: `${bud.pct}%`,
        unit: `used · ${bud.expectedPct}% expected by now`,
        children: (
          <>
            <Bar pct={bud.pct} mark={bud.expectedPct} tone={bud.over.length ? 'red' : 'teal'} label={`${bud.pct} percent used`} />
            <div>
              <KV label="Spent">{fmt(bud.spent)} of {fmt(bud.total)}</KV>
              <KV label="On track">{bud.onTrack} of {bud.lines} lines</KV>
              {bud.over.slice(0, 1).map(o => <KV key={o.name} label={<span className="text-ux2-red-ink">{o.name}</span>}><span className="text-ux2-red-ink">over by {fmt(o.overBy)}</span></KV>)}
            </div>
          </>
        ),
        action: bud.over.length > 0
          ? <><span className="min-w-0 truncate"><b className="font-semibold">Cover {bud.over[0].name.toLowerCase()} from contingency</b> · then the lines</span><Chip tone="red">{bud.over.length} over</Chip></>
          : <><span className="min-w-0 truncate"><b className="font-semibold">Every line inside its budget</b></span><Chip tone="sage">On track</Chip></>,
      },
      detail: <BudgetCard snap={snap} onSection={onSection} onGo={onGo} />,
    },
    {
      id: 'draft',
      tile: {
        tone: 'navy',
        label: `${draft.year} budget · decide`,
        meta: <Chip tone="white" className="!bg-white/[0.15] normal-case tracking-normal">Computed</Chip>,
        value: fmt(draft.scenarios[0].dues),
        unit: `dues from January, or ${fmt(draft.scenarios[1].dues)} or ${fmt(draft.scenarios[2].dues)}`,
        children: (
          <div>
            <KV dark label="Owner vote">opens when sent</KV>
            <KV dark label="Board vote">next meeting</KV>
            <KV dark label="Adopt by">Jan 1</KV>
          </div>
        ),
        action: <><span className="min-w-0 truncate"><b className="font-semibold">Pick the dues number</b> · the three options, below</span><Chip tone="white" className="!bg-white !text-ux2-navy">Decide</Chip></>,
      },
      detail: <NextYearCard snap={snap} />,
    },
    {
      id: 'reserves',
      tile: {
        tone: res.pct < 50 ? 'red' : 'grey',
        label: res.next ? `Reserves · ${res.next.name.toLowerCase()} gap` : 'Reserves',
        meta: 'study update due Mar 31',
        value: `${res.pct}%`,
        unit: `${fmt(res.funded)} of ${fmt(res.needed)}${res.next ? `, due ${res.next.year}` : ''}`,
        children: (
          <div>
            <KV dark={res.pct < 50} label={res.onSchedule ? `On schedule at ${fmt(res.monthly)} a month` : `Short at ${fmt(res.monthly)} a month`}>{fmt(res.gap)}</KV>
            {res.next && <KV dark={res.pct < 50} label={`${res.next.name} · ${fmt(res.next.cost)}`}>{res.next.cost ? Math.round((res.next.funded / res.next.cost) * 100) : 0}% funded</KV>}
          </div>
        ),
        action: <><span className="min-w-0 truncate"><b className="font-semibold">Set the monthly contribution</b> · {fmt(res.monthly)} today, {fmt(res.recommendedMonthly)} recommended</span><Chip tone="white" className={res.pct < 50 ? '!bg-white !text-ux2-red-ink' : '!bg-ux2-navy !text-white'}>Lever</Chip></>,
      },
      detail: <ReservesCard snap={snap} />,
    },
  ];

  return <TileSwitcher sections={sections} value={current} onChange={onSection} hint="Tap a tile to open its detail below. The other two stay one tap away." />;
}
