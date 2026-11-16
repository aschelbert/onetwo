import { withAdminAuth, logAudit } from '@/lib/auth'
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
