import { useState } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useAuthStore } from '@/store/useAuthStore';
import { fmt } from '@/lib/formatters';
import { spread } from '@/lib/caseTools';
import { cashForecast, loanStanding, monthlyPayment, type Loan } from '@/lib/outlook';
import { Button, Card, Chip, Inner, Table, Th, Td, Why, Field, INPUT } from '../../components';
import type { FundsSnapshot } from '../metrics';
import { savePlanning, usePlanningDoc } from './planningDoc';
import { bankAccounts, nextUnposted, recordPayment, recordProceeds } from './loans';

const num = (s: string) => Math.max(0, Number(String(s).replace(/[^0-9.]/g, '')) || 0);
const monthName = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
const monthYear = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** The forecast's rows, from the snapshot and the planning record. Shared with the Planning tile. */
export function useCash(snap: FundsSnapshot) {
  const planning = usePlanningDoc();
  const monthlyDues = snap.units.reduce((t, u) => t + u.monthlyFee, 0);
  const owed = snap.units.reduce((t, u) => t + Math.max(0, u.balance), 0);
  const operating = snap.budget.reduce((t, b) => t + b.budgeted, 0);
  // What usually comes in: all of it, less the share of a year's dues that is owed today (never below half).
  const collected = monthlyDues > 0 ? Math.max(0.5, 1 - owed / (monthlyDues * 12)) : 1;
  const floor = Math.round((operating / 12) * planning.floorMonths);
  const billsDue = snap.workOrders.filter(w => w.status === 'approved' || w.status === 'invoiced').reduce((t, w) => t + w.amount, 0);
  // This year's spending is a fair shape for the year only once most of its months have spending in them; before that, spread the budget evenly.
  const shaped = (snap.spendByMonth?.filter(n => n > 0).length ?? 0) >= 9;
  const rows = cashForecast({
    from: snap.today.slice(0, 7), cash: snap.operatingCash, monthlyDues, collected,
    operatingByMonth: spread(operating, shaped ? snap.spendByMonth : undefined), billsDue,
    reserveMonthly: Math.round(snap.annualReserveContribution / 12), loans: planning.loans, floor,
  });
  const low = rows.reduce((m, r) => (r.end < m.end ? r : m), rows[0]);
  return { rows, low, floor, collected, planning, shaped };
}

/** The loan's terms. `preset` starts it from a capital project that chose to borrow. */
export function LoanForm({ today, onClose, preset }: { today: string; onClose: () => void; preset?: { name: string; principal: number; projectId: string } }) {
  const planning = usePlanningDoc();
  const [name, setName] = useState(preset?.name ?? '');
  const [lender, setLender] = useState('');
  const [principal, setPrincipal] = useState(preset?.principal ? String(preset.principal) : '');
  const [rate, setRate] = useState('');
  const [years, setYears] = useState('');
  const [first, setFirst] = useState(today.slice(0, 7));
  const [securedBy, setSecuredBy] = useState('');
  const [covenant, setCovenant] = useState('');
  const ok = !!name.trim() && num(principal) > 0 && num(years) > 0 && !!first;
  const draft = { principal: num(principal), ratePct: num(rate), years: num(years) };
  return (
    <form aria-label="Add a loan" onSubmit={e => { e.preventDefault(); if (!ok) return; const loan: Loan = { id: `ln${Date.now().toString(36)}`, name: name.trim(), lender: lender.trim(), ...draft, firstPayment: first, securedBy: securedBy.trim(), covenant: covenant.trim(), projectId: preset?.projectId ?? '' }; savePlanning({ loans: [...planning.loans, loan] }, today); onClose(); }} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <Field label="What it paid for" className="min-w-[200px] flex-1"><input value={name} onChange={e => setName(e.target.value)} placeholder="Elevator modernisation" className={INPUT} /></Field>
      <Field label="Lender" className="w-[180px]"><input value={lender} onChange={e => setLender(e.target.value)} className={INPUT} /></Field>
      <Field label="Borrowed" className="w-[140px]"><input inputMode="decimal" value={principal} onChange={e => setPrincipal(e.target.value)} placeholder="$" className={INPUT} /></Field>
      <Field label="Rate, % a year" className="w-[120px]"><input inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} className={INPUT} /></Field>
      <Field label="Years" className="w-[90px]"><input inputMode="numeric" value={years} onChange={e => setYears(e.target.value)} className={INPUT} /></Field>
      <Field label="First payment" className="w-[160px]"><input type="month" value={first} onChange={e => setFirst(e.target.value)} className={INPUT} /></Field>
      <Field label="Secured by" className="w-[190px]"><input value={securedBy} onChange={e => setSecuredBy(e.target.value)} placeholder="Assessment income" className={INPUT} /></Field>
      <Field label="What the lender requires (optional)" className="min-w-[220px] flex-1"><input value={covenant} onChange={e => setCovenant(e.target.value)} placeholder="Reserves at least 10% of the budget" className={INPUT} /></Field>
      <div className="flex items-center gap-2">{ok && <span className="text-xs text-ux2-muted">{fmt(monthlyPayment(draft))} a month</span>}<Button type="submit" size="sm" disabled={!ok}>Add the loan</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

/**
 * Funds › Planning › Cash and loans: operating cash month by month for the
 * next twelve, against the floor the board set, and the loan register. The
 * forecast is built from billed dues, the budget, approved bills, the reserve
 * transfer and loan payments, so nobody enters it.
 */
export default function CashLoansPanel({ snap }: { snap: FundsSnapshot }) {
  const isBoard = useAuthStore(s => s.currentUser.role) !== 'RESIDENT';
  useFinancialStore(s => s.generalLedger);
  const { rows, low, floor, collected, planning, shaped } = useCash(snap);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState('');
  const today = snap.today;
  const banks = bankAccounts();
  const [bank, setBank] = useState(banks[0]?.num ?? '1010');
  const post = (err: string, ok: string) => setNote(err || ok);
  const peak = Math.max(1, floor, ...rows.map(r => Math.abs(r.end)));
  const under = rows.filter(r => r.underFloor);
  const shown = rows.slice(0, 6);
  const line = (label: string, f: (r: (typeof rows)[number]) => number, from: string, minus = true) => (
    <tr><Td className="font-semibold">{label}</Td>{shown.map(r => <Td key={r.month} num>{f(r) ? `${minus ? '−' : ''}${fmt(f(r))}` : '—'}</Td>)}<Td className="text-xs text-ux2-muted">{from}</Td></tr>
  );

  return (
    <Card aria-label="Cash and loans" id="cash" className="gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-lg font-medium text-ux2-ink">Operating cash, next 12 months</h2>
        <label className="flex items-center gap-2 text-xs text-ux2-muted">Floor: {fmt(floor)} · <input aria-label="Months of operating costs to keep" inputMode="decimal" disabled={!isBoard} key={planning.floorMonths} defaultValue={planning.floorMonths} onBlur={e => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= 0 && n !== planning.floorMonths) savePlanning({ floorMonths: Math.min(24, n) }, today); }} className="w-14 rounded-[8px] border border-ux2-line-strong px-2 py-1 text-right text-ux2-ink" /> months of operating costs</label>
      </div>

      <Inner className="flex flex-col gap-2" data-cash-forecast>
        <div className="flex h-32 items-end gap-1.5" role="img" aria-label={`Forecast month-end operating cash: ${fmt(rows[0]?.end ?? 0)} this month, lowest ${fmt(low?.end ?? 0)} in ${low ? monthYear(low.month) : ''}${under.length ? `, under the ${fmt(floor)} floor in ${under.length} month${under.length === 1 ? '' : 's'}` : ', never under the floor'}`}>
          {rows.map(r => <div key={r.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"><div title={`${monthYear(r.month)}: ${fmt(r.end)}`} className={`w-full rounded-t-[5px] ${r.end < 0 || r.underFloor ? 'bg-ux2-red-ink' : 'bg-ux2-teal'}`} style={{ height: `${Math.max(3, Math.round((Math.abs(r.end) / peak) * 100))}%` }} /><span className="text-[10px] text-ux2-muted">{monthName(r.month)}</span></div>)}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ux2-ink"><span>Lowest: <b className="font-semibold">{fmt(low?.end ?? 0)}</b> at the end of {low ? monthYear(low.month) : ''}</span>{under.length ? <Chip tone="red">Under the floor in {under.map(r => monthName(r.month)).join(', ')}</Chip> : <Chip tone="sage">Above the floor all year</Chip>}</div>
      </Inner>

      <Table minWidth={860}>
        <thead><tr><Th>What moves the cash</Th>{shown.map(r => <Th key={r.month} num>{monthName(r.month)}</Th>)}<Th>Read from</Th></tr></thead>
        <tbody>
          {line('Dues expected in', r => r.duesIn, `Billed dues, ${Math.round(collected * 100)}% of which usually comes in`, false)}
          {line('Operating costs out', r => r.operatingOut, shaped ? "The budget, in the shape of this year's spending" : 'The budget, spread evenly')}
          {line('Bills approved, not yet paid', r => r.billsOut, 'Expenses')}
          {line('Transfer to reserves', r => r.reserveOut, 'The reserve contribution')}
          {line('Loan payments', r => r.loansOut, 'The loans below')}
          <tr className="font-semibold"><Td>Month-end cash</Td>{shown.map(r => <Td key={r.month} num><span className={r.underFloor ? 'text-ux2-red-ink' : ''}>{fmt(r.end)}</span></Td>)}<Td /></tr>
        </tbody>
      </Table>

      <div className="flex flex-col gap-2" aria-label="Loans">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[17px] font-semibold text-ux2-ink">Loans</span>{isBoard && <Button size="sm" variant="ghost" onClick={() => setAdding(v => !v)}>Add a loan</Button>}</div>
        {adding && <LoanForm today={today} onClose={() => setAdding(false)} />}
        {isBoard && planning.loans.length > 0 && banks.length > 1 && <label className="flex items-center gap-2 text-xs text-ux2-muted">Paid into and from <select aria-label="Bank account for loans" value={bank} onChange={e => setBank(e.target.value)} className="rounded-[8px] border border-ux2-line-strong bg-white px-2 py-1 text-ux2-ink">{banks.map(a => <option key={a.num} value={a.num}>{a.name}</option>)}</select></label>}
        {note && <Inner className="text-sm text-ux2-ink" role="status">{note}</Inner>}
        {planning.loans.length === 0 ? <Inner className="text-sm text-ux2-muted">The association has no loans on record.</Inner> : (
          <Table minWidth={860}>
            <thead><tr><Th>Loan</Th><Th num>Borrowed</Th><Th num>Rate</Th><Th num>A month</Th><Th num>Owed today</Th><Th>Paid off</Th><Th>In the ledger</Th>{isBoard && <Th aria-label="Remove" />}</tr></thead>
            <tbody>{planning.loans.map(l => { const st = loanStanding(l, today.slice(0, 7)); const due = nextUnposted(l, today.slice(0, 7)); const dueSplit = due ? loanStanding(l, due) : null; return (
              <tr key={l.id} data-loan={l.id}>
                <Td><b className="font-semibold">{l.name}</b><span className="block text-xs text-ux2-muted">{[l.lender, l.securedBy && `secured by ${l.securedBy.toLowerCase()}`, l.covenant, l.projectId && 'from a capital improvement'].filter(Boolean).join(' · ')}</span></Td>
                <Td num>{fmt(l.principal)}</Td><Td num>{l.ratePct}%</Td><Td num>{fmt(st.payment)}</Td><Td num>{fmt(st.owed)}</Td><Td>{monthYear(st.paidOff)}</Td>
                <Td className="text-xs">
                  <span className="flex flex-col items-start gap-1">
                    {l.drawnOn ? <span>Proceeds in {l.drawnOn}</span> : isBoard ? <Button size="sm" variant="ghost" aria-label={`Record the proceeds of ${l.name}`} onClick={() => post(recordProceeds(l.id, today, bank, today), `${fmt(l.principal)} recorded as borrowed.`)}>Record the {fmt(l.principal)} arriving</Button> : <span>Proceeds not recorded</span>}
                    {due && dueSplit ? (isBoard ? <Button size="sm" variant="ghost" aria-label={`Record the ${monthYear(due)} payment on ${l.name}`} onClick={() => post(recordPayment(l.id, due, today, bank, today), `${monthYear(due)} payment recorded: ${fmt(dueSplit.interestThis)} interest, ${fmt(dueSplit.principalThis)} principal.`)}>Record {monthYear(due)}: {fmt(dueSplit.interestThis)} interest · {fmt(dueSplit.principalThis)} principal</Button> : <span>{monthYear(due)} payment not recorded</span>) : <span>{(l.posted ?? []).length ? `Payments recorded through ${monthYear([...(l.posted ?? [])].sort().pop()!)}` : st.made ? 'Paid off' : `First payment ${monthYear(l.firstPayment)}`}</span>}
                  </span>
                </Td>
                {isBoard && <Td num><Button size="sm" variant="ghost" aria-label={`Remove ${l.name}`} onClick={() => { if (window.confirm(`Remove ${l.name} from the loan register?${l.drawnOn || (l.posted ?? []).length ? ' Its entries stay in the ledger.' : ''}`)) savePlanning({ loans: planning.loans.filter(x => x.id !== l.id) }, today); }}>Remove</Button></Td>}
              </tr>
            ); })}</tbody>
          </Table>
        )}
      </div>
      <Why>A loan's payments carry into this forecast and into the five-year outlook. The register works out each payment's interest and principal from the terms entered, and one tap records the month's payment in the ledger: interest as an expense, principal against what is owed. A loan chosen in a capital improvement action is added here from that action. Whether to borrow at all is decided in a capital improvement action, which compares it with reserves and a special assessment. What already happened to cash is a statement, under Statements &amp; taxes.</Why>
    </Card>
  );
}
