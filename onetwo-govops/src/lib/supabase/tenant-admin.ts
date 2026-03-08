import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Service role client for the TENANT Supabase project (eaalfhrrytnmtzqjruxg).
// Bypasses RLS. Server-only! Lazy-initialized.
let _tenantAdmin: SupabaseClient | null = null

export function getTenantSupabaseAdmin() {
  if (!_tenantAdmin) {
    const url = process.env.TENANT_SUPABASE_URL
    const key = process.env.TENANT_SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Missing TENANT_SUPABASE_URL or TENANT_SUPABASE_SERVICE_ROLE_KEY')
    _tenantAdmin = createClient(url, key)
  }
  return _tenantAdmin
}

// Convenience proxy (same pattern as admin.ts)
export const tenantSupabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getTenantSupabaseAdmin() as never)[prop as string]
  },
})
