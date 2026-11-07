/**
 * Subscription, to the Me-Subscription board: Plan (navy), Add-ons and
 * Billing tiles, the two plan boxes, the invoices table, who can change
 * this, and cancellation. Live tenants read the `subscriptions` and
 * `invoices` rows and change things through the `manage-subscription`
 * and `chargebee-portal` edge functions, the same calls the production
 * page made; demo tenants see the plan the tenant context names.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useTenantContext } from '@/components/TenantProvider';
import { supabase, isBackendEnabled } from '@/lib/supabase';
import { ADDONS, TIERS, getAddOnPrice, getTierById, type BillingInterval, type SubscriptionTier } from '@/lib/tiers';
import { fmt } from '@/lib/formatters';
import { Button, Card, Cell, Chip, Field, INPUT, Inner, KV, PillTabs, SectionLabel, Table, Td, Th, Tile, TileRow, Why } from '../../components';
import { dayLabel } from '../../home/calendar';
import type { MeSnapshot } from '../metrics';

interface Sub { tier: SubscriptionTier; status: string; interval: BillingInterval; onCall: boolean; pmSeat: boolean; periodStart: string | null; periodEnd: string | null; cancelAtEnd: boolean; created: string | null }
interface InvoiceRow { id: string; label: string; period: string; amount: number; status: string; date: string | null }

function Toggle({ on, onChange, label, busy }: { on: boolean; onChange: (v: boolean) => void; label: string; busy?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={busy} onClick={() => onChange(!on)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${on ? 'bg-ux2-navy' : 'bg-ux2-line-strong'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

const addMonths = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00`); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const monthYear = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

function useSubscription(today: string) {
  const tenant = useTenantContext();
  const live = !tenant.isDemo && isBackendEnabled && !!supabase;
  const demo = useMemo<Sub>(() => {
    const start = `${today.slice(0, 4)}-01-01`;
    return { tier: (getTierById(tenant.tier)?.id ?? 'self_managed') as SubscriptionTier, status: tenant.status === 'trial' ? 'trialing' : 'active', interval: 'annual', onCall: false, pmSeat: tenant.pmSeat, periodStart: start, periodEnd: addMonths(start, 12), cancelAtEnd: false, created: `${Number(today.slice(0, 4)) - 2}-01-01` };
  }, [tenant.tier, tenant.status, tenant.pmSeat, today]);
  const [sub, setSub] = useState<Sub | null>(live ? null : demo);
  const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!live || !supabase) return;
    const { data } = await supabase.from('subscriptions').select('tier, status, current_period_start, current_period_end, cancel_at_period_end, created_at, addon_on_call, pm_addon, billing_interval').eq('tenant_id', tenant.id).maybeSingle();
    if (data) setSub({ tier: (getTierById(data.tier)?.id ?? 'self_managed') as SubscriptionTier, status: data.status, interval: (data.billing_interval ?? 'monthly') as BillingInterval, onCall: !!data.addon_on_call, pmSeat: !!data.pm_addon, periodStart: data.current_period_start?.slice(0, 10) ?? null, periodEnd: data.current_period_end?.slice(0, 10) ?? null, cancelAtEnd: !!data.cancel_at_period_end, created: data.created_at?.slice(0, 10) ?? null });
    const { data: inv } = await supabase.from('invoices').select('id, amount, status, invoice_date, paid_date').eq('tenant_id', tenant.id).order('invoice_date', { ascending: false }).limit(12);
    if (inv) setInvoices(inv.map(i => ({ id: i.id, label: `${getTierById(data?.tier ?? '')?.name ?? 'Plan'} · ${data?.billing_interval === 'annual' ? 'annual' : 'monthly'}`, period: monthYear(i.invoice_date), amount: i.amount / 100, status: i.status, date: i.paid_date ?? i.invoice_date })));
  }, [live, tenant.id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!live) setSub(demo); }, [live, demo]);

  const manage = async (action: string, extra?: Record<string, unknown>) => {
    setNote(null);
    if (!live || !supabase) { setNote('This is the demo building; plan changes apply to a live subscription.'); return null; }
    setBusy(action);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in');
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Request failed');
      await load();
      return data;
    } catch (e: any) { setNote(e.message || 'Something went wrong'); return null; } finally { setBusy(null); }
  };
  const portal = async () => {
    setNote(null);
    if (!live || !supabase) { setNote('The billing portal opens for a live subscription.'); return; }
    setBusy('portal');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in');
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chargebee-portal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ origin: window.location.origin }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to open billing portal');
      if (data.url) window.open(data.url, '_blank');
    } catch (e: any) { setNote(e.message || 'Something went wrong'); } finally { setBusy(null); }
  };
  return { live, sub, invoices, busy, note, setNote, manage, portal };
}

export default function SubscriptionTab({ snap }: { snap: MeSnapshot }) {
  const navigate = useNavigate();
  const tenant = useTenantContext();
  const members = useAuthStore(s => s.buildingMembers);
  const accounts = useFinancialStore(s => s.chartOfAccounts);
  const { live, sub, invoices, busy, note, setNote, manage, portal } = useSubscription(snap.today);
  const [confirmText, setConfirmText] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);

  const tier = getTierById(sub?.tier ?? 'self_managed') ?? TIERS[0];
  const other = TIERS.find(t => t.id !== tier.id)!;
  const interval: BillingInterval = sub?.interval ?? 'annual';
  const price = interval === 'annual' ? tier.annual : tier.monthly;
  const onCall = ADDONS.find(a => a.id === 'on_call')!;
  const pmSeat = ADDONS.find(a => a.id === 'pm_seat')!;
  const addOnsOn = [sub?.onCall ? 'On Call' : null, sub?.pmSeat ? 'PM Seat' : null].filter(Boolean);
  const renews = sub?.periodEnd ?? null;
  const nextInvoice = renews ? addDays(renews, -30) : null;
  const software = accounts.find(a => /software|subscription/i.test(a.name)) ?? accounts.find(a => a.num === '6100');
  const admins = members.filter(m => m.role === 'BOARD_MEMBER' && /treasurer|president/i.test(m.boardTitle ?? '') && m.name !== snap.viewer.name).map(m => m.name);
  const statusLabel = sub?.cancelAtEnd ? 'Cancels at period end' : sub?.status === 'trialing' || sub?.status === 'trial' ? 'Trial' : sub?.status === 'past_due' ? 'Past due' : 'Active';

  const rows: InvoiceRow[] = useMemo(() => {
    if (invoices) return invoices;
    if (!sub?.periodStart) return [];
    const out: InvoiceRow[] = [];
    const n = interval === 'annual' ? 3 : 6;
    for (let i = 0; i < n; i++) {
      const start = addMonths(sub.periodStart, interval === 'annual' ? -12 * i : -i);
      if (sub.created && start < sub.created) break;
      const end = addMonths(start, interval === 'annual' ? 11 : 0);
      out.push({ id: start, label: `${tier.name} · ${interval}`, period: interval === 'annual' ? `${monthYear(start)} to ${monthYear(end)}` : monthYear(start), amount: price, status: 'paid', date: addDays(start, 2) });
    }
    return out;
  }, [invoices, sub, interval, tier.name, price]);

  return (
    <div className="flex flex-col gap-5">
      <TileRow>
        <Tile tone="navy" label="Plan" meta={<Chip tone="cyan">{statusLabel}</Chip>} value={tier.name} className="min-h-[220px]"
          sub={<span className="block"><span className="block text-[15px] font-semibold">{fmt(price)} {interval === 'annual' ? 'a year' : 'a month'}</span><span className="block text-white/80">{tier.tagline}{tenant.totalUnits ? ` For all ${tenant.totalUnits} units.` : ''}</span><span className="mt-2 block">{renews && <KV dark label="Renews">{dayLabel(renews)}</KV>}{nextInvoice && <KV dark label="Next invoice">{dayLabel(nextInvoice)}</KV>}<KV dark label="Paid from">Operating{software ? ` · ${software.num} ${software.name}` : ''}</KV></span></span>}
          action={<><span>{other.name} · {other.id === 'facilities' ? 'inspections, reserve study, bids, staff role' : 'the board runs it'}</span><span className="font-semibold">{other.annual > tier.annual ? '+' : '−'}{fmt(Math.abs(other.annual - tier.annual))} a year</span></>} />
        <Tile tone="grey" label="Add-ons" meta={<span className="text-xs text-ux2-muted">{addOnsOn.length ? addOnsOn.join(' and ') : 'none on'}</span>} className="min-h-[220px]"
          sub={<span className="block">
            <span className="flex items-start justify-between gap-3 py-1.5"><span className="block"><span className="block text-[15px] font-semibold text-ux2-ink">{onCall.name}</span><span className="block text-xs text-ux2-muted">{onCall.description}</span></span><Toggle on={!!sub?.onCall} busy={busy === 'set-on-call'} label="On Call" onChange={v => void manage('set-on-call', { enable: v })} /></span>
            <span className="flex items-start justify-between gap-3 border-t border-ux2-line py-1.5"><span className="block"><span className="block text-[15px] font-semibold text-ux2-ink">{pmSeat.name}</span><span className="block text-xs text-ux2-muted">{pmSeat.description}</span></span><Toggle on={!!sub?.pmSeat} busy={busy === 'set-pm-seat'} label="Property Manager Seat" onChange={v => void manage('set-pm-seat', { enable: v })} /></span>
          </span>}
          action={<><span>Prices · On Call {fmt(getAddOnPrice(onCall, tier.id, interval))} · PM Seat {fmt(getAddOnPrice(pmSeat, tier.id, interval))} {interval === 'annual' ? 'a year' : 'a month'}</span><span className="text-xs">From next cycle</span></>} />
        <Tile tone="grey" label="Billing" meta={<span className="text-xs text-ux2-muted">{interval}</span>} className="min-h-[220px]"
          sub={<span className="block">
            <span className="block"><PillTabs size="filter" surface="white" aria-label="Billing interval" value={interval} onChange={v => void manage('set-interval', { interval: v })} tabs={[{ id: 'annual', label: `Yearly · ${fmt(tier.annual)}` }, { id: 'monthly', label: `Monthly · ${fmt(tier.monthly)}` }]} /></span>
            <span className="mt-1 block text-xs text-ux2-muted">Yearly saves {fmt(tier.monthly * 12 - tier.annual)} against twelve monthly invoices. A switch takes effect at the next renewal.</span>
            <span className="mt-2 block"><KV label="Billing contact">{snap.viewer.name}{snap.viewer.officerTitle ? ` · ${snap.viewer.officerTitle}` : ''}</KV><KV label="Invoices go to">{snap.viewer.email}</KV><KV label="Payment">{live ? 'On file in the billing portal' : 'Bank · operating'}</KV></span>
          </span>}
          action={<><span>Change contact or payment · opens the billing portal</span><Button size="sm" variant="ghost" disabled={busy === 'portal'} onClick={() => void portal()}>Portal</Button></>} />
      </TileRow>

      {note && <Inner className="flex items-center justify-between gap-3 text-sm text-ux2-ink"><span>{note}</span><button type="button" className="text-xs text-ux2-muted hover:underline" onClick={() => setNote(null)}>Dismiss</button></Inner>}

      <Card id="plans-card" aria-label="Plans">
        <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Plans</SectionLabel><span className="text-xs text-ux2-muted">A change takes effect at the next billing date{renews ? `, ${dayLabel(renews)}` : ''}</span></div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {TIERS.map(t => {
            const current = t.id === tier.id;
            return (
              <Inner key={t.id} className={`flex flex-col gap-2 ${current ? 'border-ux2-navy' : ''}`} aria-label={t.name}>
                <div className="flex items-center justify-between gap-2"><div className="text-[17px] font-semibold text-ux2-ink">{t.name}</div>{current ? <Chip tone="navy">Current</Chip> : <Button size="sm" disabled={busy === 'change-plan'} onClick={() => { if (window.confirm(`Move ${tenant.name} to ${t.name}? The change takes effect at the next billing date.`)) void manage('change-plan', { plan: t.id }); }}>{t.annual > tier.annual ? 'Move up' : 'Move down'}</Button>}</div>
                <div className="text-xs text-ux2-muted">{fmt(t.monthly)} a month or {fmt(t.annual)} a year · {t.tagline}</div>
                <ul className="m-0 list-none p-0 text-sm text-ux2-ink">{t.features.map(f => <li key={f} className="border-t border-ux2-line py-1.5 first:border-0">{f}</li>)}</ul>
              </Inner>
            );
          })}
        </div>
        <Why>{tier.id === 'self_managed' ? `${tenant.name} moves to Plus Facilities when the inspection calendar, the reserve study or a staff role is needed. On Call costs ${fmt(getAddOnPrice(onCall, 'facilities', 'annual'))} a year on Plus Facilities.` : `Plus Facilities carries the inspection calendar, reserve study tools and the staff role. Moving down keeps the records; those tools go read-only.`}</Why>
      </Card>

      <Card id="invoices-card" aria-label="Invoices">
        <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Invoices</SectionLabel><span className="text-xs text-ux2-muted">posted to {software ? `${software.num} ${software.name}` : 'Software'} in Funds</span></div>
        <Table minWidth={640}>
            <thead><tr><Th>Plan</Th><Th>Period</Th><Th num>Amount</Th><Th>Status</Th><Th><span className="sr-only">File</span></Th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <Td><Cell title={r.label} /></Td>
                  <Td>{r.period}</Td>
                  <Td num>{fmt(r.amount)}</Td>
                  <Td>{r.status === 'paid' ? `Paid${r.date ? ` ${dayLabel(r.date)}` : ''}` : r.status === 'pending' ? `Due${r.date ? ` ${dayLabel(r.date)}` : ''}` : r.status}</Td>
                  <Td num><Button size="sm" variant="ghost" onClick={() => void portal()}>PDF</Button></Td>
                </tr>
              ))}
              {rows.length === 0 && <tr><Td colSpan={5}><span className="text-ux2-muted">No invoices yet. The first one arrives thirty days before the first renewal.</span></Td></tr>}
            </tbody>
          </Table>
        <Why>{nextInvoice ? `The next invoice arrives ${dayLabel(nextInvoice)}, thirty days before renewal, and goes to the billing contact. ` : ''}Each one posts to the operating ledger the day it is paid. PDFs open in the billing portal.</Why>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card aria-label="Who can change this">
          <SectionLabel>Who can change this</SectionLabel>
          <Inner className="flex items-center justify-between gap-3"><Cell title="Admins" note={`${admins.length ? `${admins.join(', ')} and you` : 'You'} can change the plan, add-ons and billing`} /><Button size="sm" variant="ghost" onClick={() => navigate('/admin/users')}>User Management</Button></Inner>
          <Inner className="flex items-center justify-between gap-3"><Cell title="Board members" note="See the plan and the invoices, cannot change them" /><Chip tone="ghost">Read only</Chip></Inner>
          <Inner className="flex items-center justify-between gap-3"><Cell title="Owners" note="Do not see this tab" /><Chip tone="ghost">Hidden</Chip></Inner>
        </Card>
        <Card aria-label="Cancel">
          <SectionLabel>Cancel</SectionLabel>
          {sub?.cancelAtEnd ? (
            <Inner className="flex flex-wrap items-center justify-between gap-3"><Cell title="Cancellation scheduled" note={`Everything keeps working until ${renews ? dayLabel(renews) : 'the end of the period'}. Reactivate to keep going.`} /><Button size="sm" disabled={busy === 'reactivate'} onClick={() => void manage('reactivate')}>Reactivate</Button></Inner>
          ) : (
            <>
              <Inner className="flex flex-wrap items-center justify-between gap-3">
                <Cell title="Cancel at the end of the period" note={`Everything keeps working until ${renews ? dayLabel(addDays(renews, -1)) : 'the period ends'}. Records stay exportable for 90 days after that. You type the building's name to confirm.`} />
                {!cancelOpen && <Button size="sm" variant="ghost" onClick={() => setCancelOpen(true)}>Cancel…</Button>}
              </Inner>
              {cancelOpen && (
                <form onSubmit={e => { e.preventDefault(); if (confirmText.trim().toLowerCase() === tenant.name.trim().toLowerCase()) { void manage('cancel'); setCancelOpen(false); setConfirmText(''); } }} className="flex flex-wrap items-end gap-2">
                  <Field label={`Type ${tenant.name} to confirm`} className="min-w-[240px] flex-1"><input aria-label="Building name" value={confirmText} onChange={e => setConfirmText(e.target.value)} className={INPUT} /></Field>
                  <Button type="submit" size="sm" variant="danger" disabled={confirmText.trim().toLowerCase() !== tenant.name.trim().toLowerCase() || busy === 'cancel'}>Cancel subscription</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setCancelOpen(false); setConfirmText(''); }}>Keep it</Button>
                </form>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
