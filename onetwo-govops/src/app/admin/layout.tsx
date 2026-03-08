import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminShell } from '@/components/admin/admin-shell'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('platform_users')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <AdminShell
      user={user as unknown as Record<string, unknown>}
      profile={profile as unknown as Record<string, unknown>}
    >
      {children}
    </AdminShell>
  )
}
