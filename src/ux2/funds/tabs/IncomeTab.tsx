import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { fmt } from '@/lib/formatters';
import type { Unit, UnitInvoice } from '@/types/financial';
import { Button, Card, Chip, Inner, PillTabs, TileSwitcher, type TileSection, Ring, Table, Th, Td, Cell, RowMenu, SearchInput, Why, Field, INPUT } from '../../components';
import { dayLabel } from '../../home/calendar';
import { ONLINE_METHODS, agingTotals, behind, collected, invoiceSummary, monthName, openAssessments, ordinal, unpaidFees, type BehindUnit, type FundsSnapshot } from '../metrics';
import type { FundsTab } from '../FundsPage';

type Section = 'ledger' | 'behind' | 'invoices';
const SECTIONS: Section[] = ['ledger', 'behind', 'invoices'];

const isOnline = (method?: string | null) => ONLINE_METHODS.includes((method || '').toLowerCase());
const lastPayment = (u: Unit) => [...u.payments].sort((a, b) => b.date.localeCompare(a.date))[0];
const autopay = (u: Unit) => { const p = lastPayment(u); return !!p && isOnline(p.method); };
const feesAndSA = (u: Unit) => {
  const fees = unpaidFees(u);
  const sa = openAssessments(u);
  if (fees && sa) return `${fmt(fees)} late fees · ${fmt(sa)} special assessment`;
  if (fees) return `${fmt(fees)} late fees`;
  if (sa) return `${fmt(sa)} special assessment`;
  return '–';
};

/** Status chip for a unit row: the mock's "Current · autopay", "74 days behind", "SA open · dues current". */
function UnitStatus({ u, b }: { u: Unit; b?: BehindUnit }) {
  if (b) {
    if (b.daysPastDue > 60) return <span className="text-xs font-semibold text-ux2-red-ink">{b.daysPastDue} days behind</span>;
    if (b.daysPastDue > 30) return <span className="text-xs font-semibold text-ux2-amber">1 month behind</span>;
    return <span className="text-xs font-semibold text-ux2-amber">{b.daysPastDue} day{b.daysPastDue === 1 ? '' : 's'} behind</span>;
  }
  if (openAssessments(u) > 0) return <Chip tone="amber">SA open · dues current</Chip>;
  if (u.status === 'UNDER_CONTRACT') return <Chip tone="ghost">Paid by seller{u.moveIn ? ` to ${dayLabel(u.moveIn)}` : ''}</Chip>;
  return <Chip tone="sage">{autopay(u) ? 'Current · autopay' : 'Current'}</Chip>;
}

function LastPayment({ u }: { u: Unit }) {
  const p = lastPayment(u);
  if (!p) return <span className="text-ux2-dim">–</span>;
  return <span className="whitespace-nowrap">{dayLabel(p.date)}{isOnline(p.method) ? '' : ` · ${p.method || 'check'}`}</span>;
}

type Panel = { kind: 'payment' | 'fee' | 'assessment'; unit?: string } | null;

/** The inline forms that replaced the ledger modals: record a payment, add a fee, add a special assessment. */
function UnitForm({ panel, units, onClose }: { panel: NonNullable<Panel>; units: Unit[]; onClose: () => void }) {
  const record = useFinancialStore(s => s.recordUnitPayment);
  const fee = useFinancialStore(s => s.imposeLateFee);
  const assess = useFinancialStore(s => s.addSpecialAssessment);
  const [unit, setUnit] = useState(panel.unit ?? units[0]?.number ?? '');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('check');
  const [reason, setReason] = useState('');
  const title = { payment: 'Record a payment', fee: 'Add a fee', assessment: 'Add a special assessment' }[panel.kind];
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!unit || !Number.isFinite(n) || n <= 0) return;
    if (panel.kind === 'payment') record(unit, n, method);
    else if (panel.kind === 'fee') fee(unit, n, reason || 'Fee');
    else assess(unit, n, reason || 'Special assessment');
    onClose();
  };
  return (
    <form onSubmit={submit} aria-label={title} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <div className="w-full text-sm font-semibold text-ux2-ink">{title}</div>
      <Field label="Unit" className="w-[120px]">
        <select value={unit} onChange={e => setUnit(e.target.value)} className={INPUT}>
          {units.map(u => <option key={u.number} value={u.number}>{u.number} · {u.owner}</option>)}
        </select>
      </Field>
      <Field label="Amount" className="w-[140px]">
        <input inputMode="decimal" placeholder="$" value={amount} onChange={e => setAmount(e.target.value)} className={INPUT} />
      </Field>
      {panel.kind === 'payment' ? (
        <Field label="How" className="w-[150px]">
          <select value={method} onChange={e => setMethod(e.target.value)} className={INPUT}>
            <option value="check">Check</option><option value="card">Card</option><option value="bank">Bank transfer</option><option value="cash">Cash</option>
          </select>
        </Field>
      ) : (
        <Field label="What for" className="min-w-[200px] flex-1">
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder={panel.kind === 'fee' ? 'Late fee · October' : 'Roof · 2029 gap'} className={INPUT} />
        </Field>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!amount}>{panel.kind === 'payment' ? 'Record' : 'Add'}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}

function UnitRow({ u, b, onPanel, onCase }: { u: Unit; b?: BehindUnit; onPanel: (p: Panel) => void; onCase: () => void }) {
  const tint = b ? (b.daysPastDue > 60 ? 'bg-ux2-red-tint/60' : 'bg-ux2-amber-tint/60') : '';
  return (
    <tr className={tint}>
      <Td className="font-semibold">{u.number}</Td>
      <Td>{u.owner || 'Vacant'}{u.status === 'FOR_SALE' && <span className="text-xs text-ux2-muted"> · for sale</span>}{u.status === 'UNDER_CONTRACT' && u.moveIn && <span className="text-xs text-ux2-muted"> · move-in {dayLabel(u.moveIn)}</span>}</Td>
      <Td num>{fmt(u.monthlyFee)}</Td>
      <Td num className={b ? 'font-semibold text-ux2-red-ink' : u.balance < 0 ? 'text-ux2-sage' : ''}>{u.balance < 0 && !unpaidFees(u) ? `${fmt(-u.balance)} credit` : fmt(Math.max(0, u.balance) + unpaidFees(u))}</Td>
      <Td num className="text-ux2-muted">{feesAndSA(u)}</Td>
      <Td><UnitStatus u={u} b={b} /></Td>
      <Td className="text-ux2-muted"><LastPayment u={u} /></Td>
      <Td num>
        <RowMenu
          label={`More for unit ${u.number}`}
          items={[
            { label: 'Record a payment', onSelect: () => onPanel({ kind: 'payment', unit: u.number }) },
            { label: 'Add a fee', onSelect: () => onPanel({ kind: 'fee', unit: u.number }) },
            { label: 'Add a special assessment', onSelect: () => onPanel({ kind: 'assessment', unit: u.number }) },
            { label: 'Open a case', onSelect: onCase },
          ]}
        />
      </Td>
    </tr>
  );
}

const HEAD = (
  <thead><tr><Th>Unit</Th><Th>Owner</Th><Th num>Monthly</Th><Th num>Balance</Th><Th num>Fees / SA</Th><Th>Status</Th><Th>Last payment</Th><Th aria-label="Actions" /></tr></thead>
);

type LedgerFilter = 'all' | 'behind' | 'autopay' | 'fees';

function UnitLedger({ snap, beh, panel, setPanel }: { snap: FundsSnapshot; beh: BehindUnit[]; panel: Panel; setPanel: (p: Panel) => void }) {
  const [filter, setFilter] = useState<LedgerFilter>('all');
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const byNum = useMemo(() => new Map(beh.map(b => [b.number, b])), [beh]);
  const counts = {
    all: snap.units.length,
    behind: beh.length,
    autopay: snap.units.filter(autopay).length,
    fees: snap.units.filter(u => unpaidFees(u) > 0 || openAssessments(u) > 0).length,
  };
  const rows = snap.units
    .filter(u => filter === 'all' ? true : filter === 'behind' ? byNum.has(u.number) : filter === 'autopay' ? autopay(u) : unpaidFees(u) > 0 || openAssessments(u) > 0)
    .filter(u => !q || `${u.number} ${u.owner} ${u.email}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Card aria-label="Unit ledger" id="ledger">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3"><h2 className="m-0 text-lg font-medium text-ux2-ink">Unit ledger</h2><span className="text-[13px] text-ux2-muted">{snap.units.length} units · balances as of today, {dayLabel(snap.today)} · one row per unit</span></div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <PillTabs
            size="filter"
            surface="white"
            aria-label="Filter units"
            value={filter}
            onChange={setFilter}
            tabs={[{ id: 'all', label: `All · ${counts.all}` }, { id: 'behind', label: `Behind · ${counts.behind}` }, { id: 'autopay', label: `Autopay · ${counts.autopay}` }, { id: 'fees', label: `Fees and SA · ${counts.fees}` }]}
          />
          <SearchInput value={q} onChange={setQ} placeholder="Unit or owner" label="Search units" />
          <Button size="sm" className="h-9" onClick={() => setPanel({ kind: 'payment' })}>Record a payment</Button>
        </div>
      </div>
      {panel && <UnitForm key={`${panel.kind}-${panel.unit}`} panel={panel} units={snap.units} onClose={() => setPanel(null)} />}
      {rows.length === 0 ? (
        <Inner className="text-sm text-ux2-muted">{snap.units.length === 0 ? 'No units yet. Add units under Building › Directory.' : 'No unit matches.'}</Inner>
      ) : (
        <Table>
          {HEAD}
          <tbody>{rows.map(u => <UnitRow key={u.number} u={u} b={byNum.get(u.number)} onPanel={setPanel} onCase={() => navigate('/issues?view=new')} />)}</tbody>
        </Table>
      )}
      <Why>The row menu offers Record a payment, Add a fee or special assessment, and Open a case. Outstanding {fmt(beh.reduce((t, b) => t + b.amount, 0))} is {beh.length ? beh.map(b => `${b.number} ${fmt(b.amount)}`).join(' + ') : 'nothing'}. Owners see only their own unit, in their own view.</Why>
    </Card>
  );
}

function BehindCard({ snap, beh, onLedger, onPay }: { snap: FundsSnapshot; beh: BehindUnit[]; onLedger: () => void; onPay: (unit: string) => void }) {
  const totals = agingTotals(beh);
  const cases = useIssuesStore(s => s.cases);
  const navigate = useNavigate();
  const byNum = new Map(snap.units.map(u => [u.number, u]));
  const caseFor = (unit: string) => cases.find(c => c.status !== 'closed' && c.unit === unit && /collect|delinquen|dues|assessment/i.test(`${c.sitId} ${c.title}`));
  const outstanding = beh.reduce((t, b) => t + b.amount, 0);
  const lateDay = Math.min((snap.hoaDueDay || 1) + (snap.lateFee.graceDays || 0), 28);
  const steps = beh.map(b => {
    const c = caseFor(b.number);
    if (b.forSale) return { unit: b.number, title: 'resale certificate', text: `${fmt(b.amount)} collected at closing · dues ${b.daysPastDue > 30 ? 'behind' : 'current'}`, chip: <Chip tone="ghost">On track</Chip>, go: () => navigate('/building?tab=directory') };
    if (b.daysPastDue > 60) return { unit: b.number, title: 'demand letter', text: `collections runbook${c?.steps ? ` step ${Math.max(1, c.steps.findIndex(s => !s.done) + 1)} of ${c.steps.length}` : ''} · ${b.daysPastDue} days · lien allowed at 90 days, § 42-1903.13${c ? ` · ${c.sitId}` : ''}`, chip: <Chip tone="red">{c ? 'Send · drafted' : 'Start collections'}</Chip>, go: () => navigate(c ? `/issues?view=case:${c.id}` : '/issues?view=new') };
    return { unit: b.number, title: 'friendly reminder', text: `${b.daysPastDue > 30 ? '1 month' : `${b.daysPastDue} days`}, ${fmt(b.amount)} · ${snap.lateFee.enabled ? `late fee $${snap.lateFee.amount} on ${monthName(snap.today.slice(0, 7))} ${lateDay} unless paid` : 'no automatic late fee'} · goes from the app, not from you`, chip: <Chip tone="amber">Send reminder</Chip>, go: () => navigate('/boardroom?tab=outbox') };
  });
  return (
    <Card aria-label="Behind" id="behind">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3"><h2 className="m-0 text-lg font-medium text-ux2-ink">Behind · {beh.length} unit{beh.length === 1 ? '' : 's'} · {fmt(outstanding)}</h2><span className="text-[13px] text-ux2-muted">{beh.length ? 'Each one is already on a runbook step; nothing here waits on you except the step shown' : 'Every unit is current'}</span></div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="h-9" variant="ghost" onClick={() => navigate('/funds?tab=settings&section=rules')}>{snap.lateFee.enabled ? `Assess late fees · next ${monthName(snap.today.slice(0, 7))} ${lateDay}` : 'Late fees are off'}</Button>
          <Button size="sm" className="h-9" onClick={() => onPay(beh[0]?.number ?? '')}>Record a payment</Button>
        </div>
      </div>
      {beh.length > 0 && (
        <>
          <Table>
            {HEAD}
            <tbody>{beh.map(b => { const u = byNum.get(b.number); return u ? <UnitRow key={b.number} u={u} b={b} onPanel={p => onPay(p?.unit ?? b.number)} onCase={() => navigate('/issues?view=new')} /> : null; })}</tbody>
          </Table>
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
            {steps.map(s => (
              <Inner key={s.unit} className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-[13px]"><b className="font-semibold text-ux2-ink">{s.unit} · {s.title}</b> <span className="text-ux2-muted">· {s.text}</span></div>
                <button type="button" onClick={s.go} className="shrink-0 rounded-full">{s.chip}</button>
              </Inner>
            ))}
          </div>
        </>
      )}
      <Why>
        Aging: 0 to 30 days {fmt(totals['0-30'])} · 31 to 60 days {fmt(totals['31-60'])} · 61 to 90 days {fmt(totals['61-90'])} · over 90 days {fmt(totals['90+'])}. {snap.lateFee.enabled ? `Late fee $${snap.lateFee.amount} on the ${ordinal(lateDay)}, ` : ''}60-day notice by certified mail, demand letter at 60 days, lien at 90: the runbook runs these on its own and asks you only to send.
        {' '}<button type="button" onClick={onLedger} className="font-semibold text-ux2-teal hover:underline">Open the ledger</button>
      </Why>
    </Card>
  );
}

type InvoiceFilter = 'all' | 'open' | 'paid' | 'dues' | 'fees';

function InvoiceForm({ units, onClose }: { units: Unit[]; onClose: () => void }) {
  const create = useFinancialStore(s => s.createUnitInvoice);
  const [unit, setUnit] = useState(units[0]?.number ?? '');
  const [type, setType] = useState<UnitInvoice['type']>('fee');
  const [fund, setFund] = useState<'reserve' | 'operating'>('reserve');
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [due, setDue] = useState('');
  return (
    <form
      aria-label="New invoice"
      onSubmit={e => { e.preventDefault(); const n = Number(amount); if (!unit || !Number.isFinite(n) || n <= 0) return; create(unit, type, n, desc || 'Invoice', undefined, due || undefined, type === 'special_assessment' ? { fund } : undefined); onClose(); }}
      className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3"
    >
      <div className="w-full text-sm font-semibold text-ux2-ink">New invoice · fee, assessment, repair or amenity</div>
      <Field label="Unit" className="w-[120px]"><select value={unit} onChange={e => setUnit(e.target.value)} className={INPUT}>{units.map(u => <option key={u.number} value={u.number}>{u.number} · {u.owner}</option>)}</select></Field>
      <Field label="Type" className="w-[170px]"><select value={type} onChange={e => setType(e.target.value as UnitInvoice['type'])} className={INPUT}><option value="fee">Fee or repair charge</option><option value="special_assessment">Special assessment</option><option value="amenity_fee">Amenity fee</option><option value="monthly">Dues</option></select></Field>
      {type === 'special_assessment' && <Field label="For" className="w-[200px]"><select aria-label="Assessment fund" value={fund} onChange={e => setFund(e.target.value as 'reserve' | 'operating')} className={INPUT}><option value="reserve">A major repair · reserve fund</option><option value="operating">An operating shortfall</option></select></Field>}
      <Field label="Amount" className="w-[120px]"><input inputMode="decimal" placeholder="$" value={amount} onChange={e => setAmount(e.target.value)} className={INPUT} /></Field>
      <Field label="What for" className="min-w-[180px] flex-1"><input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Repair charge · door closer" className={INPUT} /></Field>
      <Field label="Due" className="w-[150px]"><input type="date" value={due} onChange={e => setDue(e.target.value)} className={INPUT} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={!amount}>Create</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

function invoiceStatus(i: UnitInvoice, today: string) {
  if (i.status === 'paid') return <Chip tone="sage">Paid{i.paidDate ? ` ${dayLabel(i.paidDate)}` : ''}{i.paymentMethod ? ` · ${i.paymentMethod === 'credit' ? 'from credit' : isOnline(i.paymentMethod) ? 'online' : i.paymentMethod}` : ''}</Chip>;
  const part = (i.paidAmount ?? 0) > 0 ? ` · ${fmt(i.paidAmount!)} paid` : '';
  if (i.status === 'overdue' || i.dueDate < today) { const d = Math.max(1, Math.round((Date.parse(today) - Date.parse(i.dueDate)) / 86400000)); return <Chip tone="red">Overdue · {d} d{part}</Chip>; }
  return <Chip tone={part ? 'amber' : 'ghost'}>{part ? `Part paid${part}` : 'Open'}</Chip>;
}

function InvoicesCard({ snap, onLedger, creating, setCreating }: { snap: FundsSnapshot; onLedger: () => void; creating: boolean; setCreating: (v: boolean) => void }) {
  const [filter, setFilter] = useState<InvoiceFilter>('all');
  const [all, setAll] = useState(false);
  const payUnitInvoice = useFinancialStore(s => s.payUnitInvoice);
  const voidUnitInvoice = useFinancialStore(s => s.voidUnitInvoice);
  const month = snap.today.slice(0, 7);
  const live = useMemo(() => snap.unitInvoices.filter(i => i.status !== 'void').sort((a, b) => b.createdDate.localeCompare(a.createdDate)), [snap.unitInvoices]);
  const thisMonth = live.filter(i => i.createdDate.startsWith(month));
  const counts = { all: live.length, open: live.filter(i => i.status !== 'paid').length, paid: live.filter(i => i.status === 'paid').length, dues: live.filter(i => i.type === 'monthly').length, fees: live.filter(i => i.type !== 'monthly').length };
  const rows = live.filter(i => filter === 'all' ? true : filter === 'open' ? i.status !== 'paid' : filter === 'paid' ? i.status === 'paid' : filter === 'dues' ? i.type === 'monthly' : i.type !== 'monthly');
  const shown = all ? rows : rows.slice(0, 8);
  const owner = (n: string) => snap.units.find(u => u.number === n)?.owner ?? '';
  const typeLabel: Record<UnitInvoice['type'], string> = { monthly: 'Dues', special_assessment: 'Special assessment', fee: 'Fee', amenity_fee: 'Amenity fee' };
  return (
    <Card aria-label="Invoices" id="invoices">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3"><h2 className="m-0 text-lg font-medium text-ux2-ink">Invoices</h2><span className="text-[13px] text-ux2-muted">{thisMonth.length} this month · every charge to a unit is recorded here, one row per charge</span></div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <PillTabs size="filter" surface="white" aria-label="Filter invoices" value={filter} onChange={setFilter} tabs={[{ id: 'all', label: `All · ${counts.all}` }, { id: 'open', label: `Open · ${counts.open}` }, { id: 'paid', label: `Paid · ${counts.paid}` }, { id: 'dues', label: `Dues · ${counts.dues}` }, { id: 'fees', label: `Fees and charges · ${counts.fees}` }]} />
          <Button size="sm" className="h-9" onClick={() => setCreating(true)}>New invoice</Button>
        </div>
      </div>
      {creating && <InvoiceForm units={snap.units} onClose={() => setCreating(false)} />}
      {rows.length === 0 ? <Inner className="text-sm text-ux2-muted">No invoices here.</Inner> : (
        <Table>
          <thead><tr><Th>Invoice</Th><Th>Unit</Th><Th>What for</Th><Th>Issued</Th><Th>Due</Th><Th num>Amount</Th><Th>Status</Th><Th aria-label="Actions" /></tr></thead>
          <tbody>
            {shown.map(i => (
              <tr key={i.id}>
                <Td className="font-semibold">{i.id}</Td>
                <Td>{i.unitNumber}{owner(i.unitNumber) ? <span className="text-ux2-muted"> · {owner(i.unitNumber)}</span> : null}</Td>
                <Td>{typeLabel[i.type]}<span className="text-ux2-muted"> · {i.description}</span></Td>
                <Td className="whitespace-nowrap text-ux2-muted">{dayLabel(i.createdDate)}</Td>
                <Td className="whitespace-nowrap text-ux2-muted">{i.dueDate ? dayLabel(i.dueDate) : '–'}</Td>
                <Td num className="font-semibold">{fmt(i.amount)}{i.fund === 'operating' && i.type === 'special_assessment' ? <span className="block text-[11px] font-normal text-ux2-muted">operating</span> : null}</Td>
                <Td>{invoiceStatus(i, snap.today)}</Td>
                <Td num>
                  <RowMenu label={`More for ${i.id}`} items={[
                    ...(i.status !== 'paid' ? [{ label: 'Record a payment in full', onSelect: () => payUnitInvoice(i.id, 'check') }, { label: 'Cancel this charge', onSelect: () => voidUnitInvoice(i.id, 'Cancelled from the invoice register') }] : []),
                    { label: 'Open the unit ledger', onSelect: onLedger },
                  ]} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Why>Dues invoices are created by the billing run on the 1st, due on the {ordinal(snap.hoaDueDay)}; fees, special assessments, repair charges and amenity bookings are created here or by their runbook. Every charge raises the unit's balance; a payment from the unit ledger settles dues first, then special assessments, then fees, oldest first. Cancelling a charge reverses it in the ledger; a paid charge is refunded under Online payments.</Why>
      {rows.length > 8 && <Button size="sm" variant="ghost" className="self-start" onClick={() => setAll(v => !v)}>{all ? 'Show fewer' : `Show the other ${rows.length - 8}`}</Button>}
    </Card>
  );
}

export default function IncomeTab({ snap, section, onSection, onGo }: { snap: FundsSnapshot; section?: string; onSection: (s: string) => void; onGo: (tab: FundsTab, section?: string) => void }) {
  const col = collected(snap);
  const beh = useMemo(() => behind(snap), [snap]);
  const inv = invoiceSummary(snap.unitInvoices, col.month);
  const current: Section = (SECTIONS as string[]).includes(section ?? '') ? (section as Section) : 'ledger';
  const outstanding = beh.reduce((t, b) => t + b.amount, 0);
  const aging = agingTotals(beh);
  const [panel, setPanel] = useState<Panel>(null);
  const [creating, setCreating] = useState(false);
  const payFrom = (unit: string) => { setPanel({ kind: 'payment', unit }); onSection('ledger'); };

  const sections: TileSection<Section>[] = [
    {
      id: 'ledger',
      tile: {
        tone: 'teal',
        label: `Collected · ${monthName(col.month)}`,
        meta: snap.autoBillingEnabled ? `Billed ${ordinal(snap.hoaDueDay)}` : undefined,
        children: (
          <>
            <Ring pct={col.pct}><b className="font-semibold">{col.paidUnits} of {col.units} paid</b><div className="text-xs text-white/[0.66]">{fmt(col.amount)} of {fmt(col.billed)}</div></Ring>
            <div className="grid grid-cols-3 gap-2">
              {[['Autopay', snap.units.filter(autopay).length], ['Card or bank', col.online], ['By check', col.check]].map(([l, v]) => (
                <div key={String(l)} className="rounded-xl bg-white/[0.12] px-2.5 py-2"><div className="text-[11px] text-white/[0.66]">{l}</div><div className="mt-0.5 text-base font-semibold">{v}</div></div>
              ))}
            </div>
          </>
        ),
        action: <><span className="min-w-0 truncate"><b className="font-semibold">Unit ledger</b> · every unit, what they pay and owe</span><Chip tone="white" className="!bg-white !text-ux2-teal">{col.units}</Chip></>,
      },
      detail: <UnitLedger snap={snap} beh={beh} panel={panel} setPanel={setPanel} />,
    },
    {
      id: 'behind',
      tile: {
        tone: 'red',
        label: 'Behind',
        meta: <Chip tone="red" className="!bg-white !text-ux2-red-ink">{beh.length} unit{beh.length === 1 ? '' : 's'}</Chip>,
        children: (
          <>
            <div className="grid grid-cols-[120px_minmax(0,1fr)] items-end gap-4">
              <div>
                <div className="text-[32px] font-semibold leading-none tracking-[-0.03em]">{fmt(outstanding)}</div>
                <div className="text-xs text-white/[0.72]">{beh.length ? 'outstanding' : 'outstanding · every unit is current'}</div>
                <div className="mt-2 text-xs text-white/[0.72]">Lien allowed at 90 days <span className="opacity-70">§ 42-1903.13</span></div>
              </div>
              <div className="flex items-end gap-2" aria-label="Outstanding by age">
                {(['0-30', '31-60', '61-90', '90+'] as const).map(b => {
                  const max = Math.max(1, ...Object.values(aging));
                  return (
                    <div key={b} className="flex flex-1 flex-col items-center gap-1 text-[10px] text-white/[0.72]">
                      <span className="text-[11px] font-semibold text-white">{aging[b] ? fmt(aging[b]) : ''}</span>
                      <div className="w-full rounded-[4px]" style={{ height: `${aging[b] ? Math.max(6, Math.round((aging[b] / max) * 56)) : 4}px`, backgroundColor: aging[b] ? (b === '0-30' ? '#F2B866' : b === '31-60' ? '#FBF1E2' : '#FFFFFF') : 'rgba(255,255,255,0.35)', opacity: aging[b] && b !== '0-30' ? 0.9 : 1 }} />
                      <span>{b} d</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {beh.slice(0, 3).map(b => (
              <div key={b.number} className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.12] px-3 py-2 text-[13px]">
                <span className="min-w-0 truncate"><b className="font-semibold">{b.number}</b> · {b.daysPastDue > 30 && b.daysPastDue <= 60 ? '1 month' : `${b.daysPastDue} days`} · {fmt(b.amount)}{b.forSale ? ' · for sale' : ''}</span>
                <Chip tone="white" className={b.forSale ? '!bg-white !text-ink-700' : b.daysPastDue > 60 ? '!bg-white !text-ux2-red-ink' : '!bg-ux2-amber-tint !text-ux2-amber'}>{b.forSale ? 'Resale cert' : b.daysPastDue > 60 ? 'Demand letter' : 'Send reminder'}</Chip>
              </div>
            ))}
          </>
        ),
      },
      detail: <BehindCard snap={snap} beh={beh} onLedger={() => onSection('ledger')} onPay={payFrom} />,
    },
    {
      id: 'invoices',
      tile: {
        tone: 'grey',
        label: `Invoices · ${monthName(col.month)}`,
        meta: <button type="button" onClick={e => { e.stopPropagation(); onSection('invoices'); }} className="text-xs font-semibold text-ux2-teal">All ›</button>,
        value: inv.sent,
        unit: 'sent',
        children: (
          <>
            <div className="flex h-2 overflow-hidden rounded-full bg-ux2-line" aria-label="Paid and open"><div className="bg-ux2-navy" style={{ width: `${inv.sent ? Math.round((inv.paid / inv.sent) * 100) : 0}%` }} /><div className="bg-ux2-red" style={{ width: `${inv.sent ? Math.round((inv.open / inv.sent) * 100) : 0}%` }} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-ux2-line bg-white px-3 py-2"><div className="text-[11px] text-ux2-muted"><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-ux2-navy" />Paid</div><div className="text-[15px] font-semibold">{inv.paid} · {fmt(inv.paidAmount)}</div></div>
              <div className="rounded-xl border border-ux2-line bg-white px-3 py-2"><div className="text-[11px] text-ux2-muted"><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-ux2-red" />Open</div><div className="text-[15px] font-semibold">{inv.open} · {fmt(inv.openAmount)}</div></div>
            </div>
            <div className="text-xs text-ux2-muted">{inv.byType.monthly} dues · {inv.byType.special_assessment} special assessment · {inv.byType.fee} fee{inv.byType.fee === 1 ? '' : 's'} · {inv.byType.amenity_fee} amenity</div>
          </>
        ),
        action: <><span className="min-w-0 truncate"><b className="font-semibold">New invoice</b> · fee, assessment, repair or amenity</span><button type="button" onClick={e => { e.stopPropagation(); setCreating(true); onSection('invoices'); }} className="inline-flex h-9 shrink-0 items-center rounded-full border border-ux2-line-strong bg-white px-3.5 text-xs font-semibold text-ux2-ink hover:bg-ux2-surface">Create</button></>,
      },
      detail: <InvoicesCard snap={snap} onLedger={() => onSection('ledger')} creating={creating} setCreating={setCreating} />,
    },
  ];

  return (
    <TileSwitcher
      sections={sections}
      value={current}
      onChange={onSection}
      hint="Tap a tile to open its list below. The other two stay one tap away."
      between={(
        <>
      <div className="flex flex-wrap items-center gap-2" aria-label="Runs on its own">
        <span className="text-sm font-semibold text-ux2-ink">Runs on its own</span>
        <Chip tone={snap.autoBillingEnabled ? 'sage' : 'ghost'}>{snap.autoBillingEnabled ? `✓ Billing on the ${ordinal(snap.hoaDueDay)}${snap.lastBillingRun ? ` · ran ${dayLabel(snap.lastBillingRun.slice(0, 10))}` : ''}` : `Billing by hand · dues due on the ${ordinal(snap.hoaDueDay)}`}</Chip>
        <Chip tone={snap.lateFee.enabled ? 'sage' : 'ghost'}>{snap.lateFee.enabled ? `✓ Late fee $${snap.lateFee.amount} after ${snap.lateFee.graceDays} days` : 'No automatic late fee'}</Chip>
        <Chip tone="sage">✓ 60-day notice · certified</Chip>
        {beh.some(b => b.daysPastDue > 60) && <Chip tone="teal">Demand at {Math.max(...beh.map(b => b.daysPastDue))} days · {beh.find(b => b.daysPastDue > 60)!.number} today</Chip>}
        <span className="ml-auto flex gap-3 text-xs font-semibold text-ux2-teal">
          <button type="button" onClick={() => onGo('settings', 'rules')} className="hover:underline">Edit rules</button>
          <button type="button" onClick={() => onGo('settings', 'fees')} className="hover:underline">Fee schedule</button>
        </span>
      </div>
      <div className="flex flex-col gap-2.5 rounded-[22px] border border-ux2-line bg-white px-[22px] py-4" aria-label="Online payments">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="m-0 text-lg font-medium text-ux2-ink">Online payments · Stripe</h2>
          <Chip tone={snap.stripeOnboardingComplete ? 'sage' : snap.stripeConnected ? 'amber' : 'ghost'}>{snap.stripeOnboardingComplete ? 'Connected' : snap.stripeConnected ? 'Finish setup' : 'Not connected'}</Chip>
        </div>
        <p className="m-0 text-[13px] text-ux2-muted">{snap.stripeOnboardingComplete ? `${snap.units.filter(autopay).length} units on autopay · ${col.online} paid by card or bank this month · ${col.check} by check · fees 2.9% + 30¢ paid by the building` : 'Connect a Stripe account so owners can pay dues and assessments by card or bank, with fees paid by the building.'}</p>
        <div className="flex flex-wrap gap-2">
          {snap.stripeOnboardingComplete && <Button size="sm" variant="ghost" onClick={() => onGo('payments')}>Refund a payment</Button>}
          <Button size="sm" variant={snap.stripeOnboardingComplete ? 'ghost' : 'primary'} onClick={() => onGo('payments')}>{snap.stripeOnboardingComplete ? 'Online payments' : 'Connect Stripe'}</Button>
        </div>
      </div>
        </>
      )}
    />
  );
}
