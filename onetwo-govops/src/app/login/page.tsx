'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function CustomerLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'signup' | 'magic'>('login')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (mode === 'magic') {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?redirect=/app` },
      })
      setLoading(false)
      if (error) return setError(error.message)
      setMessage('Check your email for a login link.')
      return
    }

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?redirect=/app` },
      })
      setLoading(false)
      if (error) return setError(error.message)
      setMessage('Check your email to confirm your account.')
      return
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) return setError(error.message)
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <header className="border-b border-stone-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center">
          <Link href="/" className="flex items-center gap-2">
            <span className="font-serif text-2xl font-bold text-[#c42030]">ONE</span>
            <span className="font-serif text-2xl font-light text-stone-800">two</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-xl border border-stone-200 p-8">
            <h1 className="font-serif text-2xl font-bold text-stone-900 text-center">
              {mode === 'signup' ? 'Create Account' : 'Welcome Back'}
            </h1>
            <p className="text-stone-500 text-center mt-2 text-sm">
              {mode === 'signup'
                ? 'Create your account to get started'
                : 'Log in to your association portal'}
            </p>

            {message && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                {message}
              </div>
            )}

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c42030]/20 focus:border-[#c42030]"
                  placeholder="you@example.com"
                />
              </div>

              {mode !== 'magic' && (
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c42030]/20 focus:border-[#c42030]"
                    placeholder="••••••••"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#c42030] text-white py-2.5 rounded-lg font-medium hover:bg-[#a31b28] transition-colors disabled:opacity-50"
              >
                {loading ? 'Please wait...' : mode === 'signup' ? 'Create Account' : mode === 'magic' ? 'Send Magic Link' : 'Log In'}
              </button>
            </form>

            <div className="mt-6 space-y-3 text-center text-sm">
              {mode === 'login' && (
                <>
                  <button onClick={() => setMode('magic')} className="text-[#c42030] hover:underline">
                    Use magic link instead
                  </button>
                  <div className="text-stone-500">
                    Don&apos;t have an account?{' '}
                    <button onClick={() => setMode('signup')} className="text-[#c42030] hover:underline">
                      Sign up
                    </button>
                  </div>
                </>
              )}
              {mode === 'signup' && (
                <div className="text-stone-500">
                  Already have an account?{' '}
                  <button onClick={() => setMode('login')} className="text-[#c42030] hover:underline">
                    Log in
                  </button>
                </div>
              )}
              {mode === 'magic' && (
                <button onClick={() => setMode('login')} className="text-[#c42030] hover:underline">
                  Use password instead
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
