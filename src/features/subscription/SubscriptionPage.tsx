import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useTenantContext } from '@/components/TenantProvider';
import { supabase, isBackendEnabled } from '@/lib/supabase';
import { TIERS, getTierById, getTierDisplayName } from '@/lib/tiers';
import type { SubscriptionTier } from '@/lib/tiers';
import { Shield, AlertTriangle, Check, X, CreditCard, RotateCcw } from 'lucide-react';

interface SubscriptionData {
  tier: string;
  status: string;
  monthly_rate: number;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_subscription_id: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function StatusBadge({ status, cancelPending }: { status: string; cancelPending: boolean }) {
  if (cancelPending) {
    return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">Canceling</span>;
  }
  const colors: Record<string, string> = {
    active: 'bg-sage-100 text-sage-800',
    trialing: 'bg-accent-100 text-accent-800',
    past_due: 'bg-red-100 text-red-800',
    canceled: 'bg-ink-100 text-ink-600',
  };
  const labels: Record<string, string> = {
    active: 'Active',
    trialing: 'Trial',
    past_due: 'Past Due',
    canceled: 'Canceled',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${colors[status] || 'bg-ink-100 text-ink-600'}`}>
      {labels[status] || status}
    </span>
  );
}

export default function SubscriptionPage() {
  const { currentRole, currentUser } = useAuthStore();
  const tenant = useTenantContext();
  const [sub, setSub] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelConfirmText, setCancelConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load subscription data
  useEffect(() => {
    if (!isBackendEnabled || !supabase || tenant.isDemo) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data, error: fetchErr } = await supabase
          .from('subscriptions')
          .select('tier, status, monthly_rate, current_period_start, current_period_end, cancel_at_period_end, stripe_subscription_id')
          .eq('tenant_id', tenant.id)
          .maybeSingle();
        if (fetchErr) throw fetchErr;
        setSub(data);
      } catch (err: any) {
        console.warn('Failed to load subscription:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [tenant.id, tenant.isDemo]);

  // Call edge function
  const callManageSubscription = async (action: string, extra?: Record<string, string>) => {
    if (!supabase) return null;
    setError(null);
    setSuccessMsg(null);
    setActionLoading(action);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-subscription`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ action, ...extra }),
        },
      );
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Request failed');
      }
      return data;
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
      return null;
    } finally {
      setActionLoading(null);
    }
  };

  const handleChangeTier = async () => {
    if (!selectedTier || selectedTier === sub?.tier) return;
    const result = await callManageSubscription('change-tier', { newTier: selectedTier });
    if (result?.success) {
      setSub(prev => prev ? { ...prev, tier: selectedTier, monthly_rate: getTierById(selectedTier)?.monthly || prev.monthly_rate } : prev);
      setSelectedTier(null);
      setSuccessMsg(`Plan changed to ${getTierDisplayName(selectedTier)}. Takes effect at your next billing date.`);
    }
  };

  const handleCancel = async () => {
    const result = await callManageSubscription('cancel');
    if (result?.success) {
      setSub(prev => prev ? { ...prev, cancel_at_period_end: true } : prev);
      setShowCancelModal(false);
      setCancelConfirmText('');
      setSuccessMsg(`Cancellation scheduled. Access continues until ${formatDate(result.periodEnd || sub?.current_period_end || null)}.`);
    }
  };

  const handleReactivate = async () => {
    const result = await callManageSubscription('reactivate');
    if (result?.success) {
      setSub(prev => prev ? { ...prev, cancel_at_period_end: false } : prev);
      setSuccessMsg('Subscription reactivated! Your plan will continue as normal.');
    }
  };

  // ── Guards ──
  if (currentRole !== 'BOARD_MEMBER') {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-8 text-center">
          <Shield className="w-10 h-10 text-ink-300 mx-auto mb-3" />
          <h2 className="font-display text-lg font-bold text-ink-900 mb-1">Access Restricted</h2>
          <p className="text-sm text-ink-500">Only board members can manage the subscription.</p>
        </div>
      </div>
    );
  }

  if (tenant.isDemo) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-8 text-center">
          <CreditCard className="w-10 h-10 text-ink-300 mx-auto mb-3" />
          <h2 className="font-display text-lg font-bold text-ink-900 mb-1">Subscription Management</h2>
          <p className="text-sm text-ink-500">Subscription management is not available in demo mode.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-8 flex justify-center">
          <div className="w-6 h-6 border-2 border-ink-300 border-t-ink-900 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!sub || !sub.stripe_subscription_id) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-8 text-center">
          <CreditCard className="w-10 h-10 text-ink-300 mx-auto mb-3" />
          <h2 className="font-display text-lg font-bold text-ink-900 mb-1">No Active Subscription</h2>
          <p className="text-sm text-ink-500">No active Stripe subscription found for this building.</p>
        </div>
      </div>
    );
  }

  const currentTier = getTierById(sub.tier);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="font-display text-2xl font-bold text-ink-900">Subscription</h1>

      {/* Status messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}
      {successMsg && (
        <div className="bg-sage-50 border border-sage-200 rounded-lg p-3 flex items-center gap-2 text-sm text-sage-700">
          <Check className="w-4 h-4 flex-shrink-0" />
          {successMsg}
          <button onClick={() => setSuccessMsg(null)} className="ml-auto text-sage-400 hover:text-sage-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ── Current Plan Card ── */}
      <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-bold text-ink-900">Current Plan</h2>
          <StatusBadge status={sub.status} cancelPending={sub.cancel_at_period_end} />
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-ink-400 text-xs mb-0.5">Plan</p>
            <p className="font-semibold text-ink-900">{currentTier?.name || sub.tier}</p>
          </div>
          <div>
            <p className="text-ink-400 text-xs mb-0.5">Price</p>
            <p className="font-semibold text-ink-900">${sub.monthly_rate}/mo</p>
          </div>
          <div>
            <p className="text-ink-400 text-xs mb-0.5">Current Period</p>
            <p className="text-ink-700">{formatDate(sub.current_period_start)} — {formatDate(sub.current_period_end)}</p>
          </div>
          <div>
            <p className="text-ink-400 text-xs mb-0.5">Next Billing Date</p>
            <p className="text-ink-700">{sub.cancel_at_period_end ? 'N/A' : formatDate(sub.current_period_end)}</p>
          </div>
        </div>

        {/* Cancel pending warning */}
        {sub.cancel_at_period_end && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-800">Cancellation Scheduled</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Your subscription will end on {formatDate(sub.current_period_end)}. All users will lose access after this date.
                </p>
                <button
                  onClick={handleReactivate}
                  disabled={actionLoading === 'reactivate'}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {actionLoading === 'reactivate' ? 'Reactivating...' : 'Reactivate Subscription'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Change Plan Section ── */}
      {!sub.cancel_at_period_end && sub.status !== 'canceled' && (
        <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-6">
          <h2 className="font-display text-lg font-bold text-ink-900 mb-1">Change Plan</h2>
          <p className="text-xs text-ink-400 mb-4">Changes take effect at your next billing date. No proration.</p>

          <div className="space-y-3">
            {TIERS.map(tier => {
              const isCurrent = tier.id === sub.tier;
              const isSelected = tier.id === selectedTier;
              return (
                <button
                  key={tier.id}
                  onClick={() => !isCurrent && setSelectedTier(tier.id)}
                  disabled={isCurrent}
                  className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                    isCurrent
                      ? 'border-accent-600 bg-accent-50 cursor-default'
                      : isSelected
                        ? 'border-accent-400 bg-accent-50'
                        : 'border-ink-200 hover:border-ink-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-ink-900">
                        {tier.name}
                        {isCurrent && <span className="ml-2 text-xs font-normal text-accent-600">Current Plan</span>}
                      </p>
                      <p className="text-xs text-ink-400 mt-0.5">{tier.features[0]}</p>
                    </div>
                    <p className="text-lg font-bold text-accent-600">${tier.monthly}<span className="text-xs font-normal text-ink-400">/mo</span></p>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedTier && selectedTier !== sub.tier && (
            <button
              onClick={handleChangeTier}
              disabled={actionLoading === 'change-tier'}
              className="mt-4 w-full py-3 bg-accent-600 text-white rounded-xl font-semibold text-sm hover:bg-accent-700 disabled:opacity-50"
            >
              {actionLoading === 'change-tier' ? 'Updating...' : `Switch to ${getTierDisplayName(selectedTier)}`}
            </button>
          )}
        </div>
      )}

      {/* ── Cancel Subscription Section ── */}
      {!sub.cancel_at_period_end && sub.status !== 'canceled' && (
        <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-6">
          <h2 className="font-display text-lg font-bold text-ink-900 mb-1">Cancel Subscription</h2>
          <p className="text-xs text-ink-400 mb-4">
            Cancellation takes effect at the end of your current billing period. All users will lose access.
          </p>
          <button
            onClick={() => setShowCancelModal(true)}
            className="px-4 py-2 border-2 border-red-300 text-red-600 rounded-lg text-sm font-semibold hover:bg-red-50 transition-colors"
          >
            Cancel Subscription
          </button>
        </div>
      )}

      {/* ── Cancel Confirmation Modal ── */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl border border-ink-100 p-6 w-full max-w-md mx-4">
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="font-display text-lg font-bold text-ink-900">Cancel Subscription?</h3>
              <p className="text-sm text-ink-500 mt-1">
                This will cancel your subscription at the end of the current billing period ({formatDate(sub.current_period_end)}).
                <strong className="text-ink-700"> All users will lose access</strong> after that date.
              </p>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-medium text-ink-700 mb-1">
                Type <span className="font-bold">"{tenant.name}"</span> to confirm
              </label>
              <input
                value={cancelConfirmText}
                onChange={e => setCancelConfirmText(e.target.value)}
                className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm"
                placeholder={tenant.name}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowCancelModal(false); setCancelConfirmText(''); }}
                className="flex-1 py-2.5 border border-ink-200 text-ink-700 rounded-lg text-sm font-semibold hover:bg-ink-50"
              >
                Keep Subscription
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelConfirmText !== tenant.name || actionLoading === 'cancel'}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading === 'cancel' ? 'Canceling...' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
