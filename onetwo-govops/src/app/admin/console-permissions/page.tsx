import { createServerSupabase } from '@/lib/supabase/server'
import { ConsolePermissionsClient } from './console-permissions-client'

export default async function ConsolePermissionsPage() {
  const supabase = await createServerSupabase()

  const { data: modules } = await supabase
    .from('admin_console_modules')
    .select('*')
    .order('sort_order')

  const { data: roles } = await supabase
    .from('admin_console_roles')
    .select('*')

  const { data: permissions } = await supabase
    .from('admin_console_permissions')
    .select('*')

  return (
    <ConsolePermissionsClient
      modules={modules || []}
      roles={roles || []}
      permissions={permissions || []}
    />
  )
}
