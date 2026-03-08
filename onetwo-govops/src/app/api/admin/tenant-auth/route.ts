import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth'
import { getTenantSupabaseAdmin } from '@/lib/supabase/tenant-admin'

export async function POST(req: Request) {
  return withAdminAuth(async (adminDb, _userId, userEmail) => {
    try {
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
      const { data: userList, error: listErr } = await tenantAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 50,
      })

      if (listErr) {
        console.error('Failed to list tenant users:', listErr.message)
        return NextResponse.json({ error: 'Failed to query tenant users: ' + listErr.message }, { status: 500 })
      }

      let tenantUser = userList?.users?.find(u => u.email === userEmail)

      // 2b. If not found, create the user
      if (!tenantUser) {
        const { data: created, error: createErr } = await tenantAdmin.auth.admin.createUser({
          email: userEmail,
          email_confirm: true,
          user_metadata: { full_name: 'Platform Admin' },
        })
        if (createErr || !created.user) {
          console.error('Failed to create tenant user:', createErr)
          return NextResponse.json({ error: 'Failed to create tenant user: ' + createErr?.message }, { status: 500 })
        }
        tenantUser = created.user
      }

      // 2c. Ensure platform_admins row exists
      await tenantAdmin
        .from('platform_admins')
        .upsert(
          { user_id: tenantUser.id, email: userEmail, name: 'Platform Admin', role: 'admin' },
          { onConflict: 'user_id' }
        )

      // 2d. Generate magic link and return the hashed token
      //     The tenant app will call verifyOtp() client-side with this token,
      //     creating the session directly in the browser.
      const { data: linkData, error: linkErr } = await tenantAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: userEmail,
      })

      if (linkErr || !linkData?.properties?.hashed_token) {
        console.error('Failed to generate link:', linkErr)
        return NextResponse.json({ error: 'Failed to generate link: ' + linkErr?.message }, { status: 500 })
      }

      return NextResponse.json({ token_hash: linkData.properties.hashed_token })
    } catch (err) {
      console.error('tenant-auth unexpected error:', err)
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Internal server error' },
        { status: 500 }
      )
    }
  })
}
