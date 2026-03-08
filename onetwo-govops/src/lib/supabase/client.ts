import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

let isRecovering = false

function clearSupabaseCookies() {
  document.cookie.split(';').forEach(c => {
    const name = c.trim().split('=')[0]
    if (name.startsWith('sb-')) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.getonetwo.com`
    }
  })
}

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        domain: process.env.NODE_ENV === 'production' ? '.getonetwo.com' : undefined,
      },
      global: {
        fetch: async (url, options) => {
          const response = await fetch(url, options)

          // Intercept refresh token failures to prevent infinite retry loop
          const urlStr = typeof url === 'string' ? url : url instanceof Request ? url.url : ''
          if (urlStr.includes('/auth/v1/token') && response.status === 400 && !isRecovering) {
            try {
              const cloned = response.clone()
              const body = await cloned.json()
              if (body?.error_description?.includes('Refresh Token Not Found') ||
                  body?.msg?.includes('Refresh Token Not Found')) {
                isRecovering = true
                console.warn('[Auth] Invalid refresh token — clearing session')
                clearSupabaseCookies()
                window.location.href = '/auth/login'
              }
            } catch {
              // ignore parse errors
            }
          }

          return response
        },
      },
    }
  )
}
