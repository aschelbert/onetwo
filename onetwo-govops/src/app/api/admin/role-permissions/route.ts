import { withAdminAuth, logAudit } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  return withAdminAuth(async (db) => {
    const { data, error } = await db
      .from('role_permissions')
      .select('*')
      .order('atom_type')
      .order('atom_id')
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
        .from('role_permissions')
        .update({ access_level: u.access_level })
        .eq('atom_type', u.atom_type)
        .eq('atom_id', u.atom_id)
        .eq('role_id', u.role_id)
    }
    await logAudit(email, 'rbac.permission_changed', 'role_permission', 'batch', `Updated ${updates.length} role permissions`)
    return NextResponse.json({ success: true, count: updates.length })
  })
}
