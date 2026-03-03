import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Service role client — bypasses RLS. Server-only!
// Lazy-initialized to avoid build errors when env var is not set.
let _admin: SupabaseClient<Database> | null = null

export function getSupabaseAdmin() {
  if (!_admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
    _admin = createClient<Database>(url, key)
  }
  return _admin
}

// Convenience alias — calls getSupabaseAdmin() under the hood
export const supabaseAdmin = new Proxy({} as SupabaseClient<Database>, {
  get(_, prop) {
    return (getSupabaseAdmin() as never)[prop as string]
  },
})
