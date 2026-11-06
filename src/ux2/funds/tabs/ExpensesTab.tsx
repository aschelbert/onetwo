import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FLWorkOrders from '@/features/financial/tabs/FLWorkOrders';
import FLApprovals from '@/features/financial/tabs/FLApprovals';
import PayrollTab from '@/features/association-team/tabs/PayrollTab';
import { useSpendingStore } from '@/store/useSpendingStore';
import { fmt } from '@/lib/formatters';
import { Button, Card, Chip, Inner, SectionLabel, TileSwitcher, type TileSection } from '../../components';
import { dayLabel } from '../../home/calendar';
import { bills, type FundsSnapshot } from '../metrics';

type Section = 'bills' | 'decisions' | 'workorders';
const SECTIONS: Section[] = ['bills', 'decisions', 'workorders'];

function WorkOrdersList({ snap, onBills }: { snap: FundsSnapshot; onBills: () => void }) {
  const navigate = useNavigate();
  const groups: { key: string; label: string; note: string; list: typeof snap.workOrders }[] = [
    { key: 'draft', label: 'Draft', note: 'not yet approved', list: snap.workOrders.filter(w => w.status === 'draft') },
    { key: 'approved', label: 'Approved', note: 'waiting on the invoice', list: snap.workOrders.filter(w => w.status === 'approved') },
    { key: 'invoiced', label: 'Invoiced', note: 'in Bills', list: snap.workOrders.filter(w => w.status === 'invoiced') },
    { key: 'paid', label: 'Paid', note: 'done', list: snap.workOrders.filter(w => w.status === 'paid').slice(-8).reverse() },
  ];
  return (
    <Card aria-label="Work orders">
      <div className="flex items-center justify-between">
        <SectionLabel>Work orders</SectionLabel>
        <Button size="sm" onClick={onBills}>Create a work order</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {groups.map(g => (
          <Inner key={g.key}>
            <div className="mb-1 flex items-center justify-between"><span className="text-sm font-semibold text-ux2-ink">{g.label} <span className="text-xs font-normal text-ux2-muted">· {g.note}</span></span><Chip tone={g.key === 'invoiced' && g.list.length ? 'navy' : 'ghost'}>{g.list.length}</Chip></div>
            {g.list.length === 0 ? <div className="text-xs text-ux2-dim">None</div> : (
              <ul className="m-0 list-none p-0 text-sm">
                {g.list.slice(0, 6).map(w => (
                  <li key={w.id} className="flex items-baseline justify-between gap-2 py-1">
                    <span className="min-w-0 truncate">
                      <span className="text-ux2-ink">{w.title}</span>
                      <span className="text-xs text-ux2-muted"> · {w.id} · {w.vendor}{w.caseId ? <button type="button" className="ml-1 text-ux2-teal hover:underline" onClick={() => navigate(`/issues?view=case:${w.caseId}`)}>case</button> : null}</span>
                    </span>
                    <b className="shrink-0 font-semibold text-ux2-ink">{fmt(w.amount)}</b>
                  </li>
                ))}
                {g.list.length > 6 && <li className="text-xs text-ux2-dim">+{g.list.length - 6} more</li>}
              </ul>
            )}
          </Inner>
        ))}
      </div>
      <Inner className="text-xs text-ux2-muted">A work order moves Draft, then Approved, then Invoiced, then Paid. Approving a bill on Bills pays it and posts to the ledger.</Inner>
    </Card>
  );
}

export default function ExpensesTab({ snap, section, onSection }: { snap: FundsSnapshot; section?: string; onSection: (s: string) => void }) {
  const bl = bills(snap);
  const approvals = useSpendingStore(s => s.approvals);
  const pending = approvals.filter(a => a.status === 'pending');
  const pendingAmount = pending.reduce((t, a) => t + a.amount, 0);
  const current: Section = (SECTIONS as string[]).includes(section ?? '') ? (section as Section) : 'bills';
  const [showPayroll, setShowPayroll] = useState(false);

  const sections: TileSection<Section>[] = [
    {
      id: 'bills',
      tile: {
        tone: bl.toApprove.length > 0 ? 'navy' : 'grey',
        label: 'Bills · to approve',
        value: bl.toApprove.length,
        unit: `bills · ${fmt(bl.amount)}`,
        children: (
          <ul className="m-0 list-none p-0 text-xs">
            <li className="flex justify-between py-0.5"><span>Within budget</span><b className="font-semibold">{bl.within.length} · {fmt(bl.withinAmount)}</b></li>
            <li className="flex justify-between py-0.5"><span>Flagged over budget</span><b className="font-semibold">{bl.flagged.length} · {fmt(bl.flaggedAmount)}</b></li>
            <li className="flex justify-between py-0.5"><span>Awaiting an invoice</span><b className="font-semibold">{bl.approved.length}</b></li>
          </ul>
        ),
        sub: bl.toApprove.length === 0 ? 'Nothing waiting for approval' : bl.flagged.length > 0 ? `Approve the ${bl.within.length} within budget; the ${bl.flagged.length} flagged one by one` : `All ${bl.toApprove.length} within budget · approve and they pay on their due date`,
      },
      detail: <div className="ux2-legacy"><FLWorkOrders /></div>,
    },
    {
      id: 'decisions',
      tile: {
        tone: 'teal',
        label: 'Spending decisions',
        meta: 'money not yet committed',
        value: pending.length,
        unit: `waiting · ${fmt(pendingAmount)}`,
        children: pending.length > 0 ? (
          <ul className="m-0 list-none p-0 text-xs">
            {pending.slice(0, 3).map(a => <li key={a.id} className="flex justify-between gap-2 py-0.5"><span className="truncate">{a.title}</span><b className="shrink-0 font-semibold">{fmt(a.amount)} · {(a.votes || []).length} vote{(a.votes || []).length === 1 ? '' : 's'}</b></li>)}
          </ul>
        ) : undefined,
        sub: pending.length > 0 ? 'Decide, oldest first · each is also a Home card' : 'No decisions open',
      },
      detail: <div className="ux2-legacy"><FLApprovals /></div>,
    },
    {
      id: 'workorders',
      tile: {
        tone: 'grey',
        label: 'Work orders',
        meta: `${bl.vendors} vendor${bl.vendors === 1 ? '' : 's'}`,
        value: bl.open,
        unit: 'open',
        children: (
          <ul className="m-0 list-none p-0 text-xs text-ux2-muted">
            <li className="flex justify-between py-0.5"><span>Draft · not yet approved</span><b className="font-semibold text-ux2-ink">{bl.drafts.length}</b></li>
            <li className="flex justify-between py-0.5"><span>Approved · waiting on the invoice</span><b className="font-semibold text-ux2-ink">{bl.approved.length}</b></li>
            <li className="flex justify-between py-0.5"><span>Invoiced · in Bills</span><b className="font-semibold text-ux2-ink">{bl.toApprove.length}</b></li>
          </ul>
        ),
        sub: `${bl.paidThisMonth.length} paid this month${bl.paidThisMonth[0]?.paidDate ? ` · last ${dayLabel(bl.paidThisMonth[0].paidDate)}` : ''}`,
      },
      detail: <WorkOrdersList snap={snap} onBills={() => onSection('bills')} />,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <TileSwitcher sections={sections} value={current} onChange={onSection} hint="Tap a tile to open its list below. The other two stay one tap away." />
      <Card aria-label="Payroll">
        <div className="flex items-center justify-between">
          <div>
            <SectionLabel>Payroll and 1099s</SectionLabel>
            <p className="text-sm text-ux2-muted">Staff, time, pay runs and the January 1099s. Same records as Association Team › Payroll.</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setShowPayroll(v => !v)}>{showPayroll ? 'Hide' : 'Open'}</Button>
        </div>
        {showPayroll && <div className="ux2-legacy"><PayrollTab /></div>}
      </Card>
    </div>
  );
}
