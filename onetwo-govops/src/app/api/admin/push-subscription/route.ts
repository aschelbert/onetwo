import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth'

export async function POST(req: NextRequest) {
  return withAdminAuth(async (db, userId) => {
    const { endpoint, p256dh, auth_key } = await req.json()

    if (!endpoint || !p256dh || !auth_key) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { error } = await db
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          endpoint,
          p256dh,
          auth_key,
          user_agent: req.headers.get('user-agent') || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,endpoint' }
      )

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  })
}

export async function DELETE(req: NextRequest) {
  return withAdminAuth(async (db, userId) => {
    const { endpoint } = await req.json()

    if (!endpoint) {
      return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })
    }

    await db
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', endpoint)

    return NextResponse.json({ ok: true })
  })
}
