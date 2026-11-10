/**
 * Online payments, shared between Setup › Get paid online and Funds ›
 * Online payments: the building's payment rules (what owners can pay here,
 * bank payments, who covers card fees, paused), the Stripe Connect call
 * through the `connect-stripe-account` edge function, and the fee estimate
 * a board sees before connecting. Rules are kept in the browser until the
 * backend has a home for them, under one key so both screens agree.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useFinancialStore } from '@/store/useFinancialStore';

export const PREFS_KEY = 'onetwo-ux2-payments-prefs';
export interface Prefs { passFees: boolean; dues: boolean; assessments: boolean; fees: boolean; ach: boolean; paused: boolean }
export const DEFAULT_PREFS: Prefs = { passFees: false, dues: true, assessments: true, fees: true, ach: true, paused: false };
export const readPrefs = (): Prefs => { try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { return DEFAULT_PREFS; } };

/** The rules as state, written back to the browser on every change. */
export function usePaymentPrefs() {
  const [prefs, setPrefs] = useState<Prefs>(() => readPrefs());
  useEffect(() => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private window */ } }, [prefs]);
  const set = (k: keyof Prefs, v: boolean) => setPrefs(p => ({ ...p, [k]: v }));
  return { prefs, set };
}

/** Where the building stands with Stripe: nothing yet, an account awaiting Stripe's verification, or ready to take payments. */
export type PaymentsStatus = 'off' | 'pending' | 'on';
export const paymentsStatus = (stripeConnectId: string | null | undefined, complete: boolean): PaymentsStatus =>
  complete && stripeConnectId ? 'on' : stripeConnectId ? 'pending' : 'off';

/** Stripe's published rates, as quoted to the board. Cards 2.9% + 30¢; bank (ACH) 0.8% capped at $5. */
export const cardFee = (amount: number) => amount * 0.029 + 0.3;
export const bankFee = (amount: number) => Math.min(5, amount * 0.008);
/** A month of fees for the building, if every assessed unit paid its dues one way. */
export function monthlyFeeEstimate(units: { monthlyFee: number }[]) {
  const assessed = units.filter(u => u.monthlyFee > 0);
  return {
    dues: assessed.reduce((t, u) => t + u.monthlyFee, 0),
    byCard: Math.round(assessed.reduce((t, u) => t + cardFee(u.monthlyFee), 0)),
    byBank: Math.round(assessed.reduce((t, u) => t + bankFee(u.monthlyFee), 0)),
  };
}

export interface ConnectResult { stripeConnectId?: string; onboardingComplete?: boolean; onboardingUrl?: string | null; chargesEnabled?: boolean; detailsSubmitted?: boolean; invalidAccount?: boolean }

/**
 * Create the building's Stripe account, or ask Stripe where an existing one
 * stands. Stripe's hosted onboarding returns to `returnUrl` (this page), so
 * the caller re-checks on arrival. Writes the account id and completion to
 * the financial store; the edge function keeps the database in step.
 */
export async function connectStripe(action: 'create' | 'check_status', buildingName: string, returnUrl = window.location.href): Promise<ConnectResult> {
  if (!supabase) throw new Error('Connecting Stripe needs the live backend; the demo building shows the flow only.');
  const { data, error } = await supabase.functions.invoke('connect-stripe-account', { body: action === 'create' ? { action, buildingName, returnUrl } : { action, returnUrl } });
  if (error) throw error;
  const r = (data ?? {}) as ConnectResult & { error?: string };
  if (r.error) throw new Error(r.error);
  const store = useFinancialStore.getState();
  if (r.stripeConnectId) store.setStripeConnect(r.stripeConnectId);
  if (r.onboardingComplete) store.setStripeOnboarding(true);
  return r;
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-ux2-navy' : 'bg-ux2-line-strong'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}
