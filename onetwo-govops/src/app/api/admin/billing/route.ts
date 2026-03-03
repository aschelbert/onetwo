import { withAdminAuth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  return withAdminAuth(async (db) => {
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50')
    const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0')
    const type = req.nextUrl.searchParams.get('type')
    const tenancy = req.nextUrl.searchParams.get('tenancy')

    let query = db
      .from('webhook_events')
      .select('*, tenancies(name)')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (type) query = query.eq('type', type)
    if (tenancy) query = query.eq('tenancy_id', tenancy)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  })
}
