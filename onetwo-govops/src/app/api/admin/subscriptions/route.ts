import { withAdminAuth, logAudit } from '@/lib/auth'
import { tenantSupabaseAdmin } from '@/lib/supabase/tenant-admin'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  return withAdminAuth(async (db) => {
    const { data, error } = await db
      .from('subscription_plans')
      .select('*, plan_role_availability(role_id)')
      .order('sort_order')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  })
}

export async function POST(req: NextRequest) {
  return withAdminAuth(async (db, _uid, email) => {
    const body = await req.json()
    const { roles, ...planData } = body
    const { data, error } = await db
      .from('subscription_plans')
      .insert(planData)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (roles?.length) {
      await db.from('plan_role_availability').insert(
        roles.map((role_id: string) => ({ plan_id: data.id, role_id }))
      )
    }
    await logAudit(email, 'plan.created', 'subscription', data.id, `Created plan: ${data.name}`)
    return NextResponse.json(data, { status: 201 })
  })
}

export async function PUT(req: NextRequest) {
  return withAdminAuth(async (db, _uid, email) => {
    const body = await req.json()
    const { id, roles, ...updates } = body
    const { data, error } = await db
      .from('subscription_plans')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (roles) {
      await db.from('plan_role_availability').delete().eq('plan_id', id)
      if (roles.length) {
        await db.from('plan_role_availability').insert(
          roles.map((role_id: string) => ({ plan_id: id, role_id }))
        )
      }
    }
    await logAudit(email, 'plan.updated', 'subscription', id, `Updated plan: ${data.name}`)
    return NextResponse.json(data)
  })
}

export async function PATCH(req: NextRequest) {
  return withAdminAuth(async (db, _uid, email) => {
    const { trial_days } = await req.json()
    if (typeof trial_days !== 'number' || trial_days < 0 || trial_days > 365) {
      return NextResponse.json({ error: 'trial_days must be 0-365' }, { status: 400 })
    }
    const updatePayload = { trial_days, updated_at: new Date().toISOString(), updated_by: email }
    const { error } = await db
      .from('platform_settings')
      .update(updatePayload)
      .eq('id', 'default')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // Sync to tenant (HOA) project so AuthPage and edge functions read the updated value
    await tenantSupabaseAdmin
      .from('platform_settings')
      .update(updatePayload)
      .eq('id', 'default')
    await logAudit(email, 'platform.trial_days_updated', 'platform_settings', 'default', `Trial days changed to ${trial_days}`)
    return NextResponse.json({ success: true })
  })
}

export async function DELETE(req: NextRequest) {
  return withAdminAuth(async (db, _uid, email) => {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    const { error } = await db.from('subscription_plans').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAudit(email, 'plan.archived', 'subscription', id, `Deleted plan: ${id}`)
    return NextResponse.json({ success: true })
  })
}
