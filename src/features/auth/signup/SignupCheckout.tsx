/**
 * Signup and checkout on one page: account, plan, add-ons, the building's
 * address and the payment method, with a live order summary beside them.
 *
 * Everything on the page is ours except the payment fields, which Chargebee
 * renders in its own iframe (see usePaymentFields). Name, email and address
 * are each typed once here and handed to Chargebee from the server.
 *
 * Pressing the button runs, in order: our own checks, the payment fields'
 * checks, creating the account (or signing in to an existing one),
 * authorising the payment method, and asking the server to start the
 * subscription. A failure at any point leaves every field as it was.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { supabase, isBackendEnabled } from '@/lib/supabase';
import { TIERS, ADDONS, getAddOnPrice } from '@/lib/tiers';
import type { AddOnId, BillingInterval, SubscriptionTier } from '@/lib/tiers';
import { toStateCode } from '@/lib/usStates';
import { missingConsent, recordConsent } from '@/lib/consent';
import { setSignupInProgress } from '@/lib/authFlow';
import { fetchMemberships, isSameBuilding } from '@/lib/tenantMembership';
import { loadOpenAIPixel, readAdClickRef, setOpenAIPixelUser } from '@/lib/openaiPixel';
import { loadRedditPixel, trackBuildingCreated } from '@/lib/adConversions';
import { readAttribution } from '@/lib/attribution';
import { PASSWORD_MIN_LENGTH } from '@/lib/passwordPolicy';
import ConsentBoxes from '../ConsentBoxes';
import PasswordRules from '../PasswordRules';
import {
  EMPTY_FORM, ACCOUNT_FIELDS, BUILDING_FIELDS, clearDraft, dollars, fieldErrors, loadDraft, saveDraft, splitName,
  summarize, trialEndDate, whatIsMissing, type FieldId, type SignupForm,
} from './signupForm';
import { usePaymentFields, type BillingContext } from './usePaymentFields';
import './signupCheckout.css';

export interface SignupUser { id: string; email?: string | null; user_metadata?: { full_name?: string } }

interface Props {
  /** Trial length from the Admin Console; 0 means billing starts at signup. */
  trialDays: number;
  /** Set when a signed-in person is setting up another building: no account step to fill in. */
  signedInAs: string | null;
  signedInName?: string;
  /** Go to the login form. The selections stay saved for when they come back. */
  onLogIn: () => void;
  /** Leave the account the page found signed in, and start blank. */
  onSignOut: () => void;
  /** The subscription exists: wait for the building, then open it. */
  onSubscribed: (user: SignupUser, knownTenantIds: string[]) => Promise<void>;
  /** With no backend configured there is nothing to pay: enter the demo. */
  onDemoSignup: (who: { firstName: string; lastName: string; email: string }) => void;
  /** "Setting up your building…" while the parent waits for it. */
  provisioningStatus: string | null;
}

/** What each plan is for, in the words of the pricing page. */
const PLAN_BLURBS: Record<SubscriptionTier, string> = {
  self_managed: 'The board runs the building. ONE two keeps it compliant. Walk-ups and small buildings with no elevator, pool or staff.',
  facilities: 'Everything in Self-Managed, plus what a building with an elevator, a pool, a boiler or staff has to manage.',
};

const NAV = [
  { href: '/#inside', label: "What's inside" },
  { href: '/#replace', label: 'Why Us' },
  { href: '/#spotlight', label: 'Spotlight' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/#owners', label: 'Get Started', current: true },
  { href: 'mailto:hello@getonetwo.com', label: 'Contact' },
];

const Tick = ({ color = '#FFFFFF', size = 14 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
);

async function completeCheckout(accessToken: string, body: Record<string, unknown>) {
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/checkout-complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data: data as { ok?: boolean; error?: string; code?: string; field?: string } | null };
}

export default function SignupCheckout({
  trialDays, signedInAs, signedInName, onLogIn, onSignOut, onSubscribed, onDemoSignup, provisioningStatus,
}: Props) {
  const ids = useId();

  // ── The form ──
  const [form, setForm] = useState<SignupForm>(() => {
    const draft = loadDraft() ?? EMPTY_FORM;
    // A pricing-page button names the plan it was under
    const params = new URLSearchParams(window.location.search);
    const plan = params.get('plan');
    const interval = params.get('interval');
    return {
      ...draft,
      tier: plan === 'self_managed' || plan === 'facilities' ? plan : draft.tier,
      interval: interval === 'annual' || interval === 'monthly' ? interval : draft.interval,
    };
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const set = <K extends keyof SignupForm>(key: K, value: SignupForm[K]) => setForm(f => ({ ...f, [key]: value }));

  useEffect(() => { saveDraft(form); }, [form]);

  // Setting up another building while signed in: the account is already known
  useEffect(() => {
    if (!signedInAs) return;
    setForm(f => ({ ...f, email: signedInAs, fullName: f.fullName || signedInName || '' }));
  }, [signedInAs, signedInName]);

  // Ad pixels load only here, so nobody signing in or using the app is tracked
  useEffect(() => { loadOpenAIPixel(); loadRedditPixel(); }, []);

  /** Signing up with an email that already has an account: ask for that account's password instead. */
  const [existingAccount, setExistingAccount] = useState<{ email: string; wrongPassword: boolean } | null>(null);
  const isExisting = !!existingAccount && existingAccount.email === form.email.trim().toLowerCase();

  const [touched, setTouched] = useState<Partial<Record<FieldId, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Partial<Record<FieldId, string>>>({});
  const errors = useMemo(() => ({
    ...fieldErrors(form, password, {
      needsEmail: !signedInAs,
      needsNewPassword: !signedInAs && !isExisting && isBackendEnabled,
      needsAccountPassword: !signedInAs && isExisting,
    }),
    ...serverErrors,
  }), [form, password, signedInAs, isExisting, serverErrors]);
  const shown = (f: FieldId) => ((touched[f] || submitted) ? errors[f] : undefined);
  const touch = (f: FieldId) => setTouched(t => ({ ...t, [f]: true }));
  const edit = (f: FieldId) => setServerErrors(e => { if (!e[f]) return e; const next = { ...e }; delete next[f]; return next; });

  const accountDone = !ACCOUNT_FIELDS.some(f => errors[f]);
  const buildingDone = !BUILDING_FIELDS.some(f => errors[f]);

  // ── The order ──
  const order = summarize(form.tier, form.interval, form.addOns);
  const toggleAddOn = (id: AddOnId) =>
    set('addOns', form.addOns.includes(id) ? form.addOns.filter(a => a !== id) : [...form.addOns, id]);

  // ── Payment fields ──
  const { firstName, lastName } = splitName(form.fullName);
  const billingContext: BillingContext | null = useMemo(() => {
    const contactOk = !errors.fullName && !errors.email;
    if (!contactOk || !buildingDone) return null;
    return {
      firstName, lastName,
      email: form.email.trim(),
      company: form.bldgName.trim(),
      street: form.street.trim(),
      city: form.city.trim(),
      stateCode: toStateCode(form.state),
      zip: form.zip.trim(),
    };
  }, [errors.fullName, errors.email, buildingDone, firstName, lastName, form.email, form.bldgName, form.street, form.city, form.state, form.zip]);

  const payment = usePaymentFields({
    enabled: isBackendEnabled,
    plan: form.tier,
    period: form.interval,
    addons: form.addOns,
    context: billingContext,
  });

  // The server's trial length wins once it has answered
  const days = payment.quote?.trialDays ?? trialDays;
  const hasTrial = days > 0;
  const startDate = trialEndDate(days);
  const dueToday = hasTrial ? '$0' : dollars(order.total);

  // ── Submitting ──
  const [busy, setBusy] = useState<string | null>(null);
  const inFlight = useRef(false);
  const [payError, setPayError] = useState<string | null>(null);
  /** The payment method is authorised but starting the subscription failed: retry that step alone. */
  const authorised = useRef<{ paymentIntentId: string; accessToken: string; user: SignupUser; knownTenantIds: string[] } | null>(null);
  const [canRetryFinish, setCanRetryFinish] = useState(false);
  /** True while this page holds a session it made for itself (a new account, or an existing one signed in here). */
  const ownsSession = useRef(false);
  const finished = useRef(false);
  const conversionEventId = useRef(`signup_${typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`);

  // Leaving before a building is paid for must not leave them signed in to an
  // account they never chose to log in to.
  const abandonSession = async () => {
    setSignupInProgress(false);
    if (!ownsSession.current || finished.current || !supabase) return;
    ownsSession.current = false;
    try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* already gone */ }
  };
  useEffect(() => () => { void abandonSession(); }, []);

  const focusFirstError = (fields: FieldId[]) => {
    const first = fields.find(f => errors[f]);
    if (first) document.getElementById(`${ids}-${first}`)?.focus();
  };

  const finish = async () => {
    const a = authorised.current;
    if (!a) return;
    setBusy('Starting your subscription…');
    setCanRetryFinish(false);
    const body = {
      paymentIntentId: a.paymentIntentId,
      plan: form.tier,
      period: form.interval,
      addons: form.addOns,
      building: { name: form.bldgName, address: { street: form.street, city: form.city, state: form.state, zip: form.zip } },
      firstName, lastName,
      origin: window.location.origin,
      conversionEventId: conversionEventId.current,
      adMeasurementOptOut: (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true,
      adClickRef: readAdClickRef(),
      attribution: readAttribution(),
    };
    // The request is safe to repeat, so ride out a dropped connection or a
    // copy of it that is still being processed.
    let result: Awaited<ReturnType<typeof completeCheckout>> | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        result = await completeCheckout(a.accessToken, body);
      } catch {
        result = null;
      }
      if (result && !(result.status === 409 && result.data?.code === 'in_progress') && result.status < 500) break;
      await new Promise(r => setTimeout(r, 1200 * (attempt + 1)));
    }

    if (result?.data?.ok) {
      finished.current = true;
      authorised.current = null;
      clearDraft();
      setSignupInProgress(false);
      ownsSession.current = false; // paid for: the session is now a real login
      await setOpenAIPixelUser({ email: form.email.trim(), userId: a.user.id });
      window.oaiq?.('measure', 'trial_started', { type: 'plan_enrollment' }, { event_id: conversionEventId.current });
      trackBuildingCreated({ eventId: conversionEventId.current, plan: form.tier, interval: form.interval });
      setBusy('Setting up your building…');
      await onSubscribed(a.user, a.knownTenantIds);
      setBusy(null);
      return;
    }

    setBusy(null);
    const field = result?.data?.field as FieldId | undefined;
    if (field && BUILDING_FIELDS.includes(field)) {
      // Something about the building has to change. The payment method stays
      // authorised, so pressing the button again only repeats this step.
      setServerErrors(e => ({ ...e, [field]: result?.data?.error || 'Please check this field.' }));
      setPayError('Please check step 4, then press the button again.');
      document.getElementById(`${ids}-${field}`)?.focus();
      return;
    }
    const code = result?.data?.code;
    if (code === 'payment_intent_not_authorized' || code === 'payment_intent_amount' || code === 'payment_failed') {
      // The payment method has to be confirmed again: start that step over
      authorised.current = null;
      setPayError(result?.data?.error || 'Please confirm your payment details again.');
      return;
    }
    if (result && result.status >= 400 && result.status < 500 && result.status !== 409) {
      authorised.current = null;
      setPayError(result.data?.error || 'We could not start your subscription. Please check the form and try again.');
      return;
    }
    // Nothing was charged and the payment method is still authorised: offer to finish
    setCanRetryFinish(true);
    setPayError(result?.data?.error || 'We could not reach the server to start your subscription. Your details are saved here.');
  };

  const start = async () => {
    if (inFlight.current) return;
    setSubmitted(true);
    setPayError(null);

    if (!accountDone) { focusFirstError(ACCOUNT_FIELDS); return; }
    if (!buildingDone) { focusFirstError(BUILDING_FIELDS); return; }
    if (missingConsent(form.consent)) { document.getElementById(`${ids}-consent-terms`)?.focus(); return; }

    // No backend configured: nothing to pay, enter the demo
    if (!isBackendEnabled || !supabase) {
      onDemoSignup({ firstName, lastName, email: form.email.trim() });
      return;
    }

    inFlight.current = true;
    try {
      if (authorised.current) { await finish(); return; }

      const signupEmail = form.email.trim();
      setBusy('Checking your details…');

      // From here until the signup succeeds or stops, any session is the signup's
      setSignupInProgress(true);
      const { data: { session: open } } = await supabase.auth.getSession();
      const sameAccount = open?.user?.email?.toLowerCase() === signupEmail.toLowerCase();
      // Signed in as this person already: adding a building, or an earlier try on this page
      const alreadySignedIn = !!open && sameAccount && (!!signedInAs || ownsSession.current);

      if (!alreadySignedIn) {
        // A sign-in the visitor did not ask to use must not be acted on
        if (open) { try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* already gone */ } }

        if (isExisting) {
          const { error } = await supabase.auth.signInWithPassword({ email: signupEmail, password });
          if (error) {
            setExistingAccount({ email: signupEmail.toLowerCase(), wrongPassword: true });
            setPassword('');
            setSignupInProgress(false);
            document.getElementById(`${ids}-password`)?.focus();
            return;
          }
        } else {
          const { error } = await supabase.auth.signUp({
            email: signupEmail,
            password,
            options: { data: { full_name: `${firstName} ${lastName}`.trim() } },
          });
          if (error) {
            setSignupInProgress(false);
            if (error.message.includes('already registered')) {
              // Never sign an account in on the strength of a password typed as a new one
              setExistingAccount({ email: signupEmail.toLowerCase(), wrongPassword: false });
              setPassword('');
              setSubmitted(false);
              setTouched(t => ({ ...t, password: false }));
              setTimeout(() => document.getElementById(`${ids}-password`)?.focus(), 0);
              return;
            }
            setServerErrors(e => ({ ...e, email: error.message }));
            document.getElementById(`${ids}-email`)?.focus();
            return;
          }
        }
        ownsSession.current = true;
      }

      const session = (await supabase.auth.getSession()).data.session;
      if (!session) {
        await abandonSession();
        setPayError('We could not sign you in. Please try again.');
        return;
      }

      // Proof of what was ticked on this form, stored before any payment step
      await recordConsent(supabase, signedInAs || isExisting ? 'add_building' : 'signup', signupEmail, form.consent);

      // An account can add another building, but not the same one twice
      const memberships = await fetchMemberships(supabase, session.user.id);
      if (memberships === null) {
        setPayError('We could not check your account. Please try again.');
        return;
      }
      const duplicate = memberships.find(m => !!m.tenant && isSameBuilding(
        { name: form.bldgName, address: { street: form.street, city: form.city, state: form.state, zip: form.zip } },
        { name: m.tenant.name, address: m.tenant.address },
      ));
      if (duplicate) {
        setServerErrors(e => ({
          ...e,
          street: `Your account already has this building: "${duplicate.tenant?.name || 'your existing building'}". To add another, enter its own name and street address.`,
        }));
        document.getElementById(`${ids}-street`)?.focus();
        return;
      }

      setBusy(hasTrial ? 'Confirming your payment method…' : 'Processing your payment…');
      const confirmed = await payment.confirm();
      if (!confirmed.ok) {
        setPayError(confirmed.message);
        return;
      }

      authorised.current = {
        paymentIntentId: confirmed.paymentIntentId,
        accessToken: session.access_token,
        user: session.user,
        knownTenantIds: memberships.map(m => m.tenant_id),
      };
      await finish();
    } catch (err) {
      setPayError(err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.');
    } finally {
      inFlight.current = false;
      setBusy(b => (finished.current ? b : null));
    }
  };

  // ── What the button says, and whether it can be pressed ──
  const missing = whatIsMissing(errors, form.consent);
  const paymentReady = !isBackendEnabled || payment.status === 'ready';
  const ctaDisabled = !!busy || !!missing || !paymentReady;
  const ctaLabel = busy
    ?? (canRetryFinish ? 'Try again'
      : !isBackendEnabled ? 'Create account & enter'
      : isExisting ? (hasTrial ? `Sign in & start my ${days}-day free trial` : 'Sign in & start my subscription')
      : hasTrial ? `Start my ${days}-day free trial` : 'Start my subscription');
  const waitingOn = missing
    ?? (isBackendEnabled && payment.status !== 'ready' && payment.status !== 'error' && payment.status !== 'unconfigured'
      ? 'Loading the payment fields…' : null);

  const [summaryOpen, setSummaryOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const currentStep = !accountDone ? 1 : !buildingDone ? 4 : 5;
  const steps = [
    { n: 1, label: 'Account', href: `#${ids}-s1` },
    { n: 2, label: 'Plan', href: `#${ids}-s2` },
    { n: 3, label: 'Add-ons', href: `#${ids}-s3` },
    { n: 4, label: 'Building', href: `#${ids}-s4` },
    { n: 5, label: 'Review & start', href: `#${ids}-s5` },
  ];

  const cityLine = [form.city.trim(), [toStateCode(form.state), form.zip.trim()].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const addressLine = [form.bldgName.trim(), form.street.trim(), cityLine].filter(Boolean).join(' · ') || 'Fill in step 4 and it appears here.';
  const contactLine = [form.fullName.trim(), form.email.trim()].filter(Boolean).join(' · ') || 'Your name and email from step 1.';

  const input = (
    field: FieldId,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement>,
    className = '',
  ) => {
    const err = shown(field);
    const id = `${ids}-${field}`;
    return (
      <label className={`sc-field ${className}`} htmlFor={id}>
        {label}
        <input id={id} aria-invalid={err ? true : undefined} aria-describedby={err ? `${id}-err` : undefined}
          onBlur={() => touch(field)} {...props} />
        {err && <span id={`${id}-err`} className="sc-error" role="alert">{err}</span>}
      </label>
    );
  };

  const summaryLines = (
    <>
      <div className="sc-row"><span>{order.planName}</span><b>{dollars(order.planPrice)} {order.per}</b></div>
      {order.addOns.map(a => (
        <div key={a.id} className="sc-row addon"><span>+ {a.name}</span><b>{dollars(a.price)} {order.per}</b></div>
      ))}
      {order.addOns.length === 0 && <div className="sc-dim">No add-ons selected</div>}
      <div className="sc-dim">Postage and card fees pass through at cost</div>
    </>
  );

  const cta = (
    <button type="button" className="sc-cta" onClick={canRetryFinish ? () => { if (!inFlight.current) { inFlight.current = true; void finish().finally(() => { inFlight.current = false; }); } } : start}
      disabled={ctaDisabled} aria-busy={busy ? true : undefined}>
      {ctaLabel}
    </button>
  );

  return (
    <div className="sc">
      <header className="sc-header">
        <div className="sc-header-in">
          <a className="sc-logo" href="/">
            <img src="/onetwo-nav-logo.jpg" alt="" />
            <span>ONE <span>two</span></span>
          </a>
          <nav className="sc-nav" aria-label="Main">
            {NAV.map(n => <a key={n.label} href={n.href} aria-current={n.current ? 'page' : undefined}>{n.label}</a>)}
          </nav>
          <div className="sc-header-actions">
            {signedInAs
              ? <a className="sc-btn-outline" href="/login">Cancel</a>
              : <button type="button" className="sc-btn-outline" onClick={onLogIn}>Log in</button>}
            <button type="button" className="sc-menu-btn" aria-expanded={menuOpen} aria-controls={`${ids}-menu`} onClick={() => setMenuOpen(o => !o)}>Menu</button>
          </div>
        </div>
        <nav id={`${ids}-menu`} className={`sc-mobile-menu${menuOpen ? ' open' : ''}`} aria-label="Mobile">
          {NAV.map(n => <a key={n.label} href={n.href} aria-current={n.current ? 'page' : undefined}>{n.label}</a>)}
        </nav>
      </header>

      {/* Phones: the order summary, pinned to the top */}
      <div className="sc-bar" role="region" aria-label="Order summary">
        <button type="button" className="sc-bar-toggle" aria-expanded={summaryOpen} aria-controls={`${ids}-bar-lines`} onClick={() => setSummaryOpen(o => !o)}>
          <span>
            <b>{order.planName} · {dollars(order.total)} {order.per}</b>
            <small>{hasTrial ? `$0 today · ${days}-day free trial` : `${dueToday} today`}</small>
          </span>
          <span className="more">{summaryOpen ? 'Hide' : 'Details'}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </span>
        </button>
        <div id={`${ids}-bar-lines`} className="sc-bar-lines" hidden={!summaryOpen}>{summaryLines}</div>
      </div>

      <div className="sc-wrap">
        <div className="sc-intro">
          <div>
            <div className="sc-eyebrow">{hasTrial ? `Start your ${days}-day free trial` : 'Start today'}</div>
            <h1>Set up your building</h1>
            <p className="sc-lede">Your total updates<span className="wide"> on the right</span> as you choose. You&apos;ll enter your address once.</p>
          </div>
          <ol className="sc-steps" aria-label="Checkout steps">
            {steps.map(s => (
              <li key={s.n}><a href={s.href} aria-current={s.n === currentStep ? 'step' : undefined}>{s.n} · {s.label}</a></li>
            ))}
          </ol>
        </div>

        <div className="sc-cols">
          <main className="sc-main">

            {/* ── 1. Account ── */}
            <section className="sc-card" id={`${ids}-s1`} aria-labelledby={`${ids}-h1`}>
              <div className="sc-card-head">
                <h2 id={`${ids}-h1`}>1. {signedInAs ? 'Your account' : 'Create your account'}</h2>
                {!signedInAs && (
                  <span className="sc-note">Already have one? <button type="button" className="sc-link" onClick={onLogIn}>Log in</button></span>
                )}
              </div>
              <div className="sc-grid">
                {input('fullName', 'Your name', {
                  type: 'text', name: 'name', autoComplete: 'name', placeholder: 'First and last name', value: form.fullName,
                  onChange: e => { set('fullName', e.target.value); edit('fullName'); },
                }, signedInAs ? 'sc-span2' : '')}
                {!signedInAs && input('email', 'Email', {
                  type: 'email', name: 'email', autoComplete: 'email', placeholder: 'you@example.com', value: form.email,
                  onChange: e => { set('email', e.target.value); edit('email'); setExistingAccount(null); },
                })}

                {signedInAs ? (
                  <p className="sc-box sc-span2">
                    <span>You&apos;re signed in as <strong>{signedInAs}</strong>, so this building will be added to that account.</span>
                    <span><button type="button" className="sc-link" onClick={onSignOut}>Not you? Sign out and start fresh</button></span>
                  </p>
                ) : isExisting ? (
                  <div className="sc-box sc-span2">
                    <p className="sc-box-title" role="status">You already have a ONE two account with this email.</p>
                    <p>Enter that account&apos;s password and this building will be added to it. Your plan, add-ons and address stay as you set them.</p>
                    <label className="sc-field" htmlFor={`${ids}-password`}>
                      Your ONE two password
                      <input id={`${ids}-password`} type="password" name="current-password" autoComplete="current-password" value={password}
                        aria-invalid={existingAccount?.wrongPassword || !!shown('password') || undefined}
                        aria-describedby={existingAccount?.wrongPassword || shown('password') ? `${ids}-password-err` : undefined}
                        onChange={e => { setPassword(e.target.value); setExistingAccount(x => x && { ...x, wrongPassword: false }); }}
                        onBlur={() => touch('password')} />
                      {(existingAccount?.wrongPassword || shown('password')) && (
                        <span id={`${ids}-password-err`} className="sc-error" role="alert">
                          {existingAccount?.wrongPassword ? "That password doesn't match this account. Try again, or reset it." : shown('password')}
                        </span>
                      )}
                    </label>
                    <div className="sc-box-actions">
                      <a href="/reset-password" className="sc-link">Forgot password?</a>
                      <button type="button" className="sc-link" onClick={() => {
                        setExistingAccount(null); setPassword(''); set('email', '');
                        setTouched(t => ({ ...t, email: false, password: false }));
                        setTimeout(() => document.getElementById(`${ids}-email`)?.focus(), 0);
                      }}>Use a different email</button>
                    </div>
                  </div>
                ) : isBackendEnabled ? (
                  <div className="sc-field sc-span2">
                    <label htmlFor={`${ids}-password`}>Password</label>
                    <span className="sc-pw">
                      <input id={`${ids}-password`} type={showPassword ? 'text' : 'password'} name="new-password" autoComplete="new-password"
                        placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`} value={password}
                        aria-invalid={shown('password') ? true : undefined}
                        aria-describedby={`${ids}-password-rules${shown('password') ? ` ${ids}-password-err` : ''}`}
                        onChange={e => setPassword(e.target.value)} onBlur={() => touch('password')} />
                      <button type="button" aria-pressed={showPassword} onClick={() => setShowPassword(s => !s)}>{showPassword ? 'Hide' : 'Show'}<span className="sc-sr"> password</span></button>
                    </span>
                    {shown('password') && <span id={`${ids}-password-err`} className="sc-error" role="alert">{shown('password')}</span>}
                    <PasswordRules password={password} id={`${ids}-password-rules`} />
                  </div>
                ) : null}
              </div>
              {!signedInAs && !isExisting && (
                <p className="sc-note">This is your login. We also use it as the billing contact, so you won&apos;t type it again.</p>
              )}
            </section>

            {/* ── 2. Plan ── */}
            <section className="sc-card" id={`${ids}-s2`} aria-labelledby={`${ids}-h2`} style={{ gap: 18 }}>
              <div className="sc-card-head center">
                <h2 id={`${ids}-h2`}>2. Pick by what your building has</h2>
                <div className="sc-seg" role="group" aria-label="Billing period">
                  {(['monthly', 'annual'] as BillingInterval[]).map(p => (
                    <button key={p} type="button" aria-pressed={form.interval === p} onClick={() => set('interval', p)}>
                      {p === 'monthly' ? 'Monthly' : 'Annual, two months free'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sc-plans">
                {TIERS.map(t => {
                  const on = form.tier === t.id;
                  return (
                    <button key={t.id} type="button" className="sc-plan" aria-pressed={on} onClick={() => set('tier', t.id)}>
                      <span className="sc-plan-top">
                        <span className="sc-plan-name">{t.name}</span>
                        {on && <span className="sc-pill">Selected</span>}
                      </span>
                      <span className="sc-plan-blurb">{PLAN_BLURBS[t.id]}</span>
                      <span className="sc-plan-price">{dollars(form.interval === 'annual' ? t.annual : t.monthly)}<span className="sc-per"> {order.per}</span></span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ── 3. Add-ons ── */}
            <section className="sc-card" id={`${ids}-s3`} aria-labelledby={`${ids}-h3`}>
              <div className="sc-card-head">
                <h2 id={`${ids}-h3`}>3. Add-ons</h2>
                <span className="sc-note">Priced for <strong>{order.planName}</strong>{hasTrial ? ' · billed after your trial' : ''}</span>
              </div>
              {ADDONS.map(a => {
                const on = form.addOns.includes(a.id);
                return (
                  <button key={a.id} type="button" className="sc-addon" aria-pressed={on} onClick={() => toggleAddOn(a.id)}>
                    <span className="sc-check" aria-hidden="true">{on && <Tick />}</span>
                    <span className="sc-addon-body">
                      <span className="sc-addon-name">{a.name}</span>
                      <span className="sc-addon-blurb">{a.description}</span>
                    </span>
                    <span className="sc-addon-price">+{dollars(getAddOnPrice(a, form.tier, form.interval))} {order.per}</span>
                  </button>
                );
              })}
            </section>

            {/* ── 4. Building and billing address ── */}
            <section className="sc-card" id={`${ids}-s4`} aria-labelledby={`${ids}-h4`}>
              <h2 id={`${ids}-h4`}>4. Your building &amp; billing address</h2>
              <div className="sc-grid">
                {input('bldgName', 'Association name', {
                  type: 'text', name: 'organization', autoComplete: 'organization', placeholder: 'e.g. 1700 Example St Condominium', value: form.bldgName,
                  onChange: e => { set('bldgName', e.target.value); edit('bldgName'); },
                }, 'sc-span2')}
                {input('street', 'Street address', {
                  type: 'text', name: 'address-line1', autoComplete: 'address-line1', placeholder: 'Street address', value: form.street,
                  onChange: e => { set('street', e.target.value); edit('street'); },
                }, 'sc-span2')}
                {input('city', 'City', {
                  type: 'text', name: 'address-level2', autoComplete: 'address-level2', placeholder: 'Washington', value: form.city,
                  onChange: e => { set('city', e.target.value); edit('city'); },
                })}
                <div className="sc-grid sc-pair" style={{ gap: 12 }}>
                  {input('state', 'State', {
                    type: 'text', name: 'address-level1', autoComplete: 'address-level1', placeholder: 'DC', value: form.state,
                    onChange: e => { set('state', e.target.value); edit('state'); },
                  })}
                  {input('zip', 'ZIP', {
                    type: 'text', name: 'postal-code', autoComplete: 'postal-code', inputMode: 'numeric', placeholder: '20009', value: form.zip, maxLength: 10,
                    onChange: e => { set('zip', e.target.value); edit('zip'); },
                  })}
                </div>
              </div>
              <p className="sc-note">We use this address for billing, so the payment step won&apos;t ask for it again.</p>
            </section>
          </main>

          <aside className="sc-aside" aria-label="Order summary and payment">
            {/* Desktop: the order summary */}
            <section className="sc-summary" aria-labelledby={`${ids}-hs`}>
              <h2 id={`${ids}-hs`}>Your plan</h2>
              {summaryLines}
              <div className="sc-rule" />
              <div className="sc-due"><span>Due today</span><b>{dueToday}</b></div>
              <div className="sc-then" aria-live="polite">
                {hasTrial
                  ? <>Then <strong>{dollars(order.total)} {order.per}</strong> after your {days}-day trial, starting {startDate}. Cancel any time; your records export with you.</>
                  : <>Then <strong>{dollars(order.total)} {order.per}</strong> at each renewal. Cancel any time; your records export with you.</>}
              </div>
            </section>

            {/* ── 5. Payment ── */}
            <section className="sc-card sc-pay" id={`${ids}-s5`} aria-labelledby={`${ids}-h5`}>
              <h2 id={`${ids}-h5`}><span className="sc-step5">5. </span>Payment method</h2>

              {isBackendEnabled ? (
                <>
                  {payment.status === 'waiting' && (
                    <p className="sc-placeholder">Card and bank fields appear here once your name, email and building address are filled in. We pass those along, so you won&apos;t be asked for them again.</p>
                  )}
                  {payment.status === 'loading' && <p className="sc-placeholder" role="status">Loading secure payment fields…</p>}
                  {payment.status === 'unconfigured' && (
                    <p className="sc-alert" role="alert">Payments are not set up on this site yet. Please contact hello@getonetwo.com to start your trial.</p>
                  )}
                  {/* Chargebee mounts its iframe here; React leaves the inside alone */}
                  <div ref={payment.containerRef} className="sc-fields" hidden={payment.status === 'waiting' || payment.status === 'unconfigured'} />
                  {payment.cleared && <p className="sc-notice" role="status">{payment.cleared}</p>}
                  {(payError || payment.error) && (
                    <p className="sc-alert" role="alert">{payError || payment.error}</p>
                  )}
                </>
              ) : (
                <p className="sc-placeholder">Demo mode: no payment is taken.</p>
              )}

              <div className="sc-contact">
                <Tick color="#0D1B2E" size={18} />
                <div>
                  <div className="t">Billing contact &amp; address from steps 1 and 4</div>
                  <div className="d">{contactLine}</div>
                  <div className="d">{addressLine}</div>
                </div>
              </div>

              <div className="sc-consent">
                <ConsentBoxes idPrefix={`${ids}-consent`} value={form.consent} onChange={c => set('consent', c)} />
              </div>

              {cta}
              {waitingOn && !busy && <p className="sc-missing" role="status">{waitingOn}</p>}
              <p className="sc-fine">{hasTrial ? "You won't be charged today. " : ''}Payments processed securely by Chargebee.</p>
            </section>
          </aside>
        </div>
      </div>

      {/* Phones: the button, pinned to the bottom */}
      <div className="sc-bottom">
        <div className="sc-bottom-in">
          <div className="sc-bottom-row">
            <b>Due today {dueToday}</b>
            <span>{hasTrial ? `Then ${dollars(order.total)} ${order.per} from ${startDate}` : `Then ${dollars(order.total)} ${order.per}`}</span>
          </div>
          {cta}
          <p className="sc-fine">{waitingOn && !busy ? waitingOn : `${hasTrial ? 'No charge today · ' : ''}Cancel any time · Secured by Chargebee`}</p>
        </div>
      </div>

      {(provisioningStatus || finished.current) && (
        <div className="sc-overlay" role="status" aria-live="assertive">
          <div className="sc-spinner" aria-hidden="true" />
          <p>{provisioningStatus || 'Setting up your building…'}</p>
        </div>
      )}
    </div>
  );
}
