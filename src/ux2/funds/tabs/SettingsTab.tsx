/**
 * Accounts and ledger (the Funds gear), to the Funds-Settings board. A
 * sub-navigation splits it into five pages: Ledger (with the books' closing,
 * quick entries and the opening balances), Chart of Accounts, GL mapping
 * (where things post), Fees & Billing (the fee schedule and billing rules),
 * and Bank & Mail (bank and payments, and the building's LetterStream
 * account with its production settings panel). A "Needs you" banner for unmatched bills sits
 * above whichever page is open. Deep links (`?section=rules`, `=opening`,
 * `=mailing`, …) open the page that holds the card and scroll to it. Every
 * write goes through the financial and fee-schedule stores.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import MailingSettingsTab from '@/features/building/tabs/MailingSettingsTab';
import { useFeeScheduleStore } from '@/store/useFeeScheduleStore';
import { useNavigate } from 'react-router-dom';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { fmt } from '@/lib/formatters';
import { PAYMENT_ORDER_LABEL, type PaymentOrder } from '@/lib/financial-logic';
import { fundOf } from '@/lib/ledger';
import type { ChartOfAccountsEntry, GLEntry } from '@/types/financial';
import { Button, Card, Cell, Chip, Field, INPUT, Inner, KV, PillTabs, RowMenu, SearchInput, SectionLabel, Table, Td, Th, Why } from '../../components';
import { dayLabel } from '../../home/calendar';
import { ordinal, type FundsSnapshot } from '../metrics';
import type { FundsTab } from '../FundsPage';
import OpeningBalances from '../OpeningBalances';

type LedgerView = 'month' | 'payments' | 'bills' | 'transfers' | 'manual' | 'all';
/** The gear's sub-navigation: one group per pill, each a page of cards. */
export type SettingsGroup = 'ledger' | 'accounts' | 'mapping' | 'billing' | 'bank';
export const GROUPS: { id: SettingsGroup; label: string }[] = [
  { id: 'ledger', label: 'Ledger' },
  { id: 'accounts', label: 'Chart of Accounts' },
  { id: 'mapping', label: 'GL mapping' },
  { id: 'billing', label: 'Fees & Billing' },
  { id: 'bank', label: 'Bank & Mail' },
];
/** Deep-link sections (`?section=`) → the group that shows them; a group id is its own section. */
export const GROUP_OF: Record<string, SettingsGroup> = { ledger: 'ledger', opening: 'ledger', accounts: 'accounts', mapping: 'mapping', billing: 'billing', rules: 'billing', fees: 'billing', bank: 'bank', mailing: 'bank' };
const SOURCE_LABEL: Record<GLEntry['source'], string> = { manual: 'By hand', assessment: 'Billing run', payment: 'Payment', expense: 'Bill', case: 'Case', transfer: 'Transfer', fee: 'Fee', refund: 'Refund', payroll: 'Payroll' };
const SECTION_LABEL: Record<string, string> = { asset: 'Owns', liability: 'Owes', equity: 'Fund balances', income: 'Income', expense: 'Expenses' };
const MAPPING_LABELS: { key: string; label: string; types: string[] }[] = [
  { key: 'bankAccount', label: 'Operating bank account', types: ['asset'] },
  { key: 'assessmentsReceivable', label: 'Dues owed', types: ['asset'] },
  { key: 'specialAssessmentsReceivable', label: 'Special assessments owed', types: ['asset'] },
  { key: 'lateFeeReceivable', label: 'Late fees owed', types: ['asset'] },
  { key: 'regularAssessmentRevenue', label: 'Dues income', types: ['income'] },
  { key: 'specialAssessmentRevenue', label: 'Special assessment income', types: ['income'] },
  { key: 'lateFeeRevenue', label: 'Late fee income', types: ['income'] },
  { key: 'amenityRevenue', label: 'Amenity fees', types: ['income'] },
];
type QuickKind = 'vendor' | 'refund' | 'toReserves' | 'fromReserves' | 'claim' | 'otherIncome' | 'custom';
const QUICK: { id: QuickKind; label: string }[] = [
  { id: 'vendor', label: 'Paid a vendor' }, { id: 'refund', label: 'Received a refund' }, { id: 'toReserves', label: 'Moved money to reserves' }, { id: 'fromReserves', label: 'Moved money from reserves' }, { id: 'claim', label: 'Insurance claim paid out' }, { id: 'otherIncome', label: 'Other income' }, { id: 'custom', label: 'Custom entry' },
];

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '06-30' → 'Jun 30'. */
function fyLabel(mmdd: string): string { const [m, d] = mmdd.split('-').map(Number); return MONTHS_SHORT[m - 1] ? `${MONTHS_SHORT[m - 1]} ${d}` : mmdd; }

/** Billing rules: due day, automatic billing, the late fee and the month close day. */
export function BillingRules({ snap }: { snap: FundsSnapshot }) {
  const setHoaDueDay = useFinancialStore(s => s.setHoaDueDay);
  const setAutoBilling = useFinancialStore(s => s.setAutoBilling);
  const setLateFeeSettings = useFinancialStore(s => s.setLateFeeSettings);
  const runMonthlyBilling = useFinancialStore(s => s.runMonthlyBilling);
  const runLateFees = useFinancialStore(s => s.runLateFees);
  const autoReserveTransfer = useFinancialStore(s => s.autoReserveTransfer);
  const setAutoReserveTransfer = useFinancialStore(s => s.setAutoReserveTransfer);
  const paymentOrder = useFinancialStore(s => s.paymentOrder);
  const setPaymentOrder = useFinancialStore(s => s.setPaymentOrder);
  const monthCloseStartDay = useFinancialStore(s => s.monthCloseStartDay);
  const setMonthCloseStartDay = useFinancialStore(s => s.setMonthCloseStartDay);
  const fiscalYearEnd = useBuildingStore(s => s.details?.fiscalYearEnd) || '12-31';
  const navigate = useNavigate();
  const [day, setDay] = useState(String(snap.hoaDueDay));
  const [closeDay, setCloseDay] = useState(String(monthCloseStartDay));
  const [amount, setAmount] = useState(String(snap.lateFee.amount));
  const [grace, setGrace] = useState(String(snap.lateFee.graceDays));
  const [ran, setRan] = useState<string | null>(null);
  const monthlyTransfer = Math.round(snap.annualReserveContribution / 12);
  const runNow = () => {
    const r = runMonthlyBilling(undefined, snap.today);
    const fees = runLateFees(snap.today);
    setRan(`${r.billed ? `Billed ${r.billed} unit${r.billed === 1 ? '' : 's'} · ${fmt(r.amount)}` : `Every unit already has this month's dues invoice`}${r.noAmount ? ` · ${r.noAmount} with no monthly amount` : ''}${r.reserveTransfer ? ` · ${fmt(r.reserveTransfer)} moved to reserves` : ''}${fees ? ` · ${fees} late fee${fees === 1 ? '' : 's'} charged` : ''}.`);
  };
  return (
    <Card id="billing-rules" aria-label="Billing rules">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[17px] font-semibold text-ux2-ink">Billing rules</span><span className="flex items-center gap-2"><span className="text-xs text-ux2-muted">runs every morning, and when a board member opens the app</span><Button size="sm" variant="ghost" onClick={runNow}>Run billing now</Button></span></div>
      {ran && <Inner className="flex items-center justify-between gap-3 text-sm text-ux2-ink" role="status"><span>{ran}</span><button type="button" className="text-xs text-ux2-muted hover:underline" onClick={() => setRan(null)}>Dismiss</button></Inner>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Inner className="flex flex-col gap-2">
          <div className="text-sm font-semibold text-ux2-ink">Dues are due on the {ordinal(snap.hoaDueDay)}</div>
          <label className="text-xs text-ux2-muted" htmlFor="rules-day">Day of the month (1–28)</label>
          <div className="flex gap-2"><input id="rules-day" inputMode="numeric" value={day} onChange={e => setDay(e.target.value)} className={`${INPUT} !w-20`} /><Button size="sm" variant="ghost" onClick={() => { const n = Number(day); if (n >= 1 && n <= 28) setHoaDueDay(n); }}>Save</Button></div>
        </Inner>
        <Inner className="flex flex-col gap-2">
          <div className="text-sm font-semibold text-ux2-ink">Automatic billing · {snap.autoBillingEnabled ? 'On' : 'Off'}</div>
          <p className="text-xs text-ux2-muted">{snap.autoBillingEnabled ? `Every unit gets its dues invoice on the 1st, due on the ${ordinal(snap.hoaDueDay)}${snap.lastBillingRun ? ` · last ran ${snap.lastBillingRun.slice(0, 10)}` : ''}.` : 'Dues invoices are created by hand from the unit ledger, or with Run billing now.'}</p>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant={snap.autoBillingEnabled ? 'ghost' : 'primary'} onClick={() => setAutoBilling(!snap.autoBillingEnabled)}>{snap.autoBillingEnabled ? 'Turn off' : 'Turn on'}</Button></div>
          <label className="flex items-center gap-2 text-xs text-ux2-muted"><input type="checkbox" checked={autoReserveTransfer} onChange={e => setAutoReserveTransfer(e.target.checked)} />Move {fmt(monthlyTransfer)} to reserves with each billing run</label>
        </Inner>
        <Inner className="flex flex-col gap-2">
          <div className="text-sm font-semibold text-ux2-ink">Late fee · {snap.lateFee.enabled ? `$${snap.lateFee.amount} after ${snap.lateFee.graceDays} days` : 'Off'}</div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-ux2-muted">
            <label htmlFor="rules-amount">$</label><input id="rules-amount" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} className={`${INPUT} !w-20`} />
            <label htmlFor="rules-grace">after</label><input id="rules-grace" inputMode="numeric" value={grace} onChange={e => setGrace(e.target.value)} className={`${INPUT} !w-16`} /> days
          </div>
          <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => setLateFeeSettings(true, Number(amount) || 0, Number(grace) || 0)}>Save and turn on</Button>{snap.lateFee.enabled && <Button size="sm" variant="ghost" onClick={() => setLateFeeSettings(false, snap.lateFee.amount, snap.lateFee.graceDays)}>Turn off</Button>}</div>
        </Inner>
        <Inner className="flex flex-col gap-2" aria-label="Month close start">
          <div className="text-sm font-semibold text-ux2-ink">Month close starts on the {ordinal(monthCloseStartDay)}</div>
          <p className="m-0 text-xs text-ux2-muted">The Month close runbook opens its case for the month just ended on this day (every morning, and when a board member opens the app), with the packet due two weeks later. Move it to follow an off-cycle fiscal calendar or a bank statement that lands late. Fiscal year ends {fyLabel(fiscalYearEnd)} · <button type="button" onClick={() => navigate('/building')} className="font-semibold text-ux2-teal hover:underline">Building › Details</button>.</p>
          <label className="text-xs text-ux2-muted" htmlFor="rules-close-day">Day of the month (1–28)</label>
          <div className="flex gap-2"><input id="rules-close-day" inputMode="numeric" value={closeDay} onChange={e => setCloseDay(e.target.value)} className={`${INPUT} !w-20`} /><Button size="sm" variant="ghost" onClick={() => { const n = Number(closeDay); if (n >= 1 && n <= 28) setMonthCloseStartDay(n); }}>Save</Button><Button size="sm" variant="ghost" onClick={() => navigate('/boardroom?tab=runbooks&runbook=month-close')}>Runbook</Button></div>
        </Inner>
      </div>
      <Inner className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0"><div className="text-sm font-semibold text-ux2-ink">A payment goes to: {PAYMENT_ORDER_LABEL[paymentOrder].toLowerCase()}</div><p className="m-0 text-xs text-ux2-muted">Oldest due first within each kind. Dues first is what most collection policies (and several state laws) require; oldest first treats every charge the same.</p></div>
        <label className="flex items-center gap-2 text-xs text-ux2-muted">Order<select aria-label="Payment order" value={paymentOrder} onChange={e => setPaymentOrder(e.target.value as PaymentOrder)} className={`${INPUT} !h-9 !w-[300px]`}>{(Object.keys(PAYMENT_ORDER_LABEL) as PaymentOrder[]).map(k => <option key={k} value={k}>{PAYMENT_ORDER_LABEL[k]}</option>)}</select></label>
      </Inner>
    </Card>
  );
}

function QuickEntry({ kind, onDone, today }: { kind: QuickKind; onDone: (note?: string) => void; today: string }) {
  const coa = useFinancialStore(s => s.chartOfAccounts);
  const postManual = useFinancialStore(s => s.postManualEntry);
  const postTransfer = useFinancialStore(s => s.postTransfer);
  const canPostOn = useFinancialStore(s => s.canPostOn);
  const closedThrough = useFinancialStore(s => s.closedThrough);
  const [error, setError] = useState<string | null>(null);
  const accts = coa.filter(a => a.parent);
  const expense = accts.filter(a => a.type === 'expense');
  const income = accts.filter(a => a.type === 'income');
  const claimAcct = income.find(a => /insurance|recovery/i.test(a.name))?.num ?? income[income.length - 1]?.num ?? '4010';
  const otherAcct = income.find(a => /other/i.test(a.name))?.num ?? income[income.length - 1]?.num ?? '4010';
  const [amount, setAmount] = useState('');
  const [who, setWho] = useState('');
  const [acct, setAcct] = useState(expense[0]?.num ?? '5010');
  const [debit, setDebit] = useState('1010');
  const [credit, setCredit] = useState(accts[0]?.num ?? '1010');
  const [date, setDate] = useState(today);
  const label = QUICK.find(q => q.id === kind)!.label;
  const needsAcct = kind === 'vendor' || kind === 'refund';
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    if (!canPostOn(date)) { setError(`The books are closed through ${dayLabel(closedThrough!)}. Date this entry today; the memo can name the month it belongs to.`); return; }
    const memo = who.trim() || label;
    if (kind === 'vendor') postManual(date, memo, acct, '1010', amt);
    else if (kind === 'refund') postManual(date, memo, '1010', acct, amt);
    else if (kind === 'toReserves') postTransfer(date, memo, '1010', '1020', amt);
    else if (kind === 'fromReserves') postTransfer(date, memo, '1020', '1010', amt);
    else if (kind === 'claim') postManual(date, memo, '1010', claimAcct, amt);
    else if (kind === 'otherIncome') postManual(date, memo, '1010', otherAcct, amt);
    else if (debit !== credit) postManual(date, memo, debit, credit, amt);
    onDone();
  };
  return (
    <form aria-label={label} onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <Field label="Amount" className="w-[140px]"><input aria-label="Amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} className={INPUT} /></Field>
      <Field label={kind === 'custom' ? 'Memo' : 'Who, and why'} className="min-w-[220px] flex-1"><input aria-label="Who and why" value={who} onChange={e => setWho(e.target.value)} placeholder={kind === 'vendor' ? 'Heating Co · boiler service' : kind === 'toReserves' ? 'November reserve contribution' : label} className={INPUT} /></Field>
      {needsAcct && <Field label={kind === 'vendor' ? 'Expense line' : 'Refunded from'} className="w-[220px]"><select aria-label="Account" value={acct} onChange={e => setAcct(e.target.value)} className={INPUT}>{expense.map(a => <option key={a.num} value={a.num}>{a.num} · {a.name}</option>)}</select></Field>}
      {kind === 'custom' && <><Field label="Debit" className="w-[220px]"><select aria-label="Debit account" value={debit} onChange={e => setDebit(e.target.value)} className={INPUT}>{accts.map(a => <option key={a.num} value={a.num}>{a.num} · {a.name}</option>)}</select></Field><Field label="Credit" className="w-[220px]"><select aria-label="Credit account" value={credit} onChange={e => setCredit(e.target.value)} className={INPUT}>{accts.map(a => <option key={a.num} value={a.num}>{a.num} · {a.name}</option>)}</select></Field></>}
      <Field label="Date" className="w-[160px]"><input type="date" aria-label="Date" value={date} onChange={e => { setDate(e.target.value); setError(null); }} className={INPUT} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm">Post</Button><Button type="button" size="sm" variant="ghost" onClick={() => onDone('cancel')}>Cancel</Button></div>
      {error &&<div role="alert" className="basis-full text-xs font-semibold text-ux2-red-ink">{error}</div>}
      <Why className="basis-full">{kind === 'custom' ? 'Both sides are shown and must balance.' : `${label}: the two accounts are picked for you${kind === 'vendor' ? ' (the expense line and operating cash)' : kind === 'toReserves' || kind === 'fromReserves' ? ' (operating cash and reserves)' : ''}.`}</Why>
    </form>
  );
}

export default function SettingsTab({ snap, section, onSection, onGo }: { snap: FundsSnapshot; section?: string; onSection: (s: string) => void; onGo?: (tab: FundsTab, section?: string) => void }) {
  const ledger = useFinancialStore(s => s.generalLedger);
  const coa = useFinancialStore(s => s.chartOfAccounts);
  const getAcctName = useFinancialStore(s => s.getAcctName);
  const acctBalance = useFinancialStore(s => s.acctBalance);
  const addCoAAccount = useFinancialStore(s => s.addCoAAccount);
  const addCoASection = useFinancialStore(s => s.addCoASection);
  const updateCoAAccount = useFinancialStore(s => s.updateCoAAccount);
  const mapping = useFinancialStore(s => s.glAccountMapping);
  const setMapping = useFinancialStore(s => s.setGlAccountMapping);
  const closedThrough = useFinancialStore(s => s.closedThrough);
  const closeBooksThrough = useFinancialStore(s => s.closeBooksThrough);
  const reverseEntry = useFinancialStore(s => s.reverseEntry);
  const budgetCategories = useFinancialStore(s => s.budgetCategories);
  const fees = useFeeScheduleStore(s => s.fees);
  const updateFee = useFeeScheduleStore(s => s.updateFee);
  const toggleFee = useFeeScheduleStore(s => s.toggleFee);

  const [view, setView] = useState<LedgerView>(() => (ledger.some(e => e.date.startsWith(snap.today.slice(0, 7))) ? 'month' : 'all'));
  const [q, setQ] = useState('');
  const [older, setOlder] = useState(false);
  const [quick, setQuick] = useState<QuickKind | null>(null);
  const [renaming, setRenaming] = useState<{ num: string; name: string } | null>(null);
  const [adding, setAdding] = useState<'account' | 'section' | null>(null);
  const [newAcct, setNewAcct] = useState({ num: '', name: '', parent: '' });
  const [draftMap, setDraftMap] = useState<Record<string, string>>(() => ({ ...(mapping as unknown as Record<string, string>) }));
  const [showAllLines, setShowAllLines] = useState(false);
  const [editingFee, setEditingFee] = useState<{ id: string; amount: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [openingOpen, setOpeningOpen] = useState(section === 'opening');
  const opening = useFinancialStore(s => s.openingBalances)();

  useEffect(() => {
    if (!section) return;
    const id = { accounts: 'chart-card', ledger: 'ledger-card', rules: 'billing-rules', fees: 'fees-card', mailing: 'mailing-card', mapping: 'mapping-card', bank: 'bank-card', opening: 'opening-card' }[section];
    if (section === 'opening') setOpeningOpen(true);
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, [section]);

  const group: SettingsGroup = GROUP_OF[section ?? ''] ?? 'ledger';
  const thisMonth = snap.today.slice(0, 7);
  // Accounts, sections (header rows), and the accounts grouped under the section at the top of their parent chain.
  const { accts, sections, grouped } = useMemo(() => {
    const accts = coa.filter(a => a.parent);
    const sections = coa.filter(a => !a.parent);
    const byNum = new Map(coa.map(a => [a.num, a]));
    const sectionOf = (a: ChartOfAccountsEntry) => { let p: ChartOfAccountsEntry | undefined = a; const seen = new Set<string>(); while (p?.parent && !seen.has(p.num)) { seen.add(p.num); p = byNum.get(p.parent); } return p && !p.parent ? p : undefined; };
    const groups: { section?: ChartOfAccountsEntry; accounts: ChartOfAccountsEntry[] }[] = sections.map(s => ({ section: s, accounts: [] }));
    const other: { section?: ChartOfAccountsEntry; accounts: ChartOfAccountsEntry[] } = { accounts: [] };
    accts.forEach(a => { const sec = sectionOf(a); (groups.find(g => g.section?.num === sec?.num) ?? other).accounts.push(a); });
    return { accts, sections, grouped: [...groups.filter(g => g.accounts.length), ...(other.accounts.length ? [other] : [])] };
  }, [coa]);
  const waiting = snap.workOrders.filter(w => w.status === 'invoiced');

  const entries = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return [...ledger].filter(e => e.status !== 'void')
      .filter(e => view === 'all' || (view === 'month' && e.date.startsWith(thisMonth)) || (view === 'payments' && (e.source === 'payment' || e.source === 'refund')) || (view === 'bills' && (e.source === 'expense' || e.source === 'payroll')) || (view === 'transfers' && e.source === 'transfer') || (view === 'manual' && e.source === 'manual'))
      .filter(e => !ql || `${e.memo} ${e.id} ${e.sourceId ?? ''} ${getAcctName(e.debitAcct)} ${getAcctName(e.creditAcct)}`.toLowerCase().includes(ql))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }, [ledger, view, thisMonth, q, getAcctName]);
  const visible = older ? entries : entries.slice(0, 8);
  const priorEnd = useMemo(() => { const [y, m] = snap.today.split('-').map(Number); return new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10); }, [snap.today]);
  const closedEntries = closedThrough ? ledger.filter(e => e.date <= closedThrough).length : 0;
  const locked = (date: string) => !!closedThrough && date <= closedThrough;

  const tiers = useMemo(() => { const m = new Map<number, number>(); snap.units.forEach(u => m.set(u.monthlyFee, (m.get(u.monthlyFee) ?? 0) + 1)); return Array.from(m.entries()).sort((a, b) => a[0] - b[0]); }, [snap.units]);
  const lineMaps = budgetCategories.map(c => ({ name: c.name, acct: coa.find(a => a.budgetCat === c.id) }));
  const autopayUnits = new Set(snap.units.flatMap(u => u.payments.filter(p => /card|stripe|online|ach|bank/i.test(p.method || '')).map(() => u.number))).size;

  return (
    <div className="flex flex-col gap-5">
      {waiting.length > 0 && (
        <Card tone="navy" aria-label="Needs you">
          <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel className="text-white/[0.66]">Needs you</SectionLabel><Chip tone="red">{waiting.length} {waiting.length === 1 ? 'bill' : 'bills'} to match</Chip></div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {waiting.slice(0, 2).map(w => <div key={w.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-white px-3.5 py-3"><Cell title={`${w.invoiceNum ?? w.id} · ${fmt(w.amount)}`} note={`${w.vendor} · invoiced ${w.invoiceDate ? dayLabel(w.invoiceDate) : ''} · ${w.title} · approved, not yet paid`} /><Button size="sm" onClick={() => onGo?.('expenses', 'bills')}>Pay or match</Button></div>)}
          </div>
          <Why className="text-white/[0.75]">These bills have an invoice but no payment behind them; paying them (or matching the bank line) keeps the {dayLabel(`${thisMonth}-01`).replace(/ \d+$/, '')} close clean.</Why>
        </Card>
      )}
      {note && <Inner className="flex items-center justify-between gap-3 text-sm text-ux2-ink"><span>{note}</span><button type="button" className="text-xs text-ux2-muted hover:underline" onClick={() => setNote(null)}>Dismiss</button></Inner>}

      <PillTabs aria-label="Accounts and ledger sections" surface="white" value={group} onChange={g => onSection(g)} tabs={GROUPS} />

      {group === 'ledger' && (<>
      <Card id="ledger-card" aria-label="Ledger">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><span className="text-[17px] font-semibold text-ux2-ink">Ledger</span><span className="ml-2 text-xs text-ux2-muted">{ledger.length.toLocaleString()} entries · {closedEntries.toLocaleString()} in closed months · every bill, payment and transfer ends up here</span></div>
          <span className="flex flex-wrap items-center gap-2" aria-label="Books closed through">
            <Chip tone={closedThrough ? 'navy' : 'ghost'}>{closedThrough ? `Closed through ${dayLabel(closedThrough)}` : 'No month closed yet'}</Chip>
            {(!closedThrough || closedThrough < priorEnd) && <Button size="sm" variant="ghost" onClick={() => { closeBooksThrough(priorEnd); setNote(`Books closed through ${dayLabel(priorEnd)}. Entries on or before that date are locked; a correction posts dated today.`); }}>Close through {dayLabel(priorEnd)}</Button>}
            {closedThrough && <Button size="sm" variant="ghost" onClick={() => { closeBooksThrough(null); setNote('Books reopened. Every month can be posted to again.'); }}>Reopen</Button>}
          </span>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <PillTabs size="filter" surface="white" aria-label="Ledger views" value={view} onChange={setView} tabs={[{ id: 'month', label: dayLabel(`${thisMonth}-01`).replace(/ \d+$/, '') }, { id: 'payments', label: 'Payments' }, { id: 'bills', label: 'Bills' }, { id: 'transfers', label: 'Transfers' }, { id: 'manual', label: 'By hand' }, { id: 'all', label: 'All accounts' }]} />
          <SearchInput value={q} onChange={setQ} placeholder="Memo, id, vendor, or amount" label="Search entries" />
        </div>
        <div className="flex flex-col gap-1.5">
          <SectionLabel>Quick entries</SectionLabel>
          <div className="flex flex-wrap gap-1.5">{QUICK.map(k => <button key={k.id} type="button" onClick={() => setQuick(v => (v === k.id ? null : k.id))} className={`h-9 rounded-full border px-3.5 text-xs font-semibold ${quick === k.id ? 'border-ux2-navy bg-ux2-navy text-white' : 'border-ux2-line-strong bg-white text-ux2-ink hover:bg-ux2-surface'}`}>{k.label}</button>)}</div>
          {quick && <QuickEntry kind={quick} today={snap.today} onDone={(n) => { setQuick(null); if (n !== 'cancel') setNote('Posted. Entries in a closed month are locked; a correction is a new entry dated today.'); }} />}
          <Why>A quick entry asks only for the amount, who, and why; it picks the two accounts for you. Custom entry shows both sides and must balance.</Why>
        </div>
        <Table minWidth={900}>
          <thead><tr><Th>Date</Th><Th>What</Th><Th>Accounts</Th><Th num>Amount</Th><Th>Source</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
          <tbody>
            {visible.map(e => {
              const isLockedEntry = locked(e.date);
              return (
                <tr key={e.id} data-entry={e.id}>
                  <Td>{dayLabel(e.date)}</Td>
                  <Td><Cell title={e.memo} note={`${e.id}${e.sourceId ? ` · ${e.sourceId}` : ''}`} /></Td>
                  <Td><span className="text-ux2-ink">{e.debitAcct} {getAcctName(e.debitAcct)}</span> <span className="text-ux2-muted">←</span> <span className="text-ux2-ink">{e.creditAcct} {getAcctName(e.creditAcct)}</span></Td>
                  <Td num>{fmt(e.amount)}</Td>
                  <Td>{SOURCE_LABEL[e.source] ?? e.source}</Td>
                  <Td><Chip tone={isLockedEntry ? 'navy' : 'sage'}>{isLockedEntry ? 'Locked' : 'Posted'}</Chip></Td>
                  <Td num><RowMenu label={`Actions for ${e.id}`} items={[...(e.source === 'expense' || e.source === 'payroll' ? [{ label: 'Open the bill', onSelect: () => onGo?.('expenses', 'bills') }] : []), ...(e.source === 'payment' || e.source === 'fee' || e.source === 'assessment' || e.source === 'refund' ? [{ label: 'Open the unit', onSelect: () => onGo?.('income', 'ledger') }] : []), { label: `Entries on ${e.debitAcct}`, onSelect: () => { setView('all'); setQ(getAcctName(e.debitAcct)); } }, { label: isLockedEntry ? 'Reverse with an entry dated today' : 'Reverse this entry', onSelect: () => { const r = reverseEntry(e.id, 'Reversed from the ledger'); setNote(r ? `${e.id} reversed by ${r.id}${isLockedEntry ? ', dated today because that month is closed' : ''}.` : `${e.id} was already reversed.`); } }]} /></Td>
                </tr>
              );
            })}
            {visible.length === 0 && <tr><Td colSpan={7}><span className="text-ux2-muted">Nothing here{q ? ' that matches' : ''}.</span></Td></tr>}
          </tbody>
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {entries.length > 8 ? <Button size="sm" variant="ghost" onClick={() => setOlder(v => !v)}>{older ? 'Show fewer' : `Older entries · ${(entries.length - 8).toLocaleString()}`}</Button> : <span />}
          <Why>{closedThrough ? `Entries dated ${dayLabel(closedThrough)} or earlier are locked; a correction is a reversing entry dated today.` : 'No month is closed yet, so any entry can still be reversed on its own date. Close a month once its packet is out.'} The row menu opens the bill, the unit, or the account behind an entry, or reverses it. Stripe fees are recorded with each payout.</Why>
        </div>
      </Card>

      <Card id="opening-card" aria-label="Opening balances">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><span className="text-[17px] font-semibold text-ux2-ink">Opening balances</span><span className="ml-2 text-xs text-ux2-muted">{opening.asOf ? `on the books as of ${dayLabel(opening.asOf)} · ${fmt(opening.operatingCash)} operating · ${fmt(opening.reserveCash)} reserves · ${fmt(opening.owed)} owed by owners${opening.billsTotal ? ` · ${fmt(opening.billsTotal)} unpaid bills` : ''}` : 'the state of the books when the building joined: not entered yet'}</span></div>
          <Button size="sm" variant={opening.asOf ? 'ghost' : 'primary'} aria-expanded={openingOpen} onClick={() => setOpeningOpen(v => !v)}>{openingOpen ? 'Hide' : opening.asOf ? 'Review or re-enter' : 'Enter the opening balances'}</Button>
        </div>
        {openingOpen && <OpeningBalances today={snap.today} />}
        {!openingOpen && <Why>Bring the books over as of one cutover date: bank balances, what each owner owed or had paid ahead, and bills not yet paid. Posted lines are dated the cutover and the books close through it, so nothing lands before then by mistake.</Why>}
      </Card>
      </>)}

      {group === 'accounts' && (
      <Card id="chart-card" aria-label="Chart of accounts">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><span className="text-[17px] font-semibold text-ux2-ink">Chart of accounts</span><span className="ml-2 text-xs text-ux2-muted">{accts.length} accounts in {sections.length} sections</span></div>
          <span className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => setAdding(v => (v === 'account' ? null : 'account'))}>Add an account</Button><Button size="sm" variant="ghost" onClick={() => setAdding(v => (v === 'section' ? null : 'section'))}>Add a section</Button></span>
        </div>
        {adding && (
          <form aria-label={adding === 'account' ? 'Add an account' : 'Add a section'} onSubmit={e => { e.preventDefault(); if (!newAcct.num || !newAcct.name) return; if (adding === 'account') { const parent = sections.find(s => s.num === newAcct.parent) ?? sections.find(s => s.num[0] === newAcct.num[0]); if (!parent) return; addCoAAccount(newAcct.num, newAcct.name, parent.num, parent.sub); } else addCoASection(newAcct.num, newAcct.name, { '1': 'asset', '2': 'liability', '3': 'equity', '4': 'income' }[newAcct.num[0]] ?? 'expense'); setAdding(null); setNewAcct({ num: '', name: '', parent: '' }); }} className="flex flex-wrap items-end gap-2 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
            <Field label="Code" className="w-[120px]"><input aria-label="Code" value={newAcct.num} onChange={e => setNewAcct(v => ({ ...v, num: e.target.value }))} placeholder="5036" className={INPUT} /></Field>
            <Field label="Name" className="min-w-[200px] flex-1"><input aria-label="Name" value={newAcct.name} onChange={e => setNewAcct(v => ({ ...v, name: e.target.value }))} className={INPUT} /></Field>
            {adding === 'account' && <Field label="Section" className="w-[220px]"><select aria-label="Section" value={newAcct.parent} onChange={e => setNewAcct(v => ({ ...v, parent: e.target.value }))} className={INPUT}><option value="">By the code's first digit</option>{sections.map(s => <option key={s.num} value={s.num}>{s.num} · {s.name}</option>)}</select></Field>}
            <div className="flex gap-2"><Button type="submit" size="sm">Add</Button><Button type="button" size="sm" variant="ghost" onClick={() => setAdding(null)}>Cancel</Button></div>
          </form>
        )}
        <Table minWidth={620}>
          <thead><tr><Th>Code</Th><Th>Account</Th><Th>Fund</Th><Th num>Balance</Th><Th><span className="sr-only">Rename</span></Th></tr></thead>
          <tbody>
            {grouped.map(g => (
              <Fragment key={g.section?.num ?? 'other'}>
                <tr data-section={g.section?.num ?? 'other'}><Td colSpan={5}><span className="text-xs font-semibold uppercase tracking-wide text-ux2-muted">{g.section ? `${g.section.num} · ${g.section.name} · ${SECTION_LABEL[g.section.type] ?? g.section.type}` : 'Not in a section'} · {g.accounts.length} account{g.accounts.length === 1 ? '' : 's'}</span></Td></tr>
                {g.accounts.map(a => (
                  <tr key={a.num} data-account={a.num}>
                    <Td><span className="font-mono text-xs">{a.num}</span></Td>
                    <Td>{renaming?.num === a.num ? (
                      <form onSubmit={e => { e.preventDefault(); if (renaming.name.trim()) updateCoAAccount(a.num, renaming.name.trim(), true); setRenaming(null); }} className="flex items-center gap-2"><input aria-label={`Rename ${a.num}`} value={renaming.name} onChange={e => setRenaming({ num: a.num, name: e.target.value })} className={`${INPUT} !h-9`} /><Button type="submit" size="sm">Save</Button><Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button></form>
                    ) : <Cell title={a.name} note={a.sub && a.sub !== a.type ? a.sub : undefined} />}</Td>
                    <Td>{fundOf(a) === 'reserve' ? 'Reserve' : 'Operating'}</Td>
                    <Td num>{fmt(acctBalance(a.num))}</Td>
                    <Td num>{renaming?.num !== a.num && <Button size="sm" variant="ghost" onClick={() => setRenaming({ num: a.num, name: a.name })}>Rename</Button>}</Td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {accts.length === 0 && <tr><Td colSpan={5}><span className="text-ux2-muted">No accounts yet. The default chart is written the first time the building loads; reload, or add accounts by hand.</span></Td></tr>}
          </tbody>
        </Table>
        <Why>Sections: Owns (1000s), Owes (2000s), Fund balances (3000s), Income (4000s), Expenses (5000s operating, 6000s reserve). Each account belongs to the operating or the reserve fund. Balances are year to date for income and expenses, today for the rest. An account with entries can be renamed but not deleted.</Why>
      </Card>
      )}

      {group === 'mapping' && (
      <Card id="mapping-card" aria-label="Where things post">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[17px] font-semibold text-ux2-ink">Where things post</span><span className="text-xs text-ux2-muted">GL mapping</span></div>
        <div className="flex flex-col gap-1.5">
          {MAPPING_LABELS.map(m => (
            <label key={m.key} className="flex items-center justify-between gap-3 text-sm text-ux2-ink"><span>{m.label}</span><select aria-label={m.label} value={draftMap[m.key] ?? ''} onChange={e => setDraftMap(d => ({ ...d, [m.key]: e.target.value }))} className={`${INPUT} !h-9 !w-[200px]`}>{accts.filter(a => m.types.includes(a.type)).map(a => <option key={a.num} value={a.num}>{a.num} · {a.name}</option>)}</select></label>
          ))}
        </div>
        <SectionLabel>Budget lines to expense accounts</SectionLabel>
        <Inner className="py-1">
          {(showAllLines ? lineMaps : lineMaps.slice(0, 4)).map(l => <KV key={l.name} label={l.name}>{l.acct ? l.acct.num : 'by category'}</KV>)}
          {lineMaps.length > 4 && <button type="button" className="pt-1 text-xs font-semibold text-ux2-ink underline" onClick={() => setShowAllLines(v => !v)}>{showAllLines ? 'Show fewer' : `${lineMaps.length - 4} more lines · Show all`}</button>}
        </Inner>
        <div><Button size="sm" onClick={() => { setMapping(draftMap as never); setNote('Mapping saved. It affects new entries only.'); }}>Save mapping</Button></div>
        <Why>Changing a mapping affects new entries only. Most buildings never touch it.</Why>
      </Card>
      )}

      {group === 'billing' && (<>
      <Card id="fees-card" aria-label="Fee schedule">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><span className="text-[17px] font-semibold text-ux2-ink">Fee schedule</span><span className="ml-2 text-xs text-ux2-muted">What billing charges on the {ordinal(snap.hoaDueDay)}</span></div><span className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => onGo?.('income', 'ledger')}>Edit tiers</Button><Button size="sm" variant="ghost" onClick={() => document.getElementById('billing-rules')?.scrollIntoView({ behavior: 'smooth' })}>Edit late fee</Button><Button size="sm" variant="ghost" onClick={() => onGo?.('planning', 'draft')}>{Number(snap.today.slice(0, 4)) + 1} dues</Button></span></div>
        <Table minWidth={720}>
          <thead><tr><Th>Charge</Th><Th>Who</Th><Th num>Amount</Th><Th>When</Th><Th>On</Th><Th><span className="sr-only">Edit</span></Th></tr></thead>
          <tbody>
            {tiers.map(([fee, n], i) => <tr key={`tier-${fee}`}><Td><Cell title={`Dues${tiers.length > 1 ? ` · tier ${i + 1}` : ''}`} note="Per the CC&Rs' percentage interests" /></Td><Td>{n} unit{n === 1 ? '' : 's'}</Td><Td num>{fmt(fee)}</Td><Td>Monthly, {ordinal(snap.hoaDueDay)}</Td><Td><Chip tone="sage">On</Chip></Td><Td /></tr>)}
            {snap.lateFee.enabled && <tr><Td><Cell title="Late fee" note="Any unpaid dues invoice" /></Td><Td>Per the collections policy</Td><Td num>{fmt(snap.lateFee.amount)}</Td><Td>{snap.lateFee.graceDays} days after the {ordinal(snap.hoaDueDay)}</Td><Td><Chip tone="sage">On</Chip></Td><Td num><Button size="sm" variant="ghost" onClick={() => document.getElementById('billing-rules')?.scrollIntoView({ behavior: 'smooth' })}>Edit</Button></Td></tr>}
            {fees.map(f => (
              <tr key={f.id} data-fee={f.id}>
                <Td><Cell title={f.name} note={f.description || f.authority} /></Td>
                <Td>{f.category === 'assessment' ? 'Per unit' : f.category === 'amenity' ? 'Per booking' : f.category === 'move' ? 'Per move' : f.category === 'violation' ? 'Per violation' : 'Per occurrence'}</Td>
                <Td num>{editingFee?.id === f.id ? <form onSubmit={e => { e.preventDefault(); updateFee(f.id, { amount: Number(editingFee.amount) || f.amount }); setEditingFee(null); }} className="flex items-center justify-end gap-1"><input aria-label={`Amount for ${f.name}`} inputMode="decimal" value={editingFee.amount} onChange={e => setEditingFee({ id: f.id, amount: e.target.value })} className={`${INPUT} !h-9 !w-24`} /><Button type="submit" size="sm">Save</Button></form> : f.amountType === 'percentage' ? `${f.amount}%` : fmt(f.amount)}</Td>
                <Td>{f.frequency === 'monthly' ? `Monthly, ${ordinal(snap.hoaDueDay)}` : f.frequency === 'one-time' ? 'Invoice or at closing' : f.frequency === 'per-occurrence' ? 'When it happens' : f.frequency}</Td>
                <Td><button type="button" role="switch" aria-checked={f.enabled} aria-label={`${f.name} on`} onClick={() => toggleFee(f.id)} className="rounded-full"><Chip tone={f.enabled ? 'sage' : 'ghost'}>{f.enabled ? 'On' : 'Off'}</Chip></button></Td>
                <Td num>{editingFee?.id !== f.id && <Button size="sm" variant="ghost" onClick={() => setEditingFee({ id: f.id, amount: String(f.amount) })}>Edit</Button>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Why>Tiers follow the CC&Rs' percentage interests. A dues change takes effect Jan 1 after the budget is adopted; owners are notified 30 days before. Late fees per the collections policy.</Why>
      </Card>

      <BillingRules snap={snap} />
      </>)}

      {group === 'bank' && (<>
      <Card id="bank-card" aria-label="Bank and payments">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[17px] font-semibold text-ux2-ink">Bank and payments</span><Chip tone={snap.stripeOnboardingComplete ? 'sage' : 'ghost'}>{snap.stripeOnboardingComplete ? 'All connected' : 'Stripe not set up'}</Chip></div>
        <Inner className="flex flex-wrap items-center justify-between gap-3"><Cell title="Stripe" note={snap.stripeOnboardingComplete ? `owners pay by card or bank · ${autopayUnits} units paying online · payouts land in 1010 the next business day` : 'owners pay by card or bank once the account is connected'} /><Chip tone={snap.stripeOnboardingComplete ? 'sage' : 'amber'}>{snap.stripeOnboardingComplete ? 'Connected' : 'Not set up'}</Chip></Inner>
        <Inner className="flex flex-wrap items-center justify-between gap-3"><Cell title={`${getAcctName('1010') || 'Operating checking'} · 1010`} note={`ledger balance ${fmt(acctBalance('1010'))} · a bank feed is on the roadmap; until then the ledger is the record`} /><Chip tone="ghost">Ledger</Chip></Inner>
        <Inner className="flex flex-wrap items-center justify-between gap-3"><Cell title={`${getAcctName('1020') || 'Reserve money market'} · 1020`} note={`ledger balance ${fmt(acctBalance('1020'))}`} /><Chip tone="ghost">Ledger</Chip></Inner>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" onClick={() => onGo?.('payments')}>Online payments · Stripe</Button><Button size="sm" variant="ghost" onClick={() => setNote('Bank feeds are not connected yet; balances come from the ledger.')}>Reconnect a bank</Button></div>
        <Why>Bills approved on Expenses are paid from 1010 on their due date. Transfers between the two accounts post as ledger entries; a manual transfer uses "Moved money to reserves" on the Ledger page.</Why>
      </Card>

      <Card id="mailing-card" aria-label="Mailing">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[17px] font-semibold text-ux2-ink">Mailing</span><span className="text-xs text-ux2-muted">printed letters are billed by LetterStream to the building's own account</span></div>
        <div className="ux2-legacy"><MailingSettingsTab /></div>
        <Why>Jump to the <button type="button" className="underline" onClick={() => onSection('ledger')}>ledger</button>, the <button type="button" className="underline" onClick={() => onSection('accounts')}>chart of accounts</button> or the <button type="button" className="underline" onClick={() => onSection('fees')}>fee schedule</button>.</Why>
      </Card>
      </>)}

    </div>
  );
}
