import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * GET /api/auth/bootstrap — Check if setup is needed (no platform_users yet)
 * POST /api/auth/bootstrap — Create the first platform admin user
 */

export async function GET() {
  try {
    const admin = getSupabaseAdmin()
    const { count } = await admin
      .from('platform_users')
      .select('*', { count: 'exact', head: true })

    return NextResponse.json({ needs_setup: !count || count === 0 })
  } catch {
    return NextResponse.json({ needs_setup: false })
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = getSupabaseAdmin()

    // Safety check: only allow if no platform_users exist yet
    const { count } = await admin
      .from('platform_users')
      .select('*', { count: 'exact', head: true })

    if (count && count > 0) {
      return NextResponse.json(
        { error: 'Platform already has admin users. Use the normal login flow.' },
        { status: 403 }
      )
    }

    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    // Create user via admin API (auto-confirmed, no email verification)
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // The trigger `on_auth_user_created` → `handle_new_user` will automatically
    // insert into platform_users with platform_admin role (since it's the first user)

    return NextResponse.json({
      success: true,
      message: 'Platform admin created. You can now sign in.',
      user_id: data.user.id,
    })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
