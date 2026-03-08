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
          const urlStr = typeof url === 'string' ? url : url instanceof Request ? url.url : ''

          // If already recovering, block all auth token requests immediately
          if (isRecovering && urlStr.includes('/auth/v1/token')) {
            return new Response(JSON.stringify({ error: 'session_cleared' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            })
          }

          const response = await fetch(url, options)

          // Catch refresh token failures OR rate limiting on token endpoint
          if (urlStr.includes('/auth/v1/token') && (response.status === 400 || response.status === 429)) {
            if (!isRecovering) {
              if (response.status === 429) {
                // Already rate limited — stop immediately
                isRecovering = true
                clearSupabaseCookies()
                window.location.href = '/auth/login'
              } else {
                try {
                  const cloned = response.clone()
                  const body = await cloned.json()
                  if (body?.error_description?.includes('Refresh Token Not Found') ||
                      body?.msg?.includes('Refresh Token Not Found')) {
                    isRecovering = true
                    clearSupabaseCookies()
                    window.location.href = '/auth/login'
                  }
                } catch {
                  // ignore parse errors
                }
              }
            }
          }

          return response
        },
      },
    }
  )
}
