/**
 * Online payments, to the Funds-Payments board: Collected online / Payouts /
 * Fees tiles, Recent payments (refund in place), the building's Stripe
 * account card, What owners can pay here, and, before setup, the Get paid
 * online runbook with Have ready / What it costs / After it is on. Stripe
 * Connect goes through the `connect-stripe-account` edge function, the same
 * call the production Payments manager made; refunds through the store.
 */
import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { supabase } from '@/lib/supabase';
import { fmt } from '@/lib/formatters';
import { Button, Card, Cell, Chip, Field, INPUT, Inner, KV, RowMenu, SectionLabel, Table, Td, Th, Tile, TileRow, Why } from '../../components';
import { dayLabel } from '../../home/calendar';
import { collected, monthName, ONLINE_METHODS, type FundsSnapshot } from '../metrics';
import type { FundsTab } from '../FundsPage';

const PREFS_KEY = 'onetwo-ux2-payments-prefs';
interface Prefs { passFees: boolean; dues: boolean; assessments: boolean; fees: boolean; ach: boolean; paused: boolean }
const DEFAULT_PREFS: Prefs = { passFees: false, dues: true, assessments: true, fees: true, ach: true, paused: false };
const readPrefs = (): Prefs => { try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { return DEFAULT_PREFS; } };

const isCard = (m: string) => /card|stripe|online/i.test(m);
const isBank = (m: string) => /ach|bank/i.test(m);
const feeFor = (amount: number, method: string) => (isCard(method) ? amount * 0.029 + 0.3 : isBank(method) ? Math.min(5, amount * 0.008) : 0);
const nextTuesday = (iso: string) => { const d = new Date(`${iso}T00:00:00`); const add = (9 - d.getDay()) % 7 || 7; d.setDate(d.getDate() + add); return d.toISOString().slice(0, 10); };
const lastTuesday = (iso: string) => { const d = new Date(`${iso}T00:00:00`); const back = (d.getDay() + 5) % 7 || 7; d.setDate(d.getDate() - back); return d.toISOString().slice(0, 10); };

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-ux2-navy' : 'bg-ux2-line-strong'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

interface PaymentRow { id: string; date: string; unit: string; owner: string; what: string; how: string; amount: number; status: string; tone: 'sage' | 'red' | 'ghost' | 'amber'; invoiceId?: string; refundable: boolean }

export default function PaymentsTab({ snap, onGo }: { snap: FundsSnapshot; onGo: (tab: FundsTab, section?: string) => void }) {
  const building = useBuildingStore();
  const viewer = useAuthStore(s => s.currentUser);
  const role = useAuthStore(s => s.currentRole);
  const addAnnouncement = useComplianceStore(s => s.addAnnouncement);
  const stripeId = useFinancialStore(s => s.stripeConnectId);
  const setStripeConnect = useFinancialStore(s => s.setStripeConnect);
  const setStripeOnboarding = useFinancialStore(s => s.setStripeOnboarding);
  const refund = useFinancialStore(s => s.refundUnitInvoice);
  const getAcctName = useFinancialStore(s => s.getAcctName);
  const [prefs, setPrefs] = useState<Prefs>(() => readPrefs());
  const [refunding, setRefunding] = useState<{ id: string; reason: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private window */ } }, [prefs]);
  const set = (k: keyof Prefs, v: boolean) => setPrefs(p => ({ ...p, [k]: v }));

  const col = collected(snap);
  const month = col.month;
  const ready = snap.stripeOnboardingComplete && !!stripeId;
  const thisYear = snap.today.slice(0, 4);

  const rows = useMemo<PaymentRow[]>(() => {
    const out: PaymentRow[] = [];
    const ownerOf = (n: string) => snap.units.find(u => u.number === n)?.owner ?? '';
    for (const u of snap.units) for (const [i, p] of u.payments.entries()) out.push({ id: `pay:${u.number}:${i}`, date: p.date.slice(0, 10), unit: u.number, owner: u.owner, what: p.note || 'Dues', how: isCard(p.method) ? 'Card' : isBank(p.method) ? 'Bank' : p.method ? p.method.charAt(0).toUpperCase() + p.method.slice(1) : 'By hand', amount: p.amount, status: isCard(p.method) || isBank(p.method) ? `Paid · payout ${dayLabel(nextTuesday(p.date.slice(0, 10)))}` : 'Paid · recorded by hand', tone: 'sage', refundable: false });
    for (const inv of snap.unitInvoices) {
      if (inv.refundDate) out.push({ id: `ref:${inv.id}`, date: inv.refundDate.slice(0, 10), unit: inv.unitNumber, owner: ownerOf(inv.unitNumber), what: inv.description, how: inv.paymentMethod ? (isCard(inv.paymentMethod) ? 'Card' : isBank(inv.paymentMethod) ? 'Bank' : inv.paymentMethod) : '—', amount: inv.refundAmount ?? inv.amount, status: `Refunded ${dayLabel(inv.refundDate.slice(0, 10))}`, tone: 'ghost', invoiceId: inv.id, refundable: false });
      else if (inv.status === 'paid' && inv.paidDate) out.push({ id: `inv:${inv.id}`, date: inv.paidDate.slice(0, 10), unit: inv.unitNumber, owner: ownerOf(inv.unitNumber), what: inv.description, how: inv.paymentMethod ? (isCard(inv.paymentMethod) ? 'Card' : isBank(inv.paymentMethod) ? 'Bank' : inv.paymentMethod) : '—', amount: inv.paidAmount ?? inv.amount, status: 'Paid', tone: 'sage', invoiceId: inv.id, refundable: true });
      else if (inv.status === 'overdue') out.push({ id: `due:${inv.id}`, date: inv.dueDate, unit: inv.unitNumber, owner: ownerOf(inv.unitNumber), what: inv.description, how: inv.stripePaymentLink ? 'Payment link' : '—', amount: inv.amount, status: `Unpaid · due ${dayLabel(inv.dueDate)}`, tone: 'red', invoiceId: inv.id, refundable: false });
    }
    return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  }, [snap.units, snap.unitInvoices]);

  const monthPays = snap.units.flatMap(u => u.payments.filter(p => p.date.slice(0, 7) === month).map(p => ({ ...p, unit: u.number })));
  const byCard = monthPays.filter(p => isCard(p.method));
  const byBank = monthPays.filter(p => isBank(p.method));
  const byCheck = monthPays.filter(p => !isCard(p.method) && !isBank(p.method));
  const online = byCard.reduce((t, p) => t + p.amount, 0) + byBank.reduce((t, p) => t + p.amount, 0);
  const checkUnits = Array.from(new Set(byCheck.map(p => p.unit)));
  const sinceTuesday = snap.units.flatMap(u => u.payments).filter(p => (isCard(p.method) || isBank(p.method)) && p.date.slice(0, 10) > lastTuesday(snap.today) && p.date.slice(0, 10) <= snap.today).reduce((t, p) => t + p.amount, 0);
  const lastPayoutDate = lastTuesday(snap.today);
  const lastPayout = snap.units.flatMap(u => u.payments).filter(p => (isCard(p.method) || isBank(p.method)) && p.date.slice(0, 10) <= lastPayoutDate && p.date.slice(0, 10) > lastTuesday(lastPayoutDate)).reduce((t, p) => t + p.amount, 0);
  const feesMonth = monthPays.reduce((t, p) => t + feeFor(p.amount, p.method), 0);
  const feesYear = snap.units.flatMap(u => u.payments).filter(p => p.date.startsWith(thisYear)).reduce((t, p) => t + feeFor(p.amount, p.method), 0);
  const cardVolume = byCard.reduce((t, p) => t + p.amount, 0);
  const autopayUnits = new Set([...byCard, ...byBank].map(p => p.unit)).size;

  const connect = async (action: 'create' | 'check_status') => {
    if (!supabase) { setNote('Connecting Stripe needs the live backend; the demo building shows the flow only.'); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('connect-stripe-account', { body: action === 'create' ? { action, buildingName: building.name, returnUrl: window.location.href } : { action, returnUrl: window.location.href } });
      if (error) throw error;
      if (data?.stripeConnectId) setStripeConnect(data.stripeConnectId);
      if (data?.onboardingComplete) { setStripeOnboarding(true); setNote('Stripe confirmed the account. Owners can pay online.'); }
      else if (data?.onboardingUrl) window.location.href = data.onboardingUrl;
    } catch (e: any) { setNote(e?.message || 'Stripe did not answer. Try again in a minute.'); } finally { setBusy(false); }
  };
  const inviteCheckPayers = () => {
    addAnnouncement({ title: 'Pay online or set up autopay', body: `Dues, assessments and fees can now be paid by card or bank from My Unit › Pay. Autopay runs on the ${snap.hoaDueDay}${['th', 'st', 'nd', 'rd'][(snap.hoaDueDay % 100 - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][snap.hoaDueDay % 100] ?? 'th'} and counts as on time. Checks still work for anyone who prefers them.`, category: 'financial', postedBy: viewer.name, postedDate: snap.today, pinned: false });
    setNote(`Invitation posted to owners${checkUnits.length ? ` · ${checkUnits.join(', ')} still pay by check` : ''}.`);
  };

  return (
    <div className="flex flex-col gap-5">
      <TileRow>
        <Tile tone={ready ? 'navy' : 'grey'} label={`Collected online · ${monthName(month)}`} meta={<Chip tone={ready ? 'cyan' : 'ghost'}>{prefs.paused ? 'Stripe · paused' : ready ? 'Stripe · connected' : stripeId ? 'Stripe · finish setup' : 'Stripe · not set up'}</Chip>} value={fmt(online)} unit={`of ${fmt(col.amount)} collected`} className="min-h-[230px]"
          sub={<span className="block">
            <KV dark={ready} label="Autopay, card">{new Set(byCard.map(p => p.unit)).size} units · {fmt(cardVolume)}</KV>
            <KV dark={ready} label="Autopay, bank (ACH)">{new Set(byBank.map(p => p.unit)).size} units · {fmt(byBank.reduce((t, p) => t + p.amount, 0))}</KV>
            <KV dark={ready} label="By check, outside Stripe">{checkUnits.length} units · {fmt(byCheck.reduce((t, p) => t + p.amount, 0))}</KV>
          </span>}
          action={<><span>Invite the {checkUnits.length || 'owners'} who still pay by check{checkUnits.length ? ` · ${checkUnits.slice(0, 4).join(', ')}` : ''}</span><Button size="sm" variant="ghost" onClick={inviteCheckPayers}>Send</Button></>} />
        <Tile tone="grey" label="Payouts" meta={<span className="text-xs text-ux2-muted">weekly, Tuesdays</span>} value={dayLabel(nextTuesday(snap.today))} unit={`next · about ${fmt(sinceTuesday)}`} className="min-h-[230px]"
          sub={<span className="block">
            <KV label="Last payout">{fmt(lastPayout)} · {dayLabel(lastPayoutDate)}</KV>
            <KV label="Lands in">{getAcctName('1010') || 'Operating'}</KV>
            <KV label="Posts to the ledger as">1010 ← 1140, matched</KV>
            <KV label="In Stripe, not yet paid out">{fmt(sinceTuesday)}</KV>
          </span>}
          action={<><span>Ledger · every payout matched to the bank feed</span><Button size="sm" variant="ghost" onClick={() => onGo('settings', 'ledger')}>Open</Button></>} />
        <Tile tone="teal" label="Fees" meta={<span className="text-xs text-white/70">the building pays</span>} value={fmt(Math.round(feesMonth))} unit={`this month · ${cardVolume ? `${(feesMonth / cardVolume * 100).toFixed(1)}% of card volume` : 'no card volume'}`} className="min-h-[230px]"
          sub={<span className="block">
            <KV dark label="Cards">2.9% + 30¢</KV>
            <KV dark label="Bank (ACH)">0.8%, capped at $5</KV>
            <KV dark label="Year to date">{fmt(Math.round(feesYear))} · 6100 Bank and card fees</KV>
          </span>}
          action={<><span>Pass card fees to the owner · {prefs.passFees ? 'On' : 'Off · owners see no fee at checkout'}</span><Toggle on={prefs.passFees} onChange={v => set('passFees', v)} label="Pass card fees to the owner" /></>} />
      </TileRow>

      {note && <Inner className="flex items-center justify-between gap-3 text-sm text-ux2-ink"><span>{note}</span><button type="button" className="text-xs text-ux2-muted hover:underline" onClick={() => setNote(null)}>Dismiss</button></Inner>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[3fr_2fr]">
        <Card aria-label="Recent payments">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[17px] font-semibold text-ux2-ink">Recent payments</span><span className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => { const r = rows.find(x => x.refundable); if (r?.invoiceId) setRefunding({ id: r.invoiceId, reason: '' }); else setNote('Nothing to refund: refunds apply to invoices paid online.'); }}>Refund a payment</Button><Button size="sm" variant="ghost" onClick={() => onGo('income', 'invoices')}>Invoices</Button></span></div>
          <Table minWidth={720}>
            <thead><tr><Th>When</Th><Th>Unit</Th><Th>For</Th><Th>How</Th><Th num>Amount</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} data-payment={r.id}>
                  <Td>{dayLabel(r.date)}</Td>
                  <Td><Cell title={r.unit} note={r.owner} /></Td>
                  <Td>{r.what}</Td>
                  <Td>{r.how}</Td>
                  <Td num>{fmt(r.amount)}</Td>
                  <Td><Chip tone={r.tone}>{r.status}</Chip></Td>
                  <Td num><RowMenu label={`Actions for ${r.unit} ${r.what}`} items={[{ label: 'Open the unit ledger', onSelect: () => onGo('income', 'ledger') }, ...(r.refundable && r.invoiceId ? [{ label: 'Refund', onSelect: () => setRefunding({ id: r.invoiceId!, reason: '' }), danger: true }] : [])]} /></Td>
                </tr>
              ))}
              {rows.length === 0 && <tr><Td colSpan={7}><span className="text-ux2-muted">No payments yet. The first online payment lands here with its payout date.</span></Td></tr>}
            </tbody>
          </Table>
          {refunding && (
            <form aria-label="Refund a payment" onSubmit={e => { e.preventDefault(); refund(refunding.id, refunding.reason.trim() || 'Board-initiated refund'); setNote('Refund recorded; it goes back to the same card or account in 5 to 10 days and reverses the ledger entry.'); setRefunding(null); }} className="flex flex-wrap items-end gap-2 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
              <Field label="Invoice" className="w-[200px]"><select aria-label="Invoice" value={refunding.id} onChange={e => setRefunding({ ...refunding, id: e.target.value })} className={INPUT}>{snap.unitInvoices.filter(i => i.status === 'paid' && !i.refundDate).map(i => <option key={i.id} value={i.id}>{i.unitNumber} · {i.description} · {fmt(i.paidAmount ?? i.amount)}</option>)}</select></Field>
              <Field label="Reason" className="min-w-[220px] flex-1"><input aria-label="Reason" value={refunding.reason} onChange={e => setRefunding({ ...refunding, reason: e.target.value })} className={INPUT} /></Field>
              <Button type="submit" size="sm" variant="danger">Refund</Button><Button type="button" size="sm" variant="ghost" onClick={() => setRefunding(null)}>Cancel</Button>
            </form>
          )}
          <Why>A failed autopay retries once after 7 days, then the unit gets a Home card and the dues count as unpaid for late fees. A refund goes back to the same card or account in 5 to 10 days and reverses the ledger entry.</Why>
        </Card>

        <div className="flex flex-col gap-5">
          <Card aria-label="Stripe account">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[17px] font-semibold text-ux2-ink">The building's Stripe account</span><Chip tone={ready ? 'sage' : stripeId ? 'amber' : 'ghost'}>{ready ? 'Verified' : stripeId ? 'Onboarding' : 'Not connected'}</Chip></div>
            <Inner className="py-1">
              <KV label="Account">{stripeId ? `${building.name} · ${stripeId.slice(0, 7)}…${stripeId.slice(-2)}` : '—'}</KV>
              <KV label="Connected">{ready ? 'Yes' : stripeId ? 'Finish verification' : 'Not yet'}</KV>
              <KV label="Payout bank">{getAcctName('1010') || 'Operating checking'}</KV>
              <KV label="On owners' statements as">{building.name.toUpperCase()}</KV>
              <KV label="Representative">{viewer.name}{role === 'BOARD_MEMBER' ? ' · Board' : ''}</KV>
              <KV label="Who can change this">Admins</KV>
            </Inner>
            <div className="flex flex-wrap gap-2">
              {ready ? <Button size="sm" variant="ghost" onClick={() => window.open('https://dashboard.stripe.com', '_blank')}>Open the Stripe dashboard</Button> : stripeId ? <Button size="sm" disabled={busy} onClick={() => void connect('check_status')}>Finish setup</Button> : <Button size="sm" disabled={busy} onClick={() => void connect('create')}>Connect with Stripe</Button>}
              {ready && <Button size="sm" variant="ghost" onClick={() => void connect('check_status')}>Change payout bank</Button>}
              {ready && <Button size="sm" variant="ghost" onClick={() => { if (prefs.paused || window.confirm('Pause online payments? Owners see "pay by check" until you resume; autopay stops.')) set('paused', !prefs.paused); }}>{prefs.paused ? 'Resume online payments' : 'Pause online payments…'}</Button>}
            </div>
          </Card>
          <Card aria-label="What owners can pay here">
            <SectionLabel>What owners can pay here</SectionLabel>
            {([['dues', 'Monthly dues', `Autopay on the ${snap.hoaDueDay}${['th', 'st', 'nd', 'rd'][(snap.hoaDueDay % 100 - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][snap.hoaDueDay % 100] ?? 'th'}, or pay when billed`], ['assessments', 'Special assessments', 'In full or by the instalments the board set'], ['fees', 'Fees, fines and repair charges', 'Late fees, amenity bookings, chargebacks'], ['ach', 'Bank account (ACH) as well as cards', 'Lower fee, 3 to 5 days to clear']] as [keyof Prefs, string, string][]).map(([k, t, n]) => (
              <Inner key={k} className="flex items-center justify-between gap-3"><Cell title={t} note={n} /><Toggle on={prefs[k]} onChange={v => set(k, v)} label={t} /></Inner>
            ))}
          </Card>
        </div>
      </div>

      {!ready && (
        <>
          <Card tone="navy" aria-label="Get paid online">
            <SectionLabel className="text-white/[0.66]">Get paid online · Runbook · New building setup, step 6 of 9</SectionLabel>
            <div className="text-[22px] font-semibold leading-tight">Collect dues and assessments through Stripe</div>
            <p className="text-sm text-white/[0.85]">Owners pay by card or bank from their unit page; money lands in the operating account every week; the ledger posts itself. Until this is done, owners keep paying by check and you record each one by hand.</p>
            <div><Button size="sm" disabled={busy} className="!bg-white !text-ux2-navy" onClick={() => void connect(stripeId ? 'check_status' : 'create')}>{stripeId ? 'Finish setup' : 'Connect with Stripe'}</Button></div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              {[['Create the account', "One click. Stripe opens in a new tab with the association's name, address and EIN already filled in."], ['Verify the association', "An officer's ID and date of birth, and the bank account payouts go to. About 10 minutes; Stripe confirms in 1 to 2 days."], ['Choose the rules', 'Who pays card fees, whether bank payments are allowed, what owners can pay here. Sensible defaults are set.'], ['Turn it on for owners', 'Every owner gets a Home card and an email: "Pay online or set up autopay". Checks still work for anyone who prefers them.']].map(([t, d], i) => (
                <div key={t} className="rounded-[14px] bg-white/[0.08] px-3.5 py-3"><span className="mb-1 inline-grid h-6 w-6 place-items-center rounded-full bg-white text-[11px] font-bold text-ux2-navy">{i + 1}</span><div className="text-sm font-semibold">{t}</div><div className="text-xs text-white/[0.8]">{d}</div></div>
              ))}
            </div>
          </Card>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <Card aria-label="Have ready">
              <SectionLabel>Have ready</SectionLabel>
              <Inner className="flex items-center justify-between gap-3"><Cell title="The association's EIN" note="On file in Building › Documents if the biennial report was filed here" /><Chip tone="amber">Needed</Chip></Inner>
              <Inner className="flex items-center justify-between gap-3"><Cell title="Operating bank account and routing numbers" note="Where payouts land; the bank feed can be connected at the same time" /><Chip tone="amber">Needed</Chip></Inner>
              <Inner className="flex items-center justify-between gap-3"><Cell title="An officer's government ID" note="The person clicking Connect, usually the Treasurer or President" /><Chip tone="amber">Needed</Chip></Inner>
            </Card>
            <Card aria-label="What it costs">
              <SectionLabel>What it costs</SectionLabel>
              <Inner className="py-1"><KV label="Cards">2.9% + 30¢ per payment</KV><KV label="Bank (ACH)">0.8%, capped at $5</KV><KV label="Monthly or setup fee">None</KV><KV label={`For a ${snap.units.length}-unit building, if everyone pays by card`}>about {fmt(Math.round(snap.units.reduce((t, u) => t + u.monthlyFee * 0.029 + 0.3, 0)))} a month</KV></Inner>
              <Why>Fees can be absorbed by the building or added at checkout; most boards absorb them and steer owners to bank payments.</Why>
            </Card>
            <Card aria-label="After it is on">
              <SectionLabel>After it is on</SectionLabel>
              {['Billing on the due day charges autopay units itself', 'Every payment posts to the unit ledger the same day', 'Payouts reconcile against the bank feed', 'Refunds, failed payments and retries show on this page'].map(t => <Inner key={t} className="flex items-center justify-between gap-3"><span className="text-sm text-ux2-ink">{t}</span><Chip tone="ghost">Automatic</Chip></Inner>)}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
