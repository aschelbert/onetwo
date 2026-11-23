import { useState } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useAuthStore } from '@/store/useAuthStore';
import { balanceOf, fiscalYearStart, monthEnd } from '@/lib/ledger';
import { fmt } from '@/lib/formatters';
import { blankReconciliation, reconcile, signBlocker, type Reconciliation } from '@/lib/caseTools';
import { Button, Card, Chip, Inner, KV, SectionLabel, Why, Field, INPUT } from '../../components';
import { todayIso } from '../../runbook/adapters';
import { periodLabel } from '../monthClose';
import { esc, printPage, rowsHtml, useToolDoc } from './docs';

const FORM = 'flex flex-wrap items-end gap-3';
const signed = (s: string) => Math.round((Number(s.replace(/[^0-9.-]/g, '')) || 0) * 100) / 100;

function Reconcile({ acct, name, period }: { acct: string; name: string; period: string }) {
  const me = useAuthStore(s => s.currentUser.name);
  const gl = useFinancialStore(s => s.generalLedger);
  const end = monthEnd(period + '-01');
  const books = balanceOf(acct, 'asset', gl.filter(e => e.date <= end));
  const [rec, save] = useToolDoc<Reconciliation>('reconciliation', acct + ':' + period, blankReconciliation(acct, period));
  const [bank, setBank] = useState(rec.bankBalance ? String(rec.bankBalance) : '');
  const [what, setWhat] = useState('');
  const [amount, setAmount] = useState('');
  const { adjustedBank, leftToExplain } = reconcile(rec, books);
  const blocker = signBlocker(rec, books, me);
  const locked = !!rec.signedOn;
  return (
    <Inner className="flex flex-col gap-2.5" data-reconcile={acct}>
      <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm font-semibold text-ux2-ink">{name}</b>{rec.signedOn ? <Chip tone="sage">Signed {rec.signedOn} by {rec.signedBy}</Chip> : rec.preparedOn ? <Chip tone="navy">Prepared {rec.preparedOn} by {rec.preparedBy} · waits on a second signature</Chip> : <Chip tone="amber">Not reconciled</Chip>}</div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-4">
        <KV label="Bank says">{rec.bankBalance ? fmt(rec.bankBalance) : '—'}</KV>
        <KV label="Not yet at the bank">{fmt(rec.outstanding.reduce((t, o) => t + o.amount, 0))}</KV>
        <KV label="Books say">{fmt(books)}</KV>
        <KV label="Left to explain"><span className={leftToExplain === 0 && rec.bankBalance ? '' : 'text-ux2-red-ink'}>{rec.bankBalance ? fmt(leftToExplain) : '—'}</span></KV>
      </div>
      {!locked && (
        <>
          <div className={FORM}>
            <Field label={'Closing balance on the ' + periodLabel(period) + ' statement'} className="w-[260px]"><input inputMode="decimal" value={bank} onChange={e => setBank(e.target.value)} onBlur={() => save({ bankBalance: signed(bank), preparedOn: '', preparedBy: '' })} placeholder="$" className={INPUT} /></Field>
            <Field label="Check not cashed, or deposit not yet in" className="min-w-[200px] flex-1"><input value={what} onChange={e => setWhat(e.target.value)} placeholder="Check 1160, Apex Roofing" className={INPUT} /></Field>
            <Field label="Amount (minus for a check)" className="w-[180px]"><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="-310.00" className={INPUT} /></Field>
            <Button size="sm" variant="ghost" disabled={!what.trim() || !signed(amount)} onClick={() => { save({ outstanding: [...rec.outstanding, { id: 'o' + Date.now().toString(36), what: what.trim(), amount: signed(amount) }], preparedOn: '', preparedBy: '' }); setWhat(''); setAmount(''); }}>Add</Button>
          </div>
          {rec.outstanding.length > 0 && <ul className="m-0 flex list-none flex-col gap-1 p-0">{rec.outstanding.map(o => <li key={o.id} className="flex items-center justify-between gap-2 text-sm text-ux2-ink"><span>{o.what}</span><span className="flex items-center gap-3">{fmt(o.amount)}<button type="button" onClick={() => save({ outstanding: rec.outstanding.filter(x => x.id !== o.id), preparedOn: '', preparedBy: '' })} className="text-xs font-semibold text-ux2-red-ink hover:underline">Remove</button></span></li>)}</ul>}
          <div className="flex flex-wrap items-center gap-2">
            {!rec.preparedOn && <Button size="sm" disabled={!rec.bankBalance || leftToExplain !== 0} onClick={() => save({ preparedBy: me, preparedOn: todayIso() })}>{!rec.bankBalance ? 'Enter the bank balance' : leftToExplain !== 0 ? fmt(Math.abs(leftToExplain)) + ' left to explain' : 'I prepared this: it ties out'}</Button>}
            {rec.preparedOn && <Button size="sm" disabled={!!blocker} onClick={() => save({ signedBy: me, signedOn: todayIso() })}>Sign as {me}</Button>}
            {rec.preparedOn && blocker && <span className="text-xs text-ux2-muted">{blocker}.</span>}
          </div>
        </>
      )}
      <span className="text-xs text-ux2-muted">Adjusted bank balance {rec.bankBalance ? fmt(adjustedBank) : '—'} · books as of {end}. A difference is a bank line not yet in the books (a fee, interest) or an entry that is wrong: post or correct it in Funds, then it ties out here.</span>
    </Inner>
  );
}

interface Packet { sentOn: string; sentBy: string }

function StatementPacket({ period }: { period: string }) {
  const me = useAuthStore(s => s.currentUser.name);
  const building = useBuildingStore(s => s.name);
  const fyEnd = useBuildingStore(s => s.details?.fiscalYearEnd) || '12-31';
  const [packet, save] = useToolDoc<Packet>('statement-packet', period, { sentOn: '', sentBy: '' });
  const print = () => {
    const fin = useFinancialStore.getState();
    const end = monthEnd(period + '-01'), start = period + '-01', fy = fiscalYearStart(end, fyEnd);
    const month = fin.getIncomeStatement(start, end), ytd = fin.getIncomeStatement(fy, end), bs = fin.getBalanceSheet();
    const money = (n: number) => fmt(n);
    const statement = (title: string, st: typeof month) => '<h2 style="font-size:16px;margin-top:24px">' + esc(title) + '</h2>' + rowsHtml([
      ...Object.values(st.income as Record<string, { name: string; amount: number }>).map(i => [i.name, money(i.amount)] as [string, string]),
      ['Total income', money(st.totalIncome)],
      ...Object.values(st.expenses as Record<string, { name: string; amount: number }>).map(i => [i.name, money(i.amount)] as [string, string]),
      ['Total expenses', money(st.totalExpenses)],
      ['Income less expenses', money(st.netIncome)],
    ]);
    const late = fin.units.filter(u => u.balance > 0);
    printPage(building + ' · ' + periodLabel(period), '<h1 style="font-size:22px">' + esc(building) + '</h1><p>Statement packet for ' + esc(periodLabel(period)) + '</p>'
      + statement('Operating statement, ' + periodLabel(period), month)
      + statement('Year to date, from ' + fy, ytd)
      + '<h2 style="font-size:16px;margin-top:24px">Balance sheet by fund, today</h2>' + rowsHtml([['Operating fund', money(bs.equity.operatingFund)], ['Reserve fund', money(bs.equity.reserveFund)], ['Total liabilities', money(bs.liabilities.total)]])
      + '<h2 style="font-size:16px;margin-top:24px">Dues owed</h2>' + rowsHtml([['Units with a balance', String(late.length) + ' of ' + fin.units.length], ['Total owed', money(late.reduce((t, u) => t + u.balance, 0))]])
      + '<p style="font-size:12px;color:#555;margin-top:24px">No unit is named in this packet.</p>');
  };
  return (
    <Inner className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm font-semibold text-ux2-ink">Statement packet for owners</b>{packet.sentOn ? <Chip tone="sage">Sent {packet.sentOn} by {packet.sentBy}</Chip> : <Chip tone="ghost">Not sent</Chip>}</div>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" onClick={print}>Print or save the packet</Button>{!packet.sentOn && <Button size="sm" onClick={() => save({ sentOn: todayIso(), sentBy: me })}>It went to owners today</Button>}</div>
      <span className="text-xs text-ux2-muted">The month and year-to-date operating statements, fund balances and a dues summary with no unit named. Save it as a PDF from the print window and attach it to the notice; this records the day it went out.</span>
    </Inner>
  );
}

/** Month close: reconcile each bank account, with a second person signing, and the statement packet. */
export default function MonthCloseTools({ period }: { period: string }) {
  const banks = useFinancialStore(s => s.chartOfAccounts).filter(a => a.sub === 'bank');
  return (
    <Card aria-label="Reconcile and report" className="gap-3">
      <SectionLabel>Reconcile and report · {periodLabel(period)}</SectionLabel>
      {banks.map(a => <Reconcile key={a.num} acct={a.num} name={a.name} period={period} />)}
      <StatementPacket period={period} />
      <Why>Each account is reconciled by one person and signed by another: whoever prepared a reconciliation cannot sign it. Close the books for the month after both are signed.</Why>
    </Card>
  );
}
