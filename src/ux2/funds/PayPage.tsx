/**
 * Pay — the owner's payment screen (ux2.funds), at /my-unit/pay.
 * Wraps the production balance tab so Stripe Checkout, autopay and the
 * billing portal are the same calls; adds the unit picker and the balance
 * summary from the design.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MyBalanceTab from '@/features/unit-manager/tabs/MyBalanceTab';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { fmt } from '@/lib/formatters';
import { Button, Chip, PillTabs, Tile, TileRow } from '../components';
import { openAssessments, ordinal, unpaidFees } from './metrics';

export default function PayPage() {
  const currentUser = useAuthStore(s => s.currentUser);
  const units = useFinancialStore(s => s.units);
  const unitInvoices = useFinancialStore(s => s.unitInvoices);
  const hoaDueDay = useFinancialStore(s => s.hoaDueDay);
  const navigate = useNavigate();
  const linked = currentUser.linkedUnits?.length ? currentUser.linkedUnits : currentUser.unitNumber ? [currentUser.unitNumber] : [];
  const mine = useMemo(() => units.filter(u => linked.includes(u.number)), [units, linked]);
  const [selected, setSelected] = useState<string>(mine[0]?.number ?? '');
  const unit = mine.find(u => u.number === selected) ?? mine[0];

  if (!unit) {
    return (
      <div data-page="ux2-pay" className="flex flex-col gap-4">
        <h1 className="font-display text-[28px] font-semibold text-ux2-ink">Pay</h1>
        <p className="text-sm text-ux2-muted">No unit is linked to this account yet. Ask the board to link your unit from the directory.</p>
      </div>
    );
  }

  const fees = unpaidFees(unit);
  const sa = openAssessments(unit);
  const credit = Math.max(0, -unit.balance);
  const total = Math.max(0, unit.balance) + fees;
  const open = unitInvoices.filter(i => i.unitNumber === unit.number && (i.status === 'sent' || i.status === 'overdue'));

  return (
    <div data-page="ux2-pay" className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ux2-ink">Pay · Unit {unit.number}</h1>
            <p className="text-sm text-ux2-muted">What you owe and how to pay it. Payments go through Stripe and post to your ledger the same day.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/my-unit')}>Back to My Unit</Button>
        </div>
        {mine.length > 1 && (
          <PillTabs size="filter" aria-label="Your units" value={unit.number} onChange={setSelected} tabs={mine.map(u => ({ id: u.number, label: `Unit ${u.number}` }))} />
        )}
      </header>

      <TileRow>
        <Tile tone={total > 0 ? 'navy' : 'teal'} label="Balance" meta={`Unit ${unit.number}`} value={fmt(total)} sub={total > 0 ? `${fmt(Math.max(0, unit.balance))} dues and charges${fees ? ` · ${fmt(fees)} late fees` : ''}${sa ? ` · includes ${fmt(sa)} special assessment` : ''}` : credit > 0 ? `Paid up · ${fmt(credit)} credit goes toward your next dues` : 'Paid up · nothing due'} className="min-h-[150px]" />
        <Tile tone="grey" label="Monthly dues" value={fmt(unit.monthlyFee)} sub={`Due on the ${ordinal(hoaDueDay)} · autopay takes it unless you pay early`} className="min-h-[150px]" />
        <Tile tone="grey" label="Open invoices" value={open.length} sub={open.length ? open.slice(0, 3).map(i => `${i.description} · ${fmt(i.amount)}`).join(' · ') : 'Nothing open on this unit'} className="min-h-[150px]">
          {open.some(i => i.status === 'overdue') && <Chip tone="red">Overdue</Chip>}
        </Tile>
      </TileRow>

      <div className="ux2-legacy"><MyBalanceTab activeUnit={unit} /></div>
    </div>
  );
}
