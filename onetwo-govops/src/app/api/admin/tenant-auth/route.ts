import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth'
import { getTenantSupabaseAdmin } from '@/lib/supabase/tenant-admin'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  return withAdminAuth(async (adminDb, _userId, userEmail) => {
    const { slug } = await req.json()
    if (!slug) {
      return NextResponse.json({ error: 'Missing slug' }, { status: 400 })
    }

    // 1. Validate tenancy exists in admin DB
    const { data: tenancy, error: tenancyErr } = await adminDb
      .from('tenancies')
      .select('id, name')
      .eq('slug', slug)
      .single()

    if (tenancyErr || !tenancy) {
      return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })
    }

    // 2. Work with tenant Supabase project
    const tenantAdmin = getTenantSupabaseAdmin()

    // 2a. Check if admin's email exists as auth user in tenant project
    const { data: existingUsers } = await tenantAdmin.auth.admin.listUsers()
    let tenantUser = existingUsers?.users?.find(u => u.email === userEmail)

    // 2b. If not found, create the user
    if (!tenantUser) {
      const { data: created, error: createErr } = await tenantAdmin.auth.admin.createUser({
        email: userEmail,
        email_confirm: true,
        user_metadata: { full_name: 'Platform Admin' },
      })
      if (createErr || !created.user) {
        return NextResponse.json({ error: 'Failed to create tenant user: ' + createErr?.message }, { status: 500 })
      }
      tenantUser = created.user
    }

    // 2c. Ensure platform_admins row exists
    const { error: upsertErr } = await tenantAdmin
      .from('platform_admins')
      .upsert(
        { user_id: tenantUser.id, email: userEmail },
        { onConflict: 'user_id' }
      )

    if (upsertErr) {
      console.error('Failed to upsert platform_admins:', upsertErr)
      // Non-fatal — continue even if this fails
    }

    // 2d. Generate magic link to get a session
    const { data: linkData, error: linkErr } = await tenantAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: userEmail,
    })

    if (linkErr || !linkData?.properties?.hashed_token) {
      return NextResponse.json({ error: 'Failed to generate link: ' + linkErr?.message }, { status: 500 })
    }

    // 2e. Verify the OTP using an anon client to get session tokens
    const tenantAnonUrl = process.env.TENANT_SUPABASE_URL!
    const tenantAnonKey = process.env.TENANT_SUPABASE_ANON_KEY!
    const tenantAnon = createClient(tenantAnonUrl, tenantAnonKey)

    const { data: sessionData, error: verifyErr } = await tenantAnon.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    })

    if (verifyErr || !sessionData?.session) {
      return NextResponse.json({ error: 'Failed to verify OTP: ' + verifyErr?.message }, { status: 500 })
    }

    // 2f. Return session tokens
    return NextResponse.json({
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
    })
  })
}
