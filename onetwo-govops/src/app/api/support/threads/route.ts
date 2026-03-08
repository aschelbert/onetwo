import { withTenantAuth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const tenancyId = req.nextUrl.searchParams.get('tenancy_id')
  if (!tenancyId) return NextResponse.json({ error: 'Missing tenancy_id' }, { status: 400 })

  return withTenantAuth(tenancyId, async (db, tId) => {
    const { data, error } = await db
      .from('support_threads')
      .select('*')
      .eq('tenancy_id', tId)
      .order('updated_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { tenancy_id, subject, module, priority, message } = body

  if (!tenancy_id || !subject || !message) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  return withTenantAuth(tenancy_id, async (db, tId, userId, userName, userRole) => {
    // Create thread
    const { data: thread, error: threadError } = await db
      .from('support_threads')
      .insert({
        tenancy_id: tId,
        subject,
        module: module || '',
        priority: priority || 'medium',
        created_by_user_id: userId,
        created_by_name: userName,
      })
      .select()
      .single()

    if (threadError) return NextResponse.json({ error: threadError.message }, { status: 500 })

    // Create first message
    const { error: msgError } = await db
      .from('support_messages')
      .insert({
        thread_id: thread.id,
        sender_type: 'tenant',
        sender_id: userId,
        sender_name: userName,
        sender_role: userRole,
        body: message,
      })

    if (msgError) return NextResponse.json({ error: msgError.message }, { status: 500 })

    return NextResponse.json(thread, { status: 201 })
  })
}
