import { syncOnCallRequests } from '@/lib/on-call'
import { NextRequest, NextResponse } from 'next/server'

// Runs on a schedule (vercel.json) so a building that adds On Call gets its
// support thread without anyone having to open the console first. Vercel
// sends "Authorization: Bearer $CRON_SECRET" when that variable is set; with
// no secret configured the route refuses to run rather than be open to all.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not set' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { opened, errors, rows } = await syncOnCallRequests()
    return NextResponse.json({ opened, errors, buildings: rows.length })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
