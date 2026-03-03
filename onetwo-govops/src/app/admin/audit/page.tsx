import { createServerSupabase } from '@/lib/supabase/server'
import { AuditClient } from './audit-client'

export default async function AuditPage() {
  const supabase = await createServerSupabase()
  const { data: entries } = await supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)
  return <AuditClient entries={entries || []} />
}
