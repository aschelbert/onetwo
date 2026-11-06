import PaymentsManager from '@/features/building/tabs/PaymentsManager';
import { fmt } from '@/lib/formatters';
import { Card, Chip, Inner, SectionLabel, Tile, TileRow } from '../../components';
import { collected, invoiceSummary, monthName, ONLINE_METHODS, type FundsSnapshot } from '../metrics';
import type { FundsTab } from '../FundsPage';

export default function PaymentsTab({ snap, onGo }: { snap: FundsSnapshot; onGo: (tab: FundsTab, section?: string) => void }) {
  const col = collected(snap);
  const month = col.month;
  const online = snap.unitInvoices.filter(i => i.status === 'paid' && i.paidDate && i.paidDate.slice(0, 7) === month && ONLINE_METHODS.includes((i.paymentMethod || '').toLowerCase()));
  const onlineAmount = online.reduce((t, i) => t + (i.paidAmount ?? i.amount), 0)
    + snap.units.reduce((t, u) => t + u.payments.filter(p => p.date.slice(0, 7) === month && ONLINE_METHODS.includes((p.method || '').toLowerCase())).reduce((x, p) => x + p.amount, 0), 0);
  const refunded = snap.unitInvoices.filter(i => i.refundDate && i.refundDate.slice(0, 7) === month);
  const inv = invoiceSummary(snap.unitInvoices, month);
  const ready = snap.stripeOnboardingComplete;
  return (
    <div className="flex flex-col gap-5">
      <TileRow>
        <Tile
          tone={ready ? 'teal' : 'navy'}
          label={`Collected online · ${monthName(month)}`}
          meta={<Chip tone={ready ? 'cyan' : 'ghost'}>{ready ? 'Stripe · connected' : snap.stripeConnected ? 'Stripe · finish setup' : 'Stripe · not set up'}</Chip>}
          value={fmt(onlineAmount)}
          unit={`of ${fmt(col.amount)} collected`}
          sub={ready ? `${col.online} unit${col.online === 1 ? '' : 's'} by card or bank · ${col.check} by check, outside Stripe` : 'Connect the building\'s Stripe account below: dues, assessments and fees by card or bank, paid out to operating.'}
          className="min-h-[170px]"
        />
        <Tile
          tone="grey"
          label="Invoices this month"
          value={inv.sent}
          unit="sent"
          sub={`${inv.paid} paid · ${inv.open} open · ${inv.overdue} overdue`}
          className="min-h-[170px]"
          action={<><span>Invoice register</span><button type="button" onClick={() => onGo('income', 'invoices')} className="inline-flex h-9 items-center rounded-full border border-ux2-line-strong bg-white px-3.5 text-xs font-semibold text-ux2-ink hover:bg-ux2-surface">Open</button></>}
        />
        <Tile
          tone="grey"
          label="Refunds"
          value={refunded.length}
          unit="this month"
          sub={refunded.length ? refunded.map(r => `${r.unitNumber} · ${fmt(r.refundAmount ?? r.amount)}`).join(' · ') : 'A refund goes back to the same card or account and reverses the ledger entry.'}
          className="min-h-[170px]"
        />
      </TileRow>
      <Card aria-label="Stripe account">
        <SectionLabel>The building's Stripe account</SectionLabel>
        <p className="text-sm text-ux2-muted">Connect or finish onboarding, send invoices with a payment link, refund a payment, and set the billing and late-fee rules. Owners pay from My Unit › Pay.</p>
        <div className="ux2-legacy"><PaymentsManager /></div>
        <Inner className="text-xs text-ux2-muted">Card fees are paid by the building today; a pass-through switch and bank (ACH) at checkout are on the roadmap for this screen.</Inner>
      </Card>
    </div>
  );
}
