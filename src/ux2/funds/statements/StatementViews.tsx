import { useState } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useAuthStore } from '@/store/useAuthStore';
import { budgetLineAccounts, fiscalYearStart } from '@/lib/ledger';
import { fmt } from '@/lib/formatters';
import { cashFlow, operatingStatement, periodDates, trialBalance, wantsReason, type PeriodId } from '@/lib/statements';
import { Card, Chip, Inner, KV, PillTabs, Table, Th, Td, Why } from '../../components';
import { useToolDoc } from '../../boardroom/tools/docs';

type View = 'operating' | 'cash' | 'trial';
const signed = (n: number) => (n < 0 ? `−${fmt(-n)}` : fmt(n));

/**
 * The statements for a period, under Funds › Statements & taxes: the
 * operating statement with net operating income and each line against its
 * budget, the cash-flow statement, and the trial balance. One period control
 * serves all three.
 */
export default function StatementViews({ today }: { today: string }) {
  const coa = useFinancialStore(s => s.chartOfAccounts);
  const gl = useFinancialStore(s => s.generalLedger);
  const lines = useFinancialStore(s => s.budgetCategories);
  const fyEnd = useBuildingStore(s => s.details?.fiscalYearEnd) || '12-31';
  const isBoard = useAuthStore(s => s.currentUser.role) !== 'RESIDENT';
  const [view, setView] = useState<View>('operating');
  const [period, setPeriod] = useState<PeriodId>('month');
  const p = periodDates(period, today, fiscalYearStart(today, fyEnd));
  const [notes, saveNotes] = useToolDoc<{ notes: Record<string, string> }>('variance-notes', `${p.from}:${p.to}`, { notes: {} });

  // A line's budget for the period: its yearly figure times the share of the year covered, on the first account it is measured against.
  const budgetOf = new Map<string, number>();
  for (const l of lines) { const a = budgetLineAccounts(l, coa)[0]; if (a) budgetOf.set(a.num, (budgetOf.get(a.num) ?? 0) + l.budgeted * p.yearShare); }
  const os = operatingStatement(coa, gl, p.from, p.to, num => (budgetOf.has(num) ? Math.round(budgetOf.get(num)!) : null));
  const cf = cashFlow(coa, gl, p.from, p.to);
  const tb = trialBalance(coa, gl, p.to);

  return (
    <Card aria-label="Statements for a period" className="gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PillTabs size="filter" surface="white" aria-label="Statement" value={view} onChange={v => setView(v as View)} tabs={[{ id: 'operating', label: 'Operating statement' }, { id: 'cash', label: 'Cash flow' }, { id: 'trial', label: 'Trial balance' }]} />
        <PillTabs size="filter" surface="white" aria-label="Period" value={period} onChange={v => setPeriod(v as PeriodId)} tabs={[{ id: 'month', label: 'Last month' }, { id: 'ytd', label: 'Year to date' }, { id: 'last-year', label: 'Last year' }]} />
      </div>
      <span className="text-xs text-ux2-muted">{view === 'trial' ? `As of ${p.to}` : p.label}</span>

      {view === 'operating' && (
        <>
          <Table minWidth={760}>
            <thead><tr><Th>Line</Th><Th num>Actual</Th><Th num>Budget for the period</Th><Th num>Difference</Th><Th>Why, if it is off</Th></tr></thead>
            <tbody>
              {os.income.map(l => <tr key={l.num}><Td>{l.name}</Td><Td num>{fmt(l.amount)}</Td><Td num>—</Td><Td num>—</Td><Td /></tr>)}
              <tr className="font-semibold"><Td>Income</Td><Td num>{fmt(os.totalIncome)}</Td><Td /><Td /><Td /></tr>
              {os.expenses.map(l => {
                const diff = l.budget == null ? null : l.budget - l.amount;
                const off = wantsReason(l);
                return (
                  <tr key={l.num} data-line={l.num} className={off ? 'bg-ux2-red-tint/40' : ''}>
                    <Td>{l.name}</Td><Td num>{fmt(l.amount)}</Td><Td num>{l.budget == null ? '—' : fmt(l.budget)}</Td>
                    <Td num>{diff == null ? '—' : <span className={diff < 0 ? 'text-ux2-red-ink' : ''}>{signed(diff)}</span>}</Td>
                    <Td>{off ? (isBoard ? <input aria-label={`Why ${l.name} is over`} key={notes.notes[l.num] ?? ''} defaultValue={notes.notes[l.num] ?? ''} placeholder="A sentence for owners" onBlur={e => { const v = e.target.value.trim(); if (v !== (notes.notes[l.num] ?? '')) saveNotes({ notes: { ...notes.notes, [l.num]: v } }); }} className="w-full min-w-[180px] rounded-[8px] border border-ux2-line-strong px-2 py-1 text-xs" /> : <span className="text-xs">{notes.notes[l.num] || 'No reason given yet'}</span>) : null}</Td>
                  </tr>
                );
              })}
              <tr data-line="bad-debt"><Td>Bad debt expense <span className="text-xs text-ux2-muted">· the year-end allowance, or a collections write-off</span></Td><Td num>{fmt(os.badDebt)}</Td><Td num>—</Td><Td num>—</Td><Td /></tr>
              <tr className="font-semibold"><Td>Operating expenses</Td><Td num>{fmt(os.totalExpenses)}</Td><Td num>{os.budgetExpenses == null ? '—' : fmt(os.budgetExpenses)}</Td><Td num>{os.budgetExpenses == null ? '—' : signed(os.budgetExpenses - (os.totalExpenses - os.badDebt))}</Td><Td /></tr>
              <tr className="bg-ux2-teal-tint/50 font-semibold" data-noi={os.noi}><Td>Net operating income</Td><Td num>{signed(os.noi)}</Td><Td /><Td /><Td className="text-xs font-normal text-ux2-muted">Income less operating expenses, before the transfer to reserves</Td></tr>
              <tr><Td>Transfer to reserves</Td><Td num>{signed(-os.toReserves)}</Td><Td /><Td /><Td /></tr>
              <tr className="font-semibold"><Td>Left in the operating fund</Td><Td num>{signed(os.left)}</Td><Td /><Td /><Td /></tr>
            </tbody>
          </Table>
          <Why>A line's budget for the period is its yearly figure times the share of the year the period covers. A line more than 10% and $500 over asks for a sentence, which goes to owners with the statement. Reserve spending is not here: it is the reserve fund's, and shows on the balance sheet and the cash-flow statement.</Why>
        </>
      )}

      {view === 'cash' && (
        <>
          <Inner data-cash-flow>
            <KV label={<b>Cash at the start</b>}><b>{fmt(cf.start)}</b></KV>
            <KV label="Collected from owners">{signed(cf.fromOwners)}</KV>
            <KV label="Other receipts">{signed(cf.otherReceipts)}</KV>
            <KV label="Paid to vendors and staff">{signed(cf.toVendors)}</KV>
            <KV label={<b>From running the building</b>}><b>{signed(cf.fromOperations)}</b></KV>
            <KV label="Reserve and capital spending">{signed(cf.capital)}</KV>
            <KV label="Loans: borrowed, less repaid">{signed(cf.loans)}</KV>
            {cf.other !== 0 && <KV label="Other movements">{signed(cf.other)}</KV>}
            <KV label={<b>Cash at the end</b>}><b>{fmt(cf.end)}</b></KV>
            <KV label={<span className="text-ux2-muted">of which operating · reserve</span>}><span className="text-ux2-muted">{fmt(cf.operatingEnd)} · {fmt(cf.reserveEnd)}</span></KV>
          </Inner>
          {Math.abs(cf.start + cf.fromOperations + cf.capital + cf.loans + cf.other - cf.end) > 0.01 && <Chip tone="amber" className="self-start">The lines do not add up to the change in cash: an account may be missing from the chart</Chip>}
          <Why>Read from the bank accounts in the ledger, so it ties to the balance sheet. The operating statement shows what was billed and owed; this shows what moved. A transfer between the association's own accounts is left out: it changes which account holds the money, not how much there is. The forecast, which looks ahead, is under Planning › Cash and loans.</Why>
        </>
      )}

      {view === 'trial' && (
        <>
          <Table minWidth={560}>
            <thead><tr><Th>Account</Th><Th num>Debit</Th><Th num>Credit</Th></tr></thead>
            <tbody>
              {tb.rows.map(r => <tr key={r.num}><Td><span className="text-ux2-muted">{r.num}</span> {r.name}</Td><Td num>{r.debit ? fmt(r.debit) : ''}</Td><Td num>{r.credit ? fmt(r.credit) : ''}</Td></tr>)}
              <tr className="font-semibold" data-trial-balanced={tb.balanced ? '1' : '0'}><Td>Total</Td><Td num>{fmt(tb.debits)}</Td><Td num>{fmt(tb.credits)}</Td></tr>
            </tbody>
          </Table>
          {!tb.balanced && <Chip tone="red" className="self-start">Debits and credits differ by {fmt(Math.abs(tb.debits - tb.credits))}</Chip>}
          <Why>Every account with a balance, for the accountant. The two columns always add to the same figure, because each entry has one debit and one credit of the same amount.</Why>
        </>
      )}
    </Card>
  );
}
