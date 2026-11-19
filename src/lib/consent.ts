/**
 * Consent given on the signup, invitation and demo forms.
 *
 * Product emails need provable opt-in: a checkbox that is
 * unticked by default and separate from accepting the privacy policy. The
 * three answers are stored by `record_consent()` together with who, when and
 * from where, which the database fills in itself.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logDbError } from '@/lib/supabase';

/** Effective dates of the documents being agreed to (public/terms.html, public/privacy.html). Update when either changes. */
export const POLICY_VERSION = 'terms-2026-11-08/privacy-2026-11-11';

export interface Consent {
  terms: boolean;
  privacy: boolean;
  /** Product news and tips. Optional, and never pre-ticked. */
  marketing: boolean;
}

export const NO_CONSENT: Consent = { terms: false, privacy: false, marketing: false };

export type ConsentSource = 'signup' | 'add_building' | 'invitation' | 'demo';

/** What still has to be ticked before the form can go ahead, or null when nothing does. */
export function missingConsent(c: Consent): string | null {
  if (!c.terms && !c.privacy) return 'Please agree to the Terms of Service and the Privacy Policy to continue.';
  if (!c.terms) return 'Please agree to the Terms of Service to continue.';
  if (!c.privacy) return 'Please agree to the Privacy Policy to continue.';
  return null;
}

/**
 * Store what was ticked. Never throws: a failure to record must not lose a
 * signup, so it is logged (and reported to Sentry) for follow-up instead.
 */
export async function recordConsent(
  sb: SupabaseClient, source: ConsentSource, email: string, c: Consent,
): Promise<boolean> {
  try {
    const { error } = await sb.rpc('record_consent', {
      p_source: source, p_email: email.trim(), p_terms: c.terms, p_privacy: c.privacy,
      p_marketing: c.marketing, p_policy_version: POLICY_VERSION,
    });
    if (error) { logDbError('record_consent failed:', error); return false; }
    return true;
  } catch (err) {
    logDbError('record_consent failed:', err);
    return false;
  }
}
