import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase, isBackendEnabled } from '@/lib/supabase';
import { isUnsubscribeToken, linkStatus, setByLink, type LinkStatus } from '@/lib/marketingPrefs';

type View =
  | { kind: 'loading' }
  | { kind: 'unknown' }                    // no token, or one we do not recognise
  | { kind: 'failed' }                     // could not reach the server
  | { kind: 'ready'; status: LinkStatus; justChanged: boolean };

/**
 * Where the Unsubscribe link in a product email leads. No sign-in: the token
 * in the link is the proof. Opening the page changes nothing (mail scanners
 * open links); the button does.
 */
export default function UnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get('t');
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isUnsubscribeToken(token) || !isBackendEnabled || !supabase) { setView({ kind: 'unknown' }); return; }
      try {
        const status = await linkStatus(supabase, token);
        if (!cancelled) setView(status ? { kind: 'ready', status, justChanged: false } : { kind: 'unknown' });
      } catch {
        if (!cancelled) setView({ kind: 'failed' });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const change = async (subscribed: boolean) => {
    if (!isUnsubscribeToken(token) || !supabase) return;
    setBusy(true);
    try {
      const status = await setByLink(supabase, token, subscribed);
      setView(status ? { kind: 'ready', status, justChanged: true } : { kind: 'unknown' });
    } catch {
      setView({ kind: 'failed' });
    }
    setBusy(false);
  };

  const primary = 'w-full py-3 bg-ink-900 text-white rounded-xl font-semibold text-sm hover:bg-ink-800 disabled:opacity-50';
  const secondary = 'w-full py-3 border border-ink-200 text-ink-700 rounded-xl font-semibold text-sm hover:bg-ink-50 disabled:opacity-50';
  const note = 'Emails about your account and building, such as invoices, notices and password resets, are not affected.';

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
              <p className="text-sm text-ink-600 mb-6">It may be incomplete. Use the Unsubscribe link in the most recent product email we sent you, or sign in and turn off product emails under Account, Notifications.</p>
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
                {view.justChanged ? 'You’re subscribed again' : 'Stop product emails?'}
              </h1>
              <p className="text-sm text-ink-600 mb-2">
                {view.justChanged
                  ? <>ONE two product news, tips and offers will be sent to <span className="font-semibold">{view.status.emailHint}</span>.</>
                  : <>ONE two will stop sending product news, tips and offers to <span className="font-semibold">{view.status.emailHint}</span>.</>}
              </p>
              <p className="text-xs text-ink-500 mb-6">{note}</p>
              <button type="button" onClick={() => change(false)} disabled={busy} className={view.justChanged ? secondary : primary}>
                {busy ? 'Saving…' : 'Unsubscribe'}
              </button>
            </>
          )}

          {view.kind === 'ready' && !view.status.subscribed && (
            <>
              <h1 className="font-display text-xl font-bold text-ink-900 mb-2">
                {view.justChanged ? 'You’re unsubscribed' : 'You’re not subscribed'}
              </h1>
              <p className="text-sm text-ink-600 mb-2">
                ONE two won&apos;t send product news, tips or offers to <span className="font-semibold">{view.status.emailHint}</span>.
              </p>
              <p className="text-xs text-ink-500 mb-6">{note}</p>
              <button type="button" onClick={() => change(true)} disabled={busy} className={secondary}>
                {busy ? 'Saving…' : 'Subscribe again'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
