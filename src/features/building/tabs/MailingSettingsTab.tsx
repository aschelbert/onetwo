import { useState } from 'react';
import { useMailStore } from '@/store/useMailStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { PRICING, formatDeliveryMethod } from '@/types/mail';
import type { MailDeliveryMethod } from '@/types/mail';
import { supabase } from '@/lib/supabase';
import StripeCardModal from '../components/StripeCardModal';

const DELIVERY_METHODS: MailDeliveryMethod[] = ['first-class', 'certified', 'certified-return-receipt', 'certified-electronic-return-receipt'];

export default function MailingSettingsTab() {
  const mailStore = useMailStore();
  const buildingStore = useBuildingStore();
  const settings = mailStore.mailingSettings;

  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [clientSecret, setClientSecret] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const hasCard = !!settings.stripePaymentMethodId;

  const totalMailings = mailStore.mailRecords.length;
  const totalCostCents = mailStore.mailRecords.reduce((sum, r) => sum + r.cost.totalCents, 0);

  const handleAddOrChangeCard = async () => {
    if (!supabase) {
      alert('Backend not configured. Set Supabase env vars to enable.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('mailing-billing', {
        body: { action: 'setup-intent' },
      });
      if (fnError || data?.error) {
        setError(data?.error || fnError?.message || 'Failed to start card setup');
        return;
      }
      setClientSecret(data.clientSecret);
      setCustomerId(data.customerId);
      setCardModalOpen(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCardSuccess = (cardLast4: string, cardBrand: string, paymentMethodId: string) => {
    mailStore.updateMailingSettings({
      stripePaymentMethodId: paymentMethodId,
      stripeCustomerId: customerId,
      cardLast4,
      cardBrand,
    });
    setCardModalOpen(false);
  };

  const handleRemoveCard = async () => {
    if (!confirm('Remove this payment method? You will not be able to send mail until a new card is added.')) return;
    if (!supabase) return;

    setLoading(true);
    setError('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('mailing-billing', {
        body: { action: 'detach-method' },
      });
      if (fnError || data?.error) {
        setError(data?.error || fnError?.message || 'Failed to remove payment method');
        return;
      }
      mailStore.updateMailingSettings({
        stripePaymentMethodId: '',
        stripeCustomerId: '',
        cardLast4: '',
        cardBrand: '',
      });
    } catch (err) {
      setError(String(err));
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
            <p className="text-xs text-ink-500 mt-0.5">LetterStream Monetization Mode — per-piece pricing, $0/month</p>
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

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Payment Method */}
      <div className="bg-white border border-ink-200 rounded-xl p-5">
        <h4 className="text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-3">Payment Method</h4>
        {hasCard ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-12 bg-ink-100 rounded flex items-center justify-center text-xs font-bold text-ink-600">
                {settings.cardBrand}
              </div>
              <div>
                <p className="text-sm font-medium text-ink-900">{settings.cardBrand} ending in {settings.cardLast4}</p>
                <p className="text-xs text-ink-500">Billed to {settings.senderName}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddOrChangeCard}
                disabled={loading}
                className="text-xs text-accent-600 hover:text-accent-700 font-medium disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Change'}
              </button>
              <button
                onClick={handleRemoveCard}
                disabled={loading}
                className="text-xs text-red-400 hover:text-red-600 font-medium disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-ink-500 mb-3">No payment method on file. Add a card to enable mailing.</p>
            <button
              onClick={handleAddOrChangeCard}
              disabled={loading}
              className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Add Payment Method'}
            </button>
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
        <h4 className="text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-3">Mailing Pricing</h4>
        <p className="text-xs text-ink-500 mb-3">LetterStream per-piece pricing — zero markup, pay only for what you send.</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100">
              <th className="text-left py-2 text-xs font-semibold text-ink-600">Service</th>
              <th className="text-right py-2 text-xs font-semibold text-ink-600">Price</th>
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
                <p className="text-xs text-ink-500">Total Cost</p>
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
                    <p className="text-xs text-ink-400 capitalize">{r.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-400 text-center py-4">No mailings sent yet</p>
        )}
      </div>

      {/* Stripe Card Modal */}
      {cardModalOpen && (
        <StripeCardModal
          clientSecret={clientSecret}
          customerId={customerId}
          onSuccess={handleCardSuccess}
          onClose={() => setCardModalOpen(false)}
        />
      )}
    </div>
  );
}
