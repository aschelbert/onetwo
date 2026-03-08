import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const ADMIN_HOST = 'admin.getonetwo.com'

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || ''
  const isAdminDomain = hostname.startsWith('admin.')
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // --- admin.getonetwo.com routing ---
  if (isAdminDomain) {
    const path = request.nextUrl.pathname

    // Rewrite root of admin subdomain to /admin/dashboard
    if (path === '/' || path === '') {
      const url = request.nextUrl.clone()
      url.pathname = '/admin/dashboard'
      if (!user) {
        const loginUrl = new URL('/auth/login', request.url)
        loginUrl.searchParams.set('redirect', '/admin/dashboard')
        return NextResponse.redirect(loginUrl)
      }
      // Check admin role
      const { data: profile } = await supabase
        .from('platform_users')
        .select('platform_role')
        .eq('id', user.id)
        .single()
      if (profile?.platform_role !== 'platform_admin') {
        return NextResponse.redirect(new URL('/unauthorized', request.url))
      }
      return NextResponse.rewrite(url, { request, headers: supabaseResponse.headers })
    }

    // Protect /admin routes on admin subdomain
    if (path.startsWith('/admin')) {
      if (!user) {
        const loginUrl = new URL('/auth/login', request.url)
        loginUrl.searchParams.set('redirect', path)
        return NextResponse.redirect(loginUrl)
      }
      const { data: profile } = await supabase
        .from('platform_users')
        .select('platform_role')
        .eq('id', user.id)
        .single()
      if (profile?.platform_role !== 'platform_admin') {
        return NextResponse.redirect(new URL('/unauthorized', request.url))
      }
    }

    return supabaseResponse
  }

  // --- Main domain (getonetwo.com / www.getonetwo.com) routing ---

  // Protect /admin routes (direct URL access on main domain)
  if (request.nextUrl.pathname.startsWith('/admin')) {
    if (!user) {
      const loginUrl = new URL('/auth/login', request.url)
      loginUrl.searchParams.set('redirect', request.nextUrl.pathname)
      return NextResponse.redirect(loginUrl)
    }
    const { data: profile } = await supabase
      .from('platform_users')
      .select('platform_role')
      .eq('id', user.id)
      .single()
    if (profile?.platform_role !== 'platform_admin') {
      return NextResponse.redirect(new URL('/unauthorized', request.url))
    }
  }

  // Protect /app routes (tenant app)
  if (request.nextUrl.pathname.startsWith('/app')) {
    if (!user) {
      const loginUrl = new URL('/auth/login', request.url)
      loginUrl.searchParams.set('redirect', request.nextUrl.pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  // Everything else on main domain passes through (landing page, /login, etc.)
  return supabaseResponse
}

export const config = {
  matcher: [
    '/',
    '/admin/:path*',
    '/app/:path*',
    '/auth/:path*',
    '/login',
  ],
}
