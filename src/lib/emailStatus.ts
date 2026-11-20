/**
 * Whether email from the app reaches someone.
 *
 * Our email provider adds its own Unsubscribe to every message. One click
 * stops everything we send to that address: notices, invoices, password
 * resets. A dead mailbox or a spam report does the same. The app keeps a
 * record of those addresses, shows it to the person and to the people who
 * run their building, and lets either of them turn email back on.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type EmailOffReason = 'unsubscribed' | 'hard_bounce' | 'invalid' | 'spam' | 'blocked';

export interface EmailOff {
  reason: EmailOffReason;
  /** ISO date-time email stopped. */
  since: string;
}

export interface MemberEmailOff extends EmailOff {
  email: string;
}

const REASONS: EmailOffReason[] = ['unsubscribed', 'hard_bounce', 'invalid', 'spam', 'blocked'];
const toReason = (r: unknown): EmailOffReason => (REASONS.includes(r as EmailOffReason) ? (r as EmailOffReason) : 'blocked');

/** Why email stopped, said to the person it stopped for. */
export function emailOffExplanation(reason: EmailOffReason): string {
  switch (reason) {
    case 'unsubscribed': return 'Unsubscribe was pressed in one of our emails. That stops every email from ONE two and your building, not only news.';
    case 'spam': return 'One of our emails was marked as spam, which stops every email from ONE two and your building.';
    case 'hard_bounce':
    case 'invalid': return 'Your mailbox turned away one of our emails, so we stopped sending. If the address is right, turn email back on.';
    default: return 'Our email service stopped delivering to your address.';
  }
}

/** The same, said to the board about a member. */
export function memberEmailOffLabel(reason: EmailOffReason): string {
  switch (reason) {
    case 'unsubscribed': return 'pressed Unsubscribe';
    case 'spam': return 'reported an email as spam';
    case 'hard_bounce':
    case 'invalid': return 'mailbox turned email away';
    default: return 'email is being blocked';
  }
}

/** The signed-in person's own address. `null` when email reaches them, or when that could not be read. */
export async function myEmailOff(sb: SupabaseClient): Promise<EmailOff | null> {
  // Any failure to read counts as "email reaches them": never claim it is off on a guess
  try {
    const { data, error } = await sb.rpc('my_email_suppression');
    if (error || !data || typeof data !== 'object') return null;
    const d = data as { reason?: unknown; since?: unknown };
    return { reason: toReason(d.reason), since: typeof d.since === 'string' ? d.since : '' };
  } catch {
    return null;
  }
}

/** Members of a building who are not being reached, for the people who run it. Empty for anyone else. */
export async function buildingEmailOff(sb: SupabaseClient, tenantId: string): Promise<MemberEmailOff[]> {
  try {
    const { data, error } = await sb.rpc('building_email_suppressions', { p_tenant_id: tenantId });
    if (error || !Array.isArray(data)) return [];
    return (data as { email?: unknown; reason?: unknown; since?: unknown }[])
      .filter(r => typeof r.email === 'string')
      .map(r => ({ email: (r.email as string).toLowerCase(), reason: toReason(r.reason), since: typeof r.since === 'string' ? r.since : '' }));
  } catch {
    return [];
  }
}

async function restore(sb: SupabaseClient, body: Record<string, unknown>): Promise<string | null> {
  let data: unknown = null;
  let error: unknown = null;
  try { ({ data, error } = await sb.functions.invoke('email-suppression', { body })); } catch (e) { error = e; }
  if (!error && (data as { success?: boolean } | null)?.success) return null;
  // A refusal comes back as a non-2xx with the reason in its body
  let message = (data as { error?: string } | null)?.error;
  const response = (error as { context?: Response } | null)?.context;
  if (!message && response && typeof response.json === 'function') {
    try { message = ((await response.json()) as { error?: string }).error; } catch { /* not JSON */ }
  }
  return message || 'That didn’t work. Try again in a moment.';
}

/** Turn email back on for the signed-in person. `null` when it worked, otherwise what to tell them. */
export function restoreMyEmail(sb: SupabaseClient): Promise<string | null> {
  return restore(sb, { action: 'restore-self' });
}

/** Turn email back on for a member of a building the caller runs. `null` when it worked, otherwise what to tell them. */
export function restoreMemberEmail(sb: SupabaseClient, tenantId: string, email: string): Promise<string | null> {
  return restore(sb, { action: 'restore-member', tenantId, email });
}
