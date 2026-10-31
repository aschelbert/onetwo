import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useTenantContext } from '@/components/TenantProvider';
import { supabase, isBackendEnabled } from '@/lib/supabase';
import { TIERS, ADDONS, getTierById, getTierDisplayName, getAddOnPrice } from '@/lib/tiers';
import type { SubscriptionTier, BillingInterval, AddOnId } from '@/lib/tiers';
import { Shield, AlertTriangle, Check, X, CreditCard, RotateCcw, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';

interface SubscriptionData {
  tier: string;
  status: string;
  monthly_rate: number;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_subscription_id: string | null;
  chargebee_subscription_id: string | null;
  trial_ends_at: string | null;
  created_at: string | null;
  addon_on_call: boolean;
  pm_addon: boolean;
  billing_interval: BillingInterval;
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

/** Compute total display price from tiers.ts config (dollars). */
function computeDisplayPrice(
  tier: SubscriptionTier,
  interval: BillingInterval,
  addonOnCall: boolean,
  pmAddon: boolean,
): number {
  const tierConfig = getTierById(tier);
  if (!tierConfig) return 0;
  let total = interval === 'annual' ? tierConfig.annual : tierConfig.monthly;
  if (addonOnCall) {
    const onCallAddon = ADDONS.find(a => a.id === 'on_call');
    if (onCallAddon) total += getAddOnPrice(onCallAddon, tier, interval);
  }
  if (pmAddon) {
    const pmAddonConfig = ADDONS.find(a => a.id === 'pm_seat');
    if (pmAddonConfig) total += getAddOnPrice(pmAddonConfig, tier, interval);
  }
  return total;
}

export default function SubscriptionPage() {
  const { currentRole } = useAuthStore();
  const tenant = useTenantContext();
  const [sub, setSub] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelConfirmText, setCancelConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [managePlanOpen, setManagePlanOpen] = useState(false);

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
          .select('tier, status, monthly_rate, current_period_start, current_period_end, cancel_at_period_end, stripe_subscription_id, chargebee_subscription_id, trial_ends_at, created_at, addon_on_call, pm_addon, billing_interval')
          .eq('tenant_id', tenant.id)
          .maybeSingle();
        if (fetchErr) throw fetchErr;
        if (data) {
          setSub({
            ...data,
            addon_on_call: data.addon_on_call ?? false,
            pm_addon: data.pm_addon ?? false,
            billing_interval: data.billing_interval ?? 'monthly',
          });
        }
      } catch (err: any) {
        console.warn('Failed to load subscription:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [tenant.id, tenant.isDemo]);

  // Call edge function
  const callManageSubscription = async (action: string, extra?: Record<string, unknown>) => {
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
    const result = await callManageSubscription('change-plan', { plan: selectedTier });
    if (result?.success) {
      setSub(prev => prev ? { ...prev, tier: selectedTier, monthly_rate: result.monthlyRate ?? prev.monthly_rate } : prev);
      setSelectedTier(null);
      setSuccessMsg(`Plan changed to ${getTierDisplayName(selectedTier)}. Takes effect at your next billing date.`);
    }
  };

  const handleToggleOnCall = async () => {
    if (!sub) return;
    const enable = !sub.addon_on_call;
    // Optimistic update
    setSub(prev => prev ? { ...prev, addon_on_call: enable } : prev);
    const result = await callManageSubscription('set-on-call', { enable });
    if (result?.success) {
      setSub(prev => prev ? { ...prev, addon_on_call: enable, monthly_rate: result.monthlyRate ?? prev.monthly_rate } : prev);
      setSuccessMsg(`On Call ${enable ? 'added' : 'removed'}.`);
    } else {
      // Revert on failure
      setSub(prev => prev ? { ...prev, addon_on_call: !enable } : prev);
    }
  };

  const handleTogglePmSeat = async () => {
    if (!sub) return;
    const enable = !sub.pm_addon;
    // Optimistic update
    setSub(prev => prev ? { ...prev, pm_addon: enable } : prev);
    const result = await callManageSubscription('set-pm-seat', { enable });
    if (result?.success) {
      setSub(prev => prev ? { ...prev, pm_addon: enable, monthly_rate: result.monthlyRate ?? prev.monthly_rate } : prev);
      setSuccessMsg(`Property Manager Seat ${enable ? 'added' : 'removed'}.`);
    } else {
      // Revert on failure
      setSub(prev => prev ? { ...prev, pm_addon: !enable } : prev);
    }
  };

  const handleSetInterval = async (newInterval: BillingInterval) => {
    if (!sub || newInterval === sub.billing_interval) return;
    const prevInterval = sub.billing_interval;
    // Optimistic update
    setSub(prev => prev ? { ...prev, billing_interval: newInterval } : prev);
    const result = await callManageSubscription('set-interval', { interval: newInterval });
    if (result?.success) {
      setSub(prev => prev ? { ...prev, billing_interval: newInterval } : prev);
      setSuccessMsg(`Billing switched to ${newInterval === 'annual' ? 'annual' : 'monthly'}.`);
    } else {
      // Revert on failure
      setSub(prev => prev ? { ...prev, billing_interval: prevInterval } : prev);
    }
  };

  const handleOpenBillingPortal = async () => {
    if (!supabase) return;
    setActionLoading('billing-portal');
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chargebee-portal`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ origin: window.location.origin }),
        },
      );
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to open billing portal');
      }
      if (data.url) {
        window.open(data.url, '_blank');
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setActionLoading(null);
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
        <div className="bg-white rounded-2xl shadow-sm border border-ink-100 p-8 text-center">
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
        <div className="bg-white rounded-2xl shadow-sm border border-ink-100 p-8 text-center">
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
        <div className="bg-white rounded-2xl shadow-sm border border-ink-100 p-8 flex justify-center">
          <div className="w-6 h-6 border-2 border-ink-300 border-t-ink-900 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!sub || (!sub.stripe_subscription_id && !sub.chargebee_subscription_id)) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-ink-100 p-8 text-center">
          <CreditCard className="w-10 h-10 text-ink-300 mx-auto mb-3" />
          <h2 className="font-display text-lg font-bold text-ink-900 mb-1">No Active Subscription</h2>
          <p className="text-sm text-ink-500">No active subscription found for this building.</p>
        </div>
      </div>
    );
  }

  const currentTier = getTierById(sub.tier);
  const interval = sub.billing_interval;
  const totalPrice = computeDisplayPrice(
    sub.tier as SubscriptionTier,
    interval,
    sub.addon_on_call,
    sub.pm_addon,
  );
  const isManageable = !sub.cancel_at_period_end && sub.status !== 'canceled';

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

      {/* ── Section 1: Your Subscription overview ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-ink-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-bold text-ink-900">Your Subscription</h2>
          <StatusBadge status={sub.status} cancelPending={sub.cancel_at_period_end} />
        </div>

        {/* Row 1: Plan, Billing interval, Total price */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm mb-4">
          <div>
            <p className="text-ink-400 text-xs mb-0.5">Plan</p>
            <p className="font-semibold text-ink-900">{currentTier?.name || sub.tier}</p>
          </div>
          <div>
            <p className="text-ink-400 text-xs mb-0.5">Billing</p>
            <p className="font-semibold text-ink-900">{interval === 'annual' ? 'Annual' : 'Monthly'}</p>
          </div>
          <div>
            <p className="text-ink-400 text-xs mb-0.5">Total</p>
            <p className="font-semibold text-brand-teal text-lg">
              ${totalPrice.toLocaleString()}
              <span className="text-sm font-normal text-brand-teal"> / {interval === 'annual' ? 'yr' : 'mo'}</span>
            </p>
          </div>
        </div>

        {/* Row 2: Active add-ons */}
        <div className="mb-4">
          <p className="text-ink-400 text-xs mb-1">Add-ons</p>
          {sub.addon_on_call || sub.pm_addon ? (
            <div className="flex flex-wrap gap-3">
              {ADDONS.filter(a =>
                (a.id === 'on_call' && sub.addon_on_call) ||
                (a.id === 'pm_seat' && sub.pm_addon)
              ).map(addon => {
                const price = getAddOnPrice(addon, sub.tier as SubscriptionTier, interval);
                return (
                  <span key={addon.id} className="inline-flex items-center gap-1.5 text-sm text-ink-700">
                    <Check className="w-4 h-4 text-sage-600" />
                    {addon.name}
                    <span className="text-ink-400">${price.toLocaleString()}/{interval === 'annual' ? 'yr' : 'mo'}</span>
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-ink-400 italic">No add-ons</p>
          )}
        </div>

        {/* Row 3: Period dates and next billing */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-ink-400 text-xs mb-0.5">{sub.status === 'trialing' ? 'Trial Period' : 'Current Period'}</p>
            <p className="text-ink-700">
              {formatDate(sub.current_period_start || (sub.status === 'trialing' ? sub.created_at : null))}
              {' — '}
              {formatDate(sub.current_period_end || (sub.status === 'trialing' ? sub.trial_ends_at : null))}
            </p>
          </div>
          <div>
            <p className="text-ink-400 text-xs mb-0.5">{sub.status === 'trialing' ? 'Trial Ends' : 'Next Billing Date'}</p>
            <p className="text-ink-700">
              {sub.cancel_at_period_end
                ? 'N/A'
                : formatDate(sub.current_period_end || (sub.status === 'trialing' ? sub.trial_ends_at : null))}
            </p>
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

      {/* ── Section 2: Manage Plan (collapsible) ── */}
      {isManageable && (
        <div className="bg-white rounded-2xl shadow-sm border border-ink-100">
          <button
            onClick={() => setManagePlanOpen(v => !v)}
            className="w-full flex items-center justify-between p-6"
          >
            <h2 className="font-display text-lg font-bold text-ink-900">Manage Plan</h2>
            {managePlanOpen
              ? <ChevronUp className="w-5 h-5 text-ink-400" />
              : <ChevronDown className="w-5 h-5 text-ink-400" />}
          </button>

          {managePlanOpen && (
            <div className="px-6 pb-6 space-y-8">
              {/* ── 2a: Change Tier ── */}
              <div>
                <h3 className="font-display text-sm font-bold text-ink-900 mb-1">Change Tier</h3>
                <p className="text-xs text-ink-400 mb-4">Changes take effect at your next billing date.</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {TIERS.map(tier => {
                    const isCurrent = tier.id === sub.tier;
                    const isSelected = tier.id === (selectedTier ?? sub.tier);
                    const displayPrice = interval === 'annual' ? tier.annual : tier.monthly;
                    return (
                      <button
                        key={tier.id}
                        onClick={() => setSelectedTier(isCurrent ? null : tier.id)}
                        className={`p-5 rounded-2xl border-2 text-left transition-all ${
                          isSelected
                            ? 'border-brand-teal bg-[#F0FBFF]'
                            : 'border-dashed border-ink-200 hover:border-ink-300'
                        }`}
                      >
                        <p className="font-bold text-ink-900 text-lg">{tier.name}</p>
                        <p className="font-bold text-brand-teal text-lg mt-1">
                          ${displayPrice.toLocaleString()}
                          <span className="font-normal text-brand-teal text-sm"> / {interval === 'annual' ? 'yr' : 'mo'}</span>
                        </p>
                        {interval === 'annual' && (
                          <p className="text-xs text-ink-400 mt-0.5">${Math.round(tier.annual / 12)} / mo</p>
                        )}
                        <p className="text-sm text-ink-400 mt-2">{tier.tagline}</p>
                        {isCurrent && (
                          <span className="inline-block mt-2 text-xs font-semibold text-brand-teal">Current Plan</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {selectedTier && selectedTier !== sub.tier && (
                  <button
                    onClick={handleChangeTier}
                    disabled={actionLoading === 'change-plan'}
                    className="mt-4 w-full py-3 bg-brand-red text-white rounded-2xl font-semibold text-sm hover:bg-[#B82230] disabled:opacity-50"
                  >
                    {actionLoading === 'change-plan' ? 'Updating...' : `Switch to ${getTierDisplayName(selectedTier)}`}
                  </button>
                )}
              </div>

              {/* ── 2b: Add-Ons ── */}
              <div>
                <h3 className="font-display text-sm font-bold text-ink-900 mb-1">Add-Ons</h3>
                <p className="text-xs text-ink-400 mb-4">Toggle add-ons on or off. Changes are prorated.</p>

                <div className="space-y-3">
                  {ADDONS.map(addon => {
                    const isActive =
                      (addon.id === 'on_call' && sub.addon_on_call) ||
                      (addon.id === 'pm_seat' && sub.pm_addon);
                    const price = getAddOnPrice(addon, sub.tier as SubscriptionTier, interval);
                    const isToggling =
                      (addon.id === 'on_call' && actionLoading === 'set-on-call') ||
                      (addon.id === 'pm_seat' && actionLoading === 'set-pm-seat');

                    return (
                      <button
                        key={addon.id}
                        onClick={() => {
                          if (addon.id === 'on_call') handleToggleOnCall();
                          else handleTogglePmSeat();
                        }}
                        disabled={isToggling}
                        className={`w-full p-4 rounded-2xl border-2 text-left transition-all disabled:opacity-60 ${
                          isActive
                            ? 'border-brand-teal bg-[#F0FBFF]'
                            : 'border-ink-200 hover:border-ink-300'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            isActive ? 'bg-brand-teal border-brand-teal' : 'border-ink-300'
                          }`}>
                            {isActive && <span className="text-white text-xs">&#10003;</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-bold text-ink-900">{addon.name}</p>
                              <p className="text-sm font-bold text-brand-teal whitespace-nowrap">
                                ${price.toLocaleString()} / {interval === 'annual' ? 'yr' : 'mo'}
                              </p>
                            </div>
                            <p className="text-xs text-ink-400 mt-1">{addon.description}</p>
                            {isToggling && <p className="text-xs text-ink-400 mt-1">Updating...</p>}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── 2c: Billing Interval ── */}
              <div>
                <h3 className="font-display text-sm font-bold text-ink-900 mb-1">Billing Interval</h3>
                <p className="text-xs text-ink-400 mb-4">Switch between monthly and annual billing.</p>

                <div className="inline-flex rounded-full border border-ink-200 p-0.5">
                  <button
                    onClick={() => handleSetInterval('monthly')}
                    disabled={actionLoading === 'set-interval'}
                    className={`px-5 py-2 rounded-full text-sm font-medium transition-all disabled:opacity-60 ${
                      interval === 'monthly' ? 'bg-navy text-white' : 'text-ink-500 hover:text-ink-700'
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => handleSetInterval('annual')}
                    disabled={actionLoading === 'set-interval'}
                    className={`px-5 py-2 rounded-full text-sm font-medium transition-all disabled:opacity-60 ${
                      interval === 'annual' ? 'bg-navy text-white' : 'text-ink-500 hover:text-ink-700'
                    }`}
                  >
                    Annual, two months free
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Section 3: Billing & Invoices ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-ink-100 p-6">
        <h2 className="font-display text-lg font-bold text-ink-900 mb-1">Billing & Invoices</h2>
        <p className="text-xs text-ink-400 mb-4">
          View invoices, update your payment method, and manage billing details in the Chargebee portal.
        </p>
        <button
          onClick={handleOpenBillingPortal}
          disabled={actionLoading === 'billing-portal'}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-red text-white rounded-2xl text-sm font-semibold hover:bg-[#B82230] disabled:opacity-50 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          {actionLoading === 'billing-portal' ? 'Opening...' : 'Manage Billing'}
        </button>
      </div>

      {/* ── Section 4: Cancel Subscription ── */}
      {isManageable && (
        <div className="bg-white rounded-2xl shadow-sm border border-ink-100 p-6">
          <h2 className="font-display text-lg font-bold text-ink-900 mb-1">Cancel Subscription</h2>
          <p className="text-xs text-ink-400 mb-4">
            Cancellation takes effect at the end of your current billing period. All users will lose access.
          </p>
          <button
            onClick={() => setShowCancelModal(true)}
            className="px-4 py-2 border-2 border-red-300 text-red-600 rounded-2xl text-sm font-semibold hover:bg-red-50 transition-colors"
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
