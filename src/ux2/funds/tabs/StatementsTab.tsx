/**
 * Statements & taxes, to the Funds-Statements board: Needs you, the balance
 * sheet and income statement cards (expand to the full report and the
 * budget variance), Monthly statement packets, Taxes and filings, and
 * Accountant access. Every number comes from the general ledger through the
 * store's report helpers; a packet downloads as a file and "Send to owners"
 * posts it as a financial notice.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { fmt } from '@/lib/formatters';
import { Button, Card, Cell, Chip, Inner, KV, PillTabs, RowMenu, SectionLabel, Table, Td, Th, Why } from '../../components';
import { dayLabel } from '../../home/calendar';
import { behind, monthName, type FundsSnapshot } from '../metrics';

const SENT_KEY = 'onetwo-ux2-packets-sent';
const readSent = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(SENT_KEY) || '{}'); } catch { return {}; } };

interface Line { num: string; name: string; amount: number }
interface IS { income: Record<string, { name: string; amount: number }>; expenses: Record<string, { name: string; amount: number }>; totalIncome: number; totalExpenses: number; netIncome: number }

const monthEnd = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const lines = (rec: Record<string, { name: string; amount: number }>): Line[] => Object.entries(rec).map(([num, v]) => ({ num, name: v.name, amount: v.amount })).sort((a, b) => a.num.localeCompare(b.num));

function download(name: string, text: string, type = 'text/html') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function StatementsTab({ snap }: { snap: FundsSnapshot }) {
  const navigate = useNavigate();
  const getBalanceSheet = useFinancialStore(s => s.getBalanceSheet);
  const getIncomeStatement = useFinancialStore(s => s.getIncomeStatement);
  const getBudgetVariance = useFinancialStore(s => s.getBudgetVariance);
  const getAcctName = useFinancialStore(s => s.getAcctName);
  const ledger = useFinancialStore(s => s.generalLedger);
  const building = useBuildingStore();
  const addAnnouncement = useComplianceStore(s => s.addAnnouncement);
  const viewer = useAuthStore(s => s.currentUser);
  const [fullBs, setFullBs] = useState(false);
  const [fullIs, setFullIs] = useState<'none' | 'full' | 'variance'>('none');
  const [year, setYear] = useState<string>(snap.today.slice(0, 4));
  const [showAllMonths, setShowAllMonths] = useState(false);
  const [filing, setFiling] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, string>>(() => readSent());
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { try { localStorage.setItem(SENT_KEY, JSON.stringify(sent)); } catch { /* private window */ } }, [sent]);

  const thisYear = snap.today.slice(0, 4);
  const thisMonth = snap.today.slice(0, 7);
  const bs = getBalanceSheet() as { assets: Record<string, number>; liabilities: Record<string, number>; equity: Record<string, number> };
  const is = getIncomeStatement(`${thisYear}-01-01`, snap.today) as IS;
  const variance = getBudgetVariance() as { id: string; name: string; budgeted: number; actual: number; variance: number; pct: number }[];
  const behindUnits = behind(snap);
  const receivable = (bs.assets.assessmentsAR ?? 0) + (bs.assets.specialAR ?? 0) + (bs.assets.lateFeesAR ?? 0) + (bs.assets.insuranceAR ?? 0);
  const owns = (bs.assets.operating ?? 0) + (bs.assets.reserves ?? 0) + (bs.assets.pettyCash ?? 0) + receivable + (bs.assets.prepaid ?? 0);
  const owes = (bs.liabilities.payable ?? 0) + (bs.liabilities.prepaidAssessments ?? 0) + (bs.liabilities.deposits ?? 0) + (bs.liabilities.accrued ?? 0);
  const funds = (bs.equity.operatingFund ?? 0) + (bs.equity.reserveFund ?? 0) + (bs.equity.retained ?? 0);
  const dues = lines(is.income).find(l => /dues|assessment/i.test(l.name));
  const billed = snap.unitInvoices.filter(i => i.type === 'monthly' && i.createdDate.startsWith(thisYear) && i.status !== 'void').reduce((t, i) => t + i.amount, 0);
  const stillOwed = behindUnits.reduce((t, b) => t + b.amount, 0);

  const years = useMemo(() => { const set = new Set(ledger.map(e => e.date.slice(0, 4))); set.add(thisYear); return Array.from(set).sort().reverse(); }, [ledger, thisYear]);
  const months = useMemo(() => {
    const out: { key: string; label: string; income: number; expenses: number; net: number; entries: number; open: boolean; lastEntry: string | null }[] = [];
    const last = year === thisYear ? Number(thisMonth.slice(5, 7)) : 12;
    for (let m = last; m >= 1; m--) {
      const key = `${year}-${String(m).padStart(2, '0')}`;
      const s = getIncomeStatement(`${key}-01`, monthEnd(key)) as IS;
      const entries = ledger.filter(e => e.date.startsWith(key));
      out.push({ key, label: monthName(key, true), income: s.totalIncome, expenses: s.totalExpenses, net: s.netIncome, entries: entries.length, open: key === thisMonth, lastEntry: entries.map(e => e.posted || e.date).sort().pop() ?? null });
    }
    return out;
  }, [year, thisYear, thisMonth, getIncomeStatement, ledger]);
  const visibleMonths = showAllMonths ? months : months.slice(0, 5);
  const lastClosed = months.find(m => !m.open && m.entries > 0);
  const closeBy = (key: string) => { const [y, m] = key.split('-').map(Number); const d = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 15)); return d.toISOString().slice(0, 10); };

  // Taxes
  const exemptIncome = is.totalIncome;
  const nonExempt = lines(is.income).filter(l => /interest|rental|other/i.test(l.name)).reduce((t, l) => t + l.amount, 0);
  const deductions = is.totalExpenses;
  const taxable = Math.max(0, nonExempt - 100 - deductions * (nonExempt / ((exemptIncome + nonExempt) || 1)));
  const taxOwed = Math.round(taxable * 0.3);
  const dc = building.address.state === 'DC' || /district of columbia/i.test(building.address.state);
  const localForm = dc ? (building.details.entityType === 'unincorporated' ? 'Form D-30' : 'Form D-20') : `${building.address.state} return`;
  const vendors1099 = useMemo(() => {
    const paid = new Map<string, number>();
    for (const w of snap.workOrders) if (w.status === 'paid' && w.paidDate?.startsWith(thisYear)) paid.set(w.vendor, (paid.get(w.vendor) ?? 0) + w.amount);
    return Array.from(paid.entries()).filter(([, amt]) => amt >= 600).map(([vendor, amt]) => ({ vendor, amt, onFile: building.vendors.some(v => v.name === vendor && v.status === 'active') })).sort((a, b) => b.amt - a.amt);
  }, [snap.workOrders, thisYear, building.vendors]);
  const w9Missing = vendors1099.filter(v => !v.onFile);

  const packetHtml = (key: string) => {
    const s = getIncomeStatement(`${key}-01`, monthEnd(key)) as IS;
    const entries = ledger.filter(e => e.date.startsWith(key));
    const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const row = (l: Line) => `<tr><td>${l.num} ${esc(l.name)}</td><td align="right">${fmt(l.amount)}</td></tr>`;
    return `<!doctype html><meta charset="utf-8"><title>${esc(building.name)} · ${monthName(key, true)} statement packet</title><style>body{font:14px/1.5 system-ui;max-width:760px;margin:40px auto;color:#1A1F25}h1{font-size:22px}h2{font-size:15px;margin-top:28px}table{width:100%;border-collapse:collapse}td,th{padding:4px 6px;border-bottom:1px solid #E3E8EE;text-align:left}</style>
<h1>${esc(building.name)} · ${monthName(key, true)} statement packet</h1><p>Balance sheet as of ${monthEnd(key)}, income statement for the month, budget variance year to date, and the month's ledger.</p>
<h2>Balance sheet</h2><table><tr><td>Operating cash</td><td align="right">${fmt(bs.assets.operating ?? 0)}</td></tr><tr><td>Reserves</td><td align="right">${fmt(bs.assets.reserves ?? 0)}</td></tr><tr><td>Owed by owners</td><td align="right">${fmt(receivable)}</td></tr><tr><th>Total owns</th><th align="right">${fmt(owns)}</th></tr><tr><td>Bills awaiting payment</td><td align="right">${fmt(bs.liabilities.payable ?? 0)}</td></tr><tr><th>Total owes</th><th align="right">${fmt(owes)}</th></tr><tr><td>Operating fund</td><td align="right">${fmt(bs.equity.operatingFund ?? 0)}</td></tr><tr><td>Reserve fund</td><td align="right">${fmt(bs.equity.reserveFund ?? 0)}</td></tr><tr><th>Total fund balances</th><th align="right">${fmt(funds)}</th></tr></table>
<h2>Income statement · ${monthName(key, true)}</h2><table>${lines(s.income).map(row).join('')}<tr><th>Total income</th><th align="right">${fmt(s.totalIncome)}</th></tr>${lines(s.expenses).map(row).join('')}<tr><th>Total expenses</th><th align="right">${fmt(s.totalExpenses)}</th></tr><tr><th>Net</th><th align="right">${fmt(s.netIncome)}</th></tr></table>
<h2>Budget variance · year to date</h2><table><tr><th>Line</th><th align="right">Budget</th><th align="right">Actual</th><th align="right">Variance</th></tr>${variance.map(v => `<tr><td>${esc(v.name)}</td><td align="right">${fmt(v.budgeted)}</td><td align="right">${fmt(v.actual)}</td><td align="right">${fmt(v.variance)}</td></tr>`).join('')}</table>
<h2>Ledger · ${entries.length} entries</h2><table><tr><th>Date</th><th>Memo</th><th>Debit</th><th>Credit</th><th align="right">Amount</th></tr>${entries.map(e => `<tr><td>${e.date}</td><td>${esc(e.memo)}</td><td>${e.debitAcct} ${esc(getAcctName(e.debitAcct))}</td><td>${e.creditAcct} ${esc(getAcctName(e.creditAcct))}</td><td align="right">${fmt(e.amount)}</td></tr>`).join('')}</table>`;
  };
  const sendToOwners = (key: string) => {
    const s = getIncomeStatement(`${key}-01`, monthEnd(key)) as IS;
    addAnnouncement({ title: `${monthName(key, true)} statement packet`, body: `Income ${fmt(s.totalIncome)}, expenses ${fmt(s.totalExpenses)}, net ${s.netIncome >= 0 ? '+' : '−'}${fmt(Math.abs(s.netIncome))}. Operating cash ${fmt(bs.assets.operating ?? 0)}, reserves ${fmt(bs.assets.reserves ?? 0)}. The full packet (balance sheet, income statement, budget variance, ledger) is attached to this notice and to your own statement under My Unit.`, category: 'financial', postedBy: viewer.name, postedDate: snap.today, pinned: false });
    setSent(prev => ({ ...prev, [key]: snap.today }));
    setNote(`${monthName(key, true)} packet posted to owners as a financial notice.`);
  };

  const needs = [
    lastClosed && !sent[lastClosed.key] ? { title: `${lastClosed.label} packet is ready`, detail: `closed${lastClosed.lastEntry ? ` ${dayLabel(lastClosed.lastEntry.slice(0, 10))}` : ''} · balance sheet, income statement, budget variance, ledger · owners expect it by ${dayLabel(closeBy(lastClosed.key))}`, action: 'Send to owners', run: () => sendToOwners(lastClosed.key) } : null,
    w9Missing.length ? { title: `${w9Missing.length === 1 ? 'One W-9' : `${w9Missing.length} W-9s`} missing for the 1099s`, detail: `${w9Missing.map(v => v.vendor).join(', ')} · ${vendors1099.length - w9Missing.length} on file · forms go out Jan 31`, action: 'Request the W-9', run: () => navigate('/building?tab=contracts') } : null,
  ].filter((x): x is NonNullable<typeof x> => !!x);

  return (
    <div className="flex flex-col gap-5">
      {needs.length > 0 && (
        <Card tone="navy" aria-label="Needs you">
          <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel className="text-white/[0.66]">Needs you</SectionLabel><Chip tone="red">{needs.length} this month</Chip></div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {needs.map(n => <div key={n.title} className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-white px-3.5 py-3"><Cell title={n.title} note={n.detail} /><Button size="sm" onClick={n.run}>{n.action}</Button></div>)}
          </div>
        </Card>
      )}
      {note && <Inner className="flex items-center justify-between gap-3 text-sm text-ux2-ink"><span>{note}</span><button type="button" className="text-xs text-ux2-muted hover:underline" onClick={() => setNote(null)}>Dismiss</button></Inner>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card aria-label="Balance sheet">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[17px] font-semibold text-ux2-ink">What the building owns and owes</span><span className="text-xs text-ux2-muted">Balance sheet · as of {dayLabel(snap.today)}</span></div>
          <Inner className="py-1">
            <SectionLabel>Owns</SectionLabel>
            <KV label={<>Operating cash <span className="text-ux2-muted">· 1010</span></>}>{fmt(bs.assets.operating ?? 0)}</KV>
            <KV label={<>Reserves <span className="text-ux2-muted">· 1020</span></>}>{fmt(bs.assets.reserves ?? 0)}</KV>
            <KV label={<>Owed by owners <span className="text-ux2-muted">· {behindUnits.length} unit{behindUnits.length === 1 ? '' : 's'}</span></>}>{fmt(receivable)}</KV>
            {fullBs && <><KV label="Petty cash · 1030">{fmt(bs.assets.pettyCash ?? 0)}</KV><KV label="Prepaid expenses · 1200">{fmt(bs.assets.prepaid ?? 0)}</KV></>}
            <KV label={<b>Total</b>}>{fmt(owns)}</KV>
          </Inner>
          <Inner className="py-1">
            <SectionLabel>Owes</SectionLabel>
            <KV label={<>Bills awaiting payment <span className="text-ux2-muted">· 2010</span></>}>{fmt(bs.liabilities.payable ?? 0)}</KV>
            {fullBs && <><KV label="Prepaid assessments · 2020">{fmt(bs.liabilities.prepaidAssessments ?? 0)}</KV><KV label="Deposits held · 2030">{fmt(bs.liabilities.deposits ?? 0)}</KV><KV label="Accrued expenses · 2040">{fmt(bs.liabilities.accrued ?? 0)}</KV></>}
            <KV label={<b>Total</b>}>{fmt(owes)}</KV>
          </Inner>
          <Inner className="py-1">
            <SectionLabel>Fund balances</SectionLabel>
            <KV label="Operating fund">{fmt(bs.equity.operatingFund ?? 0)}</KV>
            <KV label="Reserve fund">{fmt(bs.equity.reserveFund ?? 0)}</KV>
            {fullBs && <KV label="Retained surplus">{fmt(bs.equity.retained ?? 0)}</KV>}
            <KV label={<b>Total</b>}>{fmt(funds)}</KV>
          </Inner>
          <div><Button size="sm" variant="ghost" onClick={() => setFullBs(v => !v)}>{fullBs ? 'Show the short balance sheet' : 'Open the full balance sheet'}</Button></div>
        </Card>

        <Card aria-label="Income statement">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[17px] font-semibold text-ux2-ink">What came in and went out</span><span className="text-xs text-ux2-muted">Income statement · Jan 1 to {dayLabel(snap.today)}</span></div>
          <div className="flex items-baseline gap-2"><span className={`font-display text-[34px] font-semibold leading-none tracking-[-0.02em] ${is.netIncome >= 0 ? 'text-ux2-sage' : 'text-ux2-red-ink'}`}>{is.netIncome >= 0 ? '+' : '−'}{fmt(Math.abs(is.netIncome))}</span><span className="text-sm text-ux2-muted">net income to date</span></div>
          {fullIs !== 'variance' ? (
            <>
              <Inner className="py-1">
                <SectionLabel>Income</SectionLabel>
                {(fullIs === 'full' ? lines(is.income) : lines(is.income).slice(0, 3)).map(l => <KV key={l.num} label={l === dues ? <>{l.name} <span className="text-ux2-muted">· {fmt(billed)} billed{stillOwed ? `, ${fmt(stillOwed)} still owed by ${behindUnits.slice(0, 2).map(b => b.number).join(' and ')}` : ''}</span></> : l.name}>{fmt(l.amount)}</KV>)}
                <KV label={<b>Total income</b>}>{fmt(is.totalIncome)}</KV>
              </Inner>
              <Inner className="py-1">
                <SectionLabel>Expenses</SectionLabel>
                {fullIs === 'full' ? lines(is.expenses).map(l => <KV key={l.num} label={l.name}>{fmt(l.amount)}</KV>) : <KV label={<>The {variance.length} budget lines</>}>{fmt(is.totalExpenses)}</KV>}
                <KV label={<>Set aside for reserves <span className="text-ux2-muted">· {fmt(snap.annualReserveContribution / 12)} a month</span></>}>{fmt(Math.round(snap.annualReserveContribution / 12) * Number(thisMonth.slice(5, 7)))}</KV>
                <KV label={<b>Total expenses</b>}>{fmt(is.totalExpenses)}</KV>
              </Inner>
            </>
          ) : (
            <Table minWidth={520}>
              <thead><tr><Th>Line</Th><Th num>Budget</Th><Th num>Actual</Th><Th num>Variance</Th></tr></thead>
              <tbody>{variance.map(v => <tr key={v.id}><Td>{v.name}</Td><Td num>{fmt(v.budgeted)}</Td><Td num>{fmt(v.actual)}</Td><Td num><span className={v.variance < 0 ? 'text-ux2-red-ink' : ''}>{fmt(v.variance)}</span></Td></tr>)}</tbody>
            </Table>
          )}
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" onClick={() => setFullIs(v => (v === 'full' ? 'none' : 'full'))}>{fullIs === 'full' ? 'Show the summary' : 'Open the full income statement'}</Button><Button size="sm" variant="ghost" onClick={() => setFullIs(v => (v === 'variance' ? 'none' : 'variance'))}>Budget variance report</Button></div>
          <Why>The budget variance report is the same {variance.length} lines as Planning, with the difference column; it is included in every monthly packet.</Why>
        </Card>
      </div>

      <Card aria-label="Monthly statement packets">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><span className="text-[17px] font-semibold text-ux2-ink">Monthly statement packets</span><span className="ml-2 text-xs text-ux2-muted">Each packet: balance sheet, income statement, budget variance, ledger</span></div>
          <PillTabs size="filter" surface="white" aria-label="Packet years" value={year} onChange={setYear} tabs={years.map(y => ({ id: y, label: y }))} />
        </div>
        <Table minWidth={820}>
          <thead><tr><Th>Month</Th><Th>Closed</Th><Th num>Income</Th><Th num>Expenses</Th><Th num>Net</Th><Th>Owners</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
          <tbody>
            {visibleMonths.map(m => (
              <tr key={m.key} data-packet={m.key} className={m.open ? '' : ''}>
                <Td><span className="font-semibold">{m.label.replace(/ \d{4}$/, '')}</span></Td>
                <Td>{m.open ? <Cell title="Open" note={`close by ${dayLabel(closeBy(m.key))}`} /> : m.entries === 0 ? <span className="text-ux2-muted">No entries</span> : <Cell title={m.lastEntry ? dayLabel(m.lastEntry.slice(0, 10)) : 'Closed'} note={`${m.entries} entries`} />}</Td>
                <Td num>{m.open ? '–' : fmt(m.income)}</Td><Td num>{m.open ? '–' : fmt(m.expenses)}</Td><Td num>{m.open ? '–' : `${m.net >= 0 ? '+' : '−'}${fmt(Math.abs(m.net))}`}</Td>
                <Td>{m.open ? <Chip tone="ghost">Not yet</Chip> : m.entries === 0 ? <Chip tone="ghost">Nothing to send</Chip> : sent[m.key] ? <Chip tone="sage">Sent {dayLabel(sent[m.key])}</Chip> : <Chip tone="navy">Ready to send</Chip>}</Td>
                <Td num>
                  {m.open ? <Button size="sm" variant="ghost" onClick={() => navigate('/boardroom?tab=runbooks')}>Month close runbook</Button> : m.entries === 0 ? null : (
                    <span className="flex justify-end gap-1.5"><Button size="sm" variant="ghost" onClick={() => download(`${building.name.replace(/\s+/g, '-')}-${m.key}-packet.html`, packetHtml(m.key))}>Download</Button>{sent[m.key] ? <RowMenu label={`Actions for ${m.label}`} items={[{ label: 'Send again', onSelect: () => sendToOwners(m.key) }, { label: 'Open the ledger for this month', onSelect: () => navigate('/funds?tab=settings&section=ledger') }]} /> : <Button size="sm" onClick={() => sendToOwners(m.key)}>Send to owners</Button>}</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {months.length > 5 ? <Button size="sm" variant="ghost" onClick={() => setShowAllMonths(v => !v)}>{showAllMonths ? 'Show fewer' : `${months.length - 5} more`}</Button> : <span />}
          <Why>Monthly income and expenses include the reserve set-aside. The packet posts to the Community notices when sent; owners can also pull it from their own statement. Bylaws: statements to owners within 15 days of close.</Why>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[3fr_2fr]">
        <Card aria-label="Taxes and filings">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[17px] font-semibold text-ux2-ink">Taxes and filings</span><span className="text-xs text-ux2-muted">Tax year {thisYear} · drafted from the ledger as it closes</span></div>
          {[
            { id: '1120h', title: 'Form 1120-H', note: `federal return for homeowner associations · due Apr 15 · dues are exempt; interest on reserves is the only taxable income · estimated tax ${fmt(taxOwed)}, paid through EFTPS`, chip: 'Drafted', tone: 'cyan' as const, action: 'Review draft' },
            { id: 'local', title: localForm, note: dc ? `DC franchise tax return · DC Office of Tax and Revenue · due Apr 15 · files at MyTax.DC.gov · usually nothing owed for an association · DC Code § 47-180${building.details.entityType === 'unincorporated' ? '8' : '7'}` : `State return · due Apr 15 · usually nothing owed for an association`, chip: 'Not started', tone: 'ghost' as const, action: 'Start from the 1120-H' },
            { id: '1099', title: '1099s', note: `${vendors1099.length} vendor${vendors1099.length === 1 ? '' : 's'} paid over $600${vendors1099.length ? ` · ${vendors1099.slice(0, 4).map(v => `${v.vendor} ${fmt(v.amt)}`).join(' · ')}` : ''} · to vendors and the IRS by Jan 31`, chip: vendors1099.length ? `${vendors1099.length - w9Missing.length} of ${vendors1099.length} W-9s` : 'None yet', tone: w9Missing.length ? ('amber' as const) : ('sage' as const), action: 'Prepare' },
            { id: 'annual', title: 'Annual report to owners', note: `${thisYear} · year-end statements plus the reserve position · goes with the annual meeting notice`, chip: 'After Dec close', tone: 'ghost' as const, action: 'Past reports' },
          ].map(f => (
            <Inner key={f.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-3"><Cell title={f.title} note={f.note} /><span className="flex items-center gap-2"><Chip tone={f.tone}>{f.chip}</Chip><Button size="sm" variant="ghost" onClick={() => setFiling(v => (v === f.id ? null : f.id))}>{f.action}</Button></span></div>
              {filing === f.id && f.id === '1120h' && <div className="rounded-[12px] bg-ux2-surface px-3 py-2"><KV label="1. Dues and assessments (exempt function income)">{fmt(exemptIncome)}</KV><KV label="2. Interest and other income">{fmt(nonExempt)}</KV><KV label="3. Deductions allocable to that income">{fmt(Math.round(deductions * (nonExempt / ((exemptIncome + nonExempt) || 1))))}</KV><KV label="4. Specific deduction">{fmt(Math.min(100, nonExempt))}</KV><KV label="5. Taxable income">{fmt(taxable)}</KV><KV label="6. Tax at 30%">{fmt(taxOwed)}</KV><Why>Auto-drafted from the ledger under IRC § 528. Review with the accountant before filing.</Why></div>}
              {filing === f.id && f.id === 'local' && <div className="rounded-[12px] bg-ux2-surface px-3 py-2"><KV label="Federal taxable income carried over">{fmt(taxable)}</KV><KV label="Rate">8.25% of DC taxable income{building.details.entityType === 'unincorporated' ? ' (first $12,500 exempt)' : ''}</KV><KV label="Estimated">{fmt(building.details.entityType === 'unincorporated' ? Math.round(Math.max(0, taxable - 12500) * 0.0825) : Math.round(taxable * 0.0825))}</KV><Why>Files at <a className="underline" href="https://mytax.dc.gov" target="_blank" rel="noreferrer">MyTax.DC.gov</a>. Associations with no DC-sourced non-exempt income usually owe nothing.</Why></div>}
              {filing === f.id && f.id === '1099' && <div className="rounded-[12px] bg-ux2-surface px-3 py-2">{vendors1099.length === 0 ? <Why>No vendor has been paid $600 or more this year.</Why> : vendors1099.map(v => <KV key={v.vendor} label={v.vendor}>{fmt(v.amt)} · <Chip tone={v.onFile ? 'sage' : 'amber'}>{v.onFile ? 'W-9 on file' : 'W-9 needed'}</Chip></KV>)}<div className="pt-2"><Button size="sm" variant="ghost" onClick={() => navigate('/building?tab=contracts')}>Vendors · Building › Contracts</Button></div></div>}
              {filing === f.id && f.id === 'annual' && <div className="rounded-[12px] bg-ux2-surface px-3 py-2">{years.filter(y => y !== thisYear).length === 0 ? <Why>No past year in the ledger yet.</Why> : years.filter(y => y !== thisYear).map(y => <Inner key={y} className="flex items-center justify-between gap-3"><Cell title={`Annual report · ${y}`} note="Year-end statements and the reserve position" /><Button size="sm" variant="ghost" onClick={() => { setYear(y); document.querySelector('[aria-label="Monthly statement packets"]')?.scrollIntoView({ behavior: 'smooth' }); }}>Open</Button></Inner>)}</div>}
            </Inner>
          ))}
          <Why>Each filing is a Runbook: the numbers fill in from the ledger, the accountant reviews, and the "file" step arrives as a Home card when it is due. The biennial report to DCRA (Apr 1) is a records filing and lives under Building obligations.</Why>
        </Card>

        <Card aria-label="Accountant access">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[17px] font-semibold text-ux2-ink">Accountant access</span><Chip tone={building.management.company ? 'sage' : 'ghost'}>{building.management.company ? 'Active' : 'Not set up'}</Chip></div>
          <Inner className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ux2-navy text-xs font-bold text-white">{(building.management.company || 'CPA').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</span>
            <Cell title={building.management.company || 'No accountant yet'} note={building.management.company ? `${building.management.email || building.management.contact || ''} · read-only · statements, ledger, tax drafts` : 'Invite one with read-only access to the statements, the ledger and the tax drafts'} />
          </Inner>
          <Inner className="py-1">
            <KV label="Last viewed">{lastClosed && sent[lastClosed.key] ? `${dayLabel(sent[lastClosed.key])} · ${lastClosed.label} packet` : '—'}</KV>
            <KV label="Can see">reports, ledger, filings</KV>
            <KV label="Cannot">pay, approve, or edit</KV>
            <KV label="Reviews">1120-H, {localForm}, year end</KV>
          </Inner>
          <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => navigate('/admin/users')}>Manage access</Button><Button size="sm" variant="ghost" onClick={() => download(`${building.name.replace(/\s+/g, '-')}-ledger-${snap.today}.csv`, ['date,id,memo,debit,credit,amount,source', ...ledger.map(e => [e.date, e.id, e.memo, `${e.debitAcct} ${getAcctName(e.debitAcct)}`, `${e.creditAcct} ${getAcctName(e.creditAcct)}`, e.amount, e.source].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n'), 'text/csv')}>Export the ledger</Button></div>
          <Why>Counsel has no Funds access; they see collections cases in the Board Room only.</Why>
        </Card>
      </div>
    </div>
  );
}
