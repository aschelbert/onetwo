/**
 * The Chargebee Payment Component behind step 5 of the signup page.
 *
 * Chargebee renders the card and bank fields inside its own iframe, so card
 * details never touch this app. This hook owns everything around that iframe:
 *
 *   - asking our server for the payment intent the component needs, and for
 *     the trial length and totals the server will actually use;
 *   - mounting the component once there is a billing contact and address to
 *     give it, so it never asks for them again;
 *   - validating and confirming on our own button, and turning the
 *     component's callbacks into one awaited result.
 *
 * Changing what the component was given (the intent, or the contact and
 * address) remounts it, which clears anything typed into it. During a trial
 * the amount due today is always $0, so choosing a different plan or add-on
 * does not change the intent and leaves the fields alone.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AddOnId, BillingInterval, SubscriptionTier } from '@/lib/tiers';
import { supabase } from '@/lib/supabase';

export interface BillingContext {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  street: string;
  city: string;
  stateCode: string;
  zip: string;
}

export interface Quote {
  trialDays: number;
  totalCents: number;
  dueTodayCents: number;
}

export type PaymentStatus =
  /** Waiting for the contact and address before showing the fields. */
  | 'waiting'
  | 'loading'
  | 'ready'
  /** The publishable key or site name is not configured in this build. */
  | 'unconfigured'
  | 'error';

export type ConfirmResult =
  | { ok: true; paymentIntentId: string }
  | { ok: false; reason: 'invalid' | 'declined' | 'unavailable'; message: string };

// The slice of Chargebee.js this page uses
interface PaymentComponent {
  mount(target: HTMLElement): Promise<boolean>;
  update(options: Record<string, unknown>): void;
  validate(): Promise<boolean>;
  confirm(): Promise<void>;
  close(): void;
}
interface ChargebeeInstance {
  components(options: Record<string, unknown>): {
    create(type: 'payment', options: Record<string, unknown>, callbacks: Record<string, unknown>): PaymentComponent;
  };
}
interface ChargebeeGlobal {
  init(options: { site: string; publishableKey?: string }): ChargebeeInstance;
  getInstance?: () => ChargebeeInstance;
}

const SITE = (import.meta.env.VITE_CB_SITE || import.meta.env.VITE_CHARGEBEE_SITE || '') as string;
const PUBLISHABLE_KEY = (import.meta.env.VITE_CB_PUBLISHABLE_KEY || '') as string;

let instance: ChargebeeInstance | null = null;

/** Chargebee.js, initialised once with the publishable key. Null until the script has loaded. */
function chargebeeInstance(): ChargebeeInstance | null {
  if (instance) return instance;
  const cb = (window as unknown as { Chargebee?: ChargebeeGlobal }).Chargebee;
  if (!cb || !SITE || !PUBLISHABLE_KEY) return null;
  try {
    instance = cb.init({ site: SITE, publishableKey: PUBLISHABLE_KEY });
  } catch {
    // Already initialised elsewhere on this page
    try { instance = cb.getInstance?.() ?? null; } catch { instance = null; }
  }
  return instance;
}

async function waitForChargebee(timeoutMs = 8000): Promise<ChargebeeInstance | null> {
  const started = Date.now();
  for (;;) {
    const cb = chargebeeInstance();
    if (cb) return cb;
    if (Date.now() - started > timeoutMs) return null;
    await new Promise(r => setTimeout(r, 150));
  }
}

/** Brand colours and shape for the fields inside Chargebee's iframe. Custom fonts cannot be loaded there. */
const COMPONENT_STYLE = {
  theme: { appearance: 'light', accentColor: 'gray', grayColor: 'slate', radius: 'large', scaling: '100%' },
  variables: {
    defaultFontFamily: "'DM Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
    colorBackground: '#FFFFFF',
    colorSurface: '#FFFFFF',
    accent9: '#0D1B2E',
    accent10: '#16263C',
    accent11: '#0D1B2E',
    accent12: '#0D1B2E',
    accentContrast: '#FFFFFF',
    gray7: '#CBD3DD',
    gray8: '#8A95A5',
    gray11: '#3E4A5B',
    gray12: '#0D1B2E',
  },
};

const NEVER = 'never';
/** We already hold the contact and the address, so the component must not ask for either. */
const NO_ADDRESS_FIELDS = {
  firstName: NEVER, lastName: NEVER, phone: NEVER, email: NEVER, companyName: NEVER,
  addressLine1: NEVER, addressLine2: NEVER, addressLine3: NEVER, city: NEVER, state: NEVER,
  stateCode: NEVER, countryCode: NEVER, zip: NEVER,
};
const COMPONENT_FORM = {
  customer: { firstName: NEVER, lastName: NEVER, phone: NEVER, email: NEVER, companyName: NEVER },
  billingAddress: NO_ADDRESS_FIELDS,
  shippingAddress: NO_ADDRESS_FIELDS,
};

function componentContext(c: BillingContext) {
  return {
    customer: { firstName: c.firstName, lastName: c.lastName, email: c.email, companyName: c.company },
    billingAddress: {
      firstName: c.firstName, lastName: c.lastName, email: c.email, companyName: c.company,
      addressLine1: c.street, city: c.city, stateCode: c.stateCode, zip: c.zip, countryCode: 'US',
    },
  };
}

interface IntentAnswer {
  paymentIntent: { id: string; amount: number; status: string; expiresAt: number | null };
  trialDays: number;
  totalCents: number;
  dueTodayCents: number;
}

/** Ask the server for the intent that matches this order. It works the amount out itself. */
export async function requestIntent(
  order: { plan: SubscriptionTier; period: BillingInterval; addons: AddOnId[] },
  paymentIntentId: string | null,
): Promise<IntentAnswer> {
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const token = (await supabase?.auth.getSession())?.data.session?.access_token ?? anon;
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/checkout-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...order, ...(paymentIntentId ? { paymentIntentId } : {}) }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.paymentIntent?.id) throw new Error(data?.error || 'We could not start the payment step.');
  return data as IntentAnswer;
}

export function usePaymentFields(opts: {
  /** False in demo mode, where there is no payment step at all. */
  enabled: boolean;
  plan: SubscriptionTier;
  period: BillingInterval;
  addons: AddOnId[];
  /** The contact and address to hand Chargebee, or null while they are incomplete. */
  context: BillingContext | null;
}) {
  const { enabled, plan, period, context } = opts;
  const addonsKey = opts.addons.join(',');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const component = useRef<PaymentComponent | null>(null);
  /** What the mounted component was last given, to tell when it must be updated. */
  const mounted = useRef<{ intentId: string; amount: number; contextKey: string } | null>(null);
  const intent = useRef<IntentAnswer['paymentIntent'] | null>(null);
  const pending = useRef<((r: ConfirmResult) => void) | null>(null);

  const [status, setStatus] = useState<PaymentStatus>('waiting');
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [intentVersion, setIntentVersion] = useState(0);
  const [method, setMethod] = useState<string | null>(null);
  /** Set when a remount cleared fields the visitor may already have filled in. */
  const [cleared, setCleared] = useState<string | null>(null);

  const settle = useCallback((result: ConfirmResult) => {
    const resolve = pending.current;
    pending.current = null;
    resolve?.(result);
  }, []);

  // ── The intent for the current order ──
  const syncIntent = useCallback(async (): Promise<boolean> => {
    try {
      const answer = await requestIntent(
        { plan, period, addons: addonsKey ? (addonsKey.split(',') as AddOnId[]) : [] },
        intent.current?.id ?? null,
      );
      const changed = intent.current?.id !== answer.paymentIntent.id || intent.current?.amount !== answer.paymentIntent.amount;
      intent.current = answer.paymentIntent;
      setQuote({ trialDays: answer.trialDays, totalCents: answer.totalCents, dueTodayCents: answer.dueTodayCents });
      if (changed) setIntentVersion(v => v + 1);
      return changed;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not start the payment step.');
      setStatus(s => (s === 'ready' ? s : 'error'));
      return false;
    }
  }, [plan, period, addonsKey]);

  useEffect(() => {
    if (!enabled) return;
    // Wait for the selection to settle: every change is a server round trip
    const timer = setTimeout(() => { void syncIntent(); }, intent.current ? 400 : 0);
    return () => clearTimeout(timer);
  }, [enabled, syncIntent]);

  // ── Mounting, and remounting when what it was given changes ──
  const contextKey = context ? JSON.stringify(context) : '';
  useEffect(() => {
    if (!enabled) return;
    if (!SITE || !PUBLISHABLE_KEY) { setStatus('unconfigured'); return; }
    if (!context || !intent.current) { if (!component.current) setStatus('waiting'); return; }

    let cancelled = false;
    // Typing an address fires this on every keystroke; act once it pauses
    const timer = setTimeout(async () => {
      const current = intent.current;
      const el = containerRef.current;
      if (!current || !el || cancelled) return;
      const given = { intentId: current.id, amount: current.amount, contextKey };
      const was = mounted.current;
      if (was && was.intentId === given.intentId && was.amount === given.amount && was.contextKey === given.contextKey) return;

      if (component.current && was) {
        mounted.current = given;
        component.current.update({ paymentIntent: { id: current.id }, context: componentContext(context) });
        setCleared(was.intentId !== given.intentId || was.amount !== given.amount
          ? 'Your order changed, so the payment fields were reset. Please enter your payment details again.'
          : 'Your billing details changed, so the payment fields were reset. Please enter your payment details again.');
        return;
      }

      setStatus('loading');
      const cb = await waitForChargebee();
      if (cancelled) return;
      if (!cb) {
        setStatus('error');
        setError('The payment fields could not load. Check your connection, or turn off any content blocker for this page, and reload.');
        return;
      }
      try {
        const created = cb.components({ locale: 'en', style: COMPONENT_STYLE }).create('payment', {
          paymentIntent: { id: current.id },
          layout: { type: 'tab', showRadioButtons: false },
          // Only methods the site's gateway offers are shown, whatever is listed here
          paymentMethods: {
            allowed: ['card', 'direct_debit'],
            sortOrder: ['card', 'direct_debit'],
            options: { card: { defaultAddressSource: 'billingAddress' } },
          },
          form: COMPONENT_FORM,
          context: componentContext(context),
        }, {
          onPaymentMethodChange(m: string) {
            setMethod(m);
            setStatus('ready');
            setError(null);
          },
          onSuccess(paymentIntent: { id: string }) {
            settle({ ok: true, paymentIntentId: paymentIntent.id });
          },
          onError(err: { code?: string; message?: string }) {
            const message = err?.message || 'Your payment details could not be confirmed. Please check them and try again.';
            if (pending.current) settle({ ok: false, reason: 'declined', message });
            else setError(message);
            // The page shows the message itself, next to the fields
            return false;
          },
        });
        component.current = created;
        mounted.current = given;
        const ok = await created.mount(el);
        if (cancelled) return;
        if (!ok) {
          setStatus('error');
          setError('The payment fields could not load. Please reload the page.');
        }
        // 'ready' is set by onPaymentMethodChange, the first sign the fields are showing
      } catch (e) {
        if (cancelled) return;
        setStatus('error');
        setError(e instanceof Error ? e.message : 'The payment fields could not load. Please reload the page.');
      }
    }, component.current ? 900 : 300);

    return () => { cancelled = true; clearTimeout(timer); };
    // `context` is represented by contextKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, contextKey, intentVersion, settle]);

  useEffect(() => () => {
    try { component.current?.close(); } catch { /* already gone */ }
    component.current = null;
    mounted.current = null;
  }, []);

  /**
   * Validate the fields and authorise the payment method. Resolves once
   * Chargebee reports success or failure, including after a 3-D Secure or
   * bank step, which it runs in a window of its own.
   */
  const confirm = useCallback(async (): Promise<ConfirmResult> => {
    const pc = component.current;
    if (!pc || status !== 'ready') {
      return { ok: false, reason: 'unavailable', message: 'The payment fields are not ready yet. Please wait a moment and try again.' };
    }
    setCleared(null);
    setError(null);
    // An intent lives for under an hour. If this one ran out while the page
    // sat open, the server hands back a new one and the fields reset.
    if (await syncIntent()) {
      return { ok: false, reason: 'unavailable', message: 'Your payment session timed out, so the fields were reset. Please enter your payment details again.' };
    }
    let valid = false;
    try { valid = await pc.validate(); } catch { valid = false; }
    if (!valid) return { ok: false, reason: 'invalid', message: 'Check your payment details above.' };

    return await new Promise<ConfirmResult>(resolve => {
      pending.current = resolve;
      pc.confirm().catch((e: unknown) => {
        settle({
          ok: false,
          reason: 'declined',
          message: e instanceof Error && e.message ? e.message : 'Your payment details could not be confirmed. Please try again.',
        });
      });
    });
  }, [status, syncIntent, settle]);

  return { containerRef, status, error, quote, method, cleared, confirm, clearNotice: () => setCleared(null) };
}
