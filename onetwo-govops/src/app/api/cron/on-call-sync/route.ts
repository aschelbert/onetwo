import { syncOnCallRequests } from '@/lib/on-call'
import { NextRequest, NextResponse } from 'next/server'

// Runs on a schedule (vercel.json) so a building that adds On Call gets its
// support thread without anyone having to open the console first. Vercel
// sends "Authorization: Bearer $CRON_SECRET" when that variable is set; with
// no secret configured the route refuses to run rather than be open to all.
export const dynamic = 'force-dynamic'

// One line per run, so the outcome can be read from the runtime logs.
const log = (outcome: string, detail = '') => console.log(`[on-call-sync] ${outcome}${detail ? ` ${detail}` : ''}`)

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    log('refused', 'CRON_SECRET is not set')
    return NextResponse.json({ error: 'CRON_SECRET is not set' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    log('refused', 'the request did not carry the expected secret')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { opened, errors, rows } = await syncOnCallRequests()
    const waiting = rows.filter(r => r.status === 'requested').length
    log('ok', `buildings=${rows.length} waiting=${waiting} opened=${opened} errors=${errors.length}`)
    errors.forEach(e => console.error(`[on-call-sync] error ${e}`))
    return NextResponse.json({ opened, errors, buildings: rows.length })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`[on-call-sync] failed ${message}`)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
