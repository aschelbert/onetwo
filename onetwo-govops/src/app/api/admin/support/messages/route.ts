import { withAdminAuth, logAudit } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  return withAdminAuth(async (db) => {
    const threadId = req.nextUrl.searchParams.get('thread_id')
    if (!threadId) return NextResponse.json({ error: 'Missing thread_id' }, { status: 400 })

    const { data, error } = await db
      .from('support_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  })
}

export async function POST(req: NextRequest) {
  return withAdminAuth(async (db, userId, email) => {
    const body = await req.json()
    const { thread_id, body: messageBody, attachment_url } = body

    if (!thread_id || (!messageBody && !attachment_url)) {
      return NextResponse.json({ error: 'Missing thread_id or body' }, { status: 400 })
    }

    const { data, error } = await db
      .from('support_messages')
      .insert({
        thread_id,
        sender_type: 'admin',
        sender_id: userId,
        sender_name: email.split('@')[0],
        body: messageBody || '',
        attachment_url: attachment_url || null,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Update thread's updated_at
    await db.from('support_threads').update({ updated_at: new Date().toISOString() }).eq('id', thread_id)

    await logAudit(email, 'support_message.sent', 'support_message', data.id, `Admin replied to thread ${thread_id}`)
    return NextResponse.json(data, { status: 201 })
  })
}
