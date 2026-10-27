import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useTenantContext } from '@/components/TenantProvider';
import { supabase, isBackendEnabled } from '@/lib/supabase';
import { isOwner as checkIsOwner, canSetup } from '@/lib/ownership';
import {
  PLANS,
  normalizePlan,
  planFeatures,
  onCallPrice,
  periodTotal,
  setupPrice,
  ON_CALL,
  PM_SEAT,
  PM_SEAT_LABEL,
  SETUP_LABEL,
} from '@/lib/tiers';
import type { PlanId, BillingInterval } from '@/lib/tiers';
import {
  Shield,
  AlertTriangle,
  Check,
  X,
  CreditCard,
  ExternalLink,
  Loader2,
  Wrench,
  ToggleLeft,
  ToggleRight,
  Crown,
  Trash2,
} from 'lucide-react';

// ── Types ──

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
  billing_interval: string;
  setup_paid_at: string | null;
  setup_amount: number | null;
}

// ── Helpers ──

function formatDate(iso: string | null): string {
  if (!iso) return '\u2014';
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

// ── Demo pricing preview ──

const DEMO_PRICING = {
  plan: { name: 'Plus Facilities', price: 279 },
  addOns: [
    { name: 'On Call', price: 499, enabled: true },
    { name: PM_SEAT_LABEL, price: 79, enabled: false },
  ],
  setup: { name: SETUP_LABEL, price: 599, oneTime: true },
};

function DemoSubscriptionPreview() {
  const { leaveDemo } = useAuthStore();
  const navigate = useNavigate();

  const handleCTA = () => {
    leaveDemo('subscription');
    navigate('/login?create=1&from=demo');
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="font-display text-2xl font-bold text-ink-900">Subscription</h1>

      <div className="bg-brand-teal-light border border-brand-teal/30 rounded-lg p-3 text-sm text-brand-teal">
        This is how your subscription page will look. Sunny Acres is a sample building.
      </div>

      {/* Current plan */}
      <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-bold text-ink-900">Current Plan</h2>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sage-100 text-sage-800">Active</span>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-ink-400 text-xs mb-0.5">Plan</p>
            <p className="font-semibold text-ink-900">{DEMO_PRICING.plan.name}</p>
          </div>
          <div>
            <p className="text-ink-400 text-xs mb-0.5">Price</p>
            <p className="font-semibold text-ink-900">${DEMO_PRICING.plan.price}/mo</p>
          </div>
        </div>
      </div>

      {/* Add-ons */}
      <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-6">
        <h2 className="font-display text-lg font-bold text-ink-900 mb-4">Add-ons</h2>
        <div className="space-y-3">
          {DEMO_PRICING.addOns.map((addon) => (
            <div key={addon.name} className="flex items-center justify-between p-3 rounded-lg border border-ink-200">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${addon.enabled ? 'bg-sage-500' : 'bg-ink-200'}`} />
                <span className="text-sm font-medium text-ink-900">{addon.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-ink-500">${addon.price}/mo</span>
                <button
                  onClick={handleCTA}
                  className="px-3 py-1 text-xs font-semibold rounded-lg border border-accent-300 text-accent-600 hover:bg-accent-50"
                >
                  {addon.enabled ? 'Manage' : 'Add'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Setup fee */}
      <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-ink-900">{DEMO_PRICING.setup.name}</h2>
            <p className="text-xs text-ink-400">One-time</p>
          </div>
          <span className="text-lg font-bold text-accent-600">${DEMO_PRICING.setup.price}</span>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={handleCTA}
        className="w-full py-3.5 bg-accent-600 text-white rounded-xl font-semibold text-sm hover:bg-accent-700"
      >
        Start Your Own Building
      </button>
    </div>
  );
}

// ── Main Component ──

export default function SubscriptionPage() {
  const { currentRole, currentUser } = useAuthStore();
  const tenant = useTenantContext();
  const [searchParams, setSearchParams] = useSearchParams();

  const [sub, setSub] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Checkout builder state (no chargebee_subscription_id branch)
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('self_managed');
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');
  const [onCallChecked, setOnCallChecked] = useState(false);
  const [pmSeatChecked, setPmSeatChecked] = useState(false);
  const [setupChecked, setSetupChecked] = useState(false);

  // PM seat disable check
  const [hasPmUser, setHasPmUser] = useState(false);

  // Ownership
  const [ownerInfo, setOwnerInfo] = useState<{ name: string; email: string } | null>(null);
  const [boardMembersForTransfer, setBoardMembersForTransfer] = useState<Array<{ user_id: string; name: string; email: string }>>([]);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const meIsOwner = checkIsOwner(tenant.me);
  const meCanSetup = canSetup(tenant.me);

  // Polling state for post-checkout
  const pollingRef = useRef(false);

  // ── Load subscription data ──
  const loadSubscription = useCallback(async () => {
    if (!isBackendEnabled || !supabase || tenant.isDemo) {
      setLoading(false);
      return;
    }
    try {
      const { data, error: fetchErr } = await supabase
        .from('subscriptions')
        .select(
          'tier, status, monthly_rate, current_period_start, current_period_end, cancel_at_period_end, stripe_subscription_id, chargebee_subscription_id, trial_ends_at, created_at, addon_on_call, pm_addon, billing_interval, setup_paid_at, setup_amount'
        )
        .eq('tenant_id', tenant.id)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      setSub(data);
      if (data) {
        const plan = normalizePlan(data.tier);
        setSelectedPlan(plan);
        setBillingInterval((data.billing_interval as BillingInterval) || 'monthly');
        setOnCallChecked(data.addon_on_call ?? false);
        setPmSeatChecked(data.pm_addon ?? false);
      }
    } catch (err: any) {
      console.warn('Failed to load subscription:', err);
    } finally {
      setLoading(false);
    }
  }, [tenant.id, tenant.isDemo]);

  useEffect(() => {
    loadSubscription();
  }, [loadSubscription]);

  // Load ownership info
  useEffect(() => {
    if (!isBackendEnabled || !supabase || tenant.isDemo) return;
    (async () => {
      try {
        // Get owner
        const { data: owner } = await supabase
          .from('tenant_users')
          .select('user_id, email, role')
          .eq('tenant_id', tenant.id)
          .eq('is_account_owner', true)
          .maybeSingle();
        if (owner) {
          const { data: profile } = await supabase.auth.admin?.getUserById?.(owner.user_id) || { data: null };
          setOwnerInfo({
            name: profile?.user?.user_metadata?.name || owner.email?.split('@')[0] || 'Owner',
            email: owner.email || '',
          });
        }
        // Get board members for transfer picker
        const { data: members } = await supabase
          .from('tenant_users')
          .select('user_id, email, role')
          .eq('tenant_id', tenant.id)
          .eq('role', 'board_member')
          .eq('is_account_owner', false);
        if (members) {
          setBoardMembersForTransfer(
            members.map((m: any) => ({ user_id: m.user_id, name: m.email?.split('@')[0] || 'Member', email: m.email || '' }))
          );
        }
      } catch {
        // ignore
      }
    })();
  }, [tenant.id, tenant.isDemo]);

  // Check for existing property_manager users (disables PM seat toggle)
  useEffect(() => {
    if (!isBackendEnabled || !supabase || tenant.isDemo) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('tenant_users')
          .select('id')
          .eq('tenant_id', tenant.id)
          .eq('role', 'property_manager')
          .limit(1);
        setHasPmUser((data?.length ?? 0) > 0);
      } catch {
        // ignore
      }
    })();
  }, [tenant.id, tenant.isDemo]);

  // ── Poll for chargebee_subscription_id after checkout redirect ──
  useEffect(() => {
    if (searchParams.get('billing') !== '1') return;
    if (pollingRef.current) return;
    pollingRef.current = true;

    let attempts = 0;
    const maxAttempts = 15;
    const interval = 1200;

    const poll = async () => {
      if (!supabase) return;
      attempts++;
      try {
        const { data } = await supabase
          .from('subscriptions')
          .select(
            'tier, status, monthly_rate, current_period_start, current_period_end, cancel_at_period_end, stripe_subscription_id, chargebee_subscription_id, trial_ends_at, created_at, addon_on_call, pm_addon, billing_interval, setup_paid_at, setup_amount'
          )
          .eq('tenant_id', tenant.id)
          .maybeSingle();

        if (data?.chargebee_subscription_id) {
          setSub(data);
          setSuccessMsg('Billing is set up! Your subscription is active.');
          // Remove the query param
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.delete('billing');
            return next;
          });
          pollingRef.current = false;
          return;
        }
      } catch {
        // ignore polling errors
      }

      if (attempts < maxAttempts) {
        setTimeout(poll, interval);
      } else {
        pollingRef.current = false;
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete('billing');
          return next;
        });
        setError('Billing setup is still processing. Refresh the page in a moment.');
      }
    };

    poll();
  }, [searchParams, tenant.id, setSearchParams]);

  // ── Edge function helper ──

  const callManageSubscription = async (action: string, extra?: Record<string, any>) => {
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
          body: JSON.stringify({ action, tenant_id: tenant.id, ...extra }),
        },
      );
      const data = await res.json();
      if (res.status === 402 && data.needsCard) {
        return data; // Let caller handle 402
      }
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

  // ── Checkout (no chargebee sub) ──

  const handleCheckout = async () => {
    if (!supabase) return;
    setError(null);
    setActionLoading('checkout');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chargebee-checkout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            tenantId: tenant.id,
            plan: selectedPlan,
            interval: billingInterval,
            onCall: onCallChecked,
            pmSeat: pmSeatChecked,
            setup: setupChecked,
            origin: window.location.origin,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Checkout failed');
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Chargebee management actions ──

  const handleChangePlan = async () => {
    if (!sub) return;
    const currentPlan = normalizePlan(sub.tier);
    const newPlan: PlanId = currentPlan === 'self_managed' ? 'facilities' : 'self_managed';
    const result = await callManageSubscription('change-plan', { plan: newPlan });
    if (result?.success) {
      await loadSubscription();
      setSuccessMsg(`Plan changed to ${PLANS[newPlan].name}.`);
    }
  };

  const handleToggleOnCall = async () => {
    if (!sub) return;
    const newValue = !sub.addon_on_call;
    const result = await callManageSubscription('set-on-call', { enabled: newValue });
    if (result?.success) {
      setSub(prev => prev ? { ...prev, addon_on_call: newValue } : prev);
      setSuccessMsg(newValue ? 'On Call add-on enabled.' : 'On Call add-on removed.');
    }
  };

  const handleTogglePmSeat = async () => {
    if (!sub || hasPmUser) return;
    const newValue = !sub.pm_addon;
    const result = await callManageSubscription('set-pm-seat', { enabled: newValue });
    if (result?.success) {
      setSub(prev => prev ? { ...prev, pm_addon: newValue } : prev);
      setSuccessMsg(newValue ? 'Property manager seat add-on enabled.' : 'Property manager seat add-on removed.');
    }
  };

  const handleBuySetup = async () => {
    const result = await callManageSubscription('buy-setup');
    if (result?.needsCard) {
      handleOpenPortal();
      return;
    }
    if (result?.success) {
      await loadSubscription();
      setSuccessMsg('Setup purchased successfully.');
    }
  };

  const handleOpenPortal = async () => {
    if (!supabase) return;
    setActionLoading('portal');
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
          body: JSON.stringify({ tenant_id: tenant.id }),
        },
      );
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to open billing portal');
      if (data.url) {
        window.open(data.url, '_blank');
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Ownership actions ──

  const handleTransferOwnership = async () => {
    if (!supabase || !transferTarget) return;
    setActionLoading('transfer');
    try {
      const { error: rpcErr } = await supabase.rpc('transfer_ownership', {
        p_tenant_id: tenant.id,
        p_to_user_id: transferTarget,
      });
      if (rpcErr) throw rpcErr;
      setSuccessMsg('Ownership transfer initiated.');
      setShowTransferModal(false);
      setTransferTarget('');
    } catch (err: any) {
      setError(err.message || 'Transfer failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteBuilding = async () => {
    if (!supabase || deleteConfirmText !== tenant.name) return;
    setActionLoading('delete');
    try {
      // Delete tenant and all associated data
      const { error: delErr } = await supabase
        .from('tenants')
        .delete()
        .eq('id', tenant.id);
      if (delErr) throw delErr;
      // Sign out after deletion
      const { signOut } = useAuthStore.getState();
      signOut();
    } catch (err: any) {
      setError(err.message || 'Delete failed');
      setActionLoading(null);
    }
  };

  // ── Guards ──

  if (!meCanSetup && currentRole !== 'BOARD_MEMBER') {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-8 text-center">
          <Shield className="w-10 h-10 text-ink-300 mx-auto mb-3" />
          <h2 className="font-display text-lg font-bold text-ink-900 mb-1">Access Restricted</h2>
          <p className="text-sm text-ink-500">Only board members or the account owner can manage the subscription.</p>
        </div>
      </div>
    );
  }

  if (tenant.isDemo) {
    return <DemoSubscriptionPreview />;
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

  // ── Derived values ──

  const hasChargebee = !!sub?.chargebee_subscription_id;

  // ── No Chargebee subscription: checkout builder ──

  if (!hasChargebee) {
    const total = periodTotal({ plan: selectedPlan, onCall: onCallChecked, pmSeat: pmSeatChecked, interval: billingInterval });
    const setup = setupChecked ? setupPrice(selectedPlan) : 0;
    const isPolling = searchParams.get('billing') === '1';

    return (
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <h1 className="font-display text-2xl font-bold text-ink-900">Set up billing</h1>

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

        {isPolling && (
          <div className="bg-accent-50 border border-accent-200 rounded-lg p-3 flex items-center gap-2 text-sm text-accent-700">
            <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
            Confirming your subscription...
          </div>
        )}

        {/* Current plan info */}
        {sub && (
          <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-4">
            <p className="text-xs text-ink-400 mb-0.5">Current plan on file</p>
            <p className="text-sm font-semibold text-ink-900">{PLANS[normalizePlan(sub.tier)].name}</p>
          </div>
        )}

        {/* Plan cards */}
        <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-6">
          <h2 className="font-display text-lg font-bold text-ink-900 mb-4">Choose your plan</h2>
          <div className="space-y-3">
            {(Object.keys(PLANS) as PlanId[]).map((pid) => {
              const p = PLANS[pid];
              const isSelected = pid === selectedPlan;
              return (
                <button
                  key={pid}
                  onClick={() => setSelectedPlan(pid)}
                  className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                    isSelected
                      ? 'border-accent-600 bg-accent-50'
                      : 'border-ink-200 hover:border-ink-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-bold text-ink-900">{p.name}</p>
                    <p className="text-lg font-bold text-accent-600">
                      ${billingInterval === 'annual' ? Math.round(p.annual / 10) : p.monthly}
                      <span className="text-xs font-normal text-ink-400">/mo</span>
                    </p>
                  </div>
                  <p className="text-xs text-ink-500">{p.tagline}</p>
                  {isSelected && (
                    <ul className="mt-2 space-y-0.5">
                      {p.includes.slice(0, 6).map((line, i) => (
                        <li key={i} className="text-xs text-ink-500 flex items-start gap-1.5">
                          <Check className="w-3 h-3 text-sage-500 mt-0.5 flex-shrink-0" />
                          {line}
                        </li>
                      ))}
                    </ul>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Billing interval toggle */}
        <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-6">
          <h2 className="font-display text-lg font-bold text-ink-900 mb-3">Billing interval</h2>
          <div className="flex gap-3">
            <button
              onClick={() => setBillingInterval('monthly')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all ${
                billingInterval === 'monthly'
                  ? 'border-accent-600 bg-accent-50 text-accent-700'
                  : 'border-ink-200 text-ink-600 hover:border-ink-300'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingInterval('annual')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all ${
                billingInterval === 'annual'
                  ? 'border-accent-600 bg-accent-50 text-accent-700'
                  : 'border-ink-200 text-ink-600 hover:border-ink-300'
              }`}
            >
              Annual <span className="text-xs font-normal">(save ~17%)</span>
            </button>
          </div>
        </div>

        {/* Add-ons */}
        <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-6">
          <h2 className="font-display text-lg font-bold text-ink-900 mb-4">Add-ons</h2>
          <div className="space-y-3">
            {/* On Call */}
            <label className="flex items-center justify-between p-3 rounded-lg border border-ink-200 cursor-pointer hover:bg-ink-50 transition-colors">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={onCallChecked}
                  onChange={(e) => setOnCallChecked(e.target.checked)}
                  className="w-4 h-4 rounded border-ink-300 text-accent-600 focus:ring-accent-500"
                />
                <div>
                  <p className="text-sm font-medium text-ink-900">On Call</p>
                  <p className="text-xs text-ink-400">
                    {ON_CALL[selectedPlan].hours} hours/mo of expert support
                  </p>
                </div>
              </div>
              <span className="text-sm font-semibold text-accent-600">
                ${onCallPrice(selectedPlan, billingInterval) === ON_CALL[selectedPlan].annual
                  ? `${Math.round(ON_CALL[selectedPlan].annual / 10)}`
                  : ON_CALL[selectedPlan].monthly}/mo
              </span>
            </label>

            {/* PM Seat */}
            <label className="flex items-center justify-between p-3 rounded-lg border border-ink-200 cursor-pointer hover:bg-ink-50 transition-colors">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={pmSeatChecked}
                  onChange={(e) => setPmSeatChecked(e.target.checked)}
                  className="w-4 h-4 rounded border-ink-300 text-accent-600 focus:ring-accent-500"
                />
                <div>
                  <p className="text-sm font-medium text-ink-900">Property manager seat</p>
                  <p className="text-xs text-ink-400">Property manager access</p>
                </div>
              </div>
              <span className="text-sm font-semibold text-accent-600">
                ${billingInterval === 'annual' ? Math.round(PM_SEAT.annual / 10) : PM_SEAT.monthly}/mo
              </span>
            </label>

            {/* Setup */}
            <label className="flex items-center justify-between p-3 rounded-lg border border-ink-200 cursor-pointer hover:bg-ink-50 transition-colors">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={setupChecked}
                  onChange={(e) => setSetupChecked(e.target.checked)}
                  className="w-4 h-4 rounded border-ink-300 text-accent-600 focus:ring-accent-500"
                />
                <div>
                  <p className="text-sm font-medium text-ink-900">Setup with us</p>
                  <p className="text-xs text-ink-400">One-time onboarding assistance</p>
                </div>
              </div>
              <span className="text-sm font-semibold text-accent-600">
                ${setupPrice(selectedPlan)} <span className="text-xs font-normal text-ink-400">billed today</span>
              </span>
            </label>
          </div>
        </div>

        {/* Running total */}
        <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-6">
          <h2 className="font-display text-lg font-bold text-ink-900 mb-3">Summary</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-600">{PLANS[selectedPlan].name} ({billingInterval})</span>
              <span className="font-semibold text-ink-900">
                ${billingInterval === 'annual' ? Math.round(PLANS[selectedPlan].annual / 10) : PLANS[selectedPlan].monthly}/mo
              </span>
            </div>
            {onCallChecked && (
              <div className="flex justify-between">
                <span className="text-ink-600">On Call</span>
                <span className="font-semibold text-ink-900">
                  ${billingInterval === 'annual' ? Math.round(ON_CALL[selectedPlan].annual / 10) : ON_CALL[selectedPlan].monthly}/mo
                </span>
              </div>
            )}
            {pmSeatChecked && (
              <div className="flex justify-between">
                <span className="text-ink-600">Property manager seat</span>
                <span className="font-semibold text-ink-900">
                  ${billingInterval === 'annual' ? Math.round(PM_SEAT.annual / 10) : PM_SEAT.monthly}/mo
                </span>
              </div>
            )}
            <div className="border-t border-ink-100 pt-2 flex justify-between">
              <span className="font-semibold text-ink-900">Monthly total</span>
              <span className="font-bold text-accent-600">${total}/mo</span>
            </div>
            {setup > 0 && (
              <div className="flex justify-between text-ink-500">
                <span>+ Setup with us (one-time)</span>
                <span className="font-semibold">${setup}</span>
              </div>
            )}
          </div>
        </div>

        {/* Checkout button */}
        <button
          onClick={handleCheckout}
          disabled={actionLoading === 'checkout' || isPolling}
          className="w-full py-3.5 bg-accent-600 text-white rounded-xl font-semibold text-sm hover:bg-accent-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {actionLoading === 'checkout' ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Redirecting...
            </>
          ) : (
            'Continue to payment'
          )}
        </button>
      </div>
    );
  }

  // ── With Chargebee subscription: management view ──

  const currentPlan = normalizePlan(sub!.tier);
  const currentInterval: BillingInterval = (sub!.billing_interval as BillingInterval) || 'monthly';
  const alternatePlan: PlanId = currentPlan === 'self_managed' ? 'facilities' : 'self_managed';

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

      {/* Trial countdown banner */}
      {sub!.status === 'trialing' && sub!.trial_ends_at && (() => {
        const now = new Date();
        const trialEnd = new Date(sub!.trial_ends_at!);
        const daysLeft = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / 86400000));
        const trialStart = sub!.created_at ? new Date(sub!.created_at) : now;
        const totalDays = Math.max(1, Math.ceil((trialEnd.getTime() - trialStart.getTime()) / 86400000));
        const progress = Math.min(100, Math.round(((totalDays - daysLeft) / totalDays) * 100));
        const isUrgent = daysLeft <= 7;

        return (
          <div className={`rounded-xl p-5 border ${isUrgent ? 'bg-amber-50 border-amber-200' : 'bg-accent-50 border-accent-200'}`}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-display text-base font-bold text-ink-900">
                {daysLeft} day{daysLeft !== 1 ? 's' : ''} left in your free trial
              </h2>
              <span className={`text-xs font-semibold ${isUrgent ? 'text-amber-600' : 'text-accent-600'}`}>
                {progress}% elapsed
              </span>
            </div>
            <div className="w-full h-1.5 bg-ink-100 rounded-full mb-3">
              <div
                className={`h-full rounded-full ${isUrgent ? 'bg-amber-500' : 'bg-accent-500'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm text-ink-600">
              Billing starts <strong>{formatDate(sub!.trial_ends_at)}</strong>.
              All features are unlocked during your trial.
            </p>
          </div>
        );
      })()}

      {/* Unified subscription card */}
      {(() => {
        const planPrice = currentInterval === 'annual' ? Math.round(PLANS[currentPlan].annual / 10) : PLANS[currentPlan].monthly;
        const ocPrice = currentInterval === 'annual' ? Math.round(ON_CALL[currentPlan].annual / 10) : ON_CALL[currentPlan].monthly;
        const pmPrice = currentInterval === 'annual' ? Math.round(PM_SEAT.annual / 10) : PM_SEAT.monthly;
        const monthlyTotal = periodTotal({ plan: currentPlan, onCall: sub!.addon_on_call, pmSeat: sub!.pm_addon, interval: currentInterval });

        return (
          <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-lg font-bold text-ink-900">Your subscription</h2>
              <StatusBadge status={sub!.status} cancelPending={sub!.cancel_at_period_end} />
            </div>

            <div className="space-y-3">
              {/* Plan line item */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-ink-900 font-medium">{PLANS[currentPlan].name} ({currentInterval})</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-semibold text-ink-900">${planPrice}/mo</span>
                  {!sub!.cancel_at_period_end && sub!.status !== 'canceled' && (
                    <button
                      onClick={handleChangePlan}
                      disabled={actionLoading === 'change-plan'}
                      className="px-3 py-1 text-xs font-semibold rounded-lg border border-accent-300 text-accent-600 hover:bg-accent-50 transition-colors disabled:opacity-50"
                    >
                      {actionLoading === 'change-plan' ? 'Updating...' : 'Change'}
                    </button>
                  )}
                </div>
              </div>

              {/* On Call line item */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-ink-900 font-medium">On Call</span>
                  <span className="text-xs text-ink-400">({ON_CALL[currentPlan].hours} hrs/mo)</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-semibold text-ink-900">${ocPrice}/mo</span>
                  <button
                    onClick={handleToggleOnCall}
                    disabled={actionLoading === 'set-on-call'}
                    className="text-ink-400 hover:text-accent-600 transition-colors disabled:opacity-50"
                    title={sub!.addon_on_call ? 'Disable On Call' : 'Enable On Call'}
                  >
                    {sub!.addon_on_call ? (
                      <ToggleRight className="w-7 h-7 text-accent-600" />
                    ) : (
                      <ToggleLeft className="w-7 h-7" />
                    )}
                  </button>
                </div>
              </div>

              {/* PM Seat line item */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-ink-900 font-medium">Property manager seat</span>
                  {hasPmUser && <span className="text-xs text-amber-600">(active PM user)</span>}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-semibold text-ink-900">${pmPrice}/mo</span>
                  <button
                    onClick={handleTogglePmSeat}
                    disabled={actionLoading === 'set-pm-seat' || hasPmUser}
                    className="text-ink-400 hover:text-accent-600 transition-colors disabled:opacity-50"
                    title={
                      hasPmUser
                        ? 'Cannot disable while a property manager user exists'
                        : sub!.pm_addon
                          ? 'Disable property manager seat'
                          : 'Enable property manager seat'
                    }
                  >
                    {sub!.pm_addon ? (
                      <ToggleRight className="w-7 h-7 text-accent-600" />
                    ) : (
                      <ToggleLeft className="w-7 h-7" />
                    )}
                  </button>
                </div>
              </div>

              {/* Divider + total */}
              <div className="border-t border-ink-100 pt-3 flex items-center justify-between">
                <span className="text-sm font-bold text-ink-900">Monthly total</span>
                <span className="text-base font-bold text-accent-600">${monthlyTotal}/mo</span>
              </div>
            </div>

            {/* Footer: billing info + switch interval */}
            <div className="mt-4 pt-4 border-t border-ink-50 text-sm text-ink-500 space-y-2">
              <p>
                Billed {currentInterval}
                {!sub!.cancel_at_period_end && sub!.current_period_end && (
                  <> · Next billing: <strong className="text-ink-700">{formatDate(sub!.current_period_end)}</strong></>
                )}
              </p>
              {sub!.billing_interval === 'monthly' && sub!.status !== 'canceled' && !sub!.cancel_at_period_end && (
                <button
                  onClick={async () => {
                    const result = await callManageSubscription('set-interval', { interval: 'annual' });
                    if (result?.success) {
                      await loadSubscription();
                      setSuccessMsg('Switched to annual billing.');
                    }
                  }}
                  disabled={actionLoading === 'set-interval'}
                  className="text-accent-600 font-semibold hover:text-accent-700 transition-colors disabled:opacity-50"
                >
                  {actionLoading === 'set-interval' ? 'Updating...' : 'Switch to annual (save ~17%)'}
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* 4. Setup Section */}
      <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent-50 flex items-center justify-center">
              <Wrench className="w-4.5 h-4.5 text-accent-600" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-ink-900">Setup with us</h2>
              {sub!.setup_paid_at ? (
                <p className="text-xs text-ink-400">
                  Purchased {formatDate(sub!.setup_paid_at)}
                  {sub!.setup_amount != null && ` \u2014 $${sub!.setup_amount}`}
                </p>
              ) : (
                <p className="text-xs text-ink-400">One-time onboarding assistance</p>
              )}
            </div>
          </div>
          {!sub!.setup_paid_at ? (
            <button
              onClick={handleBuySetup}
              disabled={actionLoading === 'buy-setup'}
              className="px-4 py-2 bg-accent-600 text-white rounded-lg text-sm font-semibold hover:bg-accent-700 disabled:opacity-50 transition-colors"
            >
              {actionLoading === 'buy-setup' ? 'Processing...' : `Book setup \u2014 $${setupPrice(currentPlan)}`}
            </button>
          ) : (
            <div className="flex items-center gap-1.5 text-sage-600">
              <Check className="w-4 h-4" />
              <span className="text-sm font-semibold">Purchased</span>
            </div>
          )}
        </div>
      </div>

      {/* 5. Billing / Portal Section */}
      <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent-50 flex items-center justify-center">
              <CreditCard className="w-4.5 h-4.5 text-accent-600" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-ink-900">Billing</h2>
              <p className="text-xs text-ink-400">Manage payment methods, invoices, and cancellation</p>
            </div>
          </div>
          <button
            onClick={handleOpenPortal}
            disabled={actionLoading === 'portal'}
            className="px-4 py-2 border-2 border-accent-300 text-accent-600 rounded-lg text-sm font-semibold hover:bg-accent-50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {actionLoading === 'portal' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ExternalLink className="w-4 h-4" />
            )}
            Manage billing
          </button>
        </div>
      </div>

      {/* 6. Ownership Section */}
      <div className="bg-white rounded-xl shadow-sm border border-ink-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
            <Crown className="w-4.5 h-4.5 text-amber-600" />
          </div>
          <div>
            <h2 className="font-display text-base font-bold text-ink-900">Ownership</h2>
            <p className="text-xs text-ink-400">Account owner and building management</p>
          </div>
        </div>

        {ownerInfo && (
          <div className="text-sm mb-4">
            <p className="text-ink-400 text-xs mb-0.5">Account owner</p>
            <p className="font-semibold text-ink-900">{ownerInfo.name}</p>
            <p className="text-ink-500 text-xs">{ownerInfo.email}</p>
          </div>
        )}

        {meIsOwner && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowTransferModal(true)}
              disabled={boardMembersForTransfer.length === 0}
              className="px-4 py-2 border-2 border-amber-300 text-amber-700 rounded-lg text-sm font-semibold hover:bg-amber-50 transition-colors disabled:opacity-50"
            >
              Transfer ownership
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 border-2 border-red-300 text-red-600 rounded-lg text-sm font-semibold hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 inline mr-1" />
              Delete building
            </button>
          </div>
        )}
      </div>

      {/* Transfer ownership modal */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4" onClick={() => setShowTransferModal(false)}>
          <div className="bg-white rounded-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="font-display text-lg font-bold text-ink-900 mb-2">Transfer Ownership</h2>
            <p className="text-sm text-ink-600 mb-4">Select a board member to transfer account ownership to.</p>
            <div className="space-y-2 mb-4">
              {boardMembersForTransfer.map((m) => (
                <label key={m.user_id} className="flex items-center gap-3 p-3 rounded-lg border border-ink-200 cursor-pointer hover:bg-mist-50">
                  <input
                    type="radio"
                    name="transferTarget"
                    value={m.user_id}
                    checked={transferTarget === m.user_id}
                    onChange={() => setTransferTarget(m.user_id)}
                    className="w-4 h-4 text-accent-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-ink-900">{m.name}</p>
                    <p className="text-xs text-ink-500">{m.email}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowTransferModal(false)} className="px-4 py-2 text-sm text-ink-600 hover:bg-ink-50 rounded-lg">Cancel</button>
              <button
                onClick={handleTransferOwnership}
                disabled={!transferTarget || actionLoading === 'transfer'}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold hover:bg-amber-700 disabled:opacity-50"
              >
                {actionLoading === 'transfer' ? 'Transferring...' : 'Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete building confirm */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white rounded-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="font-display text-lg font-bold text-red-600 mb-2">Delete Building</h2>
            <p className="text-sm text-ink-600 mb-4">
              This will permanently delete <strong>{tenant.name}</strong> and all associated data. This action cannot be undone.
            </p>
            <p className="text-sm text-ink-600 mb-2">Type <strong>{tenant.name}</strong> to confirm:</p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm mb-4"
              placeholder={tenant.name}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }} className="px-4 py-2 text-sm text-ink-600 hover:bg-ink-50 rounded-lg">Cancel</button>
              <button
                onClick={handleDeleteBuilding}
                disabled={deleteConfirmText !== tenant.name || actionLoading === 'delete'}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading === 'delete' ? 'Deleting...' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
