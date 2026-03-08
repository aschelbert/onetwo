import { withAdminAuth, logAudit } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function PUT(req: NextRequest) {
  return withAdminAuth(async (db, _uid, email) => {
    const { user_id, admin_console_role_id } = await req.json()

    if (!user_id || !admin_console_role_id) {
      return NextResponse.json({ error: 'Missing user_id or admin_console_role_id' }, { status: 400 })
    }

    const { data, error } = await db
      .from('platform_users')
      .update({ admin_console_role_id })
      .eq('id', user_id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logAudit(email, 'rbac.permission_changed', 'platform_user', user_id, `Changed console role to ${admin_console_role_id}`)
    return NextResponse.json(data)
  })
}
