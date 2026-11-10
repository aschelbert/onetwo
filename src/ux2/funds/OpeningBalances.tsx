/**
 * Opening balances: bringing the books over as of one cutover date. Used in
 * Setup › Fill the gaps and again under Funds › Accounts and ledger, so a
 * building can enter the state of its books when it joins or later. Asks for
 * the numbers in the order a treasurer finds them: the date, the bank
 * balances, who owes what, the bills in the drawer. Saving posts every line
 * dated the cutover and closes the books through it; saving again replaces
 * the earlier lines.
 */
import { useMemo, useState } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { fmt } from '@/lib/formatters';
import { priorMonthEnd } from '@/lib/ledger';
import { Button, Chip, Field, INPUT, Inner, KV, SectionLabel, Table, Td, Th, Why } from '../components';
import { dayLabel } from '../home/calendar';

const money = (v: string) => { const s = v.trim().replace(/[$,\s]/g, ''); if (!s) return 0; const neg = /^\(.*\)$/.test(s) || s.startsWith('-'); const n = Number(s.replace(/[()\-]/g, '')); return Number.isFinite(n) ? (neg ? -n : n) : 0; };

interface BillDraft { vendor: string; description: string; amount: string; acctNum: string; invoiceNum: string }

export default function OpeningBalances({ today, defaultAsOf, onSaved }: { today: string; defaultAsOf?: string | null; onSaved?: () => void }) {
  const units = useFinancialStore(s => s.units);
  const coa = useFinancialStore(s => s.chartOfAccounts);
  const closedThrough = useFinancialStore(s => s.closedThrough);
  const ledger = useFinancialStore(s => s.generalLedger);
  const workOrders = useFinancialStore(s => s.workOrders);
  const post = useFinancialStore(s => s.postOpeningBalances);
  const read = useFinancialStore(s => s.openingBalances);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const existing = useMemo(() => read(), [ledger, workOrders, units]);

  const [asOf, setAsOf] = useState(existing.asOf ?? defaultAsOf ?? priorMonthEnd(today));
  const [opCash, setOpCash] = useState(existing.operatingCash ? String(existing.operatingCash) : '');
  const [rsCash, setRsCash] = useState(existing.reserveCash ? String(existing.reserveCash) : '');
  const [unitAmounts, setUnitAmounts] = useState<Record<string, string>>(() => Object.fromEntries(units.map(u => [u.number, (existing.units[u.number] ?? u.balance) ? String(existing.units[u.number] ?? u.balance) : ''])));
  const [bills, setBills] = useState<BillDraft[]>(() => existing.bills.filter(b => b.status === 'invoiced').map(b => ({ vendor: b.vendor, description: b.description, amount: String(b.amount), acctNum: b.acctNum, invoiceNum: b.invoiceNum && !b.invoiceNum.startsWith('OB-') ? b.invoiceNum : '' })));
  const [newBill, setNewBill] = useState<BillDraft>({ vendor: '', description: '', amount: '', acctNum: coa.find(a => a.type === 'expense' && a.parent)?.num ?? '5010', invoiceNum: '' });
  const [note, setNote] = useState<{ tone: 'sage' | 'red'; text: string } | null>(null);
  const [showUnits, setShowUnits] = useState(units.length <= 12);

  const expenseAccts = coa.filter(a => a.type === 'expense' && a.parent);
  const sortedUnits = [...units].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  const owed = sortedUnits.reduce((t, u) => { const n = money(unitAmounts[u.number] ?? ''); return n > 0 ? t + n : t; }, 0);
  const prepaid = sortedUnits.reduce((t, u) => { const n = money(unitAmounts[u.number] ?? ''); return n < 0 ? t - n : t; }, 0);
  const billsTotal = bills.reduce((t, b) => t + Math.max(0, money(b.amount)), 0);
  const operatingFund = money(opCash) + owed - prepaid - billsTotal;
  const behindCount = sortedUnits.filter(u => money(unitAmounts[u.number] ?? '') > 0).length;
  const aheadCount = sortedUnits.filter(u => money(unitAmounts[u.number] ?? '') < 0).length;
  const locked = !!closedThrough && closedThrough > (existing.asOf ?? '');

  const save = () => {
    try {
      const result = post({
        asOf,
        operatingCash: money(opCash),
        reserveCash: money(rsCash),
        units: sortedUnits.map(u => ({ number: u.number, amount: money(unitAmounts[u.number] ?? '') })),
        bills: bills.map(b => ({ vendor: b.vendor.trim() || 'Vendor', description: b.description.trim() || 'Bill', amount: money(b.amount), acctNum: b.acctNum, invoiceNum: b.invoiceNum.trim() || undefined })),
      }, today);
      setNote({ tone: 'sage', text: `Opening balances posted as of ${dayLabel(asOf)}: ${fmt(result.operatingCash)} operating, ${fmt(result.reserveCash)} reserves, ${fmt(result.owed)} owed by ${Object.values(result.units).filter(v => v > 0).length} unit${Object.values(result.units).filter(v => v > 0).length === 1 ? '' : 's'}${result.prepaid ? `, ${fmt(result.prepaid)} paid ahead` : ''}${result.billsTotal ? `, ${fmt(result.billsTotal)} in unpaid bills` : ''}. The books are closed through that date.` });
      onSaved?.();
    } catch (e) {
      setNote({ tone: 'red', text: e instanceof Error ? e.message : 'The opening balances could not be posted.' });
    }
  };

  return (
    <div data-opening-balances className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] text-ux2-muted">Everything as of one date, from the last bank statements and the owner ledger you kept before. Each line posts to the ledger dated that day.</span>
        {existing.asOf && <Chip tone="sage">On the books as of {dayLabel(existing.asOf)}</Chip>}
      </div>
      {note && <Inner role="status" className={`text-sm ${note.tone === 'red' ? 'text-ux2-red-ink' : 'text-ux2-ink'}`}>{note.text}</Inner>}
      {locked && <Inner className="text-sm text-ux2-amber">The books are closed through {dayLabel(closedThrough!)}, after the cutover. Reopen them under Accounts and ledger to re-enter the opening balances; a correction to one unit is better made as a new charge or a credit.</Inner>}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Field label="Cutover date · last day of the month before you joined" className="min-w-0"><input type="date" aria-label="Cutover date" value={asOf} max={priorMonthEnd(today) > asOf ? undefined : today} onChange={e => setAsOf(e.target.value)} className={INPUT} /></Field>
        <Field label="Operating account balance on that date" className="min-w-0"><input inputMode="decimal" aria-label="Operating account balance" placeholder="$" value={opCash} onChange={e => setOpCash(e.target.value)} className={INPUT} /></Field>
        <Field label="Reserve account balance on that date" className="min-w-0"><input inputMode="decimal" aria-label="Reserve account balance" placeholder="$" value={rsCash} onChange={e => setRsCash(e.target.value)} className={INPUT} /></Field>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>Who owes what on that date</SectionLabel>
          <span className="flex items-center gap-2 text-xs text-ux2-muted">{behindCount} behind · {aheadCount} paid ahead · {sortedUnits.length - behindCount - aheadCount} current{units.length > 12 && <Button size="sm" variant="ghost" onClick={() => setShowUnits(v => !v)}>{showUnits ? 'Hide units' : `Show ${units.length} units`}</Button>}</span>
        </div>
        {units.length === 0 ? <Inner className="text-sm text-ux2-muted">Add the units first; their balances go here.</Inner> : showUnits && (
          <Table minWidth={520}>
            <thead><tr><Th>Unit</Th><Th>Owner</Th><Th num>Monthly</Th><Th num>Owes · or (paid ahead)</Th></tr></thead>
            <tbody>
              {sortedUnits.map(u => (
                <tr key={u.number}>
                  <Td className="font-semibold">{u.number}</Td>
                  <Td>{u.owner || <span className="text-ux2-muted">Vacant</span>}</Td>
                  <Td num>{fmt(u.monthlyFee)}</Td>
                  <Td num><input inputMode="decimal" aria-label={`Balance owed by unit ${u.number}`} placeholder="0" value={unitAmounts[u.number] ?? ''} onChange={e => setUnitAmounts(a => ({ ...a, [u.number]: e.target.value }))} className={`${INPUT} !h-9 !w-32 text-right`} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Why>Type what each owner owed on the cutover date, or (450) for an owner who had paid ahead. An owner list with a Balance column fills this in. Each amount owed becomes one charge on the unit, so the first payment settles it; a credit goes toward the next dues.</Why>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>Bills received before the cutover and not yet paid</SectionLabel>
        {bills.length > 0 && (
          <Table minWidth={560}>
            <thead><tr><Th>Vendor</Th><Th>What</Th><Th>Budget line</Th><Th num>Amount</Th><Th><span className="sr-only">Remove</span></Th></tr></thead>
            <tbody>
              {bills.map((b, i) => (
                <tr key={i}>
                  <Td>{b.vendor}</Td><Td>{b.description}{b.invoiceNum ? <span className="text-ux2-muted"> · {b.invoiceNum}</span> : null}</Td><Td>{coa.find(a => a.num === b.acctNum)?.name ?? b.acctNum}</Td><Td num>{fmt(money(b.amount))}</Td>
                  <Td num><Button size="sm" variant="ghost" aria-label={`Remove bill ${b.description}`} onClick={() => setBills(list => list.filter((_, j) => j !== i))}>Remove</Button></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <form aria-label="Add an unpaid bill" className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); if (!(money(newBill.amount) > 0)) return; setBills(list => [...list, newBill]); setNewBill(b => ({ ...b, vendor: '', description: '', amount: '', invoiceNum: '' })); }}>
          <Field label="Vendor" className="w-[160px]"><input aria-label="Vendor" value={newBill.vendor} onChange={e => setNewBill(b => ({ ...b, vendor: e.target.value }))} className={INPUT} /></Field>
          <Field label="What" className="min-w-[160px] flex-1"><input aria-label="What the bill is for" value={newBill.description} onChange={e => setNewBill(b => ({ ...b, description: e.target.value }))} className={INPUT} /></Field>
          <Field label="Budget line" className="w-[200px]"><select aria-label="Budget line" value={newBill.acctNum} onChange={e => setNewBill(b => ({ ...b, acctNum: e.target.value }))} className={INPUT}>{expenseAccts.map(a => <option key={a.num} value={a.num}>{a.name}</option>)}</select></Field>
          <Field label="Amount" className="w-[120px]"><input inputMode="decimal" aria-label="Bill amount" placeholder="$" value={newBill.amount} onChange={e => setNewBill(b => ({ ...b, amount: e.target.value }))} className={INPUT} /></Field>
          <Button type="submit" size="sm" variant="ghost" disabled={!(money(newBill.amount) > 0)}>Add bill</Button>
        </form>
        <Why>These show under Bills to pay. Paying one clears the payable; it never counts as this year's expense, because it was last year's.</Why>
      </div>

      <Inner className="py-1" aria-label="What the opening balances imply">
        <SectionLabel>What this says about the building on {dayLabel(asOf || today)}</SectionLabel>
        <KV label="Operating cash">{fmt(money(opCash))}</KV>
        <KV label="Owed by owners">{fmt(owed)}</KV>
        {prepaid > 0 && <KV label="Paid ahead by owners">({fmt(prepaid)})</KV>}
        {billsTotal > 0 && <KV label="Unpaid bills">({fmt(billsTotal)})</KV>}
        <KV label={<b>Operating fund balance</b>}>{fmt(operatingFund)}</KV>
        <KV label={<b>Reserve fund balance</b>}>{fmt(money(rsCash))}</KV>
      </Inner>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} disabled={locked || !asOf || asOf >= today}>{existing.asOf ? 'Re-enter the opening balances' : 'Post the opening balances'}</Button>
        <span className="text-xs text-ux2-muted">Posting closes the books through {asOf ? dayLabel(asOf) : 'the cutover date'}; nothing can be dated before then by mistake.</span>
      </div>
    </div>
  );
}
