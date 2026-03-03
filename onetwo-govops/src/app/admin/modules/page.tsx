import { createServerSupabase } from '@/lib/supabase/server'
import { ModulesClient } from './modules-client'

export default async function ModulesPage() {
  const supabase = await createServerSupabase()
  const [{ data: modules }, { data: submodules }, { data: features }, { data: entitlements }, { data: rolePerms }, { data: plans }, { data: roles }] = await Promise.all([
    supabase.from('modules').select('*').order('sort_order'),
    supabase.from('submodules').select('*').order('sort_order'),
    supabase.from('features').select('*').order('sort_order'),
    supabase.from('entitlements').select('*'),
    supabase.from('role_permissions').select('*'),
    supabase.from('subscription_plans').select('id, name, color').order('sort_order'),
    supabase.from('user_roles').select('id, name, icon').order('sort_order'),
  ])
  return <ModulesClient modules={modules||[]} submodules={submodules||[]} features={features||[]} entitlements={entitlements||[]} rolePermissions={rolePerms||[]} plans={plans||[]} roles={roles||[]} />
}
