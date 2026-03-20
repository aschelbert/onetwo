'use client'
import { useState, useEffect } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [mode, setMode] = useState<'login' | 'setup'>('login')
  const [setupDone, setSetupDone] = useState(false)
  const searchParams = useSearchParams()
  const router = useRouter()
  const redirect = searchParams.get('redirect') || '/admin/dashboard'

  // Check if this is a fresh install (no admin users yet)
  useEffect(() => {
    async function checkSetup() {
      try {
        const res = await fetch('/api/auth/bootstrap')
        const data = await res.json()
        if (data.needs_setup) setMode('setup')
      } catch {
        // Ignore — default to login mode
      }
    }
    checkSetup()
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    router.push(redirect)
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) { setError('Email and password are required'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    setLoading(true)
    setError('')
    setMessage('')

    const res = await fetch('/api/auth/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Setup failed')
      setLoading(false)
      return
    }

    // Account created — now sign in
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setMessage('Account created! Please sign in.')
      setMode('login')
      setSetupDone(true)
      setLoading(false)
      return
    }
    router.push(redirect)
  }

  async function handleMagicLink() {
    if (!email) { setError('Enter your email first'); return }
    setLoading(true)
    setError('')
    setMessage('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?redirect=${redirect}` }
    })
    if (error) { setError(error.message); setLoading(false); return }
    setMessage('Check your email for a login link!')
    setLoading(false)
  }

  const isSetup = mode === 'setup' && !setupDone

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
        <div className="flex items-center gap-2.5 mb-6">
          <Image src="/onetwo-logo.jpg" alt="ONE two" width={32} height={32} className="w-8 h-8 rounded-lg object-cover" />
          <div>
            <span className="font-serif text-lg font-bold">ONE two</span>
            <span className="block text-[0.65rem] text-gray-500 uppercase tracking-wider">Admin Console</span>
          </div>
        </div>

        {isSetup && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 text-sm text-amber-800">
            Welcome! Create your platform admin account to get started.
          </div>
        )}

        <form onSubmit={isSetup ? handleSetup : handleLogin}>
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-gray-900" required />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-gray-900" required minLength={6} />
          </div>
          {error && <div className="text-red-600 text-sm mb-4">{error}</div>}
          {message && <div className="text-green-600 text-sm mb-4">{message}</div>}
          <button type="submit" disabled={loading} className="w-full bg-gray-900 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-gray-800 disabled:opacity-50">
            {loading
              ? (isSetup ? 'Creating admin account...' : 'Signing in...')
              : (isSetup ? 'Create Admin Account' : 'Sign In')}
          </button>
        </form>

        {!isSetup && (
          <div className="mt-4 text-center">
            <button onClick={handleMagicLink} disabled={loading} className="text-sm text-gray-500 hover:text-gray-700 bg-transparent border-none cursor-pointer">
              Or sign in with magic link
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>
}
