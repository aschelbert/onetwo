import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase, isBackendEnabled } from '@/lib/supabase';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Two modes: (1) request reset (enter email), (2) set new password (from email link)
  const [mode, setMode] = useState<'request' | 'set'>('request');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // If URL has access_token or type=recovery, we're in set-password mode
    const hash = window.location.hash;
    if (hash.includes('type=recovery') || hash.includes('access_token')) {
      setMode('set');
      // Supabase client auto-detects the recovery token from the URL hash
    }
  }, []);

  const handleRequestReset = async () => {
    if (!email) { setError('Please enter your email address.'); return; }
    if (!isBackendEnabled || !supabase) { setError('Backend not configured.'); return; }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reset-password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ email }),
        }
      );

      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setMessage('Check your email for a password reset link. It may take a minute to arrive.');
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    }
    setLoading(false);
  };

  const handleSetPassword = async () => {
    if (!password) { setError('Please enter a new password.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (!isBackendEnabled || !supabase) { setError('Backend not configured.'); return; }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message);
      } else {
        setMessage('Password updated successfully! Redirecting to login...');
        setTimeout(() => navigate('/login'), 2000);
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-mist-100 via-white to-sage-50 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-ink-100 p-8">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <svg className="w-12 h-12" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="4" fill="#3D3D3D" />
              <rect x="13.5" y="7" width="5" height="18" rx="1" fill="white" />
              <rect x="7" y="13.5" width="18" height="5" rx="1" fill="white" />
            </svg>
          </div>

          {mode === 'request' ? (
            <>
              <h2 className="font-display text-xl font-bold text-ink-900 text-center mb-2">Reset Your Password</h2>
              <p className="text-sm text-ink-400 text-center mb-6">Enter your email and we'll send you a link to reset your password.</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-ink-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(''); }}
                    onKeyDown={e => e.key === 'Enter' && handleRequestReset()}
                    className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm"
                    placeholder="you@example.com"
                  />
                </div>

                {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
                {message && <p className="text-sm text-sage-700 bg-sage-50 border border-sage-200 rounded-lg px-3 py-2">{message}</p>}

                <button
                  onClick={handleRequestReset}
                  disabled={loading}
                  className="w-full py-3 bg-ink-900 text-white rounded-xl font-semibold text-sm hover:bg-ink-800 disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="font-display text-xl font-bold text-ink-900 text-center mb-2">Set New Password</h2>
              <p className="text-sm text-ink-400 text-center mb-6">Enter your new password below.</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-ink-700 mb-1">New Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(''); }}
                    className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm"
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-700 mb-1">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
                    onKeyDown={e => e.key === 'Enter' && handleSetPassword()}
                    className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm"
                    placeholder="••••••••"
                  />
                </div>

                {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
                {message && <p className="text-sm text-sage-700 bg-sage-50 border border-sage-200 rounded-lg px-3 py-2">{message}</p>}

                <button
                  onClick={handleSetPassword}
                  disabled={loading}
                  className="w-full py-3 bg-ink-900 text-white rounded-xl font-semibold text-sm hover:bg-ink-800 disabled:opacity-50"
                >
                  {loading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </>
          )}

          <div className="mt-6 text-center">
            <a onClick={() => navigate('/login')} className="text-sm text-ink-400 hover:text-ink-600 cursor-pointer">← Back to Sign In</a>
          </div>
        </div>
      </div>
    </div>
  );
}

