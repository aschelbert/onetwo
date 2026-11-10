/**
 * Setup step 5 · Send letters by mail. Connect the building's own account
 * with a printed-mail vendor (DocuPost, or LetterStream through our partner
 * link) so certified notices and letters print and mail themselves from the
 * day the board sends one. The vendor bills the building directly; the app
 * only pushes letters into the account. Two states: nothing yet (pick the
 * vendor, open the account, paste its credentials) and connected. Optional
 * throughout: "Later" moves the Home card on, and nothing here blocks going
 * live. Same call and store as Funds › Accounts and ledger › Bank & Mail
 * (`useMailStore`), so the two screens agree.
 */
import { useState } from 'react';
import { cn } from '@/lib/formatters';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useMailStore } from '@/store/useMailStore';
import { useTenantContext } from '@/components/TenantProvider';
import { useSetupStore } from '@/features/setup/useSetupStore';
import { DEFAULT_MAIL_PROVIDER, ESTIMATE_NOTE, MAIL_PROVIDERS, pricingFor } from '@/types/mail';
import type { MailProviderId } from '@/types/mail';
import { Button, Chip } from '../components';
import { useSetup } from './useSetup';

const CARD = 'flex flex-col gap-2.5 rounded-[14px] border border-ux2-line bg-white px-5 py-4';
const EYEBROW = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-ux2-muted';
const ROW = 'flex items-center justify-between gap-3 rounded-xl bg-ux2-surface px-3 py-2.5';
const INPUT = 'h-10 w-full rounded-xl border border-ux2-line-strong bg-white px-3 font-mono text-[13px]';
const PROVIDER_IDS: MailProviderId[] = ['docupost', 'letterstream'];
const Ext = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></svg>;

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** What happens, per vendor. */
const STEPS: Record<MailProviderId, [string, string][]> = {
  docupost: [
    ['Open the account.', "At DocuPost, with the association's email. Free; no monthly fee."],
    ['Add funds.', 'From $10, like buying a roll of stamps. Each letter is deducted when sent.'],
    ['Copy the API token.', 'Account settings → Developer → Generate API Token. It can be regenerated if it ever leaks.'],
    ['Paste it here.', 'We check it with DocuPost and keep it server-side; the app only ever shows the last four characters.'],
  ],
  letterstream: [
    ['Open the account.', "Through our partner link, with the association's email. Free; no monthly fee."],
    ['Copy the API ID and key.', 'My Account → API Information in LetterStream. The key cannot be rotated once issued, so keep it to the board.'],
    ['Paste them here.', 'We check them with LetterStream and keep them server-side; the app only ever shows the last four characters.'],
    ['Fund it, or pay per letter.', 'LetterStream holds a letter until the building pays for it in its own account. A prepaid balance (from $20) sends letters at once.'],
  ],
};

export default function MailStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const s = useSetup();
  const tenant = useTenantContext();
  const name = useBuildingStore(x => x.name);
  const address = useBuildingStore(x => x.address);
  const settings = useMailStore(x => x.mailingSettings);
  const connectMailProvider = useMailStore(x => x.connectMailProvider);
  const disconnectMailProvider = useMailStore(x => x.disconnectMailProvider);
  const setLater = useSetupStore(x => x.setLater);
  const [provider, setProvider] = useState<MailProviderId>(settings.mailProvider || DEFAULT_MAIL_PROVIDER);
  const [apiId, setApiId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'sage' | 'red' | 'amber'; text: string } | null>(null);

  const status = s.mail;
  const current = settings.mailProvider ? MAIL_PROVIDERS[settings.mailProvider] : null;
  const chosen = MAIL_PROVIDERS[provider];
  const signupUrl = provider === 'letterstream' ? settings.letterstreamPartnerUrl : chosen.signupUrl;
  const needsApiId = chosen.credentials.includes('apiId');
  const pricing = pricingFor(provider);
  const showForm = status === 'off' || changing;

  const connect = async () => {
    if (!apiKey.trim() || (needsApiId && !apiId.trim())) { setNote({ tone: 'red', text: needsApiId ? 'Paste both the API ID and the API key from the LetterStream account.' : 'Paste the API token from the DocuPost account.' }); return; }
    if (tenant.isDemo) { setNote({ tone: 'amber', text: `This is the demo: connecting ${chosen.label} does nothing here.` }); return; }
    setBusy(true); setNote(null);
    try {
      const r = await connectMailProvider(provider, { apiId: needsApiId ? apiId.trim() : undefined, apiKey: apiKey.trim() });
      setApiId(''); setApiKey(''); setChanging(false);
      setNote(r.note ? { tone: 'amber', text: r.note } : { tone: 'sage', text: `${chosen.label} accepted the credentials. Letters the board sends now print and mail from the building's account.` });
    } catch (e) { setNote({ tone: 'red', text: e instanceof Error ? e.message : `${chosen.label} did not answer. Try again in a minute.` }); }
    finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (!window.confirm(`Disconnect the building's ${current?.label ?? 'mail'} account? Letters can't be mailed from the app until an account is connected again. The account itself stays as it is at the vendor.`)) return;
    setBusy(true); setNote(null);
    try { await disconnectMailProvider(); setChanging(false); }
    catch (e) { setNote({ tone: 'red', text: e instanceof Error ? e.message : 'Could not disconnect.' }); }
    finally { setBusy(false); }
  };

  return (
    <div data-step="mail" data-mail-status={status} data-mail-provider={settings.mailProvider || provider} className="flex flex-col gap-[18px]">
      <section aria-labelledby="mail-h" className="flex flex-col gap-3.5 rounded-[22px] border border-ux2-line bg-ux2-surface px-[22px] py-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 id="mail-h" className="flex-1 text-xl font-medium">5 · Send letters by mail {status === 'off' && <span className="text-sm text-ux2-muted">· optional · letters are printed at the building until this is done</span>}</h2>
          {status === 'on' && current && <Chip tone="sage" className="h-7 px-3">{current.label} connected</Chip>}
          {status === 'off' && s.mailLater && <Chip tone="ghost" className="h-7 px-3">Left for later</Chip>}
        </div>
        {status === 'off' && <p className="m-0 text-[13px] text-ux2-muted">Open an account with a mail vendor in the association's name. Certified notices, demand letters and owner mailings then print, stamp and mail themselves, with tracking attached to the case. The vendor bills the building directly per letter; ONE two never holds a card for postage.</p>}

        {status === 'on' && current && (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-[14px] bg-ux2-sage-tint px-4 py-3.5 text-sm text-ux2-sage">
            <span className="min-w-[280px] flex-1 leading-relaxed"><b className="font-semibold">The building's {current.label} account is connected.</b> A letter sent from a case or the Board Room lands in that account{current.id === 'letterstream' ? ' and mails once it is paid for there, or at once from a prepaid balance.' : ' and mails from its prepaid balance.'}</span>
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => window.open(current.portalUrl, '_blank', 'noopener')}>Open {current.label} <Ext /></Button>
          </div>
        )}
        {note && <div role="status" className={cn('rounded-xl px-3 py-2 text-sm', note.tone === 'sage' ? 'bg-ux2-sage-tint text-ux2-sage' : note.tone === 'amber' ? 'bg-ux2-amber-tint text-ux2-amber' : 'bg-ux2-red-tint text-ux2-red-ink')}>{note.text}</div>}

        {status === 'off' ? (
          <div className="grid grid-cols-1 items-start gap-3.5 md:grid-cols-2">
            <div className="flex flex-col gap-3.5">
              <div className={cn(CARD, 'gap-3')}>
                <span className={EYEBROW}>About 5 minutes · billed by the vendor, not by ONE two</span>
                <h3 className="m-0 text-[22px] font-semibold leading-tight">Open the building's mail account</h3>
                <div role="radiogroup" aria-label="Mail vendor" className="flex flex-col gap-2">
                  {PROVIDER_IDS.map(id => {
                    const p = MAIL_PROVIDERS[id];
                    const on = provider === id;
                    return (
                      <button key={id} type="button" role="radio" aria-checked={on} onClick={() => { setProvider(id); setApiId(''); setApiKey(''); setNote(null); }}
                        className={cn('flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left', on ? 'border-ux2-plum bg-ux2-plum-tint' : 'border-ux2-line bg-ux2-surface')}>
                        <span aria-hidden="true" className={cn('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2', on ? 'border-ux2-plum' : 'border-ux2-line-strong')}>{on && <span className="h-2.5 w-2.5 rounded-full bg-ux2-plum" />}</span>
                        <span className="flex min-w-0 flex-col gap-0.5"><span className="text-sm font-semibold">{p.label}{id === DEFAULT_MAIL_PROVIDER && <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.08em] text-ux2-plum">Recommended</span>}</span><span className="text-xs text-ux2-muted">{p.tagline}</span></span>
                      </button>
                    );
                  })}
                </div>
                <p className="m-0 text-sm leading-relaxed">
                  {provider === 'docupost'
                    ? <>Sign up at DocuPost in the association's name and add funds. Then copy the API token from <b className="font-semibold">{chosen.credentialHint}</b> and paste it below.</>
                    : <>Sign up through the ONE two partner link, in the association's name. Only accounts opened through that link are issued the API ID and key the app needs. Then copy them from <b className="font-semibold">My Account → API Information</b> and paste them below.</>}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {signupUrl
                    ? <Button variant="plum" className="gap-2" onClick={() => window.open(signupUrl, '_blank', 'noopener')}>Create the account at {chosen.label} <Ext /></Button>
                    : <Chip tone="amber" className="h-9 px-3">Partner link not configured yet · ask ONE two support</Chip>}
                  <Button variant="ghost" onClick={() => { setLater('mail', !s.mailLater); if (!s.mailLater) onNext(); }}>{s.mailLater ? 'Do it now' : 'Later'}</Button>
                </div>
                <p className="m-0 text-xs leading-relaxed text-ux2-muted">Nothing here blocks going live. Left for later, it stays on your Home card and under Funds › Accounts and ledger › Bank & Mail.</p>
              </div>
              <div className={CARD}>
                <span className={EYEBROW}>What happens</span>
                <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
                  {STEPS[provider].map(([t, d], i) => (
                    <li key={t} className="flex items-start gap-3 text-[13px] leading-relaxed">
                      <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ux2-plum-tint text-[11px] font-bold text-ux2-plum">{i + 1}</span>
                      <span><b className="font-semibold">{t}</b> <span className="text-ux2-muted">{d}</span></span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            <div className="flex flex-col gap-3.5">
              <div className={CARD} aria-label="Have ready">
                <span className={EYEBROW}>Have ready</span>
                {[["The association's email address", `The ${chosen.label} account belongs to the building, not to a person; use the board's or treasurer's address.`], ["The association's card", provider === 'docupost' ? 'To add funds. From $10; each letter is deducted when sent.' : "LetterStream takes the building's own card or bank, never a third party's. Needed to pay for letters or to prepay a balance."], ['The return address', address.street ? `${name}, ${address.street}, ${address.city}, ${address.state} ${address.zip} · from Building › Contacts` : 'Set under Building › Contacts; it goes on every envelope.']].map(([t, n]) => (
                  <div key={t} className={ROW}><span className="flex min-w-0 flex-col gap-0.5"><span className="text-sm font-semibold">{t}</span><span className="text-xs text-ux2-muted">{n}</span></span><Chip tone="amber" className="shrink-0">Have it handy</Chip></div>
                ))}
              </div>
              <div className={CARD} aria-label="What it costs">
                <span className={EYEBROW}>What it costs · {chosen.label}</span>
                <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-[13px]" data-mail-estimate>
                  <dt className="text-ux2-muted">First-class letter</dt><dd className="m-0 font-semibold">about {usd(pricing['first-class'])}</dd>
                  <dt className="text-ux2-muted">Certified mail</dt><dd className="m-0 font-semibold">about {usd(pricing['certified'])}</dd>
                  <dt className="text-ux2-muted">Certified + return receipt</dt><dd className="m-0 font-semibold">about {usd(pricing['certified-electronic-return-receipt'])}</dd>
                  <dt className="text-ux2-muted">Each extra page</dt><dd className="m-0 font-semibold">about {usd(pricing.additionalPage)}</dd>
                  <dt className="text-ux2-muted">Monthly or setup fee</dt><dd className="m-0 font-semibold">None</dd>
                </dl>
                <p className="m-0 text-xs leading-relaxed text-ux2-muted">{ESTIMATE_NOTE} The exact price shows at {chosen.label} before anything is mailed.</p>
              </div>
            </div>
          </div>
        ) : current && (
          <div className="grid grid-cols-1 items-start gap-3.5 md:grid-cols-2">
            <div className={CARD} aria-label="Mail account">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[17px] font-semibold">The building's {current.label} account</span><Chip tone={settings.mailStatus === 'verified' ? 'sage' : 'amber'}>{settings.mailStatus === 'verified' ? 'Verified' : 'Saved, not yet verified'}</Chip></div>
              <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2.5 py-1 text-[13px]">
                <dt className="text-ux2-muted">Account</dt><dd className="m-0 text-right font-semibold">{name} · {current.id === 'letterstream' ? 'API ID' : 'token'} {settings.mailCredentialMasked || '••••'}</dd>
                <dt className="text-ux2-muted">Connected</dt><dd className="m-0 text-right font-semibold">{settings.mailConnectedAt ? new Date(settings.mailConnectedAt).toLocaleDateString() : '—'}</dd>
                <dt className="text-ux2-muted">Billed to</dt><dd className="m-0 text-right font-semibold">{name}, by {current.label}</dd>
                <dt className="text-ux2-muted">Return address</dt><dd className="m-0 text-right font-semibold">{address.street ? `${address.street}, ${address.city}, ${address.state} ${address.zip}` : 'Set under Building › Contacts'}</dd>
                <dt className="text-ux2-muted">Who can change this</dt><dd className="m-0 text-right font-semibold">Board members</dd>
              </dl>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setProvider(current.id); setChanging(c => !c); setNote(null); }}>{changing ? 'Keep the current keys' : 'Change keys'}</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void disconnect()}>Disconnect</Button>
              </div>
              <p className="m-0 text-xs leading-relaxed text-ux2-muted">Receipts and tracking live at {current.label} under the building's name. The same account shows under Funds › Accounts and ledger › Bank & Mail.</p>
            </div>
            <div className={CARD} aria-label="How letters go out">
              <span className={EYEBROW}>How letters go out</span>
              {[['From a case', 'Issues › Send notice: pick a template, the recipient and certified or first-class; tracking attaches to the case.'], ['From the Board Room', 'Outbox: demand letters, meeting notices and owner mailings, with a printed copy for anyone without email.'], ['Paying for them', current.billing + '.']].map(([t, n]) => (
                <div key={t} className={ROW}><span className="flex min-w-0 flex-col gap-0.5"><span className="text-sm font-semibold">{t}</span><span className="text-xs text-ux2-muted">{n}</span></span></div>
              ))}
            </div>
          </div>
        )}

        {showForm && (
          <div className={cn(CARD, 'gap-3')} aria-label="Mail account credentials">
            <span className={EYEBROW}>{status === 'on' ? `New ${chosen.label} keys` : `Paste the ${needsApiId ? 'keys' : 'token'} from ${chosen.label}`}</span>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {needsApiId && (
                <label className="flex flex-col gap-1 text-xs font-semibold text-ink-700">API ID
                  <input value={apiId} onChange={e => setApiId(e.target.value)} autoComplete="off" className={INPUT} placeholder="From My Account → API Information" />
                </label>
              )}
              <label className={cn('flex flex-col gap-1 text-xs font-semibold text-ink-700', !needsApiId && 'md:col-span-2')}>{needsApiId ? 'API key' : 'API token'}
                <input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" autoComplete="off" className={INPUT} placeholder="Kept server-side, never shown again" />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="plum" disabled={busy} onClick={() => void connect()}>{busy ? `Checking with ${chosen.label}…` : status === 'on' ? 'Save the new keys' : `Connect ${chosen.label}`}</Button>
              <span className="text-xs text-ux2-muted">We check {needsApiId ? 'the keys' : 'the token'} with {chosen.label} before saving. Nothing is mailed or charged by the check.</span>
            </div>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <span className="text-[13px] text-ux2-muted">{status === 'off' ? '' : 'Nothing here blocks going live.'}</span>
        <span className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={onBack}>Back to Get paid online</Button>
          <Button variant={status === 'off' ? 'ghost' : 'plum'} onClick={onNext}>{status === 'off' ? 'Skip to Invite people' : 'Continue to Invite people'}</Button>
        </span>
      </div>
    </div>
  );
}
