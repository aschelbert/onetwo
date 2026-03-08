import { withAdminAuth, logAudit } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  return withAdminAuth(async (db) => {
    const { data, error } = await db
      .from('feedback_items')
      .select('*, feedback_source_threads(thread_id), feedback_assocs(tenancy_id)')
      .order('updated_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  })
}

export async function POST(req: NextRequest) {
  return withAdminAuth(async (db, _uid, email) => {
    const body = await req.json()
    const { title, theme, type, status, impact, quarter, description } = body

    if (!title || !theme || !type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data, error } = await db
      .from('feedback_items')
      .insert({ title, theme, type, status: status || 'Backlog', impact, quarter, description })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAudit(email, 'feedback.created', 'feedback_item', data.id, `Created feedback: ${title}`)
    return NextResponse.json(data, { status: 201 })
  })
}

export async function PUT(req: NextRequest) {
  return withAdminAuth(async (db, _uid, email) => {
    const body = await req.json()
    const { id, ...updates } = body

    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { data, error } = await db
      .from('feedback_items')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAudit(email, 'feedback.updated', 'feedback_item', id, `Updated feedback: ${data.title}`, updates)
    return NextResponse.json(data)
  })
}
