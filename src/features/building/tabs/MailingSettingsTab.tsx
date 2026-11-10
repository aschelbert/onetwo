import { useState } from 'react';
import { useMailStore } from '@/store/useMailStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { ESTIMATE_NOTE, PRICING, formatDeliveryMethod } from '@/types/mail';
import type { MailDeliveryMethod } from '@/types/mail';

const DELIVERY_METHODS: MailDeliveryMethod[] = ['first-class', 'certified', 'certified-return-receipt', 'certified-electronic-return-receipt'];

/**
 * The building's own LetterStream account (Partnership mode). The board opens
 * the account through our partner link, pastes its API ID and key here, and
 * LetterStream bills the building directly for every letter. No card is kept
 * by the app and no postage ever goes through our books.
 */
export default function MailingSettingsTab() {
  const mailStore = useMailStore();
  const buildingStore = useBuildingStore();
  const settings = mailStore.mailingSettings;

  const [showConnect, setShowConnect] = useState(false);
  const [apiId, setApiId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const connected = settings.letterstreamConnected;
  const partnerUrl = settings.letterstreamPartnerUrl;
  const portalUrl = settings.letterstreamPortalUrl || 'https://secure.letterstream.com/';

  const totalMailings = mailStore.mailRecords.length;
  const totalCostCents = mailStore.mailRecords.reduce((sum, r) => sum + r.cost.totalCents, 0);

  const handleConnect = async () => {
    if (!apiId.trim() || !apiKey.trim()) { setError('Paste both the API ID and the API key from the LetterStream account.'); return; }
    setLoading(true);
    setError('');
    setNote('');
    try {
      const result = await mailStore.connectLetterStream(apiId.trim(), apiKey.trim());
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
    if (!confirm("Disconnect the building's LetterStream account? Letters can't be mailed from the app until it is connected again. The account itself, and anything already in it, stays as it is at LetterStream.")) return;
    setLoading(true);
    setError('');
    setNote('');
    try {
      await mailStore.disconnectLetterStream();
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
            <p className="text-xs text-ink-500 mt-0.5">LetterStream Partnership Mode: the building's own account, billed by LetterStream, no markup from ONE two</p>
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

      {/* LetterStream account */}
      <div className="bg-white border border-ink-200 rounded-xl p-5" data-testid="letterstream-account">
        <h4 className="text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-3">LetterStream Account</h4>
        {connected ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${settings.letterstreamStatus === 'verified' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>LS</div>
                <div>
                  <p className="text-sm font-medium text-ink-900">Connected · API ID {settings.letterstreamApiIdMasked || '••••'}</p>
                  <p className="text-xs text-ink-500">
                    {settings.letterstreamStatus === 'verified' ? 'Verified with LetterStream' : 'Saved, not yet verified with LetterStream'}
                    {settings.letterstreamConnectedAt ? ` · since ${new Date(settings.letterstreamConnectedAt).toLocaleDateString()}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <a href={portalUrl} target="_blank" rel="noreferrer" className="text-xs text-accent-600 hover:text-accent-700 font-medium">Open LetterStream ↗</a>
                <button onClick={() => { setShowConnect(true); setError(''); }} disabled={loading} className="text-xs text-accent-600 hover:text-accent-700 font-medium disabled:opacity-50">Change keys</button>
                <button onClick={handleDisconnect} disabled={loading} className="text-xs text-red-400 hover:text-red-600 font-medium disabled:opacity-50">Disconnect</button>
              </div>
            </div>
            <p className="text-xs text-ink-500">
              Letters sent from the app land in this account. LetterStream prints and mails them once the building has paid for them there, at once if the account keeps a prepaid balance. Billing, receipts and tracking live in LetterStream, under the building's name.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-ink-600">
              The building needs its own LetterStream account. LetterStream bills the building directly for each letter, so there is no card to keep here and no postage on anyone else's books.
            </p>
            <ol className="text-xs text-ink-600 list-decimal pl-5 space-y-1">
              <li>
                Open the account through the ONE two partner link{' '}
                {partnerUrl
                  ? <a href={partnerUrl} target="_blank" rel="noreferrer" className="text-accent-600 hover:text-accent-700 font-medium">(create the account ↗)</a>
                  : <span className="text-ink-400">(the partner link isn't configured yet; ask ONE two support)</span>}
                . Only accounts opened through the partner link are issued API credentials.
              </li>
              <li>In LetterStream, open <span className="font-medium">My Account → API Information</span> and copy the API ID and API key. Add funds under Billing Information if you want letters to mail without a trip to the LetterStream cart.</li>
              <li>Paste them below.</li>
            </ol>
          </div>
        )}

        {(showConnect || !connected) && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">API ID</label>
              <input value={apiId} onChange={e => setApiId(e.target.value)} autoComplete="off" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm font-mono" placeholder="From My Account → API Information" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">API key</label>
              <input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" autoComplete="off" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm font-mono" placeholder="Stored server-side, never shown again" />
            </div>
            <div className="sm:col-span-2 flex items-center gap-3">
              <button onClick={handleConnect} disabled={loading} className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                {loading ? 'Checking with LetterStream…' : connected ? 'Save new keys' : 'Connect LetterStream'}
              </button>
              {connected && <button onClick={() => { setShowConnect(false); setApiId(''); setApiKey(''); }} className="text-xs text-ink-500 hover:text-ink-700">Cancel</button>}
              <span className="text-[11px] text-ink-400">LetterStream can't rotate a key once issued, so keep it to the board.</span>
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
        <h4 className="text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-3">Estimated Postage</h4>
        <p className="text-xs text-ink-500 mb-3">{ESTIMATE_NOTE} The exact price shows in the building's LetterStream account before anything is mailed.</p>
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
              <td className="py-2 text-ink-900 font-medium text-right">${(PRICING['first-class'] / 100).toFixed(2)}</td>
            </tr>
            <tr className="border-b border-ink-50">
              <td className="py-2 text-ink-700">Certified Mail</td>
              <td className="py-2 text-ink-900 font-medium text-right">${(PRICING['certified'] / 100).toFixed(2)}</td>
            </tr>
            <tr className="border-b border-ink-50">
              <td className="py-2 text-ink-700">Certified + Electronic Return Receipt</td>
              <td className="py-2 text-ink-900 font-medium text-right">${(PRICING['certified-electronic-return-receipt'] / 100).toFixed(2)}</td>
            </tr>
            <tr className="border-b border-ink-50">
              <td className="py-2 text-ink-700">Additional Page</td>
              <td className="py-2 text-ink-900 font-medium text-right">${(PRICING.additionalPage / 100).toFixed(2)}</td>
            </tr>
            <tr className="border-b border-ink-50">
              <td className="py-2 text-ink-700">Return Envelope</td>
              <td className="py-2 text-ink-900 font-medium text-right">${(PRICING.returnEnvelope / 100).toFixed(2)}</td>
            </tr>
            <tr>
              <td className="py-2 text-ink-700">Return Envelope (stamped)</td>
              <td className="py-2 text-ink-900 font-medium text-right">${(PRICING.returnEnvelopeStamped / 100).toFixed(2)}</td>
            </tr>
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
              value={settings.defaultDeliveryMethod}
              onChange={e => mailStore.updateMailingSettings({ defaultDeliveryMethod: e.target.value as MailDeliveryMethod })}
              className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
            >
              {DELIVERY_METHODS.map(m => (
                <option key={m} value={m}>{formatDeliveryMethod(m)}</option>
              ))}
            </select>
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
            <p className="text-[11px] text-ink-400 mt-1">Where LetterStream's invoices to the building get booked when they are entered as bills.</p>
          </div>
        </div>
      </div>

      {/* Mailing History Summary */}
      <div className="bg-white border border-ink-200 rounded-xl p-5">
        <h4 className="text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-3">Mailing History</h4>
        {totalMailings > 0 ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-mist-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-ink-900">{totalMailings}</p>
                <p className="text-xs text-ink-500">Total Mailings</p>
              </div>
              <div className="bg-mist-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-ink-900">${(totalCostCents / 100).toFixed(2)}</p>
                <p className="text-xs text-ink-500">Estimated Postage</p>
              </div>
            </div>
            <div className="space-y-2">
              {mailStore.mailRecords.slice(0, 5).map(r => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-ink-50">
                  <div>
                    <p className="text-sm text-ink-700">{r.templateName}</p>
                    <p className="text-xs text-ink-400">{r.recipient.name} &middot; {new Date(r.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-ink-900">${(r.cost.totalCents / 100).toFixed(2)}</p>
                    <p className="text-xs text-ink-400 capitalize">{r.status.replace(/-/g, ' ')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-400 text-center py-4">No mailings sent yet</p>
        )}
      </div>
    </div>
  );
}
