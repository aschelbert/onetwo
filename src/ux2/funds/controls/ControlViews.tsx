import { useNavigate } from 'react-router-dom';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { balanceOf, monthEnd } from '@/lib/ledger';
import { fmt } from '@/lib/formatters';
import { reconcile, type Reconciliation } from '@/lib/caseTools';
import type { ControlRules } from '@/lib/controls';
import { Card, Chip, Inner, SectionLabel, Table, Th, Td, Why } from '../../components';
import { monthCloseCase, periodLabel } from '../../boardroom/monthClose';
import { useToolDoc } from '../../boardroom/tools/docs';

/**
 * Past reconciliations, under Accounts and ledger › Ledger. They are done in
 * the month close action; this is where one is looked up afterwards, beside
 * the entries it covers, with any month that was closed without a signature.
 */
export function ReconciliationList() {
  const navigate = useNavigate();
  const records = useActionRecordsStore(s => s.records);
  const coa = useFinancialStore(s => s.chartOfAccounts);
  const gl = useFinancialStore(s => s.generalLedger);
  const closedThrough = useFinancialStore(s => s.closedThrough);
  const cases = useIssuesStore(s => s.cases);
  const recs = records.filter(r => r.kind === 'reconciliation').map(r => r.data as unknown as Reconciliation).filter(d => d.acct && d.period).sort((a, b) => b.period.localeCompare(a.period) || a.acct.localeCompare(b.acct));
  const overrides = records.filter(r => r.kind === 'close-override').map(r => r.data as { key?: string; by?: string; why?: string });
  if (!recs.length && !overrides.length) return null;
  const name = (num: string) => coa.find(a => a.num === num)?.name ?? num;
  return (
    <Card aria-label="Reconciliations" className="gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[17px] font-semibold text-ux2-ink">Reconciliations</span><span className="text-xs text-ux2-muted">Done in the month close · read here</span></div>
      {recs.length > 0 && (
        <Table minWidth={820}>
          <thead><tr><Th>Month</Th><Th>Account</Th><Th num>Bank</Th><Th num>Books</Th><Th num>Not yet at the bank</Th><Th>Prepared</Th><Th>Signed</Th><Th>Books</Th></tr></thead>
          <tbody>{recs.slice(0, 24).map(d => {
            const end = monthEnd(d.period + '-01');
            const books = balanceOf(d.acct, 'asset', gl.filter(e => e.date <= end));
            const c = monthCloseCase(cases, d.period);
            const left = reconcile(d, books).leftToExplain;
            return (
              <tr key={d.acct + d.period} data-reconciliation={`${d.acct}:${d.period}`}>
                <Td className="font-semibold">{periodLabel(d.period)}</Td><Td>{name(d.acct)}</Td>
                <Td num>{fmt(d.bankBalance)}</Td><Td num>{fmt(books)}</Td><Td num>{fmt(d.outstanding.reduce((t, o) => t + o.amount, 0))}</Td>
                <Td className="text-xs">{d.preparedOn ? `${d.preparedBy} · ${d.preparedOn}` : '—'}</Td>
                <Td>{d.signedOn ? <span className="text-xs">{d.signedBy} · {d.signedOn}</span> : <button type="button" disabled={!c} onClick={() => c && navigate(`/boardroom?view=case:${c.id}`)} className="rounded-full"><Chip tone="amber">{d.preparedOn ? 'Waits on a second signature' : left !== 0 ? `${fmt(Math.abs(left))} to explain` : 'Not prepared'}</Chip></button>}</Td>
                <Td>{closedThrough && closedThrough >= end ? <Chip tone="navy">Closed</Chip> : <Chip tone="ghost">Open</Chip>}</Td>
              </tr>
            );
          })}</tbody>
        </Table>
      )}
      {overrides.map((o, i) => <Inner key={i} className="text-sm text-ux2-ink"><Chip tone="red" className="mr-2">Closed without a signature</Chip>Books closed through {o.key} by {o.by || 'someone'}: {o.why}.</Inner>)}
      <Why>Each account is reconciled by one person and signed by another. A month closed without that is listed here with who went ahead.</Why>
    </Card>
  );
}

/**
 * Accounts and ledger › Who can do what: the rules the board sets once. The
 * checks themselves run where the work is done (paying a bill, closing a
 * month), so nobody has to remember them.
 */
export function ControlsGroup() {
  const limit = useBuildingStore(s => s.bylawsConfig?.boardSpendingLimit);
  const anyRec = useActionRecordsStore(s => s.records.some(r => r.kind === 'reconciliation'));
  const [rules, save] = useToolDoc<ControlRules>('controls', 'building', {});
  const recOn = rules.requireReconciliation ?? anyRec;
  const row = (label: string, note: string, on: boolean, set: (v: boolean) => void) => (
    <label className="flex items-start gap-3 rounded-[14px] border border-ux2-line bg-white px-3.5 py-3">
      <input type="checkbox" role="switch" aria-label={label} className="mt-0.5 h-5 w-5 shrink-0" checked={on} onChange={e => set(e.target.checked)} />
      <span className="text-sm text-ux2-ink"><b className="font-semibold">{label}</b><span className="block text-xs text-ux2-muted">{note}</span></span>
    </label>
  );
  return (
    <Card aria-label="Who can do what" className="gap-3">
      <SectionLabel>Who can do what</SectionLabel>
      {row('A bill needs two people', 'Whoever raised or approved a bill cannot be the one who pays it. With one person doing the books this stops them paying their own bills, so switch it on only when a second person can pay. Jobs paid automatically under the Tasker limit are not held up.', !!rules.twoPersonBills, v => save({ twoPersonBills: v }))}
      {row('A month needs signed reconciliations before its books close', 'Every bank account that moved needs a reconciliation prepared by one person and signed by another. Closing without one asks first, and going ahead is recorded with the name.', recOn, v => save({ requireReconciliation: v }))}
      <Inner className="flex flex-wrap items-center justify-between gap-2 text-sm text-ux2-ink"><span><b className="font-semibold">Above {fmt(limit || 0)}, the board</b><span className="block text-xs text-ux2-muted">The bylaws' spending limit. Spending over it needs a spending decision with a recorded vote. Change the limit under Building, where the bylaws' figures are kept.</span></span><Chip tone="navy">From the bylaws</Chip></Inner>
      <Why>The ledger shows who posted each entry, and each bill shows who raised, approved and paid it, whether or not a rule is on. The rules decide what is stopped, not what is recorded.</Why>
    </Card>
  );
}
