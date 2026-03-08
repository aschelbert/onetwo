import { createServerSupabase } from '@/lib/supabase/server'
import { ConsoleUsersClient } from './console-users-client'

export default async function ConsoleUsersPage() {
  const supabase = await createServerSupabase()

  const { data: users } = await supabase
    .from('platform_users')
    .select('id, email, display_name, platform_role, admin_console_role_id, created_at')
    .order('created_at', { ascending: true })

  const { data: roles } = await supabase
    .from('admin_console_roles')
    .select('id, name, description')

  return (
    <ConsoleUsersClient
      users={users || []}
      roles={roles || []}
    />
  )
}
