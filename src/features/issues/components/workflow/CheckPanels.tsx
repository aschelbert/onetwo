/**
 * The information a checklist item asks you to review, shown right under the
 * item. Each panel reads the live stores and links to the module where the
 * record lives; the step tools that already existed (budget drafter, reserve
 * study, contract renewals, bylaws review) are reused as they are.
 */
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { lateFeeAsScheduleItem, useFeeScheduleStore } from '@/store/useFeeScheduleStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useAuthStore } from '@/store/useAuthStore';
import { fmt } from '@/lib/formatters';
import type { CaseTrackerCase, CaseStep } from '@/types/issues';
import { ROUTES, type PanelId } from '../../checkAssist';
import { BudgetDraftPanel } from './BudgetDraftPanel';
import { ReserveStudyPanel } from './ReserveStudyPanel';
import { ContractRenewalPanel } from './ContractRenewalPanel';
import { BylawsReviewPanel } from './BylawsReviewPanel';

const today = () => new Date().toISOString().slice(0, 10);

function Frame({ title, to, toLabel, children, note }: { title: string; to?: string; toLabel?: string; children: ReactNode; note?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-ink-100 bg-mist-50 p-3" data-check-panel={title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-ink-500">{title}</p>
        {to && <button type="button" onClick={() => navigate(to)} className="text-[11px] font-semibold text-accent-700 hover:underline">{toLabel ?? 'Open'} ↗</button>}
      </div>
      {children}
      {note && <p className="text-[11px] leading-relaxed text-ink-400">{note}</p>}
    </div>
  );
}

function Rows({ head, rows, empty }: { head: string[]; rows: ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <p className="text-xs text-ink-400">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-ink-100 bg-white">
      <table className="w-full text-xs">
        <thead><tr className="text-left text-[10px] uppercase tracking-wider text-ink-400">{head.map((h, i) => <th key={h} className={`px-2 py-1.5 font-semibold ${i > 0 && /amount|budget|actual|projected|balance|share|fee|premium|\$/i.test(h) ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-ink-50">{r.map((cell, j) => <td key={j} className={`px-2 py-1.5 text-ink-700 ${j > 0 && typeof cell === 'string' && /^[-−]?\$/.test(cell) ? 'text-right tabular-nums' : ''}`}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function BudgetLines() {
  const variance = useFinancialStore(s => s.getBudgetVariance)() as { id: string; name: string; budgeted: number; actual: number; variance: number }[];
  const month = Math.max(1, Number(today().slice(5, 7)));
  const rows = variance.map(v => {
    const projected = Math.round((v.actual / month) * 12);
    return [v.name, fmt(v.budgeted), fmt(v.actual), fmt(projected), <span key="d" className={projected > v.budgeted ? 'text-red-600' : 'text-sage-700'}>{projected > v.budgeted ? 'Over pace' : 'On pace'}</span>];
  });
  const total = variance.reduce((t, v) => t + v.budgeted, 0);
  const actual = variance.reduce((t, v) => t + v.actual, 0);
  return (
    <Frame title="Operating expenses by category" to={ROUTES.budget} toLabel="Open Funds › Planning"
      note={`Budget ${fmt(total)} · spent ${fmt(actual)} so far · projected = this year's pace to Dec 31. Start next year's line from the projection, not last year's budget.`}>
      <Rows head={['Category', 'Budget', 'Actual YTD', 'Projected year', 'Pace']} rows={rows} empty="No budget lines yet. Add them in Funds › Planning." />
    </Frame>
  );
}

function Financials() {
  const fin = useFinancialStore();
  const year = today().slice(0, 4);
  const is = fin.getIncomeStatement(`${year}-01-01`, today()) as { totalIncome: number; totalExpenses: number; netIncome: number };
  const bs = fin.getBalanceSheet() as { assets: Record<string, number> };
  const over = (fin.getBudgetVariance() as { name: string; budgeted: number; actual: number }[]).filter(v => v.actual > v.budgeted).slice(0, 3);
  return (
    <Frame title={`Financial position · ${year} to date`} to={ROUTES.statements} toLabel="Open Funds › Statements & taxes"
      note="The balance sheet, income statement, monthly packets and tax drafts are in Funds › Statements & taxes.">
      <Rows head={['', 'Amount']} rows={[
        ['Income to date', fmt(is.totalIncome)], ['Expenses to date', fmt(is.totalExpenses)], ['Net', fmt(is.netIncome)],
        ['Operating cash', fmt(bs.assets.operating ?? 0)], ['Reserves', fmt(bs.assets.reserves ?? 0)],
        ...over.map(v => [`Over budget: ${v.name}`, fmt(v.actual - v.budgeted)]),
      ]} empty="" />
    </Frame>
  );
}

function UnitLedger({ unit }: { unit?: string }) {
  const units = useFinancialStore(s => s.units);
  const invoices = useFinancialStore(s => s.unitInvoices);
  const u = unit ? units.find(x => x.number === unit) : undefined;
  if (!u) return <Delinquency note="This case has no unit attached; here is everyone with a balance." />;
  const fees = u.lateFees.filter(f => !f.waived && !f.paid);
  const legacyFees = fees.filter(f => !f.invoiceId);
  const sa = u.specialAssessments.filter(a => !a.paid);
  const open = invoices.filter(i => i.unitNumber === u.number && (i.status === 'sent' || i.status === 'overdue'));
  const rows: ReactNode[][] = [
    ['Balance (all open charges)', fmt(Math.max(0, u.balance))],
    ...legacyFees.map(f => [`Late fee · ${f.date} · ${f.reason}`, fmt(f.amount)]),
    ...sa.map(a => [`Includes special assessment · ${a.reason}`, fmt(a.amount)]),
    ...open.map(i => [`Includes invoice ${i.id} · ${i.description} · due ${i.dueDate}`, fmt(i.amount - (i.paidAmount ?? 0))]),
  ];
  const total = Math.max(0, u.balance) + legacyFees.reduce((t, f) => t + f.amount, 0);
  const pays = [...u.payments].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  return (
    <Frame title={`Unit ${u.number} ledger · ${u.owner}`} to={ROUTES.ledger} toLabel="Open Funds › Income"
      note={`Monthly dues ${fmt(u.monthlyFee)} · total owed ${fmt(total)}. Use this amount in letters, liens and payment plans.`}>
      <Rows head={['Charge', 'Amount']} rows={rows} empty="Nothing owed." />
      <Rows head={['Recent payment', 'Amount']} rows={pays.map(p => [`${p.date} · ${p.method || 'payment'}${p.note ? ` · ${p.note}` : ''}`, fmt(p.amount)])} empty="No payments on record." />
    </Frame>
  );
}

function Delinquency({ note }: { note?: string }) {
  const units = useFinancialStore(s => s.units);
  const behind = units.filter(u => u.balance > 0).sort((a, b) => b.balance - a.balance);
  const total = behind.reduce((t, u) => t + u.balance, 0);
  return (
    <Frame title={`Who is behind · ${behind.length} unit${behind.length === 1 ? '' : 's'}`} to={ROUTES.behind} toLabel="Open Funds › Income › Behind"
      note={note ?? `${fmt(total)} outstanding across ${behind.length} of ${units.length} units (${units.length ? Math.round(((units.length - behind.length) / units.length) * 100) : 0}% current).`}>
      <Rows head={['Unit', 'Owner', 'Balance']} rows={behind.slice(0, 10).map(u => [u.number, u.owner, fmt(u.balance)])} empty="Every unit is current." />
    </Frame>
  );
}

function Fees() {
  const schedule = useFeeScheduleStore(s => s.fees);
  const fin = useFinancialStore();
  const fees = [...(fin.lateFeeEnabled ? [lateFeeAsScheduleItem(fin)] : []), ...schedule.filter(f => f.enabled)];
  return (
    <Frame title="Fee schedule" to={ROUTES.fees} toLabel="Open the fee schedule"
      note={fin.lateFeeEnabled ? `Late fee ${fmt(fin.lateFeeAmount)} after ${fin.lateFeeGraceDays} days, set under Billing rules.` : 'No automatic late fee is set.'}>
      <Rows head={['Fee', 'Amount', 'When']} rows={fees.map(f => [f.name, f.amountType === 'percentage' ? `${f.amount}%` : fmt(f.amount), f.frequency])} empty="No fees set. Add them in Funds › Accounts and ledger › Fees & Billing." />
    </Frame>
  );
}

function Units() {
  const units = useFinancialStore(s => s.units);
  const [total, setTotal] = useState('');
  const amt = Number(total.replace(/[^0-9.]/g, '')) || 0;
  const pctSum = units.reduce((t, u) => t + (u.votingPct || 0), 0) || 100;
  return (
    <Frame title="Per-unit shares by percentage interest" to={ROUTES.ledger} toLabel="Open Funds › Income"
      note="Shares follow each unit's percentage interest in the Declaration. Enter a total to see each unit's amount.">
      <label className="flex items-center gap-2 text-xs text-ink-600">Total to allocate
        <input inputMode="decimal" value={total} onChange={e => setTotal(e.target.value)} placeholder="$24,000" className="w-32 rounded border border-ink-200 px-2 py-1 text-right text-xs" />
      </label>
      <Rows head={['Unit', 'Owner', 'Interest', 'Monthly dues', 'Share']} rows={units.map(u => [u.number, u.owner, `${u.votingPct}%`, fmt(u.monthlyFee), amt ? fmt(Math.round((amt * (u.votingPct || 0)) / pctSum)) : '—'])} empty="No units on file." />
    </Frame>
  );
}

function Insurance() {
  const policies = useBuildingStore(s => s.insurance);
  return (
    <Frame title="Insurance policies" to={ROUTES.insurance} toLabel="Open Building › Insurance"
      note="Carrier, policy number and coverage are what the carrier asks for first when you report a loss.">
      <Rows head={['Policy', 'Carrier', 'Number', 'Coverage', 'Expires']} rows={policies.map(p => [p.type, p.carrier, p.policyNum, p.coverage, p.expires])} empty="No policies on file. Add them in Building › Overview." />
    </Frame>
  );
}

function Vendors() {
  const vendors = useBuildingStore(s => s.vendors);
  return (
    <Frame title="Vendors and contracts" to={ROUTES.contracts} toLabel="Open Building › Contracts">
      <Rows head={['Vendor', 'Service', 'Contact', 'Contract', 'Status']} rows={vendors.map(v => [v.name, v.service, [v.contact, v.phone, v.email].filter(Boolean).join(' · '), v.contract, v.status])} empty="No vendors on file. Add them in Building › Contracts." />
    </Frame>
  );
}

function Documents({ label }: { label: string }) {
  const docs = useBuildingStore(s => s.legalDocuments);
  const words = (label.toLowerCase().match(/bylaw|cc&r|ccr|declaration|rule|polic|guideline|architect|pet|collection|budget/g) ?? []).map(w => w.replace('ccr', 'cc&r'));
  const hit = (n: string) => words.some(w => n.toLowerCase().includes(w));
  const sorted = [...docs].sort((a, b) => Number(hit(b.name)) - Number(hit(a.name)));
  return (
    <Frame title="Governing documents" to={ROUTES.documents} toLabel="Open Building › Documents"
      note="The full text is in Building › Documents; the ones this item refers to are listed first.">
      <Rows head={['Document', 'Version', 'Status']} rows={sorted.map(d => [<span key="n" className={hit(d.name) ? 'font-semibold text-ink-900' : ''}>{d.name}</span>, d.version, d.status === 'current' ? 'Current' : 'Review due'])} empty="No governing documents uploaded yet." />
    </Frame>
  );
}

function Owner({ unit }: { unit?: string }) {
  const units = useFinancialStore(s => s.units);
  const members = useAuthStore(s => s.buildingMembers);
  const u = unit ? units.find(x => x.number === unit) : undefined;
  if (!u) {
    return (
      <Frame title="Owners and residents" to={ROUTES.directory} toLabel="Open Building › Directory"
        note="Every unit, owner and contact is in Building › Directory.">
        <Rows head={['', 'Count']} rows={[['Units', String(units.length)], ['Owners on file', String(new Set(units.map(x => x.owner).filter(Boolean)).size)], ['People who can sign in', String(members.filter(m => m.status === 'active').length)]]} empty="" />
      </Frame>
    );
  }
  const people = members.filter(m => m.unit === u.number);
  return (
    <Frame title={`Unit ${u.number}`} to={ROUTES.directory} toLabel="Open Building › Directory">
      <Rows head={['', '']} rows={[
        ['Owner', u.owner], ['Email', u.email || '—'], ['Phone', u.phone || '—'], ['Status', u.status.toLowerCase().replace('_', ' ')],
        ...(u.moveIn ? [['Owner since', u.moveIn]] : []),
        ...people.filter(p => p.name !== u.owner).map(p => ['Also on this unit', `${p.name} · ${p.email}`]),
      ]} empty="" />
    </Frame>
  );
}

function Board() {
  const board = useBuildingStore(s => s.board);
  const quorum = Math.floor(board.length / 2) + 1;
  return (
    <Frame title={`Board · quorum ${quorum} of ${board.length}`} to={ROUTES.directory} toLabel="Open Building › Directory"
      note="Quorum shown as a simple majority of seats; check the bylaws for a different rule. Anyone with a conflict should recuse and the recusal goes in the minutes.">
      <Rows head={['Name', 'Role', 'Contact', 'Term']} rows={board.map(b => [b.name, b.role, b.email || b.phone || '—', b.term || '—'])} empty="No board members on file." />
    </Frame>
  );
}

function Counsel() {
  const counsel = useBuildingStore(s => s.legalCounsel);
  return (
    <Frame title="Legal counsel" to={ROUTES.directory} toLabel="Open Building › Directory"
      note={counsel.length ? 'Send counsel the case export so they start from the full record.' : 'No counsel on file yet. Add the association’s attorney in Building › Directory.'}>
      <Rows head={['Firm', 'Attorney', 'Contact', 'Specialty']} rows={counsel.map(l => [l.firm, l.attorney, [l.email, l.phone].filter(Boolean).join(' · '), l.specialty])} empty="" />
    </Frame>
  );
}

function Meetings() {
  const meetings = useMeetingsStore(s => s.meetings);
  const t = today();
  const upcoming = meetings.filter(m => m.date >= t).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const past = meetings.filter(m => m.date < t).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2);
  return (
    <Frame title="Meetings and minutes" to={ROUTES.meetings} toLabel="Open Community › Meetings">
      <Rows head={['Meeting', 'Date', 'Status']} rows={[...upcoming, ...past].map(m => [m.title, `${m.date}${m.time ? ` ${m.time}` : ''}`, m.date >= t ? 'Upcoming' : m.minutes ? 'Minutes recorded' : 'No minutes yet'])} empty="No meetings scheduled. Schedule one from this step or Community › Meetings." />
    </Frame>
  );
}

function Assets() {
  const assets = useBuildingStore(s => s.assets);
  const year = Number(today().slice(0, 4));
  return (
    <Frame title="Building assets" to={ROUTES.assets} toLabel="Open Building › Overview › Assets"
      note="Inspections and permits for these systems are tracked in Building › Obligations.">
      <Rows head={['Asset', 'Location', 'Condition', 'Replace by']} rows={assets.map(a => {
        const due = a.installedDate ? Number(a.installedDate.slice(0, 4)) + (a.usefulLifeYears || 0) : null;
        return [a.name, a.location || '—', a.condition, due ? `${due}${due <= year ? ' · due' : ''}` : '—'];
      })} empty="No assets on file. Add them in Building › Overview." />
    </Frame>
  );
}

function Filings() {
  const filings = useComplianceStore(s => s.filings);
  return (
    <Frame title="Filings and deadlines" to={ROUTES.filings} toLabel="Open Building › Obligations › Filings">
      <Rows head={['Filing', 'Due', 'Status', 'Reference']} rows={[...filings].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(f => [f.name, f.dueDate, f.status === 'filed' ? `Filed ${f.filedDate ?? ''}` : 'Pending', f.legalRef || '—'])} empty="No filings tracked yet." />
    </Frame>
  );
}

export function CheckPanel({ panel, c, step, stepIndex, label }: { panel: PanelId; c: CaseTrackerCase; step: CaseStep; stepIndex: number; label: string }) {
  switch (panel) {
    case 'budget-drafter': return <BudgetDraftPanel caseId={c.id} stepIdx={stepIndex} step={step} />;
    case 'reserve-study': return <ReserveStudyPanel />;
    case 'contract-renewals': return <ContractRenewalPanel />;
    case 'bylaws-review': return <BylawsReviewPanel caseId={c.id} step={step} />;
    case 'budget-lines': return <BudgetLines />;
    case 'financials': return <Financials />;
    case 'unit-ledger': return <UnitLedger unit={c.unit} />;
    case 'delinquency': return <Delinquency />;
    case 'fees': return <Fees />;
    case 'units': return <Units />;
    case 'insurance': return <Insurance />;
    case 'vendors': return <Vendors />;
    case 'documents': return <Documents label={label} />;
    case 'owner': return <Owner unit={c.unit} />;
    case 'board': return <Board />;
    case 'counsel': return <Counsel />;
    case 'meetings': return <Meetings />;
    case 'assets': return <Assets />;
    case 'filings': return <Filings />;
  }
}
