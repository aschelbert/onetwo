import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function GET() {
  const supabase = await createServerSupabase()
  await supabase.auth.signOut()
  redirect('/auth/login')
}

export async function POST() {
  const supabase = await createServerSupabase()
  await supabase.auth.signOut()
  redirect('/auth/login')
}
