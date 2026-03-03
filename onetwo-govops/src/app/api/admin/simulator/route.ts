import { withAdminAuth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  return withAdminAuth(async (db) => {
    const plan = req.nextUrl.searchParams.get('plan') || 'compliance-pro'
    const role = req.nextUrl.searchParams.get('role') || 'BOARD_MEMBER'
    const { data, error } = await db.rpc('resolve_permissions', {
      p_plan_id: plan,
      p_role_id: role,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  })
}
