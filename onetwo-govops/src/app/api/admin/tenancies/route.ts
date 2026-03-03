import { withAdminAuth, logAudit } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  return withAdminAuth(async (db) => {
    const { data, error } = await db
      .from('tenancies')
      .select('*, subscription_plans(name, color)')
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  })
}

export async function POST(req: NextRequest) {
  return withAdminAuth(async (db, _uid, email) => {
    const body = await req.json()
    const { data, error } = await db
      .from('tenancies')
      .insert(body)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAudit(email, 'tenancy.created', 'tenancy', data.id, `Created tenancy: ${data.name}`)
    return NextResponse.json(data, { status: 201 })
  })
}

export async function PUT(req: NextRequest) {
  return withAdminAuth(async (db, _uid, email) => {
    const body = await req.json()
    const { id, ...updates } = body
    const { data, error } = await db
      .from('tenancies')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAudit(email, 'tenancy.updated', 'tenancy', id, `Updated tenancy: ${data.name}`)
    return NextResponse.json(data)
  })
}

export async function DELETE(req: NextRequest) {
  return withAdminAuth(async (db, _uid, email) => {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    const { error } = await db.from('tenancies').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAudit(email, 'tenancy.deleted', 'tenancy', id, `Deleted tenancy: ${id}`)
    return NextResponse.json({ success: true })
  })
}
