import { withTenantAuth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const threadId = req.nextUrl.searchParams.get('thread_id')
  const tenancyId = req.nextUrl.searchParams.get('tenancy_id')

  if (!threadId || !tenancyId) {
    return NextResponse.json({ error: 'Missing thread_id or tenancy_id' }, { status: 400 })
  }

  return withTenantAuth(tenancyId, async (db, tId) => {
    // Verify thread belongs to this tenancy
    const { data: thread } = await db
      .from('support_threads')
      .select('id')
      .eq('id', threadId)
      .eq('tenancy_id', tId)
      .single()

    if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

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
  const body = await req.json()
  const { thread_id, tenancy_id, body: messageBody } = body

  if (!thread_id || !tenancy_id || !messageBody) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  return withTenantAuth(tenancy_id, async (db, tId, userId, userName, userRole) => {
    // Verify thread belongs to this tenancy
    const { data: thread } = await db
      .from('support_threads')
      .select('id')
      .eq('id', thread_id)
      .eq('tenancy_id', tId)
      .single()

    if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

    const { data, error } = await db
      .from('support_messages')
      .insert({
        thread_id,
        sender_type: 'tenant',
        sender_id: userId,
        sender_name: userName,
        sender_role: userRole,
        body: messageBody,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Update thread's updated_at
    await db.from('support_threads').update({ updated_at: new Date().toISOString() }).eq('id', thread_id)

    return NextResponse.json(data, { status: 201 })
  })
}
