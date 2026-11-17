import { withAdminAuth, logAudit } from '@/lib/auth'
import { assignOnCallAdvisor, syncOnCallRequests, unassignOnCallAdvisor } from '@/lib/on-call'
import { NextRequest, NextResponse } from 'next/server'

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export async function GET() {
  return withAdminAuth(async () => {
    try {
      return NextResponse.json(await syncOnCallRequests())
    } catch (e) {
      return NextResponse.json({ error: message(e) }, { status: 500 })
    }
  })
}

/** Assign a console user as a building's On Call advisor. Omit console_user_id to assign yourself. */
export async function POST(req: NextRequest) {
  return withAdminAuth(async (_db, userId, email) => {
    try {
      const { tenant_id, console_user_id } = await req.json()
      if (!tenant_id) return NextResponse.json({ error: 'Missing tenant_id' }, { status: 400 })
      const result = await assignOnCallAdvisor(tenant_id, console_user_id || userId, email)
      await logAudit(email, 'tenancy.updated', 'tenancy', tenant_id, `On Call advisor for ${result.building}: ${result.advisorName}`)
      return NextResponse.json(result)
    } catch (e) {
      return NextResponse.json({ error: message(e) }, { status: 500 })
    }
  })
}

export async function DELETE(req: NextRequest) {
  return withAdminAuth(async (_db, _uid, email) => {
    try {
      const tenantId = req.nextUrl.searchParams.get('tenant_id')
      if (!tenantId) return NextResponse.json({ error: 'Missing tenant_id' }, { status: 400 })
      await unassignOnCallAdvisor(tenantId)
      await logAudit(email, 'tenancy.updated', 'tenancy', tenantId, 'On Call advisor removed')
      return NextResponse.json({ success: true })
    } catch (e) {
      return NextResponse.json({ error: message(e) }, { status: 500 })
    }
  })
}
