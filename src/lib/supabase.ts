// src/lib/supabase.ts
// Supabase client — singleton shared across the app.
// Env vars are set in .env.local and injected by Vite.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase env vars missing. Running in demo mode with local state only.\n' +
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local to enable backend.'
  );
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const isBackendEnabled = !!supabase;

/** Log a Supabase error, suppressing "table not found" (PGRST205) noise. */
export function logDbError(label: string, error: unknown): void {
  if (error && typeof error === 'object' && (error as any).code === 'PGRST205') return;
  console.error(label, error);
}

