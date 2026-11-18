/**
 * Product-email preference: news, tips and offers. Separate from account and
 * building emails, which are always sent. Stored as consent records; the
 * newest answer for an address is the one that counts.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface LinkStatus {
  /** Whose link this is, partly hidden: d***@example.com */
  emailHint: string;
  subscribed: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a string looks like an unsubscribe link token at all. */
export function isUnsubscribeToken(token: string | null | undefined): token is string {
  return !!token && UUID.test(token);
}

function toStatus(data: unknown): LinkStatus | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as { email_hint?: unknown; subscribed?: unknown };
  return { emailHint: typeof d.email_hint === 'string' ? d.email_hint : '', subscribed: d.subscribed === true };
}

/** What an unsubscribe link refers to. `null` when the link is not recognised; throws when it could not be checked. */
export async function linkStatus(sb: SupabaseClient, token: string): Promise<LinkStatus | null> {
  const { data, error } = await sb.rpc('marketing_by_token', { p_token: token });
  if (error) throw new Error(error.message);
  return toStatus(data);
}

/** Unsubscribe (or resubscribe) the address behind a link. `null` when the link is not recognised. */
export async function setByLink(sb: SupabaseClient, token: string, subscribed: boolean): Promise<LinkStatus | null> {
  const { data, error } = await sb.rpc('set_marketing_by_token', { p_token: token, p_opt_in: subscribed });
  if (error) throw new Error(error.message);
  return toStatus(data);
}

/** The signed-in person's current answer. `null` when it could not be read. */
export async function myPreference(sb: SupabaseClient): Promise<boolean | null> {
  const { data, error } = await sb.rpc('my_marketing_preference');
  if (error) return null;
  return data === true;
}

/** Change the signed-in person's answer. Returns whether it was saved. */
export async function setMyPreference(sb: SupabaseClient, subscribed: boolean): Promise<boolean> {
  const { error } = await sb.rpc('set_my_marketing_preference', { p_opt_in: subscribed });
  return !error;
}
