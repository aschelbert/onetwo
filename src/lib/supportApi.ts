/**
 * Support threads for the signed-in member's building.
 *
 * Threads are kept in the ONE two admin project, where a building's users
 * have no account. Requests go to the Admin Console's backend with the
 * member's own access token; it confirms they belong to the building and
 * returns only that building's threads.
 */
import { supabase } from '@/lib/supabase';

const BASE = ((import.meta.env.VITE_ADMIN_CONSOLE_URL as string | undefined) || 'https://admin.getonetwo.com').replace(/\/$/, '');

export interface SupportThread {
  id: string;
  tenancy_id: string;
  subject: string;
  status: string;
  priority: string;
  module: string;
  assignee_name: string | null;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface SupportMessage {
  id: string;
  thread_id: string;
  sender_type: string;
  sender_name: string;
  sender_role: string | null;
  body: string;
  attachment_url: string | null;
  created_at: string;
}

export interface SupportAttachment { type: string; data: string }

/** Images over this size are refused before upload. */
export const MAX_SUPPORT_ATTACHMENT_BYTES = 3 * 1024 * 1024;

/** True when there is a backend to ask (not the local demo build). */
export const supportAvailable = !!supabase;

async function call<T>(tenantId: string, action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error('Support messaging is not available in this build');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sign in again to use support messaging');
  const res = await fetch(`${BASE}/api/tenant-support`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ tenant_id: tenantId, action, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Support request failed (${res.status})`);
  return data as T;
}

/** Read a picked image as the base64 payload the backend expects. */
export async function toSupportAttachment(file: File): Promise<SupportAttachment> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
  return { type: file.type, data: btoa(binary) };
}

export async function listSupportThreads(tenantId: string): Promise<SupportThread[]> {
  return (await call<{ threads: SupportThread[] }>(tenantId, 'list')).threads;
}

export async function listSupportMessages(tenantId: string, threadId: string): Promise<SupportMessage[]> {
  return (await call<{ messages: SupportMessage[] }>(tenantId, 'messages', { thread_id: threadId })).messages;
}

export function createSupportThread(
  tenantId: string,
  input: { subject: string; module: string; priority: string; body: string; attachment?: SupportAttachment | null },
): Promise<{ thread: SupportThread; message: SupportMessage | null; attachmentError: string | null }> {
  return call(tenantId, 'create', input);
}

export function replyToSupportThread(
  tenantId: string,
  threadId: string,
  input: { body: string; attachment?: SupportAttachment | null },
): Promise<{ message: SupportMessage; attachmentError: string | null }> {
  return call(tenantId, 'reply', { thread_id: threadId, ...input });
}
