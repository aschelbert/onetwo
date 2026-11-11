import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PayrollTab from '@/features/association-team/tabs/PayrollTab';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useSpendingStore, type SpendingApproval } from '@/store/useSpendingStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useAuthStore } from '@/store/useAuthStore';
import { fmt } from '@/lib/formatters';
import type { WorkOrder } from '@/data/financial';
import { Button, Card, Chip, Inner, PillTabs, TileSwitcher, type TileSection, Table, Th, Td, Cell, RowMenu, KV, Why, Field, INPUT } from '../../components';
import { dayLabel } from '../../home/calendar';
import { bills, reserveSummary, type FundsSnapshot } from '../metrics';
import type { FundsTab } from '../FundsPage';

type Section = 'bills' | 'decisions' | 'workorders';
const SECTIONS: Section[] = ['bills', 'decisions', 'workorders'];

const DAY = 86400000;
const plusDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * DAY).toISOString().slice(0, 10);

function useLines(snap: FundsSnapshot) {
  return useMemo(() => new Map(snap.budget.filter(b => b.acctNum).map(b => [b.acctNum!, b])), [snap.budget]);
}

function woStatus(w: WorkOrder, flagged: boolean) {
  if (w.status === 'paid') return <Chip tone="sage">Paid{w.paidDate ? ` · ${dayLabel(w.paidDate)}` : ''}</Chip>;
  if (w.status === 'invoiced') return flagged ? <Chip tone="red">Flagged · over budget</Chip> : <Chip tone="cyan">Invoiced</Chip>;
  if (w.status === 'approved') return <Chip tone="teal">Approved · awaiting invoice</Chip>;
  return <Chip tone="ghost">Draft</Chip>;
}

/** Inline forms: create a work order, receive an invoice against an approved one. */
function WorkOrderForm({ onClose }: { onClose: () => void }) {
  const create = useFinancialStore(s => s.createWorkOrder);
  const accts = useFinancialStore(s => s.getAcctsByType('expense'));
  const [title, setTitle] = useState('');
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [acct, setAcct] = useState(accts[0]?.num ?? '5010');
  return (
    <form aria-label="Create a work order" onSubmit={e => { e.preventDefault(); if (!title) return; create({ title, vendor: vendor || 'Vendor', amount: Number(amount) || 0, acctNum: acct }); onClose(); }} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <div className="w-full text-sm font-semibold text-ux2-ink">Create a work order · it starts as a draft</div>
      <Field label="What" className="min-w-[220px] flex-1"><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Hallway light, 2nd floor" className={INPUT} /></Field>
      <Field label="Vendor" className="w-[180px]"><input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Spark Electric" className={INPUT} /></Field>
      <Field label="Estimate" className="w-[120px]"><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="$" className={INPUT} /></Field>
      <Field label="Budget line" className="w-[220px]"><select value={acct} onChange={e => setAcct(e.target.value)} className={INPUT}>{accts.map(a => <option key={a.num} value={a.num}>{a.name}</option>)}</select></Field>
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={!title}>Create</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

function ReceiveInvoiceForm({ candidates, initial, today, onClose }: { candidates: WorkOrder[]; initial?: string; today: string; onClose: () => void }) {
  const receive = useFinancialStore(s => s.receiveInvoice);
  const [id, setId] = useState(initial ?? candidates[0]?.id ?? '');
  const [num, setNum] = useState('');
  const [amount, setAmount] = useState(() => String(candidates.find(w => w.id === (initial ?? candidates[0]?.id))?.amount ?? ''));
  const [date, setDate] = useState(today);
  return (
    <form aria-label="Receive an invoice" onSubmit={e => { e.preventDefault(); if (!id) return; receive(id, num || 'INV', Number(amount) || 0, date || undefined); onClose(); }} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <div className="w-full text-sm font-semibold text-ux2-ink">Receive an invoice · against an approved work order</div>
      <Field label="Work order" className="min-w-[240px] flex-1"><select value={id} onChange={e => { setId(e.target.value); const w = candidates.find(c => c.id === e.target.value); if (w) setAmount(String(w.amount)); }} className={INPUT}>{candidates.map(w => <option key={w.id} value={w.id}>{w.id} · {w.title}</option>)}</select></Field>
      <Field label="Invoice #" className="w-[150px]"><input value={num} onChange={e => setNum(e.target.value)} placeholder="INV 4471" className={INPUT} /></Field>
      <Field label="Amount" className="w-[120px]"><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} className={INPUT} /></Field>
      <Field label="Invoice date" className="w-[160px]"><input type="date" value={date} onChange={e => setDate(e.target.value)} className={INPUT} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={!id || candidates.length === 0}>Receive</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
      <Why className="basis-full">The expense is booked the day the invoice arrives, under its budget line, and sits in Bills to pay until it is paid.</Why>
    </form>
  );
}

type BillFilter = 'toapprove' | 'flagged' | 'approved' | 'drafts' | 'paid';

function BillsCard({ snap, onSection }: { snap: FundsSnapshot; onSection: (s: string) => void }) {
  const bl = bills(snap);
  const lines = useLines(snap);
  const navigate = useNavigate();
  const approve = useFinancialStore(s => s.approveWorkOrder);
  const pay = useFinancialStore(s => s.payWorkOrder);
  const [filter, setFilter] = useState<BillFilter>('toapprove');
  const [form, setForm] = useState<{ kind: 'receive'; id?: string } | null>(null);
  const [all, setAll] = useState(false);
  const flagged = new Set(bl.flagged.map(w => w.id));
  const rows = { toapprove: bl.toApprove, flagged: bl.flagged, approved: bl.approved, drafts: bl.drafts, paid: [...snap.workOrders.filter(w => w.status === 'paid')].sort((a, b) => (b.paidDate ?? '').localeCompare(a.paidDate ?? '')) }[filter];
  const shown = all ? rows : rows.slice(0, 8);
  const actionFor = (w: WorkOrder) => {
    if (w.status === 'invoiced') return <Button size="sm" variant="ghost" onClick={() => pay(w.id)}>Approve</Button>;
    if (w.status === 'approved') return <Button size="sm" variant="ghost" onClick={() => setForm({ kind: 'receive', id: w.id })}>Receive invoice</Button>;
    if (w.status === 'draft') return <Button size="sm" variant="ghost" onClick={() => approve(w.id)}>Approve</Button>;
    return null;
  };
  return (
    <Card aria-label="Bills" id="bills">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3"><h2 className="m-0 text-lg font-medium text-ux2-ink">Bills</h2><span className="max-w-[560px] text-[13px] text-ux2-muted">Approve here means pay: the spending was already decided. Each bill sits on a work order, so the vendor, the budget line and the approval travel together</span></div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <PillTabs size="filter" surface="white" aria-label="Filter bills" value={filter} onChange={setFilter} tabs={[{ id: 'toapprove', label: `To approve · ${bl.toApprove.length}` }, { id: 'flagged', label: `Flagged · ${bl.flagged.length}` }, { id: 'approved', label: `Approved · ${bl.approved.length}` }, { id: 'drafts', label: `Drafts · ${bl.drafts.length}` }, { id: 'paid', label: 'Paid' }]} />
          <Button size="sm" className="h-9" variant="ghost" onClick={() => setForm({ kind: 'receive' })} disabled={bl.approved.length === 0}>Receive an invoice</Button>
          <Button size="sm" className="h-9" onClick={() => bl.within.forEach(w => pay(w.id))} disabled={bl.within.length === 0}>Approve all {bl.within.length} within budget</Button>
        </div>
      </div>
      {form && <ReceiveInvoiceForm key={form.id ?? 'any'} candidates={bl.approved} initial={form.id} today={snap.today} onClose={() => setForm(null)} />}
      {rows.length === 0 ? <Inner className="text-sm text-ux2-muted">{filter === 'toapprove' ? 'Nothing is waiting for approval.' : 'Nothing here.'}</Inner> : (
        <Table>
          <thead><tr><Th>Bill</Th><Th>Vendor</Th><Th>Budget line</Th><Th num>Amount</Th><Th>Due</Th><Th>Status</Th><Th aria-label="Approve" /><Th aria-label="Actions" /></tr></thead>
          <tbody>
            {shown.map(w => {
              const line = lines.get(w.acctNum);
              const isFlag = flagged.has(w.id);
              const over = line ? line.actual + w.amount - line.budgeted : 0;
              return (
                <tr key={w.id} className={isFlag ? 'bg-ux2-red-tint/60' : ''}>
                  <Td><Cell title={w.title} note={`${w.id}${w.invoiceNum ? ` · INV ${w.invoiceNum}` : ''}${w.caseId ? ` · from ${w.caseId}` : ''}${w.status === 'draft' ? ' · draft' : ''}`} /></Td>
                  <Td>{w.vendor}</Td>
                  <Td>{line?.name ?? w.acctNum}{isFlag && <span className="text-xs text-ux2-muted"> · over by {fmt(over)}</span>}</Td>
                  <Td num className="font-semibold">{w.amount ? (w.status === 'approved' || w.status === 'draft' ? `est. ${fmt(w.amount)}` : fmt(w.amount)) : '–'}</Td>
                  <Td className="whitespace-nowrap text-ux2-muted">{w.status === 'invoiced' && w.invoiceDate ? dayLabel(plusDays(w.invoiceDate, 30)) : '–'}</Td>
                  <Td>{woStatus(w, isFlag)}</Td>
                  <Td num>{actionFor(w)}</Td>
                  <Td num><RowMenu label={`More for ${w.id}`} items={[...(w.caseId ? [{ label: 'Open the action', onSelect: () => navigate(`/issues?view=case:${w.caseId}`) }] : []), ...(w.status !== 'paid' ? [{ label: 'Mark paid · check written by hand', onSelect: () => pay(w.id) }] : []), { label: 'Show the budget line', onSelect: () => navigate('/funds?tab=planning&section=budget') }]} /></Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <div className="flex flex-wrap items-start gap-3">
        {rows.length > 8 && <button type="button" onClick={() => setAll(v => !v)} className="shrink-0"><Chip tone="ghost">{all ? 'Show fewer' : `${rows.length - 8} more`}</Chip></button>}
        <Why>A flagged bill pushes a budget line past 100%. Approving it is fine; it moves the line to Planning's "over" list and asks where the money comes from.</Why>
      </div>
      <Why>A work order moves Draft, then Approved, then Invoiced, then Paid. Approving a bill here pays it on its due date from operating cash and posts the ledger entry; "Mark paid" covers a check written by hand. <button type="button" onClick={() => onSection('workorders')} className="font-semibold text-ux2-teal hover:underline">All work orders</button></Why>
    </Card>
  );
}

const SOURCES: { id: SpendingApproval['fundingSource']; label: string }[] = [
  { id: 'operating', label: 'Operating budget' },
  { id: 'reserves', label: 'Reserves' },
  { id: 'special_assessment', label: 'Special assessment' },
  { id: 'insurance', label: 'Insurance claim' },
  { id: 'loan', label: 'Loan' },
];

function lineFor(snap: FundsSnapshot, a: SpendingApproval) {
  const pick = (re: RegExp) => snap.budget.find(b => re.test(b.name));
  return a.category === 'maintenance' ? pick(/maint|repair/i) : a.category === 'legal' ? pick(/legal/i) : a.category === 'operations' ? pick(/util|clean|operat/i) : undefined;
}

function DecisionsCard({ snap, onGo }: { snap: FundsSnapshot; onGo: (tab: FundsTab, section?: string) => void }) {
  const approvals = useSpendingStore(s => s.approvals);
  const castVote = useSpendingStore(s => s.castVote);
  const update = useSpendingStore(s => s.updateApproval);
  const boardSize = useBuildingStore(s => s.board.length) || 5;
  const me = useAuthStore(s => s.currentUser.name);
  const navigate = useNavigate();
  const pending = useMemo(() => approvals.filter(a => a.status === 'pending'), [approvals]);
  const [pos, setPos] = useState(0);
  const [decided, setDecided] = useState(0);
  const i = Math.min(pos, Math.max(0, pending.length - 1));
  const a = pending[i];
  const res = reserveSummary(snap);
  const units = Math.max(1, snap.units.length);
  const next = () => setPos(p => (pending.length > 1 ? (p + 1) % pending.length : 0));
  const prev = () => setPos(p => (pending.length > 1 ? (p - 1 + pending.length) % pending.length : 0));
  const decide = (status: 'approved' | 'denied') => {
    if (!a) return;
    castVote(a.id, me, status === 'approved' ? 'approve' : 'deny');
    update(a.id, { status, decidedAt: snap.today });
    setDecided(d => d + 1);
    setPos(p => Math.max(0, Math.min(p, pending.length - 2)));
  };
  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-baseline gap-3"><h2 className="m-0 text-lg font-medium text-ux2-ink">Spending decisions</h2><span className="max-w-[640px] text-[13px] text-ux2-muted">Money not yet committed: anything over the ${(a?.threshold ?? 5000).toLocaleString()} limit, over its budget line, or not in the budget at all. Decide first; the work order and its bill then show up under Bills to pay.</span></div>
      <div className="flex items-center gap-2">
        {pending.length > 0 && <Chip tone="ghost">{i + 1} of {pending.length}</Chip>}
        <button type="button" aria-label="Previous request" onClick={prev} disabled={pending.length < 2} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ux2-line-strong bg-white text-ux2-ink disabled:opacity-40">‹</button>
        <button type="button" aria-label="Next request" onClick={next} disabled={pending.length < 2} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ux2-line-strong bg-white text-ux2-ink disabled:opacity-40">›</button>
        <Button size="sm" className="h-9" variant="ghost" onClick={() => navigate('/issues?view=new')}>New spending request</Button>
      </div>
    </div>
  );
  if (!a) {
    return (
      <Card aria-label="Spending decisions" id="decisions">
        {header}
        <div className="flex flex-col items-center gap-2 rounded-[14px] border border-ux2-line bg-white px-4 py-8 text-center">
          <div className="text-lg font-medium text-ux2-ink">Deck is clear</div>
          <p className="m-0 max-w-[520px] text-[13px] text-ux2-muted">{decided ? `${decided} request${decided === 1 ? '' : 's'} decided. Each decision is in the action's decision trail and the requester has a card.` : 'Nothing is waiting on a decision.'} The next request opens here when it arrives.</p>
          <Button size="sm" variant="ghost" onClick={() => navigate('/issues')}>Review them again</Button>
        </div>
      </Card>
    );
  }
  const line = lineFor(snap, a);
  const left = line ? Math.max(0, line.budgeted - line.actual) : 0;
  const approves = a.votes.filter(v => v.vote === 'approve').map(v => v.member);
  const overLimit = a.amount > a.threshold;
  const overLine = !!line && a.amount > left;
  const perUnit = Math.round(a.amount / units);
  const after = Math.max(0, res.funded - a.amount);
  const afterPct = res.needed ? Math.round((after / res.needed) * 100) : 0;
  const statusChip = overLimit ? <Chip tone="plum">Board vote · {approves.length} of {boardSize}</Chip> : overLine ? <Chip tone="amber">Over budget line</Chip> : <Chip tone="ghost">New</Chip>;
  return (
    <Card aria-label="Spending decisions" id="decisions">
      {header}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
        <Inner className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><div className="text-base font-semibold text-ux2-ink">{a.title} · {fmt(a.amount)}</div><div className="text-xs text-ux2-muted">{a.caseId ? `${a.caseId} · ` : ''}requested by {a.requestedBy} · priority {a.priority}{i === 0 ? ' · oldest open' : ''}</div></div>
            {statusChip}
          </div>
          <p className="m-0 text-sm text-ux2-ink">{a.description}{a.notes ? <span className="text-ux2-muted"> {a.notes}</span> : null}</p>
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ux2-muted">Where the money comes from</div>
          <div className="flex flex-wrap gap-1.5">
            {SOURCES.map(s => {
              const note = s.id === 'operating' && line ? ` · ${fmt(left)} left on the line` : s.id === 'reserves' ? (a.category === 'capital' ? ' · recommended' : '') : s.id === 'special_assessment' ? ` · ${fmt(perUnit)} per unit` : '';
              return <button key={s.id} type="button" onClick={() => update(a.id, { fundingSource: s.id })} aria-pressed={a.fundingSource === s.id} className="rounded-full"><Chip tone={a.fundingSource === s.id ? 'navy' : 'ghost'}>{s.label}{note}</Chip></button>;
            })}
          </div>
          <div className="rounded-[10px] bg-ux2-amber-tint px-3 py-2 text-xs text-ux2-ink"><b className="font-semibold">{overLimit ? 'Over' : 'Under'} the ${a.threshold.toLocaleString()} limit</b> · {overLimit ? 'the bylaws let the board approve this from reserves; a special assessment would need an owner vote' : overLine ? 'the Treasurer can approve alone, but the line is over budget so it needs a second signature' : 'the Treasurer can approve alone; it is logged to the decision trail either way'}</div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => decide('approved')}>Approve and next</Button>
            <Button size="sm" variant="ghost" onClick={() => decide('denied')}>Deny and next</Button>
            <Button size="sm" variant="ghost" onClick={next}>Skip for now</Button>
            <Button size="sm" variant="ghost" onClick={() => navigate(a.caseId ? `/issues?view=case:${a.caseId}` : '/issues?view=new')}>Open the action</Button>
          </div>
          <Why>{overLimit ? `Votes so far: ${approves.length ? approves.join(', ') + ' approve.' : 'none.'} ${approves.length < boardSize ? `Waiting on ${boardSize - approves.length} more.` : ''}` : overLine ? 'Needs: Treasurer plus one officer.' : 'No vote needed. Approve, deny, or ask for a second bid.'}</Why>
        </Inner>
        <Card tone="navy" className="gap-1">
          <div className="text-base font-semibold">Know before you decide</div>
          <KV dark label="Operating cash today">{fmt(snap.operatingCash)}</KV>
          <KV dark label="Reserves today">{fmt(res.funded)} · {res.pct}%</KV>
          {a.fundingSource === 'reserves' && <KV dark label="Reserves after">{fmt(after)} · {afterPct}%</KV>}
          {line && <KV dark label={`${line.name} left this year`}>{fmt(left)} of {fmt(line.budgeted)}</KV>}
          {line && <KV dark label="After this">{a.amount > left ? `over by ${fmt(a.amount - left)}` : `${fmt(left - a.amount)} left`}</KV>}
          <KV dark label="Per unit if assessed">{fmt(perUnit)}</KV>
          <p className="m-0 mt-2 text-xs text-white/[0.62]">{a.fundingSource === 'reserves' && res.next ? `Reserves are earmarked for the ${res.next.name.toLowerCase()} in ${res.next.year}. Spending ${fmt(a.amount)} now moves the funded number from ${res.pct}% to ${afterPct}%; the Planning tab shows what that does to the contribution.` : line ? (a.amount > left ? `Approving this pushes ${line.name} over its line for the year; Planning shows where to move the money from.` : `Fits inside the ${line.name} line. A second bid is optional under $${a.threshold.toLocaleString()}.`) : 'Not tied to a budget line yet; pick where the money comes from on the left.'}</p>
          <Button size="sm" variant="ghost" className="mt-2 self-stretch !border-white/[0.35] !bg-transparent !text-white" onClick={() => onGo('planning', 'reserves')}>See the plan</Button>
        </Card>
      </div>
    </Card>
  );
}

type WoFilter = 'open' | 'draft' | 'approved' | 'invoiced' | 'paid';

function WorkOrdersCard({ snap, onSection }: { snap: FundsSnapshot; onSection: (s: string) => void }) {
  const bl = bills(snap);
  const lines = useLines(snap);
  const navigate = useNavigate();
  const approve = useFinancialStore(s => s.approveWorkOrder);
  const pay = useFinancialStore(s => s.payWorkOrder);
  const [filter, setFilter] = useState<WoFilter>('open');
  const [creating, setCreating] = useState(false);
  const [receive, setReceive] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [payroll, setPayroll] = useState(false);
  const flagged = new Set(bl.flagged.map(w => w.id));
  const sorted = [...snap.workOrders].sort((a, b) => b.createdDate.localeCompare(a.createdDate));
  const rows = sorted.filter(w => filter === 'open' ? w.status !== 'paid' : w.status === filter);
  const shown = all ? rows : rows.slice(0, 8);
  const vendors = new Set(snap.workOrders.map(w => w.vendor)).size;
  return (
    <Card aria-label="Work orders" id="workorders">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3"><h2 className="m-0 text-lg font-medium text-ux2-ink">Work orders</h2><span className="text-[13px] text-ux2-muted">Every job the building has asked a vendor to do. A work order moves Draft, then Approved, then Invoiced, then Paid</span></div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <PillTabs size="filter" surface="white" aria-label="Filter work orders" value={filter} onChange={setFilter} tabs={[{ id: 'open', label: `Open · ${bl.open}` }, { id: 'draft', label: `Draft · ${bl.drafts.length}` }, { id: 'approved', label: `Approved · ${bl.approved.length}` }, { id: 'invoiced', label: `Invoiced · ${bl.toApprove.length}` }, { id: 'paid', label: `Paid · ${snap.workOrders.filter(w => w.status === 'paid').length}` }]} />
          <Button size="sm" className="h-9" onClick={() => setCreating(true)}>Create a work order</Button>
        </div>
      </div>
      {creating && <WorkOrderForm onClose={() => setCreating(false)} />}
      {receive && <ReceiveInvoiceForm key={receive} candidates={bl.approved} initial={receive} today={snap.today} onClose={() => setReceive(null)} />}
      {rows.length === 0 ? <Inner className="text-sm text-ux2-muted">No work orders here.</Inner> : (
        <Table>
          <thead><tr><Th>Work order</Th><Th>Vendor</Th><Th>Budget line</Th><Th num>Amount</Th><Th>Opened</Th><Th>Status</Th><Th aria-label="Action" /><Th aria-label="Actions" /></tr></thead>
          <tbody>
            {shown.map(w => (
              <tr key={w.id}>
                <Td><Cell title={w.title} note={`${w.id}${w.caseId ? ` · from ${w.caseId}` : ''}${w.invoiceNum ? ` · INV ${w.invoiceNum}` : w.status === 'draft' ? ' · needs a quote' : ''}`} /></Td>
                <Td>{w.vendor}</Td>
                <Td>{lines.get(w.acctNum)?.name ?? w.acctNum}</Td>
                <Td num className="font-semibold">{w.amount ? (w.status === 'approved' || w.status === 'draft' ? `est. ${fmt(w.amount)}` : fmt(w.amount)) : '–'}</Td>
                <Td className="whitespace-nowrap text-ux2-muted">{dayLabel(w.createdDate)}</Td>
                <Td>{woStatus(w, flagged.has(w.id))}</Td>
                <Td num>{w.status === 'draft' ? <Button size="sm" variant="ghost" onClick={() => approve(w.id)}>Approve</Button> : w.status === 'approved' ? <Button size="sm" variant="ghost" onClick={() => setReceive(w.id)}>Receive invoice</Button> : w.status === 'invoiced' ? <Button size="sm" variant="ghost" onClick={() => pay(w.id)}>Approve</Button> : null}</Td>
                <Td num><RowMenu label={`More for ${w.id}`} items={[...(w.caseId ? [{ label: 'Open the action', onSelect: () => navigate(`/issues?view=case:${w.caseId}`) }] : []), { label: 'Show in Bills', onSelect: () => onSection('bills') }, { label: 'The vendor · Building › Contracts', onSelect: () => navigate('/building?tab=contracts') }]} /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <div className="flex flex-wrap items-start gap-3">
        {rows.length > 8 && <button type="button" onClick={() => setAll(v => !v)} className="shrink-0"><Chip tone="ghost">{all ? 'Show fewer' : `${rows.length - 8} more ${filter === 'open' ? 'open' : ''}`}</Chip></button>}
        <Why>A work order is created from an action, a runbook step or by hand. Vendors are managed under Building › Contracts; each order links to its vendor.</Why>
      </div>
      <Inner className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px]"><b className="font-semibold text-ux2-ink">Vendors and contracts</b> <span className="text-ux2-muted">· {vendors} active · managed under Building › Contracts · bills here link to each vendor</span></span>
        <span className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setPayroll(v => !v)}>{payroll ? 'Hide payroll' : 'Payroll and 1099s'}</Button>
          <Button size="sm" onClick={() => navigate('/building?tab=contracts')}>Open ›</Button>
        </span>
      </Inner>
      {payroll && <div className="ux2-legacy"><PayrollTab /></div>}
    </Card>
  );
}

export default function ExpensesTab({ snap, section, onSection, onGo }: { snap: FundsSnapshot; section?: string; onSection: (s: string) => void; onGo: (tab: FundsTab, section?: string) => void }) {
  const bl = bills(snap);
  const approvals = useSpendingStore(s => s.approvals);
  const pending = approvals.filter(a => a.status === 'pending');
  const pendingAmount = pending.reduce((t, a) => t + a.amount, 0);
  const current: Section = (SECTIONS as string[]).includes(section ?? '') ? (section as Section) : 'bills';
  const pay = useFinancialStore(s => s.payWorkOrder);
  const month = snap.today.slice(0, 7);
  const paidThisMonth = snap.workOrders.filter(w => w.status === 'paid' && w.paidDate?.startsWith(month)).length;
  const boardSize = useBuildingStore(s => s.board.length) || 5;

  const sections: TileSection<Section>[] = [
    {
      id: 'bills',
      tile: {
        tone: 'navy',
        label: 'Bills · to approve',
        meta: <Chip tone="white" className="!bg-white/[0.15] normal-case tracking-normal">Pay from operating</Chip>,
        value: bl.toApprove.length,
        unit: `bills · ${fmt(bl.amount)}`,
        children: (
          <div>
            <KV dark label="Within budget">{bl.within.length} · {fmt(bl.withinAmount)}</KV>
            <KV dark label="Flagged over budget">{bl.flagged.length} · {fmt(bl.flaggedAmount)}</KV>
            <KV dark label="Due this week">{bl.dueSoon.length} · {fmt(bl.dueSoonAmount)}</KV>
          </div>
        ),
        action: <><span className="min-w-0 truncate"><b className="font-semibold">Approve all {bl.within.length} within budget</b>{bl.flagged.length ? ` · the ${bl.flagged.length} flagged one by one` : ''}</span><button type="button" onClick={e => { e.stopPropagation(); bl.within.forEach(w => pay(w.id)); onSection('bills'); }} className="inline-flex h-8 shrink-0 items-center rounded-full bg-white px-3 text-[11px] font-semibold text-ux2-navy">Approve</button></>,
      },
      detail: <BillsCard snap={snap} onSection={onSection} />,
    },
    {
      id: 'decisions',
      tile: {
        tone: 'teal',
        label: 'Spending decisions',
        meta: 'money not yet committed',
        value: pending.length,
        unit: `waiting · ${fmt(pendingAmount)}`,
        children: pending.length > 0 ? (
          <div>{pending.slice(0, 3).map(a => <KV dark key={a.id} label={<span className="truncate">{a.title}</span>}>{fmt(a.amount)}{a.amount > a.threshold ? ` · vote ${a.votes.filter(v => v.vote === 'approve').length} of ${boardSize}` : ''}</KV>)}</div>
        ) : <div className="text-xs text-white/[0.66]">No decisions open</div>,
        action: <><span className="min-w-0 truncate"><b className="font-semibold">Decide, oldest first</b> · one card at a time</span><Chip tone="white" className="!bg-white !text-ux2-teal">Deck</Chip></>,
      },
      detail: <DecisionsCard snap={snap} onGo={onGo} />,
    },
    {
      id: 'workorders',
      tile: {
        tone: 'grey',
        label: 'Work orders',
        meta: `${bl.vendors} vendor${bl.vendors === 1 ? '' : 's'}`,
        value: bl.open,
        unit: 'open',
        children: (
          <>
            <div className="flex h-2 overflow-hidden rounded-full bg-ux2-line" aria-label="Work orders by stage">
              {[['bg-ux2-line-strong', bl.drafts.length], ['bg-ux2-teal', bl.approved.length], ['bg-ux2-cyan', bl.toApprove.length]].map(([c, n], i) => <div key={i} className={String(c)} style={{ width: `${bl.open ? Math.round((Number(n) / bl.open) * 100) : 0}%` }} />)}
            </div>
            <div>
              <KV label={<span><Chip tone="ghost" className="mr-1.5">Draft</Chip>not yet approved</span>}>{bl.drafts.length}</KV>
              <KV label={<span><Chip tone="teal" className="mr-1.5">Approved</Chip>waiting on the invoice</span>}>{bl.approved.length}</KV>
              <KV label={<span><Chip tone="cyan" className="mr-1.5">Invoiced</Chip>in Bills</span>}>{bl.toApprove.length}</KV>
            </div>
          </>
        ),
        action: <><span className="min-w-0 truncate"><b className="font-semibold">Create a work order</b> · from an action or by hand</span><Chip tone="ghost">{paidThisMonth} paid in {new Date(snap.today + 'T00:00').toLocaleDateString('en-US', { month: 'short' })}</Chip></>,
      },
      detail: <WorkOrdersCard snap={snap} onSection={onSection} />,
    },
  ];

  return <TileSwitcher sections={sections} value={current} onChange={onSection} hint="Tap a tile to open its list below. The other two stay one tap away." />;
}
