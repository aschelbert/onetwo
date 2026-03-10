import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Resolves a tenancy slug to the `tenants.id` uuid.
 * The Next.js layout queries the admin `tenancies` table (slug-based),
 * but the association-team tables (property_logs, pm_scorecard_*, association_tasks)
 * reference the older `tenants` table via `tenant_id`.
 */
export async function resolveTenantId(
  supabase: SupabaseClient,
  slug: string
): Promise<string | null> {
  // Cast to any — the `tenants` table exists in the remote DB but not in the generated types
  const { data } = await (supabase as any)
    .from('tenants')
    .select('id')
    .eq('subdomain', slug)
    .single()

  return data?.id ?? null
}

/**
 * Returns the supabase client cast to `any` for querying tables
 * that exist in the remote DB but not in the generated Database type
 * (property_logs, pm_scorecard_entries, pm_scorecard_reviews, association_tasks, tenant_users).
 */
export function untypedFrom(supabase: SupabaseClient) {
  return (table: string) => (supabase as any).from(table)
}
