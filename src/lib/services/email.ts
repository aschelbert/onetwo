/**
 * Calling the app's email functions (Mailjet behind them) and telling the
 * truth about what happened: how many emails went out, and if none, why.
 * A function without Mailjet keys answers 200 with `success: false` and
 * "Email not configured"; that's reported as email not being set up, not as
 * sent.
 */
import { supabase } from '@/lib/supabase';

export interface EmailResult {
  /** Emails that went out. */
  sent: number;
  /** Why nothing (or not everything) went out, in plain words. */
  reason?: string;
}

export const EMAIL_NOT_SET_UP = "email isn't set up for this building yet";

export async function callEmailFunction(fn: string, body: Record<string, unknown>): Promise<EmailResult> {
  // Plain import.meta.env: Vite replaces exactly this at build time (a cast around import.meta hides it).
  const sbUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const sbKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!sbUrl || !sbKey || !supabase) return { sent: 0, reason: 'email runs on a live building' };
  try {
    const session = (await supabase.auth.getSession()).data.session;
    const res = await fetch(`${sbUrl}/functions/v1/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? sbKey}`, apikey: sbKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      if (res.status === 404) return { sent: 0, reason: `the ${fn} function isn't deployed` };
      const text = await res.text();
      let msg = text;
      try { msg = (JSON.parse(text) as { error?: string }).error ?? text; } catch { /* not JSON */ }
      return { sent: 0, reason: msg.slice(0, 120) || `the email service answered ${res.status}` };
    }
    const data = (await res.json()) as { success?: boolean; sent?: number; total?: number; error?: string; message?: string };
    if (data.success === false) return { sent: 0, reason: /not configured|credentials missing/i.test(data.error ?? '') ? EMAIL_NOT_SET_UP : (data.error ?? 'the email service refused it') };
    const sent = data.sent ?? 0;
    if (!sent) return { sent: 0, reason: data.message ? data.message.toLowerCase() : 'nobody had an email address on file' };
    if (data.total && sent < data.total) return { sent, reason: `${data.total - sent} of ${data.total} couldn't be delivered` };
    return { sent };
  } catch (e) {
    console.error(`${fn} error:`, e);
    return { sent: 0, reason: 'the email service could not be reached' };
  }
}
