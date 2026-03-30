import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const ADMIN_HOST = 'admin.getonetwo.com'
const COOKIE_DOMAIN = process.env.NODE_ENV === 'production' ? '.getonetwo.com' : undefined

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
            supabaseResponse.cookies.set(name, value, { ...options, domain: COOKIE_DOMAIN }))
        },
      },
    }
  )

  // Detect tenant subdomains (e.g., 1302rstnw.getonetwo.com)
  const parts = hostname.split('.')
  const isTenantSubdomain = parts.length >= 3 && parts[0] !== 'www' && parts[0] !== 'admin'
  const tenantSlug = isTenantSubdomain ? parts[0] : null

  const { data: { user } } = await supabase.auth.getUser()

  // --- Tenant subdomain routing (e.g., slug.getonetwo.com) ---
  if (tenantSlug) {
    const path = request.nextUrl.pathname

    // Let auth, api, and static routes pass through
    if (path.startsWith('/auth') || path.startsWith('/api') || path.startsWith('/_next')) {
      return supabaseResponse
    }

    // Strip /app/{slug} prefix if present (from internal redirects/links) to avoid double-nesting
    const appPrefix = `/app/${tenantSlug}`
    if (path.startsWith(appPrefix)) {
      const cleanPath = path.slice(appPrefix.length) || '/'
      return NextResponse.redirect(new URL(cleanPath, request.url))
    }

    // Also strip /app/onboarding/{slug} prefix
    const onboardingPrefix = `/app/onboarding/${tenantSlug}`
    if (path.startsWith(onboardingPrefix)) {
      const cleanPath = `/onboarding${path.slice(onboardingPrefix.length)}` || '/onboarding'
      return NextResponse.redirect(new URL(cleanPath, request.url))
    }

    // Require login
    if (!user) {
      const loginUrl = new URL('/auth/login', request.url)
      loginUrl.searchParams.set('redirect', path || '/')
      return NextResponse.redirect(loginUrl)
    }

    // Rewrite /onboarding paths to /app/onboarding/{slug}
    if (path.startsWith('/onboarding')) {
      const url = request.nextUrl.clone()
      url.pathname = `/app/onboarding/${tenantSlug}${path.slice('/onboarding'.length) || ''}`
      return NextResponse.rewrite(url, { request, headers: supabaseResponse.headers })
    }

    // Rewrite all other paths to /app/{slug}{path}
    const url = request.nextUrl.clone()
    url.pathname = path === '/' ? `/app/${tenantSlug}` : `/app/${tenantSlug}${path}`
    return NextResponse.rewrite(url, { request, headers: supabaseResponse.headers })
  }

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
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, icons, manifest
     */
    '/((?!_next/static|_next/image|favicon\\.ico|icons/|manifest\\.json).*)',
  ],
}
