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

/** Whether a string looks like a link token (unsubscribe or confirmation) at all. */
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

/**
 * The signed-in person's product-email setting: on, off, or waiting for them
 * to press Confirm in the email we sent. `null` when it could not be read.
 */
export type MyPreference = 'on' | 'off' | 'pending';

export async function myPreference(sb: SupabaseClient): Promise<MyPreference | null> {
  const { data, error } = await sb.rpc('my_marketing_preference');
  if (error) return null;
  if (data === true) return 'on';
  const pending = await sb.rpc('my_marketing_pending');
  return !pending.error && pending.data === true ? 'pending' : 'off';
}

/**
 * Change the signed-in person's answer. Turning it off takes effect at once;
 * turning it on sends a confirmation email and is `pending` until they press
 * Confirm (unless they were already subscribed). `null` when it did not save.
 */
export async function setMyPreference(sb: SupabaseClient, subscribed: boolean): Promise<MyPreference | null> {
  const { data, error } = await sb.rpc('set_my_marketing_preference', { p_opt_in: subscribed });
  if (error) return null;
  if (!subscribed) return 'off';
  return data === true ? 'on' : 'pending';
}

/** What a confirmation link refers to. `used`: it was already pressed. */
export interface ConfirmStatus {
  emailHint: string;
  subscribed: boolean;
  state: 'pending' | 'used' | 'expired';
}

function toConfirm(data: unknown): ConfirmStatus | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as { email_hint?: unknown; subscribed?: unknown; state?: unknown };
  const state = d.state === 'used' || d.state === 'expired' ? d.state : 'pending';
  return { emailHint: typeof d.email_hint === 'string' ? d.email_hint : '', subscribed: d.subscribed === true, state };
}

/** Look at a confirmation link without acting on it. `null` when it is not recognised; throws when it could not be checked. */
export async function confirmationStatus(sb: SupabaseClient, token: string): Promise<ConfirmStatus | null> {
  const { data, error } = await sb.rpc('marketing_confirmation_by_token', { p_token: token });
  if (error) throw new Error(error.message);
  return toConfirm(data);
}

/** Press Confirm: subscribes the address behind the link. `null` when it is not recognised. */
export async function confirmByLink(sb: SupabaseClient, token: string): Promise<ConfirmStatus | null> {
  const { data, error } = await sb.rpc('confirm_marketing_by_token', { p_token: token });
  if (error) throw new Error(error.message);
  return toConfirm(data);
}
