// src/lib/supabase.ts
// Supabase client — singleton shared across the app.
// Env vars are set in .env.local and injected by Vite.

import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/react';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase env vars missing. Running in demo mode with local state only.\n' +
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local to enable backend.'
  );
}

// ── Active tenant ID ──────────────────────────────────────────────
// Set once by TenantProvider after tenant is resolved.
// Stores use this to auto-persist without callers passing tenantId.
let _activeTenantId: string | null = null;

/** Header that tells the database which building a request is for. */
export const TENANT_HEADER = 'x-tenant-id';

/**
 * Adds the active building to database requests. The database serves one
 * building per request (current_tenant_id() and the `tenant_scope` policies),
 * so someone who belongs to two buildings only ever gets the one they are in.
 * Only /rest/v1/ is tagged: edge functions, auth and storage have their own
 * CORS allow-lists and would reject the extra header.
 */
export function withTenantHeader(input: RequestInfo | URL, init?: RequestInit): RequestInit | undefined {
  if (!_activeTenantId) return init;
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes('/rest/v1/')) return init;
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.set(TENANT_HEADER, _activeTenantId);
  return { ...init, headers };
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      global: { fetch: (input, init) => fetch(input, withTenantHeader(input, init)) },
    })
  : null;

export const isBackendEnabled = !!supabase;

export function setActiveTenantId(id: string | null) { _activeTenantId = id; }
export function getActiveTenantId(): string | null { return _activeTenantId; }

/** Recent errors ring buffer for sync status indicator (P1-2). */
interface DbError { label: string; error: unknown; ts: number }
const _recentErrors: DbError[] = [];
const MAX_RECENT_ERRORS = 20;

/** Log a Supabase error, suppressing "table not found" (PGRST205) noise. */
export function logDbError(label: string, error: unknown): void {
  if (error && typeof error === 'object' && (error as any).code === 'PGRST205') return;
  console.error(label, error);
  _recentErrors.push({ label, error, ts: Date.now() });
  if (_recentErrors.length > MAX_RECENT_ERRORS) _recentErrors.shift();
  Sentry.captureException(error, { tags: { dbError: label } });
}

/** Return the last N logged DB errors (for sync status UI). */
export function getRecentDbErrors(): readonly DbError[] {
  return _recentErrors;
}

