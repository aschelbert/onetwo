import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TheUnitsTab from '@/features/building/tabs/TheUnitsTab';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { fmt } from '@/lib/formatters';
import { Button, Card, Chip, Inner, SectionLabel, TileSwitcher, type TileSection, Ring } from '../../components';
import { dayLabel } from '../../home/calendar';
import { agingTotals, behind, collected, invoiceSummary, monthName, ordinal, type FundsSnapshot } from '../metrics';
import type { FundsTab } from '../FundsPage';

type Section = 'ledger' | 'behind' | 'invoices';
const SECTIONS: Section[] = ['ledger', 'behind', 'invoices'];

function BehindList({ snap, onLedger }: { snap: FundsSnapshot; onLedger: () => void }) {
  const list = useMemo(() => behind(snap), [snap]);
  const totals = agingTotals(list);
  const cases = useIssuesStore(s => s.cases);
  const navigate = useNavigate();
  const caseFor = (unit: string) => cases.find(c => c.status !== 'closed' && c.unit === unit && /collect|delinquen|dues|assessment/i.test(`${c.sitId} ${c.title}`));
  return (
    <Card aria-label="Behind">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel>Behind · {list.length} unit{list.length === 1 ? '' : 's'}</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {(['0-30', '31-60', '61-90', '90+'] as const).map(b => (
            <Chip key={b} tone={totals[b] > 0 ? (b === '90+' ? 'red' : 'ghost') : 'ghost'}>{b} d · {fmt(totals[b])}</Chip>
          ))}
        </div>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-ux2-muted">Every unit is current.</p>
      ) : (
        <ul className="m-0 list-none divide-y divide-ux2-line p-0">
          {list.map(b => {
            const c = caseFor(b.number);
            const next = c
              ? { label: 'Open the case', go: () => navigate(`/issues?view=case:${c.id}`), note: c.steps ? `Step ${Math.max(1, (c.steps.findIndex(s => !s.done) + 1) || c.steps.length)} of ${c.steps.length}` : 'Collections case open' }
              : b.daysPastDue > 60
                ? { label: 'Start collections', go: () => navigate('/issues?view=new'), note: 'Demand letter, then lien at 90 days' }
                : { label: 'Record a payment', go: onLedger, note: b.daysPastDue > 30 ? 'Send a reminder' : 'Reminder goes with the late fee' };
            return (
              <li key={b.number} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold text-ux2-ink">Unit {b.number} · {b.owner}{b.forSale ? ' · for sale' : ''}</div>
                  <div className="text-xs text-ux2-muted">{b.daysPastDue} days · {fmt(b.amount)}{b.invoice ? ` · ${b.invoice.description}` : ''} · {next.note}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Chip tone={b.bucket === '90+' ? 'red' : b.bucket === '61-90' ? 'amber' : 'ghost'}>{b.bucket} d</Chip>
                  <Button size="sm" onClick={next.go}>{next.label}</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Inner className="text-xs text-ux2-muted">Lien allowed at 90 days (DC Code § 42-1903.13). Late fees and reminders run on their own; collections is a case.</Inner>
    </Card>
  );
}

function InvoiceRegister({ snap }: { snap: FundsSnapshot }) {
  const [filter, setFilter] = useState<'open' | 'paid' | 'all'>('open');
  const payUnitInvoice = useFinancialStore(s => s.payUnitInvoice);
  const rows = useMemo(() => [...snap.unitInvoices]
    .filter(i => i.status !== 'void')
    .filter(i => filter === 'all' ? true : filter === 'paid' ? i.status === 'paid' : i.status !== 'paid')
    .sort((a, b) => b.createdDate.localeCompare(a.createdDate)), [snap.unitInvoices, filter]);
  const sum = invoiceSummary(snap.unitInvoices);
  return (
    <Card aria-label="Invoices">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel>Invoices · {sum.sent} · {sum.paid} paid · {sum.open} open ({fmt(sum.openAmount)})</SectionLabel>
        <div className="flex gap-1.5">
          {(['open', 'paid', 'all'] as const).map(f => (
            <button key={f} type="button" onClick={() => setFilter(f)} className="rounded-full">
              <Chip tone={filter === f ? 'navy' : 'ghost'}>{f === 'open' ? `Open · ${sum.open}` : f === 'paid' ? `Paid · ${sum.paid}` : 'All'}</Chip>
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-ux2-muted">No invoices here.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.06em] text-ux2-muted">
                <th className="py-2 pr-3 font-semibold">When</th><th className="py-2 pr-3 font-semibold">Unit</th><th className="py-2 pr-3 font-semibold">For</th><th className="py-2 pr-3 text-right font-semibold">Amount</th><th className="py-2 pr-3 font-semibold">Due</th><th className="py-2 pr-3 font-semibold">Status</th><th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 60).map(i => (
                <tr key={i.id} className="border-t border-ux2-line">
                  <td className="py-2 pr-3 whitespace-nowrap text-ux2-muted">{dayLabel(i.createdDate)}</td>
                  <td className="py-2 pr-3 font-semibold text-ux2-ink">{i.unitNumber}</td>
                  <td className="py-2 pr-3 text-ux2-ink">{i.description}<span className="text-xs text-ux2-dim"> · {i.type.replace('_', ' ')}</span></td>
                  <td className="py-2 pr-3 text-right font-semibold text-ux2-ink">{fmt(i.amount)}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-ux2-muted">{dayLabel(i.dueDate)}</td>
                  <td className="py-2 pr-3"><Chip tone={i.status === 'paid' ? 'sage' : i.status === 'overdue' ? 'red' : 'ghost'}>{i.status === 'paid' ? `Paid${i.paidDate ? ` · ${dayLabel(i.paidDate)}` : ''}` : i.status === 'overdue' ? 'Overdue' : 'Open'}</Chip></td>
                  <td className="py-2 text-right">{i.status !== 'paid' && <Button size="sm" variant="ghost" onClick={() => payUnitInvoice(i.id, 'manual')}>Mark paid</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 60 && <div className="pt-2 text-xs text-ux2-dim">{rows.length - 60} more</div>}
        </div>
      )}
      <Inner className="text-xs text-ux2-muted">Fees, assessments and amenity charges are raised from the unit row on the ledger; vendor bills live under Expenses.</Inner>
    </Card>
  );
}

export default function IncomeTab({ snap, section, onSection, onGo }: { snap: FundsSnapshot; section?: string; onSection: (s: string) => void; onGo: (tab: FundsTab, section?: string) => void }) {
  const col = collected(snap);
  const beh = useMemo(() => behind(snap), [snap]);
  const inv = invoiceSummary(snap.unitInvoices, col.month);
  const current: Section = (SECTIONS as string[]).includes(section ?? '') ? (section as Section) : 'ledger';
  const outstanding = beh.reduce((t, b) => t + b.amount, 0);
  const aging = agingTotals(beh);

  const sections: TileSection<Section>[] = [
    {
      id: 'ledger',
      tile: {
        tone: 'teal',
        label: `Collected · ${monthName(col.month)}`,
        meta: snap.autoBillingEnabled ? `Billed ${ordinal(snap.hoaDueDay)}` : undefined,
        children: (
          <>
            <Ring pct={col.pct}><b className="font-semibold">{col.paidUnits} of {col.units} paid</b><div className="text-xs text-white/[0.66]">{fmt(col.amount)} of {fmt(col.billed)}</div></Ring>
            <div className="grid grid-cols-3 gap-2">
              {[['Paid up', col.paidUnits], ['Card or bank', col.online], ['By check', col.check]].map(([l, v]) => (
                <div key={String(l)} className="rounded-xl bg-white/[0.1] px-3 py-2"><div className="text-[11px] text-white/[0.66]">{l}</div><div className="text-[15px] font-semibold">{v}</div></div>
              ))}
            </div>
            <div className="mt-auto flex items-center justify-between rounded-xl bg-white/[0.1] px-3 py-2 text-[13px]"><span>Unit ledger · every unit, what they pay and owe</span><Chip tone="white" className="!bg-white/[0.15]">{col.units}</Chip></div>
          </>
        ),
      },
      detail: (
        <Card aria-label="Unit ledger">
          <div className="flex flex-wrap items-baseline gap-2"><h2 className="m-0 text-lg font-medium text-ux2-ink">Unit ledger</h2><span className="text-sm text-ux2-muted">{col.units} unit{col.units === 1 ? '' : 's'} · balances as of today, {dayLabel(snap.today)} · one row per unit</span></div>
          <div className="ux2-legacy"><TheUnitsTab variant="fiscal" compact /></div>
        </Card>
      ),
    },
    {
      id: 'behind',
      tile: {
        tone: beh.length > 0 ? 'red' : 'grey',
        label: 'Behind',
        meta: `${beh.length} unit${beh.length === 1 ? '' : 's'}`,
        value: fmt(outstanding),
        sub: beh.length > 0 ? `outstanding · oldest ${beh[0].daysPastDue} days · Unit ${beh[0].number}` : 'Every unit is current',
        children: beh.length > 0 ? (
          <>
            <div className="flex items-end gap-2" aria-label="Aging">
              {(['0-30', '31-60', '61-90', '90+'] as const).map(b => {
                const max = Math.max(1, ...Object.values(aging));
                return (
                  <div key={b} className="flex flex-1 flex-col items-center gap-1 text-[10px] text-white/[0.75]">
                    <span className="font-semibold text-white">{aging[b] ? fmt(aging[b]) : ''}</span>
                    <div className="w-full rounded-[3px] bg-white/[0.25]" style={{ height: `${Math.max(3, Math.round((aging[b] / max) * 44))}px`, backgroundColor: aging[b] ? (b === '90+' ? '#FBF1E2' : 'rgba(255,255,255,0.55)') : undefined }} />
                    <span>{b} d</span>
                  </div>
                );
              })}
            </div>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-xs">
              {beh.slice(0, 3).map(b => (
                <li key={b.number} className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.1] px-3 py-2">
                  <span className="min-w-0 truncate"><b className="font-semibold">{b.number}</b> · {b.daysPastDue} days · {fmt(b.amount)}</span>
                  <Chip tone="white" className="!bg-white !text-ux2-red-ink">{b.forSale ? 'Resale cert' : b.daysPastDue > 60 ? 'Demand letter' : 'Send reminder'}</Chip>
                </li>
              ))}
            </ul>
          </>
        ) : undefined,
      },
      detail: <BehindList snap={snap} onLedger={() => onSection('ledger')} />,
    },
    {
      id: 'invoices',
      tile: {
        tone: 'grey',
        label: `Invoices · ${monthName(col.month)}`,
        value: inv.sent,
        unit: 'sent',
        sub: `${inv.paid} paid · ${fmt(inv.paidAmount)} · ${inv.open} open · ${fmt(inv.openAmount)}`,
        children: (
          <>
            <div className="flex h-2 overflow-hidden rounded-full bg-ux2-line" aria-label="Paid and open"><div className="bg-ux2-navy" style={{ width: `${inv.sent ? Math.round((inv.paid / inv.sent) * 100) : 0}%` }} /><div className="bg-ux2-red" style={{ width: `${inv.sent ? Math.round((inv.open / inv.sent) * 100) : 0}%` }} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-ux2-line bg-white px-3 py-2"><div className="text-[11px] text-ux2-muted"><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-ux2-navy" />Paid</div><div className="text-[15px] font-semibold">{inv.paid} · {fmt(inv.paidAmount)}</div></div>
              <div className="rounded-xl border border-ux2-line bg-white px-3 py-2"><div className="text-[11px] text-ux2-muted"><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-ux2-red" />Open</div><div className="text-[15px] font-semibold">{inv.open} · {fmt(inv.openAmount)}</div></div>
            </div>
            <div className="text-xs text-ux2-muted">{inv.byType.monthly} dues · {inv.byType.special_assessment} special · {inv.byType.fee} fees · {inv.byType.amenity_fee} amenity</div>
          </>
        ),
        action: <><span className="min-w-0 truncate"><b className="font-semibold">New invoice</b> · fee, assessment, repair or amenity</span><button type="button" onClick={e => { e.stopPropagation(); onSection('ledger'); }} className="inline-flex h-9 shrink-0 items-center rounded-full border border-ux2-line-strong bg-white px-3.5 text-xs font-semibold text-ux2-ink hover:bg-ux2-surface">Create</button></>,
      },
      detail: <InvoiceRegister snap={snap} />,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <TileSwitcher sections={sections} value={current} onChange={onSection} hint="Tap a tile to open its list below. The other two stay one tap away." />
      <div className="flex flex-wrap items-center gap-2" aria-label="Runs on its own">
        <span className="text-sm font-semibold text-ux2-ink">Runs on its own</span>
        <Chip tone={snap.autoBillingEnabled ? 'teal' : 'ghost'}>{snap.autoBillingEnabled ? `Billing on the ${ordinal(snap.hoaDueDay)}${snap.lastBillingRun ? ` · ran ${dayLabel(snap.lastBillingRun.slice(0, 10))}` : ''}` : `Billing by hand · dues due on the ${ordinal(snap.hoaDueDay)}`}</Chip>
        <Chip tone={snap.lateFee.enabled ? 'teal' : 'ghost'}>{snap.lateFee.enabled ? `Late fee $${snap.lateFee.amount} after ${snap.lateFee.graceDays} days` : 'No automatic late fee'}</Chip>
        <Chip tone="ghost">60-day notice · certified</Chip>
        {beh.some(b => b.daysPastDue > 60) && <Chip tone="teal">Demand at {Math.max(...beh.map(b => b.daysPastDue))} days · {beh.find(b => b.daysPastDue > 60)!.number} today</Chip>}
        <span className="ml-auto flex gap-3 text-xs font-semibold text-ux2-teal">
          <button type="button" onClick={() => onGo('settings', 'rules')} className="hover:underline">Edit rules</button>
          <button type="button" onClick={() => onGo('settings', 'fees')} className="hover:underline">Fee schedule</button>
        </span>
      </div>
      <div className="flex flex-col gap-2.5 rounded-[22px] border border-ux2-line bg-white px-[22px] py-4" aria-label="Online payments">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="m-0 text-lg font-medium text-ux2-ink">Online payments · Stripe</h2>
          <Chip tone={snap.stripeOnboardingComplete ? 'sage' : snap.stripeConnected ? 'amber' : 'ghost'}>{snap.stripeOnboardingComplete ? 'Connected' : snap.stripeConnected ? 'Finish setup' : 'Not connected'}</Chip>
        </div>
        <p className="m-0 text-[13px] text-ux2-muted">{snap.stripeOnboardingComplete ? `${col.online} unit${col.online === 1 ? '' : 's'} paid by card or bank this month · ${col.check} by check · fees 2.9% + 30¢ paid by the building` : 'Connect a Stripe account so owners can pay dues and assessments by card or bank, with fees paid by the building.'}</p>
        <div className="flex flex-wrap gap-2">
          {snap.stripeOnboardingComplete && <Button size="sm" variant="ghost" onClick={() => onGo('payments')}>Refund a payment</Button>}
          <Button size="sm" variant={snap.stripeOnboardingComplete ? 'ghost' : 'primary'} onClick={() => onGo('payments')}>{snap.stripeOnboardingComplete ? 'Online payments' : 'Connect Stripe'}</Button>
        </div>
      </div>
    </div>
  );
}
