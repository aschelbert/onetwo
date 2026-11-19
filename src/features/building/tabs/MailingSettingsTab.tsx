import { useState } from 'react';
import { useMailStore } from '@/store/useMailStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { DEFAULT_MAIL_PROVIDER, ESTIMATE_NOTE, MAIL_PROVIDERS, deliveryMethodsFor, effectiveDeliveryMethod, estimatedBalance, formatDeliveryMethod, pricingFor } from '@/types/mail';
import type { MailDeliveryMethod, MailProviderId } from '@/types/mail';
import MailHistory from './MailHistory';

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const PROVIDER_IDS: MailProviderId[] = ['docupost', 'letterstream'];

/**
 * The building's own account with a printed-mail vendor. The board opens the
 * account (DocuPost in minutes, or LetterStream through our partner link),
 * pastes its credentials here, and the vendor bills the building directly for
 * every letter. No card is kept by the app and no postage goes through our
 * books.
 */
export default function MailingSettingsTab() {
  const mailStore = useMailStore();
  const buildingStore = useBuildingStore();
  const settings = mailStore.mailingSettings;

  const [provider, setProvider] = useState<MailProviderId>(settings.mailProvider || DEFAULT_MAIL_PROVIDER);
  const [showConnect, setShowConnect] = useState(false);
  const [apiId, setApiId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const connected = settings.mailConnected && !!settings.mailProvider;
  const current = settings.mailProvider ? MAIL_PROVIDERS[settings.mailProvider] : null;
  const chosen = MAIL_PROVIDERS[provider];
  const signupUrl = provider === 'letterstream' ? settings.letterstreamPartnerUrl : chosen.signupUrl;
  const needsApiId = chosen.credentials.includes('apiId');
  const pricing = pricingFor(connected ? settings.mailProvider : provider);

  // Only what the connected vendor really offers; a saved default it does not offer shows as what it would send.
  const methods = deliveryMethodsFor(connected ? settings.mailProvider : '');
  const defaultMethod = effectiveDeliveryMethod(settings.defaultDeliveryMethod, connected ? settings.mailProvider : '');

  const balance = estimatedBalance(settings, mailStore.mailRecords);
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceInput, setBalanceInput] = useState('');

  const handleBalance = async (clear = false) => {
    const dollars = Number(balanceInput.replace(/[^0-9.]/g, ''));
    if (!clear && (balanceInput.trim() === '' || !Number.isFinite(dollars))) { setError(`Enter the balance shown in ${current?.label ?? 'the vendor account'}, for example 50.00.`); return; }
    setLoading(true);
    setError('');
    try {
      await mailStore.setMailBalance(clear ? null : Math.round(dollars * 100));
      setEditingBalance(false);
      setBalanceInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!apiKey.trim() || (needsApiId && !apiId.trim())) { setError(needsApiId ? 'Paste both the API ID and the API key from the LetterStream account.' : 'Paste the API token from the DocuPost account.'); return; }
    setLoading(true);
    setError('');
    setNote('');
    try {
      const result = await mailStore.connectMailProvider(provider, { apiId: needsApiId ? apiId.trim() : undefined, apiKey: apiKey.trim() });
      setApiId('');
      setApiKey('');
      setShowConnect(false);
      if (result.note) setNote(result.note);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm(`Disconnect the building's ${current?.label ?? 'mail'} account? Letters can't be mailed from the app until an account is connected again. The account itself, and anything already in it, stays as it is at the vendor.`)) return;
    setLoading(true);
    setError('');
    setNote('');
    try {
      await mailStore.disconnectMailProvider();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="font-display text-xl font-bold text-ink-900">Mailing Settings</h3>

      {/* Status */}
      <div className="bg-mist-50 border border-mist-200 rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-ink-900">Physical Mail Integration</h4>
            <p className="text-xs text-ink-500 mt-0.5">The building's own account with {current ? current.label : 'DocuPost or LetterStream'}, billed by the vendor, no markup from ONE two</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${settings.enabled ? 'bg-emerald-500' : 'bg-ink-300'}`} />
            <span className="text-sm font-medium text-ink-700">{settings.enabled ? 'Active' : 'Inactive'}</span>
            <button
              onClick={() => mailStore.updateMailingSettings({ enabled: !settings.enabled })}
              className={`ml-2 relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.enabled ? 'bg-emerald-500' : 'bg-ink-300'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${settings.enabled ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Banners */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {note && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
          <p className="text-sm text-amber-800">{note}</p>
        </div>
      )}

      {/* Vendor account */}
      <div className="bg-white border border-ink-200 rounded-xl p-5" data-testid="mail-account">
        <h4 className="text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-3">Mail Account</h4>
        {connected && current ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${settings.mailStatus === 'verified' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{current.label.slice(0, 2).toUpperCase()}</div>
                <div>
                  <p className="text-sm font-medium text-ink-900">{current.label} · connected · {settings.mailCredentialMasked || '••••'}</p>
                  <p className="text-xs text-ink-500">
                    {settings.mailStatus === 'verified' ? `Verified with ${current.label}` : `Saved, not yet verified with ${current.label}`}
                    {settings.mailConnectedAt ? ` · since ${new Date(settings.mailConnectedAt).toLocaleDateString()}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <a href={current.portalUrl} target="_blank" rel="noreferrer" className="text-xs text-accent-600 hover:text-accent-700 font-medium">Open {current.label} ↗</a>
                <button onClick={() => { setProvider(current.id); setShowConnect(true); setError(''); }} disabled={loading} className="text-xs text-accent-600 hover:text-accent-700 font-medium disabled:opacity-50">Change keys</button>
                <button onClick={handleDisconnect} disabled={loading} className="text-xs text-red-400 hover:text-red-600 font-medium disabled:opacity-50">Disconnect</button>
              </div>
            </div>
            <p className="text-xs text-ink-500">
              Letters sent from the app land in this account. {current.billing}. Receipts and tracking live at {current.label}, under the building's name.
              {!current.hasStatusApi && ` ${current.label} has no status API, so each letter's USPS tracking number is copied from its dashboard into Mailing History below.`}
            </p>

            {settings.mailFundsLowAt && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3" data-testid="mail-funds-low" role="alert">
                <p className="text-sm text-red-700">
                  <span className="font-semibold">{current.label} refused a letter for lack of funds on {new Date(settings.mailFundsLowAt).toLocaleDateString()}.</span> Nothing mails until the building adds money to its {current.label} account. Send the letter again once it has.
                </p>
                <a href={current.portalUrl} target="_blank" rel="noreferrer" className="text-xs text-red-700 underline font-medium">Add funds at {current.label} ↗</a>
              </div>
            )}

            {/* Balance: the vendor's API does not report it, so the board records what the vendor shows. */}
            <div className="border-t border-ink-100 pt-3" data-testid="mail-balance">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-ink-900">
                    {balance
                      ? <>About <span className={balance.remainingCents < pricingFor(settings.mailProvider)['certified'] ? 'text-red-600' : ''}>{usd(Math.max(0, balance.remainingCents))}</span> left in {current.label}</>
                      : `${current.label} balance not recorded`}
                  </p>
                  <p className="text-xs text-ink-500">
                    {balance
                      ? `${usd(settings.mailBalanceCents ?? 0)} recorded on ${new Date(settings.mailBalanceRecordedAt).toLocaleDateString()}, less estimated postage for ${balance.letters} ${balance.letters === 1 ? 'letter' : 'letters'} sent since (${usd(balance.spentCents)}). An estimate: ${current.label}'s ${current.balanceHint} page has the exact figure.`
                      : `${current.label}'s API does not report the balance. Record what its ${current.balanceHint} page shows${current.prepaid ? ' after each top-up' : ''}, and the app keeps a running estimate and warns before a letter that may not be covered.`}
                  </p>
                </div>
                {!editingBalance && (
                  <span className="flex gap-3">
                    <button onClick={() => { setEditingBalance(true); setBalanceInput(''); setError(''); }} disabled={loading} className="text-xs text-accent-600 hover:text-accent-700 font-medium disabled:opacity-50">{balance ? 'Update balance' : 'Record balance'}</button>
                    {balance && <button onClick={() => void handleBalance(true)} disabled={loading} className="text-xs text-ink-400 hover:text-ink-600 font-medium disabled:opacity-50">Clear</button>}
                  </span>
                )}
              </div>
              {editingBalance && (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="block">
                    <span className="block text-xs font-medium text-ink-700 mb-1">Balance shown in {current.label} today ($)</span>
                    <input value={balanceInput} onChange={e => setBalanceInput(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="50.00" className="w-40 px-3 py-2 border border-ink-200 rounded-lg text-sm" />
                  </label>
                  <button onClick={() => void handleBalance()} disabled={loading} className="px-4 py-2 bg-ink-900 hover:bg-ink-800 text-white rounded-lg text-sm font-semibold disabled:opacity-50">{loading ? 'Saving…' : 'Save'}</button>
                  <button onClick={() => { setEditingBalance(false); setError(''); }} className="text-xs text-ink-500 hover:text-ink-700 py-2">Cancel</button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-ink-600">
              The building needs its own account with a mail vendor. The vendor bills the building directly for each letter, so there is no card to keep here and no postage on anyone else's books.
            </p>
            <div role="radiogroup" aria-label="Mail vendor" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PROVIDER_IDS.map(id => {
                const p = MAIL_PROVIDERS[id];
                const on = provider === id;
                return (
                  <button key={id} type="button" role="radio" aria-checked={on} onClick={() => { setProvider(id); setApiId(''); setApiKey(''); setError(''); }}
                    className={`text-left rounded-xl border px-4 py-3 ${on ? 'border-accent-500 bg-accent-50' : 'border-ink-200 hover:border-ink-300'}`}>
                    <p className="text-sm font-semibold text-ink-900">{p.label}{id === DEFAULT_MAIL_PROVIDER && <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-accent-600">Recommended</span>}</p>
                    <p className="text-xs text-ink-500 mt-0.5">{p.tagline}</p>
                  </button>
                );
              })}
            </div>
            <ol className="text-xs text-ink-600 list-decimal pl-5 space-y-1">
              <li>
                Open the account{' '}
                {signupUrl
                  ? <a href={signupUrl} target="_blank" rel="noreferrer" className="text-accent-600 hover:text-accent-700 font-medium">at {chosen.label} ↗</a>
                  : <span className="text-ink-400">through the ONE two partner link (not configured yet; ask ONE two support)</span>}
                {provider === 'letterstream' ? '. Only accounts opened through the partner link are issued API credentials.' : ', in the association\'s name, and add funds (from $10).'}
              </li>
              <li>In {chosen.label}, go to <span className="font-medium">{chosen.credentialHint}</span> and copy {needsApiId ? 'the API ID and API key' : 'the API token'}.</li>
              <li>Paste {needsApiId ? 'them' : 'it'} below.</li>
            </ol>
          </div>
        )}

        {(showConnect || !connected) && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {needsApiId && (
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">API ID</label>
                <input value={apiId} onChange={e => setApiId(e.target.value)} autoComplete="off" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm font-mono" placeholder="From My Account → API Information" />
              </div>
            )}
            <div className={needsApiId ? '' : 'sm:col-span-2'}>
              <label className="block text-xs font-medium text-ink-700 mb-1">{needsApiId ? 'API key' : 'API token'}</label>
              <input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" autoComplete="off" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm font-mono" placeholder="Stored server-side, never shown again" />
            </div>
            <div className="sm:col-span-2 flex items-center gap-3">
              <button onClick={handleConnect} disabled={loading} className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                {loading ? `Checking with ${chosen.label}…` : connected ? 'Save new keys' : `Connect ${chosen.label}`}
              </button>
              {connected && <button onClick={() => { setShowConnect(false); setApiId(''); setApiKey(''); }} className="text-xs text-ink-500 hover:text-ink-700">Cancel</button>}
              <span className="text-[11px] text-ink-400">{provider === 'letterstream' ? "LetterStream can't rotate a key once issued, so keep it to the board." : 'A leaked token can be regenerated in DocuPost; the old one stops working.'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Return Address */}
      <div className="bg-white border border-ink-200 rounded-xl p-5">
        <h4 className="text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-3">Return Address</h4>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-ink-900">{settings.senderName}</p>
            <p className="text-xs text-ink-500">{buildingStore.address.street}</p>
            <p className="text-xs text-ink-500">{buildingStore.address.city}, {buildingStore.address.state} {buildingStore.address.zip}</p>
          </div>
          <span className="text-xs text-ink-400">Edit via Building &rarr; Contacts</span>
        </div>
      </div>

      {/* Pricing Table */}
      <div className="bg-white border border-ink-200 rounded-xl p-5">
        <h4 className="text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-3">Estimated Postage · {(connected && current ? current : chosen).label}</h4>
        <p className="text-xs text-ink-500 mb-3">{ESTIMATE_NOTE} The exact price shows in the building's {(connected && current ? current : chosen).label} account before anything is mailed.</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100">
              <th className="text-left py-2 text-xs font-semibold text-ink-600">Service</th>
              <th className="text-right py-2 text-xs font-semibold text-ink-600">Estimate</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-ink-50">
              <td className="py-2 text-ink-700">First Class</td>
              <td className="py-2 text-ink-900 font-medium text-right">${(pricing['first-class'] / 100).toFixed(2)}</td>
            </tr>
            <tr className="border-b border-ink-50">
              <td className="py-2 text-ink-700">Certified Mail</td>
              <td className="py-2 text-ink-900 font-medium text-right">${(pricing['certified'] / 100).toFixed(2)}</td>
            </tr>
            <tr className="border-b border-ink-50">
              <td className="py-2 text-ink-700">Certified + Return Receipt</td>
              <td className="py-2 text-ink-900 font-medium text-right">${(pricing['certified-electronic-return-receipt'] / 100).toFixed(2)}</td>
            </tr>
            <tr className="border-b border-ink-50">
              <td className="py-2 text-ink-700">Additional Page</td>
              <td className="py-2 text-ink-900 font-medium text-right">${(pricing.additionalPage / 100).toFixed(2)}</td>
            </tr>
            {pricing.returnEnvelope > 0 && (
              <tr className="border-b border-ink-50">
                <td className="py-2 text-ink-700">Return Envelope</td>
                <td className="py-2 text-ink-900 font-medium text-right">${(pricing.returnEnvelope / 100).toFixed(2)}</td>
              </tr>
            )}
            {pricing.returnEnvelopeStamped > 0 && (
              <tr>
                <td className="py-2 text-ink-700">Return Envelope (stamped)</td>
                <td className="py-2 text-ink-900 font-medium text-right">${(pricing.returnEnvelopeStamped / 100).toFixed(2)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Defaults */}
      <div className="bg-white border border-ink-200 rounded-xl p-5">
        <h4 className="text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-3">Defaults</h4>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1">Default Delivery Method</label>
            <select
              value={defaultMethod}
              onChange={e => mailStore.updateMailingSettings({ defaultDeliveryMethod: e.target.value as MailDeliveryMethod })}
              className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
            >
              {methods.map(m => (
                <option key={m} value={m}>{formatDeliveryMethod(m)}</option>
              ))}
            </select>
            {connected && current && current.methods.length < 4 && (
              <p className="text-[11px] text-ink-400 mt-1">{current.receiptNote}</p>
            )}
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.enableEmailCopy}
              onChange={e => mailStore.updateMailingSettings({ enableEmailCopy: e.target.checked })}
              className="rounded border-ink-300"
            />
            <span className="text-sm text-ink-700">Send digital copy via email by default</span>
          </label>
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1">GL Account (Postage)</label>
            <input
              value={settings.glAccountPostage}
              onChange={e => mailStore.updateMailingSettings({ glAccountPostage: e.target.value })}
              className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
              placeholder="6900"
            />
            <p className="text-[11px] text-ink-400 mt-1">Where the vendor's charges to the building get booked when they are entered as bills.</p>
          </div>
        </div>
      </div>

      {/* Mailing History: the building's record, with tracking */}
      <MailHistory />
    </div>
  );
}
