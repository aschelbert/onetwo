import { useRef, useState } from 'react';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { bookLinesFor, matchStatement, parseBankCsv } from '@/lib/bankMatch';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useAuthStore } from '@/store/useAuthStore';
import { balanceOf, fiscalYearStart, fundStatements, monthEnd } from '@/lib/ledger';
import { operatingStatement } from '@/lib/statements';
import { fmt } from '@/lib/formatters';
import { blankReconciliation, reconcile, signBlocker, type Reconciliation } from '@/lib/caseTools';
import { Button, Card, Chip, Inner, KV, SectionLabel, Why, Field, INPUT } from '../../components';
import { todayIso } from '../../runbook/adapters';
import { periodLabel } from '../monthClose';
import { emailAnnouncement } from '../../community/notify';
import { esc, printPage, rowsHtml, useToolDoc } from './docs';

const FORM = 'flex flex-wrap items-end gap-3';
const signed = (s: string) => Math.round((Number(s.replace(/[^0-9.-]/g, '')) || 0) * 100) / 100;

function Reconcile({ acct, name, period }: { acct: string; name: string; period: string }) {
  const me = useAuthStore(s => s.currentUser.name);
  const gl = useFinancialStore(s => s.generalLedger);
  const end = monthEnd(period + '-01');
  const books = balanceOf(acct, 'asset', gl.filter(e => e.date <= end));
  const [saved, save] = useToolDoc<Reconciliation>('reconciliation', acct + ':' + period, blankReconciliation(acct, period));
  const others = useActionRecordsStore(s => s.records).filter(r => r.kind === 'reconciliation').map(r => r.data as unknown as Reconciliation).filter(d => d.acct === acct && d.period !== period);
  const accts = useFinancialStore(s => s.chartOfAccounts).filter(a => a.sub !== 'header' && a.num !== acct);
  const post = useFinancialStore(s => s.postManualEntry);
  const [bank, setBank] = useState(saved.bankBalance ? String(saved.bankBalance) : '');
  const [what, setWhat] = useState('');
  const [amount, setAmount] = useState('');
  const [problem, setProblem] = useState('');
  const [bookTo, setBookTo] = useState<Record<string, string>>({});
  const picker = useRef<HTMLInputElement>(null);
  // With the bank's lines uploaded, what cleared and what is still outstanding are worked out from the ledger, live, until someone signs.
  const clearedElsewhere = new Set(others.flatMap(d => d.clearedIds ?? []));
  const match = saved.statement.length && !saved.signedOn ? matchStatement(saved.statement, bookLinesFor(acct, gl, end).filter(b => !clearedElsewhere.has(b.id))) : null;
  const rec: Reconciliation = match ? { ...saved, clearedIds: match.matched.map(m => m.book.id), outstanding: match.bookOnly.map(b => ({ id: b.id, what: b.date + ' · ' + b.memo, amount: b.amount })) } : saved;
  const upload = async (file: File) => {
    const parsed = parseBankCsv(await file.text());
    setProblem(parsed.problem);
    if (parsed.lines.length) save({ statement: parsed.lines, preparedOn: '', preparedBy: '' });
  };
  const bookIt = (line: { id: string; date: string; description: string; amount: number }) => {
    const other = bookTo[line.id];
    if (!other) return;
    try { if (line.amount < 0) post(line.date, 'Bank: ' + line.description, other, acct, -line.amount); else post(line.date, 'Bank: ' + line.description, acct, other, line.amount); setProblem(''); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'That could not be posted.'); }
  };
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
            <span className="pb-0.5"><input ref={picker} type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} /><Button size="sm" variant="ghost" onClick={() => picker.current?.click()}>{saved.statement.length ? 'Replace the statement file' : 'Upload the statement (CSV)'}</Button></span>
          </div>
          {problem && <span className="text-xs text-ux2-red-ink">{problem}</span>}
          {match && (
            <div className="flex flex-col gap-2 rounded-[10px] border border-ux2-line bg-white px-3 py-2.5">
              <span className="text-sm text-ux2-ink"><b className="font-semibold">{match.matched.length} of {saved.statement.length} bank lines matched themselves</b> · {match.bankOnly.length} on the statement and not in the books · {match.bookOnly.length} in the books and not yet at the bank</span>
              {match.bankOnly.map(l => (
                <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-ux2-ink" data-bank-line={l.id}><span>{l.date} · {l.description || 'No description'}</span><span className="flex flex-wrap items-center gap-2"><b className="font-semibold">{fmt(l.amount)}</b><select aria-label={'Account for ' + l.description} value={bookTo[l.id] ?? ''} onChange={e => setBookTo(m => ({ ...m, [l.id]: e.target.value }))} className="rounded-[8px] border border-ux2-line-strong px-2 py-1 text-xs"><option value="">Book it to</option>{accts.map(a => <option key={a.num} value={a.num}>{a.num} {a.name}</option>)}</select><Button size="sm" variant="ghost" disabled={!bookTo[l.id]} onClick={() => bookIt(l)}>Post</Button></span></div>
              ))}
              {match.bankOnly.length > 0 && <span className="text-xs text-ux2-muted">A deposit that is an owner's payment belongs in Funds as a payment on that unit, not here; record it there and it matches itself.</span>}
            </div>
          )}
          {!match && <div className={FORM}>
            <Field label="Check not cashed, or deposit not yet in" className="min-w-[200px] flex-1"><input value={what} onChange={e => setWhat(e.target.value)} placeholder="Check 1160, Apex Roofing" className={INPUT} /></Field>
            <Field label="Amount (minus for a check)" className="w-[180px]"><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="-310.00" className={INPUT} /></Field>
            <Button size="sm" variant="ghost" disabled={!what.trim() || !signed(amount)} onClick={() => { save({ outstanding: [...rec.outstanding, { id: 'o' + Date.now().toString(36), what: what.trim(), amount: signed(amount) }], preparedOn: '', preparedBy: '' }); setWhat(''); setAmount(''); }}>Add</Button>
          </div>}
          {rec.outstanding.length > 0 && <ul className="m-0 flex list-none flex-col gap-1 p-0">{rec.outstanding.map(o => <li key={o.id} className="flex items-center justify-between gap-2 text-sm text-ux2-ink"><span>{o.what}</span><span className="flex items-center gap-3">{fmt(o.amount)}{!match && <button type="button" onClick={() => save({ outstanding: rec.outstanding.filter(x => x.id !== o.id), preparedOn: '', preparedBy: '' })} className="text-xs font-semibold text-ux2-red-ink hover:underline">Remove</button>}</span></li>)}</ul>}
          <div className="flex flex-wrap items-center gap-2">
            {!rec.preparedOn && <Button size="sm" disabled={!rec.bankBalance || leftToExplain !== 0} onClick={() => save({ preparedBy: me, preparedOn: todayIso(), outstanding: rec.outstanding, clearedIds: rec.clearedIds })}>{!rec.bankBalance ? 'Enter the bank balance' : leftToExplain !== 0 ? fmt(Math.abs(leftToExplain)) + ' left to explain' : 'I prepared this: it ties out'}</Button>}
            {rec.preparedOn && <Button size="sm" disabled={!!blocker} onClick={() => save({ signedBy: me, signedOn: todayIso(), outstanding: rec.outstanding, clearedIds: rec.clearedIds })}>Sign as {me}</Button>}
            {rec.preparedOn && blocker && <span className="text-xs text-ux2-muted">{blocker}.</span>}
          </div>
        </>
      )}
      <span className="text-xs text-ux2-muted">Adjusted bank balance {rec.bankBalance ? fmt(adjustedBank) : '—'} · books as of {end}. A difference is a bank line not yet in the books (a fee, interest) or an entry that is wrong: post or correct it in Funds, then it ties out here.</span>
    </Inner>
  );
}

interface Packet { sentOn: string; sentBy: string; emailed: number; note: string }

/** The packet's sections as headed rows, so it can be printed or put in an email. */
export function packetSections(period: string, fyEnd: string): { title: string; rows: [string, string][] }[] {
  const fin = useFinancialStore.getState();
  const end = monthEnd(period + '-01'), start = period + '-01', fy = fiscalYearStart(end, fyEnd);
  const month = fin.getIncomeStatement(start, end), ytd = fin.getIncomeStatement(fy, end);
  // As of the month's last day, not today: a packet sent on the 9th still describes the month it is for.
  const funds = fundStatements(fin.chartOfAccounts, fin.generalLedger, start, end);
  const statement = (st: typeof month): [string, string][] => [
    ...Object.values(st.income as Record<string, { name: string; amount: number }>).map(i => [i.name, fmt(i.amount)] as [string, string]),
    ['Total income', fmt(st.totalIncome)],
    ...Object.values(st.expenses as Record<string, { name: string; amount: number }>).map(i => [i.name, fmt(i.amount)] as [string, string]),
    ['Total expenses', fmt(st.totalExpenses)],
    ['Income less expenses', fmt(st.netIncome)],
  ];
  const late = fin.units.filter(u => u.balance > 0);
  return [
    { title: 'Operating statement, ' + periodLabel(period), rows: statement(month) },
    { title: 'Year to date, from ' + fy, rows: statement(ytd) },
    { title: 'Fund balances at ' + end, rows: [['Operating fund', fmt(funds.operating.fundBalance)], ['Reserve fund', fmt(funds.reserve.fundBalance)], ['Owed to others', fmt(funds.total.liabilities)], ['Net operating income, ' + periodLabel(period), fmt(operatingStatement(fin.chartOfAccounts, fin.generalLedger, start, end).noi)]] },
    { title: 'Dues owed', rows: [['Units with a balance', late.length + ' of ' + fin.units.length], ['Total owed', fmt(late.reduce((t, u) => t + u.balance, 0))]] },
  ];
}

function StatementPacket({ period }: { period: string }) {
  const me = useAuthStore(s => s.currentUser.name);
  const building = useBuildingStore(s => s.name);
  const fyEnd = useBuildingStore(s => s.details?.fiscalYearEnd) || '12-31';
  const units = useFinancialStore(s => s.units);
  const [packet, save] = useToolDoc<Packet>('statement-packet', period, { sentOn: '', sentBy: '', emailed: 0, note: '' });
  const [busy, setBusy] = useState(false);
  const withEmail = units.filter(u => u.email);
  const print = () => printPage(building + ' · ' + periodLabel(period), '<h1 style="font-size:22px">' + esc(building) + '</h1><p>Statement packet for ' + esc(periodLabel(period)) + '</p>' + packetSections(period, fyEnd).map(sec => '<h2 style="font-size:16px;margin-top:24px">' + esc(sec.title) + '</h2>' + rowsHtml(sec.rows)).join('') + '<p style="font-size:12px;color:#555;margin-top:24px">No unit is named in this packet.</p>');
  const email = async () => {
    setBusy(true);
    const body = packetSections(period, fyEnd).map(sec => sec.title.toUpperCase() + '\n' + sec.rows.map(([a, b]) => a + ': ' + b).join('\n')).join('\n\n') + '\n\nNo unit is named in this packet.';
    const r = await emailAnnouncement({ title: building + ': statement packet for ' + periodLabel(period), body, category: 'financial', postedBy: me, recipients: withEmail.map(u => ({ email: u.email, name: u.owner })) });
    save({ sentOn: r.sent ? todayIso() : packet.sentOn, sentBy: r.sent ? me : packet.sentBy, emailed: r.sent, note: r.note ?? '' });
    setBusy(false);
  };
  return (
    <Inner className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm font-semibold text-ux2-ink">Statement packet for owners</b>{packet.sentOn ? <Chip tone="sage">Sent {packet.sentOn} by {packet.sentBy}{packet.emailed ? ' · ' + packet.emailed + ' emailed' : ''}</Chip> : <Chip tone="ghost">Not sent</Chip>}</div>
      <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy || !withEmail.length} onClick={() => void email()}>{busy ? 'Sending' : 'Email it to ' + withEmail.length + ' owners'}</Button><Button size="sm" variant="ghost" onClick={print}>Print or save the packet</Button>{!packet.sentOn && <Button size="sm" variant="ghost" onClick={() => save({ sentOn: todayIso(), sentBy: me })}>It went out another way today</Button>}</div>
      {packet.note && <span className="text-xs text-ux2-red-ink">{packet.note}</span>}
      <span className="text-xs text-ux2-muted">The month and year-to-date operating statements, fund balances and a dues summary with no unit named. Emailing puts the figures in the message itself; {units.length - withEmail.length} unit{units.length - withEmail.length === 1 ? ' has' : 's have'} no email on file and need a printed copy.</span>
    </Inner>
  );
}

/** Month close: reconcile each bank account, with a second person signing, and the statement packet. */
export default function MonthCloseTools({ period }: { period: string }) {
  const banks = useFinancialStore(s => s.chartOfAccounts).filter(a => a.sub === 'bank');
  const any = useActionRecordsStore(s => s.records.some(r => r.kind === 'reconciliation'));
  const [controls, setControls] = useToolDoc<{ requireReconciliation?: boolean }>('controls', 'building', {});
  const required = controls.requireReconciliation ?? any;
  return (
    <Card aria-label="Reconcile and report" className="gap-3">
      <SectionLabel>Reconcile and report · {periodLabel(period)}</SectionLabel>
      {banks.map(a => <Reconcile key={a.num} acct={a.num} name={a.name} period={period} />)}
      <StatementPacket period={period} />
      <label className="flex items-center gap-2 text-xs font-semibold text-ux2-ink"><input type="checkbox" checked={required} onChange={e => setControls({ requireReconciliation: e.target.checked })} />Ask for a signed reconciliation of every bank account before a month's books are closed</label>
      <Why>Each account is reconciled by one person and signed by another: whoever prepared a reconciliation cannot sign it. With the box ticked, closing the books for a month that is missing a signature asks first, and going ahead anyway is recorded with the person's name.</Why>
    </Card>
  );
}
