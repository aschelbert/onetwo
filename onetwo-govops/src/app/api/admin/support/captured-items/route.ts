import { withAdminAuth, logAudit } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  return withAdminAuth(async (db) => {
    const threadId = req.nextUrl.searchParams.get('thread_id')
    if (!threadId) return NextResponse.json({ error: 'Missing thread_id' }, { status: 400 })

    const { data, error } = await db
      .from('captured_items')
      .select('*, feedback_items(id, title, status)')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  })
}

export async function POST(req: NextRequest) {
  return withAdminAuth(async (db, _uid, email) => {
    const body = await req.json()
    const { thread_id, type, title, feedback_id } = body

    if (!thread_id || !type || !title) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data, error } = await db
      .from('captured_items')
      .insert({ thread_id, type, title, feedback_id: feedback_id || null })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAudit(email, 'captured_item.created', 'captured_item', data.id, `Captured ${type}: ${title}`)
    return NextResponse.json(data, { status: 201 })
  })
}

export async function PUT(req: NextRequest) {
  return withAdminAuth(async (db, _uid, email) => {
    const body = await req.json()
    const { id, feedback_id } = body

    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { data, error } = await db
      .from('captured_items')
      .update({ feedback_id: feedback_id || null })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAudit(email, 'captured_item.linked', 'captured_item', id, `Linked to feedback: ${feedback_id || 'unlinked'}`)
    return NextResponse.json(data)
  })
}
