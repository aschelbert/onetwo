import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase, isBackendEnabled } from '@/lib/supabase';
import { isUnsubscribeToken, confirmationStatus, confirmByLink, type ConfirmStatus } from '@/lib/marketingPrefs';

type View =
  | { kind: 'loading' }
  | { kind: 'unknown' }                    // no token, or one we do not recognise
  | { kind: 'failed' }                     // could not reach the server
  | { kind: 'ready'; status: ConfirmStatus; justConfirmed: boolean };

/**
 * Where the link in a "please confirm" email leads (double opt-in for product
 * emails). No sign-in: the token in the link is the proof. Opening the page
 * changes nothing (mail scanners open links); the Confirm button does.
 */
export default function ConfirmEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('t');
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isUnsubscribeToken(token) || !isBackendEnabled || !supabase) { setView({ kind: 'unknown' }); return; }
      try {
        const status = await confirmationStatus(supabase, token);
        if (!cancelled) setView(status ? { kind: 'ready', status, justConfirmed: false } : { kind: 'unknown' });
      } catch {
        if (!cancelled) setView({ kind: 'failed' });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const confirm = async () => {
    if (!isUnsubscribeToken(token) || !supabase) return;
    setBusy(true);
    try {
      const status = await confirmByLink(supabase, token);
      setView(status ? { kind: 'ready', status, justConfirmed: true } : { kind: 'unknown' });
    } catch {
      setView({ kind: 'failed' });
    }
    setBusy(false);
  };

  const primary = 'w-full py-3 bg-ink-900 text-white rounded-xl font-semibold text-sm hover:bg-ink-800 disabled:opacity-50';
  const secondary = 'w-full py-3 border border-ink-200 text-ink-700 rounded-xl font-semibold text-sm hover:bg-ink-50 disabled:opacity-50';
  const note = 'Emails about your account and building, such as invoices, notices and password resets, are not affected.';
  const hint = (s: ConfirmStatus) => <span className="font-semibold">{s.emailHint}</span>;

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-ink-50 via-white to-mist-50 flex items-center justify-center overflow-y-auto py-8">
      <div className="w-full max-w-md mx-4">
        <div className="bg-white rounded-2xl shadow-xl border border-ink-100 p-8 text-center">
          <div className="flex items-center justify-center mb-6">
            <img src="/onetwo-wordmark-dark.jpg" alt="ONE two" className="h-14 object-contain rounded-lg" />
          </div>

          {view.kind === 'loading' && <p role="status" className="text-sm text-ink-500">Checking your link…</p>}

          {view.kind === 'unknown' && (
            <>
              <h1 className="font-display text-xl font-bold text-ink-900 mb-2">We don&apos;t recognise this link</h1>
              <p className="text-sm text-ink-600 mb-6">It may be incomplete. Use the Confirm button in the most recent email we sent you, or sign in and turn on product emails under Account, Notifications.</p>
              <a href="/login" className={`${secondary} block`}>Sign in</a>
            </>
          )}

          {view.kind === 'failed' && (
            <>
              <h1 className="font-display text-xl font-bold text-ink-900 mb-2">We couldn&apos;t reach the server</h1>
              <p className="text-sm text-ink-600 mb-6">Nothing has changed. Check your connection and try again.</p>
              <button type="button" onClick={() => window.location.reload()} className={primary}>Try again</button>
            </>
          )}

          {view.kind === 'ready' && view.status.subscribed && (
            <>
              <h1 className="font-display text-xl font-bold text-ink-900 mb-2">
                {view.justConfirmed ? 'You’re subscribed' : 'You’re already subscribed'}
              </h1>
              <p className="text-sm text-ink-600 mb-2">ONE two product news, tips and offers will be sent to {hint(view.status)}. Every one has an Unsubscribe link.</p>
              <p className="text-xs text-ink-500">{note}</p>
            </>
          )}

          {view.kind === 'ready' && !view.status.subscribed && view.status.state === 'pending' && (
            <>
              <h1 className="font-display text-xl font-bold text-ink-900 mb-2">Confirm product emails?</h1>
              <p className="text-sm text-ink-600 mb-2">ONE two will send product news, tips and offers to {hint(view.status)}. You can unsubscribe at any time.</p>
              <p className="text-xs text-ink-500 mb-6">{note}</p>
              <button type="button" onClick={confirm} disabled={busy} className={primary}>
                {busy ? 'Saving…' : 'Confirm'}
              </button>
            </>
          )}

          {view.kind === 'ready' && !view.status.subscribed && view.status.state === 'expired' && (
            <>
              <h1 className="font-display text-xl font-bold text-ink-900 mb-2">This link has expired</h1>
              <p className="text-sm text-ink-600 mb-6">Confirmation links work for 7 days. Sign in and turn on product emails under Account, Notifications, and we&apos;ll send a new one.</p>
              <a href="/login" className={`${secondary} block`}>Sign in</a>
            </>
          )}

          {view.kind === 'ready' && !view.status.subscribed && view.status.state === 'used' && (
            <>
              <h1 className="font-display text-xl font-bold text-ink-900 mb-2">You&apos;re not subscribed</h1>
              <p className="text-sm text-ink-600 mb-6">This link was already used, and {hint(view.status)} has since unsubscribed. To get product emails again, sign in and turn them on under Account, Notifications.</p>
              <a href="/login" className={`${secondary} block`}>Sign in</a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
