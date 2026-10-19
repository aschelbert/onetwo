import { useState } from 'react';
import { usePlatformAdminStore } from '@/store/usePlatformAdminStore';
import { PLANS, CB_PRICE, normalizePlan } from '@/lib/tiers';
import type { PlanId } from '@/lib/tiers';
import { fmt } from '@/lib/formatters';

const SUB_TABS = ['Overview', 'Trials', 'Events', 'Configuration'] as const;
type SubTab = typeof SUB_TABS[number];

const PLAN_LABELS: Record<string, string> = { self_managed: 'Self-Managed', facilities: 'Plus Facilities' };
const PLAN_COLORS: Record<string, string> = { self_managed: '#c42030', facilities: '#16a34a' };
const ACTIVE_PLANS: PlanId[] = ['self_managed', 'facilities'];

const STATUS_BADGE: Record<string, string> = {
  success: 'bg-green-100 text-green-700',
  processing: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-700',
};

function fmtDateTime(d: string) {
  if (!d) return '--';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Returns true if the date falls within the current ISO week (Mon-Sun). */
function isThisWeek(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  // Monday of current week
  const dayOfWeek = now.getDay() || 7; // Sunday=7
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek + 1);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return d >= monday && d <= sunday;
}

const CB_SITE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_CB_SITE) || 'onetwo-test';

const CB_ITEM_PRICES: { label: string; value: string }[] = [
  { label: 'Self-Managed Monthly', value: CB_PRICE.selfManagedMonthly },
  { label: 'Self-Managed Annual', value: CB_PRICE.selfManagedAnnual },
  { label: 'Facilities Monthly', value: CB_PRICE.facilitiesMonthly },
  { label: 'Facilities Annual', value: CB_PRICE.facilitiesAnnual },
  { label: 'On Call SM Monthly', value: CB_PRICE.onCallSmMonthly },
  { label: 'On Call SM Annual', value: CB_PRICE.onCallSmAnnual },
  { label: 'On Call Fac Monthly', value: CB_PRICE.onCallFacMonthly },
  { label: 'On Call Fac Annual', value: CB_PRICE.onCallFacAnnual },
  { label: 'PM Seat Monthly', value: CB_PRICE.pmSeatMonthly },
  { label: 'PM Seat Annual', value: CB_PRICE.pmSeatAnnual },
  { label: 'Setup SM', value: CB_PRICE.setupSm },
  { label: 'Setup Fac', value: CB_PRICE.setupFac },
];

export default function BillingTab() {
  const store = usePlatformAdminStore();
  const { tenants, stripeWebhookEvents } = store;
  const [subTab, setSubTab] = useState<SubTab>('Overview');

  // ── Derived metrics ──

  const planCounts = {
    self_managed: tenants.filter(t => normalizePlan(t.subscription.tier) === 'self_managed').length,
    facilities: tenants.filter(t => normalizePlan(t.subscription.tier) === 'facilities').length,
    onCall: tenants.filter(t => t.subscription.onCall).length,
    pmSeat: tenants.filter(t => t.subscription.pmSeat).length,
    noBilling: tenants.filter(t => !t.subscription.chargebeeSubscriptionId).length,
  };

  const chargebeeLinked = tenants.filter(t => !!t.subscription.chargebeeSubscriptionId);
  const mrr = chargebeeLinked.reduce((s, t) => s + t.subscription.monthlyRate, 0);

  const setupRevenue = tenants
    .filter(t => t.subscription.setupPaidAt !== null && t.subscription.setupAmount !== null)
    .reduce((s, t) => s + (t.subscription.setupAmount ?? 0), 0);

  const trialing = tenants.filter(t => t.subscription.status === 'trial');
  const trialEndingThisWeek = trialing.filter(t => isThisWeek(t.subscription.trialEndsAt));

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-lg font-bold text-ink-900">Billing</h3>
        <p className="text-sm text-ink-500 mt-1">Chargebee subscription billing overview, trial tracking, and configuration.</p>
      </div>

      {/* Sub-tab nav */}
      <div className="flex gap-1 border-b border-ink-100">
        {SUB_TABS.map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${subTab === t ? 'border-ink-900 text-ink-900' : 'border-transparent text-ink-400 hover:text-ink-700'}`}>
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
              { label: 'MRR', value: fmt(mrr), sub: `${chargebeeLinked.length} Chargebee-linked`, accent: 'border-l-4 border-l-sage-500' },
              { label: 'Setup Revenue', value: fmt(setupRevenue), sub: 'setup fees collected', accent: 'border-l-4 border-l-sage-500' },
              { label: 'Trials', value: trialing.length, sub: `${trialEndingThisWeek.length} ending this week`, accent: trialEndingThisWeek.length > 0 ? 'border-l-4 border-l-yellow-500' : 'border-l-4 border-l-sage-500' },
              { label: 'No Billing', value: planCounts.noBilling, sub: 'no Chargebee sub', accent: planCounts.noBilling > 0 ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-sage-500' },
            ].map(m => (
              <div key={m.label} className={`bg-white border border-ink-100 rounded-xl p-4 ${m.accent}`}>
                <p className="text-xs font-semibold text-ink-400 uppercase">{m.label}</p>
                <p className="text-2xl font-bold text-ink-900 mt-1">{m.value}</p>
                <p className="text-xs text-ink-400">{m.sub}</p>
              </div>
            ))}
          </div>

          {/* 2-column: Plan Breakdown + Add-on / Billing Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tenants by Plan */}
            <div className="bg-white border border-ink-100 rounded-xl p-5">
              <h4 className="font-bold text-ink-900 mb-4">Tenants by Plan</h4>
              <div className="space-y-3">
                {ACTIVE_PLANS.map(plan => (
                  <div key={plan} className="flex items-center justify-between py-2 border-b border-ink-50 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PLAN_COLORS[plan] }} />
                      <div>
                        <p className="font-medium text-ink-900 text-sm">{PLANS[plan].name}</p>
                        <p className="text-xs text-ink-400">{fmt(PLANS[plan].monthly)}/mo</p>
                      </div>
                    </div>
                    <span className="text-xs bg-ink-100 text-ink-500 px-2 py-0.5 rounded-full font-semibold">{planCounts[plan]} tenancies</span>
                  </div>
                ))}
                <div className="border-t border-ink-100 pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ink-700 font-medium">On Call add-on</span>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">{planCounts.onCall}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ink-700 font-medium">PM Seat add-on</span>
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold">{planCounts.pmSeat}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ink-700 font-medium">Without billing</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${planCounts.noBilling > 0 ? 'bg-red-100 text-red-600' : 'bg-sage-100 text-sage-700'}`}>{planCounts.noBilling}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Chargebee Subscription Status */}
            <div className="bg-white border border-ink-100 rounded-xl p-5">
              <h4 className="font-bold text-ink-900 mb-4">Subscription Status</h4>
              <div className="space-y-3">
                {tenants.map(t => (
                  <div key={t.id} className="flex items-center justify-between py-2 border-b border-ink-50 last:border-0">
                    <div>
                      <p className="font-medium text-ink-900 text-sm">{t.name}</p>
                      <p className="text-xs text-ink-400">{PLAN_LABELS[normalizePlan(t.subscription.tier)]} &middot; {fmt(t.subscription.monthlyRate)}/mo</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${t.subscription.chargebeeSubscriptionId ? 'bg-sage-600' : 'bg-amber-500'}`} />
                      <span className={`pill px-2 py-0.5 rounded text-xs font-semibold ${
                        t.subscription.status === 'active' ? 'bg-green-100 text-green-700'
                        : t.subscription.status === 'trial' ? 'bg-yellow-100 text-yellow-700'
                        : t.subscription.status === 'past_due' ? 'bg-red-100 text-red-700'
                        : 'bg-ink-100 text-ink-500'
                      }`}>{t.subscription.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Trials ═══ */}
      {subTab === 'Trials' && (
        <div className="space-y-6">
          {/* Ending this week highlight */}
          {trialEndingThisWeek.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <h4 className="font-bold text-yellow-800 mb-2">Trials ending this week ({trialEndingThisWeek.length})</h4>
              <div className="space-y-2">
                {trialEndingThisWeek.map(t => (
                  <div key={t.id} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-yellow-900">{t.name}</span>
                    <span className="text-xs text-yellow-700">Ends {t.subscription.trialEndsAt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All trialing tenants */}
          <div className="bg-white border border-ink-100 rounded-xl p-5">
            <h4 className="font-bold text-ink-900 mb-4">All Trialing Tenants ({trialing.length})</h4>
            {trialing.length === 0 ? (
              <p className="text-sm text-ink-400 italic">No tenants currently in trial.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-ink-400 uppercase border-b border-ink-200">
                      <th className="py-3 pr-3">Tenant</th>
                      <th className="py-3 pr-3">Plan</th>
                      <th className="py-3 pr-3">Started</th>
                      <th className="py-3 pr-3">Trial Ends</th>
                      <th className="py-3">Chargebee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trialing.map(t => {
                      const plan = normalizePlan(t.subscription.tier);
                      const endsThisWeek = isThisWeek(t.subscription.trialEndsAt);
                      return (
                        <tr key={t.id} className={`border-b border-ink-50 ${endsThisWeek ? 'bg-yellow-50' : 'hover:bg-mist-50'}`}>
                          <td className="py-3 pr-3 font-medium text-ink-900">{t.name}</td>
                          <td className="py-3 pr-3">
                            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: `${PLAN_COLORS[plan]}20`, color: PLAN_COLORS[plan] }}>
                              {PLAN_LABELS[plan]}
                            </span>
                          </td>
                          <td className="py-3 pr-3 text-xs text-ink-500">{t.subscription.startDate}</td>
                          <td className="py-3 pr-3">
                            <span className={`text-xs font-semibold ${endsThisWeek ? 'text-yellow-700' : 'text-ink-500'}`}>
                              {t.subscription.trialEndsAt || '--'}
                              {endsThisWeek && <span className="ml-1 text-[10px] bg-yellow-200 text-yellow-800 px-1 py-0.5 rounded">THIS WEEK</span>}
                            </span>
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full ${t.subscription.chargebeeSubscriptionId ? 'bg-sage-600' : 'bg-amber-500'}`} />
                              <span className="text-xs text-ink-400">{t.subscription.chargebeeSubscriptionId ? 'Linked' : 'No billing'}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Events ═══ */}
      {subTab === 'Events' && (
        <div className="space-y-3">
          <p className="text-sm text-ink-500">Recent Chargebee webhook events (via stripeWebhookEvents store).</p>
          {stripeWebhookEvents.length === 0 ? (
            <div className="bg-white border border-ink-100 rounded-xl p-12 text-center">
              <p className="text-ink-400 text-sm">No webhook events recorded yet.</p>
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}

      {/* ═══ Configuration ═══ */}
      {subTab === 'Configuration' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chargebee Site */}
          <div className="bg-white border border-ink-100 rounded-xl p-5">
            <h4 className="font-bold text-ink-900 mb-4">Chargebee Site</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-ink-400 uppercase font-semibold mb-1">Site Name (VITE_CB_SITE)</label>
                <div className="bg-mist-50 rounded-lg px-3 py-2 text-sm font-mono text-ink-700">{CB_SITE}</div>
              </div>
              <div>
                <label className="block text-xs text-ink-400 uppercase font-semibold mb-1">Dashboard URL</label>
                <div className="bg-mist-50 rounded-lg px-3 py-2 text-xs font-mono text-ink-500">https://{CB_SITE}.chargebee.com</div>
              </div>
            </div>
          </div>

          {/* Item Price IDs */}
          <div className="bg-white border border-ink-100 rounded-xl p-5">
            <h4 className="font-bold text-ink-900 mb-4">Item Price IDs ({CB_ITEM_PRICES.length})</h4>
            <div className="space-y-2">
              {CB_ITEM_PRICES.map(p => (
                <div key={p.label} className="flex items-center justify-between py-1.5 border-b border-ink-50 last:border-0">
                  <span className="text-xs text-ink-500 font-medium">{p.label}</span>
                  <code className="text-[0.7rem] text-ink-700 bg-mist-50 px-2 py-0.5 rounded font-mono">{p.value}</code>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
