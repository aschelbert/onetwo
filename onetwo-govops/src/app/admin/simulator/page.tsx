import { createServerSupabase } from '@/lib/supabase/server'
import { SimulatorClient } from './simulator-client'

export default async function SimulatorPage() {
  const supabase = await createServerSupabase()
  const [{ data: plans }, { data: roles }] = await Promise.all([
    supabase.from('subscription_plans').select('id, name, color').order('sort_order'),
    supabase.from('user_roles').select('id, name, icon').order('sort_order'),
  ])
  return <SimulatorClient plans={plans || []} roles={roles || []} />
}
