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

const _rawSupabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const isBackendEnabled = !!_rawSupabase;

// ── Demo mutation guard ─────────────────────────────────────────
// When running in a demo session (seed data, no real tenant),
// intercept .from() mutations and functions.invoke so nothing hits the DB.
// Reads (.select()) pass through unchanged.

let _demoGuardLogged = false;
const NOOP_RESULT = { data: null, error: null };

function _isDemoSession(): boolean {
  // Inline check to avoid circular import with demoGuard.ts (which imports getActiveTenantId)
  if (_activeTenantId) return false;
  try {
    const raw = localStorage.getItem('onetwo-auth');
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const uid: string | undefined = parsed?.state?.currentUser?.id;
    if (!uid) return false;
    return uid === 'user1' || uid.startsWith('user-');
  } catch { return false; }
}

const MUTATION_METHODS = new Set(['insert', 'update', 'upsert', 'delete']);

function wrapFrom(original: typeof _rawSupabase extends null ? never : NonNullable<typeof _rawSupabase>['from']) {
  return function proxyFrom(...args: Parameters<typeof original>) {
    const builder = original.apply(_rawSupabase, args);
    if (!_isDemoSession()) return builder;

    if (!_demoGuardLogged) {
      console.debug('[demo-guard] Mutations blocked for demo session');
      _demoGuardLogged = true;
    }

    return new Proxy(builder, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && MUTATION_METHODS.has(prop)) {
          return () => Promise.resolve(NOOP_RESULT);
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  };
}

function wrapFunctionsInvoke(original: Function) {
  return function proxyInvoke(...args: any[]) {
    if (_isDemoSession()) {
      if (!_demoGuardLogged) {
        console.debug('[demo-guard] Mutations blocked for demo session');
        _demoGuardLogged = true;
      }
      return Promise.resolve(NOOP_RESULT);
    }
    return original.apply(_rawSupabase!.functions, args);
  };
}

// Apply guards if the client exists
if (_rawSupabase) {
  (_rawSupabase as any).from = wrapFrom(_rawSupabase.from.bind(_rawSupabase));
  (_rawSupabase as any).functions.invoke = wrapFunctionsInvoke(_rawSupabase.functions.invoke.bind(_rawSupabase.functions));
}

export const supabase = _rawSupabase;

// ── Active tenant ID ──────────────────────────────────────────────
// Set once by TenantProvider after tenant is resolved.
// Stores use this to auto-persist without callers passing tenantId.
let _activeTenantId: string | null = null;
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

