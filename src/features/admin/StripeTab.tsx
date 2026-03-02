import { useState } from 'react';
import { usePlatformAdminStore } from '@/store/usePlatformAdminStore';
import { fmt } from '@/lib/formatters';

const SUB_TABS = ['Overview', 'Payments', 'Webhook Events', 'Configuration'] as const;
type SubTab = typeof SUB_TABS[number];

const STATUS_BADGE: Record<string, string> = {
  succeeded: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  pending: 'bg-yellow-100 text-yellow-700',
  refunded: 'bg-ink-100 text-ink-500',
  success: 'bg-green-100 text-green-700',
  processing: 'bg-yellow-100 text-yellow-700',
};

const SYNC_DOT: Record<string, string> = {
  synced: 'bg-sage-500',
  unsynced: 'bg-amber-500',
  error: 'bg-red-500',
  unlinked: 'bg-ink-300',
};

const EVENT_TYPES = [
  'invoice.paid', 'invoice.payment_failed', 'customer.subscription.created',
  'customer.subscription.updated', 'customer.subscription.deleted',
  'customer.subscription.trial_will_end', 'checkout.session.completed',
];

function fmtDateTime(d: string) {
  if (!d) return '--';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function fmtDate(d: string) {
  if (!d) return '--';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function StripeTab() {
  const store = usePlatformAdminStore();
  const { stripePayments, stripeWebhookEvents, stripeConfig, tenants } = store;
  const metrics = store.getPlatformMetrics();
  const [subTab, setSubTab] = useState<SubTab>('Overview');

  const totalCollected = stripePayments.filter(p => p.status === 'succeeded').reduce((s, p) => s + p.amount, 0);
  const failedPayments = stripePayments.filter(p => p.status === 'failed').length;
  const syncedProducts = 3; // All 3 subscription tiers are synced in seed data

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-lg font-bold text-ink-900">Stripe Integration</h3>
        <p className="text-sm text-ink-500 mt-1">Manage payment processing, webhook events, and Stripe configuration.</p>
      </div>

      {/* Sub-tab nav */}
      <div className="flex gap-1 border-b border-ink-100">
        {SUB_TABS.map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${subTab === t ? 'border-[#635bff] text-ink-900' : 'border-transparent text-ink-400 hover:text-ink-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* ═══ Overview ═══ */}
      {subTab === 'Overview' && (
        <div className="space-y-6">
          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Collected', value: fmt(totalCollected), sub: 'All time', accent: 'border-l-4 border-l-[#635bff]' },
              { label: 'MRR', value: fmt(metrics.mrr), sub: 'Monthly recurring', accent: 'border-l-4 border-l-[#635bff]' },
              { label: 'Failed Payments', value: failedPayments, sub: 'Needs attention', accent: failedPayments > 0 ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-sage-500' },
              { label: 'Sync Status', value: `${syncedProducts}/3`, sub: 'Products linked', accent: 'border-l-4 border-l-sage-500' },
            ].map(m => (
              <div key={m.label} className={`bg-white border border-ink-100 rounded-xl p-4 ${m.accent}`}>
                <p className="text-xs font-semibold text-ink-400 uppercase">{m.label}</p>
                <p className="text-2xl font-bold text-ink-900 mt-1">{m.value}</p>
                <p className="text-xs text-ink-400">{m.sub}</p>
              </div>
            ))}
          </div>

          {/* 2-column: Product Mapping + Tenant Subscriptions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Product ↔ Stripe Mapping */}
            <div className="bg-white border border-ink-100 rounded-xl p-5">
              <h4 className="font-bold text-ink-900 mb-4">Product ↔ Stripe Mapping</h4>
              <div className="space-y-3">
                {[
                  { name: 'Essentials', price: '$49/mo', color: 'bg-ink-100', productId: 'prod_Rk8m...', status: 'synced' },
                  { name: 'Compliance Pro', price: '$179/mo', color: 'bg-accent-100', productId: 'prod_Rk8n...', status: 'synced' },
                  { name: 'Advanced Governance', price: '$299/mo', color: 'bg-sage-100', productId: 'prod_Rk8o...', status: 'synced' },
                ].map(p => (
                  <div key={p.name} className="flex items-center justify-between py-2 border-b border-ink-50 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full ${SYNC_DOT[p.status]}`} />
                      <div>
                        <p className="font-medium text-ink-900 text-sm">{p.name}</p>
                        <p className="text-xs text-ink-400 font-mono">{p.productId}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-ink-700">{p.price}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_BADGE[p.status === 'synced' ? 'succeeded' : 'failed']}`}>{p.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tenant ↔ Stripe Subscriptions */}
            <div className="bg-white border border-ink-100 rounded-xl p-5">
              <h4 className="font-bold text-ink-900 mb-4">Tenancy ↔ Stripe Subscriptions</h4>
              <div className="space-y-3">
                {tenants.map(t => (
                  <div key={t.id} className="flex items-center justify-between py-2 border-b border-ink-50 last:border-0">
                    <div>
                      <p className="font-medium text-ink-900 text-sm">{t.name}</p>
                      <p className="text-xs text-ink-400">{t.subscription.tier.replace('_', ' ')}</p>
                    </div>
                    <div className="text-right">
                      <span className={`pill px-2 py-0.5 rounded text-xs font-semibold ${t.status === 'active' ? 'bg-green-100 text-green-700' : t.status === 'onboarding' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{t.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Payments ═══ */}
      {subTab === 'Payments' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-400 uppercase border-b border-ink-200">
                <th className="py-3 pr-3">Date</th>
                <th className="py-3 pr-3">Tenancy</th>
                <th className="py-3 pr-3 text-right">Amount</th>
                <th className="py-3 pr-3">Method</th>
                <th className="py-3 pr-3">Status</th>
                <th className="py-3">Invoice</th>
              </tr>
            </thead>
            <tbody>
              {[...stripePayments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(p => (
                <tr key={p.id} className="border-b border-ink-50 hover:bg-mist-50">
                  <td className="py-3 pr-3 text-xs text-ink-500">{fmtDate(p.createdAt)}</td>
                  <td className="py-3 pr-3 font-medium text-ink-900">{p.tenantName}</td>
                  <td className="py-3 pr-3 text-right font-semibold">{fmt(p.amount)}</td>
                  <td className="py-3 pr-3 text-xs text-ink-500">
                    <span className="inline-flex items-center gap-1">
                      {p.paymentMethod === 'card' ? '💳' : '🏦'}
                      <span className="font-mono">•••• {p.last4}</span>
                    </span>
                  </td>
                  <td className="py-3 pr-3">
                    <span className={`pill px-2 py-0.5 rounded text-xs font-semibold ${STATUS_BADGE[p.status]}`}>{p.status}</span>
                  </td>
                  <td className="py-3 text-xs text-ink-400 font-mono">{p.stripeInvoiceId || '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-ink-400 mt-3">Showing {stripePayments.length} payments</p>
        </div>
      )}

      {/* ═══ Webhook Events ═══ */}
      {subTab === 'Webhook Events' && (
        <div className="space-y-3">
          {[...stripeWebhookEvents].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(e => (
            <div key={e.id} className={`bg-white border border-ink-100 rounded-xl p-4 border-l-4 ${e.status === 'success' ? 'border-l-sage-500' : e.status === 'failed' ? 'border-l-red-500' : 'border-l-yellow-500'}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-ink-900 text-sm">{e.type}</span>
                    <span className={`pill px-2 py-0.5 rounded text-xs font-semibold ${STATUS_BADGE[e.status]}`}>{e.status}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-ink-500">
                    {e.tenantName && <span>{e.tenantName}</span>}
                    {e.amount != null && e.amount > 0 && <span className="font-semibold text-ink-700">{fmt(e.amount)}</span>}
                    <span className="font-mono text-ink-300">{e.stripeEventId}</span>
                  </div>
                </div>
                <span className="text-xs text-ink-400 whitespace-nowrap">{fmtDateTime(e.createdAt)}</span>
              </div>
            </div>
          ))}
          <p className="text-xs text-ink-400">Showing {stripeWebhookEvents.length} events</p>
        </div>
      )}

      {/* ═══ Configuration ═══ */}
      {subTab === 'Configuration' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* API Connection */}
          <div className="bg-white border border-ink-100 rounded-xl p-5">
            <h4 className="font-bold text-ink-900 mb-4">API Connection</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-ink-400 uppercase font-semibold mb-1">Mode</label>
                <span className={`pill px-2 py-1 rounded text-xs font-bold ${stripeConfig.mode === 'test' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                  {stripeConfig.mode === 'test' ? '🔧 Test Mode' : '🟢 Live Mode'}
                </span>
              </div>
              <div>
                <label className="block text-xs text-ink-400 uppercase font-semibold mb-1">Publishable Key</label>
                <div className="bg-mist-50 rounded-lg px-3 py-2 text-xs font-mono text-ink-500">{stripeConfig.publishableKey}</div>
              </div>
              <div>
                <label className="block text-xs text-ink-400 uppercase font-semibold mb-1">Secret Key</label>
                <div className="bg-mist-50 rounded-lg px-3 py-2 text-xs font-mono text-ink-500">•••• xK4m</div>
              </div>
              <div>
                <label className="block text-xs text-ink-400 uppercase font-semibold mb-1">Connected</label>
                <p className="text-sm text-ink-700">{fmtDateTime(stripeConfig.connectedAt)}</p>
              </div>
              <button className="px-4 py-2 bg-[#635bff] text-white rounded-lg text-sm font-medium hover:opacity-90">
                Open Stripe Dashboard
              </button>
            </div>
          </div>

          {/* Webhook Configuration */}
          <div className="bg-white border border-ink-100 rounded-xl p-5">
            <h4 className="font-bold text-ink-900 mb-4">Webhook Configuration</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-ink-400 uppercase font-semibold mb-1">Webhook URL</label>
                <div className="bg-mist-50 rounded-lg px-3 py-2 text-xs font-mono text-ink-500">{stripeConfig.webhookUrl}</div>
              </div>
              <div>
                <label className="block text-xs text-ink-400 uppercase font-semibold mb-1">Webhook Secret</label>
                <div className="bg-mist-50 rounded-lg px-3 py-2 text-xs font-mono text-ink-500">•••• 8bNz</div>
              </div>
              <div>
                <label className="block text-xs text-ink-400 uppercase font-semibold mb-1">Subscribed Events</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {EVENT_TYPES.map(et => (
                    <span key={et} className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-[10px] font-mono font-semibold">{et}</span>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-ink-400 uppercase font-semibold mb-1">Last Event Received</label>
                <p className="text-sm text-ink-700">{stripeConfig.lastWebhookReceived ? fmtDateTime(stripeConfig.lastWebhookReceived) : '--'}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
