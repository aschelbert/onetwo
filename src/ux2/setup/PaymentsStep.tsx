/**
 * Setup step 4 · Get paid online. Connect the association's Stripe account
 * so owners can pay dues by card or bank from the day they are invited.
 * Three states: nothing yet (one click starts Stripe's hosted onboarding,
 * which returns here), an account Stripe is still verifying (the board sets
 * the payment rules meanwhile; status is re-checked on arrival), and
 * connected. Optional throughout: "Later" moves the Home card on to step 5
 * (Send letters by mail), and nothing here blocks going live. Same call and
 * rules as Funds › Online payments (`paymentPrefs`), so the two screens
 * always agree.
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fmt, cn } from '@/lib/formatters';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useTenantContext } from '@/components/TenantProvider';
import { useSetupStore } from '@/features/setup/useSetupStore';
import { Button, Chip } from '../components';
import { Toggle, connectStripe, monthlyFeeEstimate, usePaymentPrefs, type Prefs } from '../funds/paymentPrefs';
import { useSetup } from './useSetup';

const CARD = 'flex flex-col gap-2.5 rounded-[14px] border border-ux2-line bg-white px-5 py-4';
const EYEBROW = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-ux2-muted';
const ROW = 'flex items-center justify-between gap-3 rounded-xl bg-ux2-surface px-3 py-2.5';
const Ext = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></svg>;
const Clock = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;

const RULES: [keyof Prefs, string, string][] = [
  ['dues', 'Monthly dues', 'Autopay on the due day, or pay when billed'],
  ['assessments', 'Special assessments', 'In full or by the instalments the board sets'],
  ['fees', 'Fees, fines and repair charges', 'Late fees, amenity bookings, chargebacks'],
  ['ach', 'Bank account (ACH) as well as cards', 'Lower fee, 3 to 5 days to clear'],
];

export default function PaymentsStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const s = useSetup();
  const tenant = useTenantContext();
  const viewer = useAuthStore(x => x.currentUser);
  const role = useAuthStore(x => x.currentRole);
  const name = useBuildingStore(x => x.name);
  const units = useFinancialStore(x => x.units);
  const stripeId = useFinancialStore(x => x.stripeConnectId);
  const getAcctName = useFinancialStore(x => x.getAcctName);
  const dueDay = useFinancialStore(x => x.hoaDueDay ?? 1);
  const setLater = useSetupStore(x => x.setLater);
  const { prefs, set } = usePaymentPrefs();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'sage' | 'red' | 'amber'; text: string } | null>(null);
  const checked = useRef(false);

  const status = s.payments;
  const est = monthlyFeeEstimate(units);
  const assessed = units.filter(u => u.monthlyFee > 0).length;
  const payoutBank = getAcctName('1010') || 'Operating checking';

  // Back from Stripe (its return_url is this page), or simply reopening: ask Stripe once where the account stands.
  useEffect(() => {
    if (status !== 'pending' || !supabase || tenant.isDemo || checked.current) return;
    checked.current = true;
    connectStripe('check_status', name).then(r => {
      if (r.onboardingComplete) setNote({ tone: 'sage', text: 'Stripe confirmed the account. Owners can pay online.' });
    }).catch(() => { /* shown on Check now */ });
  }, [status, name, tenant.isDemo]);

  const connect = async (action: 'create' | 'check_status', openStripe = false) => {
    if (tenant.isDemo) { setNote({ tone: 'amber', text: 'This is the demo: connecting Stripe does nothing here.' }); return; }
    setBusy(true); setNote(null);
    try {
      const r = await connectStripe(action, name);
      if (r.onboardingComplete) setNote({ tone: 'sage', text: 'Stripe confirmed the account. Owners can pay online when you go live.' });
      else if (r.onboardingUrl && (action === 'create' || openStripe || r.detailsSubmitted === false)) window.location.href = r.onboardingUrl;
      else setNote({ tone: 'amber', text: 'Still verifying. Stripe usually takes 1 to 2 days; we check again each time this page opens.' });
    } catch (e) { setNote({ tone: 'red', text: e instanceof Error ? e.message : 'Stripe did not answer. Try again in a minute.' }); }
    finally { setBusy(false); }
  };

  const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][n % 100] ?? 'th'}`;

  return (
    <div data-step="payments" data-payments-status={status} className="flex flex-col gap-[18px]">
      <section aria-labelledby="pay-h" className="flex flex-col gap-3.5 rounded-[22px] border border-ux2-line bg-ux2-surface px-[22px] py-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 id="pay-h" className="flex-1 text-xl font-medium">4 · Get paid online {status === 'off' && <span className="text-sm text-ux2-muted">· optional · owners pay by check until this is done</span>}</h2>
          {status === 'pending' && <Chip tone="amber" className="h-7 gap-1.5 px-3"><Clock />Stripe verifying</Chip>}
          {status === 'on' && <Chip tone="sage" className="h-7 px-3">Connected</Chip>}
          {status === 'off' && s.paymentsLater && <Chip tone="ghost" className="h-7 px-3">Left for later</Chip>}
        </div>
        {status === 'off' && <p className="m-0 text-[13px] text-ux2-muted">Connect a Stripe account in the association's name. Owners pay dues and assessments from their unit page or set up autopay, payouts land in the operating account, and every payment posts to the ledger on its own.</p>}

        {status === 'pending' && (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-[14px] border border-[#F0DDB8] bg-ux2-amber-tint px-4 py-3.5 text-sm text-ux2-ink">
            <span className="min-w-[280px] flex-1 leading-relaxed"><b className="font-semibold">Stripe is checking the association's details.</b> This usually takes 1 to 2 days. We check each time this page opens and once a day, and email you when it's done. Owners can pay online from then; until then their unit page says pay by check.</span>
            <span className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void connect('check_status')}>{busy ? 'Checking…' : 'Check now'}</Button>
              <Button size="sm" variant="ghost" disabled={busy} className="gap-1.5" onClick={() => void connect('check_status', true)}>Open Stripe <Ext /></Button>
            </span>
          </div>
        )}
        {status === 'on' && (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-[14px] bg-ux2-sage-tint px-4 py-3.5 text-sm text-ux2-sage">
            <span className="min-w-[280px] flex-1 leading-relaxed"><b className="font-semibold">Stripe has verified the association.</b> When you go live, every owner's unit page offers "Pay online or set up autopay". Checks still work for anyone who prefers them.</span>
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => window.open('https://dashboard.stripe.com', '_blank', 'noopener')}>Open the Stripe dashboard <Ext /></Button>
          </div>
        )}
        {note && <div role="status" className={cn('rounded-xl px-3 py-2 text-sm', note.tone === 'sage' ? 'bg-ux2-sage-tint text-ux2-sage' : note.tone === 'amber' ? 'bg-ux2-amber-tint text-ux2-amber' : 'bg-ux2-red-tint text-ux2-red-ink')}>{note.text}</div>}

        {status === 'off' ? (
          <div className="grid grid-cols-1 items-start gap-3.5 md:grid-cols-2">
            <div className="flex flex-col gap-3.5">
              <div className={cn(CARD, 'gap-3')}>
                <span className={EYEBROW}>About 10 minutes · then 1 to 2 days for Stripe to verify</span>
                <h3 className="m-0 text-[22px] font-semibold leading-tight">Connect the association's Stripe account</h3>
                <p className="m-0 text-sm leading-relaxed">Stripe opens with the building's name and address already filled in. The person connecting should be an officer, usually the Treasurer or President, with their ID at hand. When Stripe is done you come straight back here.</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="plum" disabled={busy} className="gap-2" onClick={() => void connect('create')}>{busy ? 'Opening Stripe…' : 'Connect with Stripe'} <Ext /></Button>
                  <Button variant="ghost" onClick={() => { setLater('payments', !s.paymentsLater); if (!s.paymentsLater) onNext(); }}>{s.paymentsLater ? 'Do it now' : 'Later'}</Button>
                </div>
                <p className="m-0 text-xs leading-relaxed text-ux2-muted">Nothing here blocks going live. Left for later, it stays on your Home card and in Funds › Online payments.</p>
              </div>
              <div className={CARD}>
                <span className={EYEBROW}>What happens</span>
                <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
                  {[['Create the account.', 'One click here. Stripe asks for nothing we already know.'], ['Verify the association.', "An officer's ID and date of birth, the EIN, and the bank account payouts go to. About 10 minutes; Stripe confirms in 1 to 2 days."], ['Choose the rules.', 'What owners can pay here, whether bank payments are allowed, who covers card fees. Sensible defaults are set; change them any time.'], ['Turn it on for owners.', 'At go-live, every invitation says "Pay online or set up autopay". Checks still work for anyone who prefers them.']].map(([t, d], i) => (
                    <li key={t} className="flex items-start gap-3 text-[13px] leading-relaxed">
                      <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ux2-plum-tint text-[11px] font-bold text-ux2-plum">{i + 1}</span>
                      <span><b className="font-semibold">{t}</b> <span className="text-ux2-muted">{d}</span></span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            <div className="flex flex-col gap-3.5">
              <div className={CARD} aria-label="Have ready">
                <span className={EYEBROW}>Have ready</span>
                {[["The association's EIN", 'On the IRS letter or the last tax filing. Stripe needs it to open an account in the association’s name.'], ['Operating account and routing numbers', 'Where payouts land, usually the operating checking account.'], ["An officer's government ID", 'Driver’s licence or passport of the person clicking Connect.']].map(([t, n]) => (
                  <div key={t} className={ROW}><span className="flex min-w-0 flex-col gap-0.5"><span className="text-sm font-semibold">{t}</span><span className="text-xs text-ux2-muted">{n}</span></span><Chip tone="amber" className="shrink-0">Have it handy</Chip></div>
                ))}
              </div>
              <div className={CARD} aria-label="What it costs">
                <span className={EYEBROW}>What it costs</span>
                <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-[13px]">
                  <dt className="text-ux2-muted">Cards</dt><dd className="m-0 font-semibold">2.9% + 30¢ per payment</dd>
                  <dt className="text-ux2-muted">Bank (ACH)</dt><dd className="m-0 font-semibold">0.8%, capped at $5</dd>
                  <dt className="text-ux2-muted">Monthly or setup fee</dt><dd className="m-0 font-semibold">None</dd>
                </dl>
                {assessed > 0 && (
                  <>
                    <div className="h-px bg-ux2-line" />
                    <div className="flex flex-col gap-1 text-[13px]" data-fee-estimate>
                      <span className="text-ux2-muted">For {assessed} unit{assessed === 1 ? '' : 's'} paying {fmt(est.dues)} a month in dues</span>
                      <span className="flex justify-between gap-3"><span>If everyone pays by card</span><b className="font-semibold">about {fmt(est.byCard)} a month</b></span>
                      <span className="flex justify-between gap-3"><span>If everyone pays by bank</span><b className="font-semibold">about {fmt(est.byBank)} a month</b></span>
                    </div>
                  </>
                )}
                <p className="m-0 text-xs leading-relaxed text-ux2-muted">Most boards absorb the fee and steer owners to bank payments. You pick in the rules, once the account exists.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-3.5 md:grid-cols-2">
            <div className={CARD} aria-label="Stripe account">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[17px] font-semibold">The association's Stripe account</span><Chip tone={status === 'on' ? 'sage' : 'amber'}>{status === 'on' ? 'Verified' : 'Verification pending'}</Chip></div>
              <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2.5 py-1 text-[13px]">
                <dt className="text-ux2-muted">Account</dt><dd className="m-0 text-right font-semibold">{name} · {stripeId ? `${stripeId.slice(0, 7)}…${stripeId.slice(-2)}` : '—'}</dd>
                <dt className="text-ux2-muted">Status</dt><dd className="m-0 text-right font-semibold">{status === 'on' ? 'Verified · owners can pay online' : 'Stripe is reviewing'}</dd>
                <dt className="text-ux2-muted">Payout bank</dt><dd className="m-0 text-right font-semibold">{payoutBank}</dd>
                <dt className="text-ux2-muted">On owners' statements as</dt><dd className="m-0 text-right font-semibold">{name.toUpperCase()}</dd>
                <dt className="text-ux2-muted">Representative</dt><dd className="m-0 text-right font-semibold">{viewer.name}{role === 'BOARD_MEMBER' ? ' · Board' : ''}</dd>
                <dt className="text-ux2-muted">Who can change this</dt><dd className="m-0 text-right font-semibold">Admins</dd>
              </dl>
              <p className="m-0 text-xs leading-relaxed text-ux2-muted">{status === 'on' ? 'Payouts, refunds and failed payments show in Funds › Online payments.' : 'When Stripe confirms, this step marks itself done and the Home card moves on. If Stripe needs anything more, Open Stripe takes you to it.'}</p>
            </div>
            <div className={CARD} aria-label="What owners can pay here">
              <span className={EYEBROW}>The rules · set now, change any time in Funds › Online payments</span>
              {RULES.map(([k, t, n]) => (
                <div key={k} className={ROW}><span className="flex min-w-0 flex-col gap-0.5"><span className="text-sm font-semibold">{t}</span><span className="text-xs text-ux2-muted">{k === 'dues' ? `Autopay on the ${ordinal(dueDay)}, or pay when billed` : n}</span></span><Toggle on={prefs[k]} onChange={v => set(k, v)} label={t} /></div>
              ))}
              <fieldset className="m-0 flex flex-col gap-2 rounded-xl border-0 bg-ux2-surface px-3 py-2.5">
                <legend className="float-left p-0 text-sm font-semibold">Card fees are paid by</legend>
                <div role="radiogroup" aria-label="Who pays card fees" className="flex gap-0.5 self-start rounded-full border border-ux2-line bg-white p-[3px]">
                  {([[false, 'The building'], [true, 'The owner, at checkout']] as [boolean, string][]).map(([v, label]) => (
                    <button key={label} type="button" role="radio" aria-checked={prefs.passFees === v} onClick={() => set('passFees', v)} className={cn('h-9 rounded-full px-3.5 text-[13px] font-semibold', prefs.passFees === v ? 'bg-ux2-plum text-white' : 'text-ink-700')}>{label}</button>
                  ))}
                </div>
                {assessed > 0 && <span className="text-xs leading-relaxed text-ux2-muted">{prefs.passFees ? 'Owners see the card fee at checkout; bank payments stay free to them.' : `With all ${assessed} units paying by card, about ${fmt(est.byCard)} a month. Owners who pay by bank bring that down to about ${fmt(est.byBank)}.`}</span>}
              </fieldset>
            </div>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <span className="text-[13px] text-ux2-muted">{status === 'off' ? '' : 'Nothing here blocks going live.'}</span>
        <span className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={onBack}>Back to Fill the gaps</Button>
          <Button variant={status === 'off' ? 'ghost' : 'plum'} onClick={onNext}>{status === 'off' ? 'Skip to Send letters by mail' : 'Continue to Send letters by mail'}</Button>
        </span>
      </div>
    </div>
  );
}
