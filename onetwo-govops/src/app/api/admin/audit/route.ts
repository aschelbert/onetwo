import { withAdminAuth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '@/types/database'

export async function GET(req: NextRequest) {
  return withAdminAuth(async (db) => {
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50')
    const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0')
    const action = req.nextUrl.searchParams.get('action')
    const entityType = req.nextUrl.searchParams.get('entity_type')

    let query = db
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (action) query = query.eq('action', action as Database['public']['Enums']['audit_action'])
    if (entityType) query = query.eq('entity_type', entityType)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  })
}
