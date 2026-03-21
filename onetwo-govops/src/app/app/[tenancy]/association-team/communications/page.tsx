import { createServerSupabase } from '@/lib/supabase/server'
import { resolveTenantId } from '@/lib/resolve-tenant'
import { redirect } from 'next/navigation'
import { TeamCommunications } from '@/components/association-team/communications/TeamCommunications'
import type { TeamChannel } from '@/types/association-team'

const DEFAULT_CHANNELS = [
  { slug: 'general', name: '# General', channel_type: 'group', restricted_to_role: null, description: 'General team discussion' },
  { slug: 'maintenance', name: '# Maintenance', channel_type: 'group', restricted_to_role: null, description: 'Maintenance coordination and updates' },
  { slug: 'board-only', name: '🔒 Board Only', channel_type: 'group', restricted_to_role: 'board_member', description: 'Private board member discussions' },
]

export default async function CommunicationsPage({
  params,
}: {
  params: Promise<{ tenancy: string }>
}) {
  const { tenancy: tenancySlug } = await params
  const supabase = await createServerSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const tenantId = await resolveTenantId(supabase, tenancySlug)
  if (!tenantId) redirect('/unauthorized')

  // Get current user's tenant_users record
  const { data: tenantUser } = await (supabase as any)
    .from('tenant_users')
    .select('id, role, name')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .single()

  if (!tenantUser || tenantUser.role === 'resident') redirect('/unauthorized')

  // Seed default channels if none exist
  const { data: existingChannels } = await (supabase as any)
    .from('team_channels')
    .select('id')
    .eq('tenant_id', tenantId)
    .limit(1)

  if (!existingChannels || existingChannels.length === 0) {
    for (const ch of DEFAULT_CHANNELS) {
      await (supabase as any)
        .from('team_channels')
        .insert({
          tenant_id: tenantId,
          slug: ch.slug,
          name: ch.name,
          channel_type: ch.channel_type,
          restricted_to_role: ch.restricted_to_role,
          description: ch.description,
        })
    }
  }

  // Fetch channels (RLS filters by role automatically)
  const { data: channels } = await (supabase as any)
    .from('team_channels')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })

  return (
    <TeamCommunications
      channels={(channels as TeamChannel[]) || []}
      tenantId={tenantId}
      currentUser={{
        tenantUserId: tenantUser.id,
        authUserId: user.id,
        name: tenantUser.name || user.email?.split('@')[0] || 'User',
        role: tenantUser.role,
      }}
    />
  )
}
