import { withAdminAuth, logAudit } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  return withAdminAuth(async (db) => {
    const { data, error } = await db
      .from('admin_console_permissions')
      .select('*')
      .order('module_id')
      .order('role_id')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  })
}

export async function PUT(req: NextRequest) {
  return withAdminAuth(async (db, _uid, email) => {
    const { updates } = await req.json()

    for (const u of updates) {
      await db
        .from('admin_console_permissions')
        .upsert(
          { module_id: u.module_id, role_id: u.role_id, access_level: u.access_level, updated_at: new Date().toISOString() },
          { onConflict: 'module_id,role_id' }
        )
    }

    await logAudit(email, 'rbac.permission_changed', 'admin_console_permission', 'batch', `Updated ${updates.length} console permissions`)
    return NextResponse.json({ success: true, count: updates.length })
  })
}
