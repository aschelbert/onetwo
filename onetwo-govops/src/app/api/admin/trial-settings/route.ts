import { withAdminAuth, logAudit } from '@/lib/auth'
import { tenantSupabaseAdmin } from '@/lib/supabase/tenant-admin'
import { NextRequest, NextResponse } from 'next/server'

// The free trial length lives on Chargebee's plan prices. The tenant (HOA)
// project's chargebee-trial-settings function holds the Chargebee key, so
// this route asks it to read and write. Nothing is saved here unless
// Chargebee has accepted the change first.

type TrialSettings = Record<string, unknown> & { error?: string }

async function callTrialFunction(body: Record<string, unknown>): Promise<{ status: number; data: TrialSettings }> {
  try {
    const { data, error } = await tenantSupabaseAdmin.functions.invoke('chargebee-trial-settings', { body })
    if (!error) return { status: 200, data: data as TrialSettings }
    // A non-2xx reply still carries the function's explanation and Chargebee's current values.
    const res = (error as { context?: Response }).context
    let detail: TrialSettings | null = null
    try { detail = res ? await res.json() : null } catch { /* not JSON */ }
    return {
      status: res?.status && res.status >= 400 ? res.status : 502,
      data: { ...(detail || {}), error: detail?.error || error.message || 'Could not reach Chargebee' },
    }
  } catch (e) {
    return { status: 502, data: { error: e instanceof Error ? e.message : 'Could not reach Chargebee' } }
  }
}

export async function GET() {
  return withAdminAuth(async () => {
    const { status, data } = await callTrialFunction({ action: 'get' })
    return NextResponse.json(data, { status })
  })
}

export async function PUT(req: NextRequest) {
  return withAdminAuth(async (db, _uid, email) => {
    const { trial_days } = await req.json()
    if (!Number.isInteger(trial_days) || trial_days < 0 || trial_days > 365) {
      return NextResponse.json({ error: 'trial_days must be a whole number from 0 to 365' }, { status: 400 })
    }
    // Sets every Chargebee plan price, then the tenant project's platform_settings.
    const { status, data } = await callTrialFunction({ action: 'set', days: trial_days, actor: email })
    if (status !== 200) return NextResponse.json(data, { status })

    const { error } = await db
      .from('platform_settings')
      .update({ trial_days, updated_at: new Date().toISOString(), updated_by: email })
      .eq('id', 'default')
    if (error) {
      return NextResponse.json({ ...data, error: `Chargebee is updated, but saving the setting here failed: ${error.message}` }, { status: 500 })
    }
    await logAudit(email, 'platform.trial_days_updated', 'platform_settings', 'default', `Free trial set to ${trial_days} days in Chargebee and platform settings`)
    return NextResponse.json(data)
  })
}
