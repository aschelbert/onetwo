import { createServerSupabase } from '@/lib/supabase/server'
import { RolesClient } from './roles-client'

export default async function RolesPage() {
  const supabase = await createServerSupabase()
  const { data: roles } = await supabase
    .from('user_roles')
    .select('*, plan_role_availability(plan_id, subscription_plans:plan_id(name, color))')
    .order('sort_order')
  return <RolesClient roles={roles || []} />
}
