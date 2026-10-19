import { useState, useEffect, useRef } from 'react';
import { usePlatformAdminStore, generateSubdomain, TIER_FEATURES, TENANT_ROLES, FEATURE_GROUPS, type Tenant, type SubscriptionTier } from '@/store/usePlatformAdminStore';
import { PLANS, planFeatures, normalizePlan, ON_CALL, PM_SEAT, SETUP } from '@/lib/tiers';
import type { PlanId } from '@/lib/tiers';
import { useAuthStore } from '@/store/useAuthStore';
import { fmt } from '@/lib/formatters';
import Modal from '@/components/ui/Modal';
import PermissionsTab from './PermissionsTab';
import BillingTab from './BillingTab';
import FinanceTab from './FinanceTab';
import FeedbackTab from './FeedbackTab';
import ProblemsTab from './ProblemsTab';

// ── Types ────────────────────────────────────────────────────────────────────

type Page = 'dashboard' | 'subscriptions' | 'features' | 'matrix' | 'permissions' | 'tenancies' | 'roles' | 'stripe' | 'finance' | 'support' | 'feedback' | 'problems';

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-sage-100 text-sage-700', onboarding: 'bg-accent-100 text-accent-700',
  suspended: 'bg-red-100 text-red-700', archived: 'bg-ink-100 text-ink-500',
  trial: 'bg-yellow-100 text-yellow-700', past_due: 'bg-red-100 text-red-700',
};
const PLAN_LABELS: Record<string, string> = { self_managed: 'Self-Managed', facilities: 'Plus Facilities' };
const PLAN_BADGE: Record<string, string> = {
  self_managed: 'bg-accent-100 text-accent-700', facilities: 'bg-sage-100 text-sage-700',
  // Legacy fallbacks
  essentials: 'bg-accent-100 text-accent-700', board: 'bg-accent-100 text-accent-700', estate: 'bg-sage-100 text-sage-700',
  compliance_pro: 'bg-accent-100 text-accent-700', community_plus: 'bg-accent-100 text-accent-700', management_suite: 'bg-sage-100 text-sage-700',
};
const PLAN_PRICES: Record<string, number> = { self_managed: PLANS.self_managed.monthly, facilities: PLANS.facilities.monthly };
const PLAN_COLORS: Record<string, string> = { self_managed: '#c42030', facilities: '#16a34a' };
const ACTIVE_PLANS: PlanId[] = ['self_managed', 'facilities'];
const FEATURE_LABELS: Record<string, string> = {
  fiscalLens: 'Fiscal Lens', caseOps: 'Case Ops', complianceRunbook: 'Compliance Runbook',
  aiAdvisor: 'AI Advisor', documentVault: 'Document Vault', paymentProcessing: 'Payment Processing',
  votesResolutions: 'Votes & Resolutions', communityPortal: 'Community Portal',
  vendorManagement: 'Vendor Management', reserveStudyTools: 'Reserve Study Tools',
  facilities: 'Plus Facilities', onCall: 'On Call',
};

/** Resolve any legacy tier string to the canonical PlanId for display */
function displayPlan(tier: SubscriptionTier): PlanId {
  return normalizePlan(tier);
}

const NAV = [
  { section: 'Overview', items: [
    { id: 'dashboard' as Page, label: 'Dashboard', d: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
  ]},
  { section: 'Product', items: [
    { id: 'subscriptions' as Page, label: 'Subscriptions', d: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
    { id: 'features' as Page, label: 'Features', d: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z' },
    { id: 'matrix' as Page, label: 'Feature Matrix', d: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zm10 0a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z' },
    { id: 'permissions' as Page, label: 'Permissions', d: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  ]},
  { section: 'Operations', items: [
    { id: 'tenancies' as Page, label: 'Tenancies', d: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
    { id: 'roles' as Page, label: 'User Roles', d: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
    { id: 'support' as Page, label: 'Support', d: 'M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z' },
    { id: 'feedback' as Page, label: 'Feedback', d: 'M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z' },
    { id: 'problems' as Page, label: 'Problem Statements', d: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  ]},
  { section: 'Billing', items: [
    { id: 'stripe' as Page, label: 'Billing', d: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
    { id: 'finance' as Page, label: 'Fiscal Lens', d: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  ]},
];

const PAGE_META: Record<Page, [string, string]> = {
  dashboard: ['Dashboard', 'Admin Console > Overview'],
  subscriptions: ['Subscriptions', 'Admin Console > Product > Subscriptions'],
  features: ['Features', 'Admin Console > Product > Features'],
  matrix: ['Feature Matrix', 'Admin Console > Product > Feature Matrix'],
  permissions: ['Permissions', 'Admin Console > Product > RBAC Permissions'],
  tenancies: ['Tenancies', 'Admin Console > Operations > Tenancies'],
  roles: ['User Roles', 'Admin Console > Operations > User Roles'],
  stripe: ['Billing', 'Admin Console > Billing > Billing'],
  finance: ['Fiscal Lens', 'Admin Console > Billing > Fiscal Lens'],
  support: ['Support', 'Admin Console > Operations > Support'],
  feedback: ['Feedback', 'Admin Console > Operations > Feedback'],
  problems: ['Problem Statements', 'Admin Console > Operations > Problem Statements'],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button onClick={onChange} disabled={disabled} className={`w-10 h-5 rounded-full relative transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${on ? 'bg-sage-500' : 'bg-ink-200'}`}>
      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

// ── Three-dot menu for tenancy cards ─────────────────────────────────────────

function TenancyMenu({ tenant, isLastRow, onView, onImpersonate, onActivate, onSuspend }: {
  tenant: Tenant;
  isLastRow: boolean;
  onView: () => void;
  onImpersonate: () => void;
  onActivate: () => void;
  onSuspend: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="p-1.5 rounded-lg hover:bg-ink-100 transition-colors text-ink-400 hover:text-ink-600 cursor-pointer">
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>
      {open && (
        <div className={`absolute right-0 ${isLastRow ? 'bottom-full mb-1' : 'top-full mt-1'} bg-white border border-ink-200 rounded-xl shadow-lg min-w-[180px] z-50 overflow-hidden`}>
          <button onClick={() => { onView(); setOpen(false); }}
            className="w-full text-left px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-50 cursor-pointer">
            View Tenancy
          </button>
          <button onClick={() => { onImpersonate(); setOpen(false); }}
            className="w-full text-left px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-50 cursor-pointer">
            View as Tenant
          </button>
          {tenant.status !== 'active' && (
            <button onClick={() => { onActivate(); setOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-sm font-medium text-sage-700 hover:bg-sage-50 cursor-pointer">
              Activate
            </button>
          )}
          {tenant.status !== 'suspended' && (
            <button onClick={() => { onSuspend(); setOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 cursor-pointer">
              Suspend
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function PlatformAdminPage() {
  const store = usePlatformAdminStore();
  const { tenants, permissions, stripeWebhookEvents, stripePayments, impersonating } = store;
  const { currentUser } = useAuthStore();
  const metrics = store.getPlatformMetrics();
  const ACTOR = currentUser?.name || 'Admin';

  const [page, setPage] = useState<Page>('dashboard');
  const [selectedTenancy, setSelectedTenancy] = useState<string | null>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [bldgForm, setBldgForm] = useState({ name: '', street: '', city: '', state: '', zip: '', units: '', yearBuilt: '', contactName: '', contactEmail: '', contactPhone: '', plan: 'self_managed' as PlanId });
  const [trialDaysInput, setTrialDaysInput] = useState(store.trialDays);
  const [trialDaysSaving, setTrialDaysSaving] = useState(false);

  useEffect(() => { setTrialDaysInput(store.trialDays); }, [store.trialDays]);

  const selected = tenants.find(t => t.id === selectedTenancy);
  const totalRevenueYTD = store.glEntries.filter(e => e.creditAcct.startsWith('4')).reduce((s, e) => s + e.amount, 0);

  const handleAddTenancy = () => {
    if (!bldgForm.name || !bldgForm.contactEmail) return;
    const id = `bld-${Date.now()}`;
    const today = new Date().toISOString().split('T')[0];
    const trialEnd = new Date(Date.now() + store.trialDays * 86400000).toISOString().split('T')[0];
    const subdomain = generateSubdomain(bldgForm.name, tenants.map(t => t.subdomain));
    store.addTenant({
      id, name: bldgForm.name, subdomain,
      address: { street: bldgForm.street, city: bldgForm.city, state: bldgForm.state, zip: bldgForm.zip },
      totalUnits: parseInt(bldgForm.units) || 0, yearBuilt: bldgForm.yearBuilt, status: 'onboarding', createdAt: today,
      subscription: { tier: bldgForm.plan, status: 'trial', startDate: today, nextBillingDate: trialEnd, monthlyRate: PLAN_PRICES[bldgForm.plan], trialEndsAt: trialEnd, onCall: false, pmSeat: false, setupPaidAt: null, setupAmount: null, billingInterval: 'monthly', chargebeeSubscriptionId: null },
      stats: { activeUsers: 0, occupiedUnits: 0, collectionRate: 0, complianceScore: 0, openCases: 0, monthlyRevenue: 0 },
      primaryContact: { name: bldgForm.contactName, email: bldgForm.contactEmail, phone: bldgForm.contactPhone, role: 'Primary Contact' },
      features: { ...planFeatures(bldgForm.plan) },
      onboardingChecklist: { accountCreated: true, buildingProfileComplete: !!bldgForm.street, unitsConfigured: false, firstUserInvited: false, bylawsUploaded: false, financialSetupDone: false, goLive: false },
    });
    store.addAuditEntry({ actor: ACTOR, actorRole: 'super_admin', action: 'building.create', target: bldgForm.name, details: `Onboarded: ${subdomain}.getonetwo.com`, buildingId: id });
    setBldgForm({ name: '', street: '', city: '', state: '', zip: '', units: '', yearBuilt: '', contactName: '', contactEmail: '', contactPhone: '', plan: 'self_managed' });
    setModal(null);
  };

  const [title, breadcrumb] = PAGE_META[page];

  // Helper counts for dashboard
  const planCounts = {
    self_managed: tenants.filter(t => normalizePlan(t.subscription.tier) === 'self_managed').length,
    facilities: tenants.filter(t => normalizePlan(t.subscription.tier) === 'facilities').length,
    onCall: tenants.filter(t => t.subscription.onCall).length,
    pmSeat: tenants.filter(t => t.subscription.pmSeat).length,
    setupPaid: tenants.filter(t => t.subscription.setupPaidAt !== null).length,
    noBilling: tenants.filter(t => t.subscription.chargebeeSubscriptionId === null).length,
  };

  return (
    <div className="flex min-h-screen bg-ink-50">

      {/* ═══════════════════════ SIDEBAR ═══════════════════════ */}
      <aside className="fixed top-0 left-0 bottom-0 w-60 bg-navy text-white flex flex-col z-50 overflow-y-auto">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-white/[0.08] flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#c42030] flex items-center justify-center shrink-0">
            <span className="text-white font-display text-sm font-bold">1|2</span>
          </div>
          <div>
            <span className="font-display text-[1.05rem] font-bold tracking-tight">ONE two</span>
            <span className="block text-[0.65rem] text-ink-400 uppercase tracking-widest font-normal">Admin Console</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2">
          {NAV.map(section => (
            <div key={section.section} className="mt-4 first:mt-2">
              <p className="text-[0.6rem] uppercase tracking-[0.1em] text-ink-500 font-semibold px-3 mb-1.5">{section.section}</p>
              {section.items.map(item => (
                <button key={item.id} onClick={() => { setPage(item.id); setSelectedTenancy(null); store.setImpersonating(null); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[0.82rem] font-medium transition-colors mb-0.5 ${
                    page === item.id ? 'text-white bg-white/10 font-semibold' : 'text-ink-400 hover:text-white hover:bg-white/[0.06]'
                  }`}>
                  <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.d} />
                  </svg>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/[0.08] text-center">
          <p className="text-[0.7rem] text-ink-500">ONE two GovOps Platform</p>
          <p className="text-[0.65rem] text-ink-500/60">Admin Console v2.0</p>
        </div>
      </aside>

      {/* ═══════════════════════ MAIN ═══════════════════════ */}
      <div className="ml-60 flex-1 flex flex-col min-h-screen">

        {/* Impersonation Banner */}
        {impersonating && (() => {
          const t = tenants.find(x => x.id === impersonating);
          return t ? (
            <div className="bg-yellow-400 text-yellow-900 px-6 py-2 flex items-center justify-between text-sm font-semibold">
              <span>Viewing as: {t.name} ({t.subdomain}.getonetwo.com)</span>
              <button onClick={() => { store.setImpersonating(null); store.addAuditEntry({ actor: ACTOR, actorRole: 'super_admin', action: 'impersonate.end', target: t.name, details: 'Stopped impersonating', buildingId: t.id }); }}
                className="px-3 py-1 bg-yellow-900 text-yellow-100 rounded text-xs">Exit View-As</button>
            </div>
          ) : null;
        })()}

        {/* Topbar */}
        <header className="flex items-center justify-between px-8 py-4 bg-white border-b border-ink-200">
          <div>
            <h1 className="font-display text-xl font-bold text-ink-900">{title}</h1>
            <p className="text-xs text-ink-400 mt-0.5">{breadcrumb}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold text-ink-900">Platform Admin</p>
              <p className="text-[0.72rem] text-ink-500">{currentUser?.email || 'admin@getonetwo.com'}</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-ink-900 text-white flex items-center justify-center text-xs font-bold">PA</div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-8">

          {/* ═══ DASHBOARD ═══ */}
          {page === 'dashboard' && (
            <div className="space-y-6">
              {/* Stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {([
                  { label: 'Active Tenancies', value: String(metrics.activeBuildings), sub: `${tenants.filter(t => t.subscription.status === 'trial').length} in trial`, stripe: false },
                  { label: 'Total Users', value: String(metrics.totalUsers), sub: `across ${tenants.length} tenancies`, stripe: false },
                  { label: 'MRR', value: fmt(metrics.mrr), sub: 'monthly recurring revenue', stripe: false },
                  { label: 'Total Revenue (YTD)', value: fmt(totalRevenueYTD), sub: 'via Chargebee', stripe: true },
                ] as const).map(m => (
                  <div key={m.label} className={`bg-white rounded-[10px] border border-ink-200 p-5 ${m.stripe ? 'border-l-4 border-l-[#635bff]' : ''}`}>
                    <p className="text-xs text-ink-500 font-medium">{m.label}</p>
                    <p className={`text-2xl font-display font-bold mt-1 ${m.stripe ? 'text-[#635bff]' : 'text-ink-900'}`}>{m.value}</p>
                    <p className="text-[0.72rem] text-ink-400 mt-0.5">{m.sub}</p>
                  </div>
                ))}
              </div>

              {/* 3-column: Plan Mix, Recent Stripe Events, RBAC Summary */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Plan Mix */}
                <div className="bg-white rounded-[10px] border border-ink-200 p-5">
                  <h3 className="font-display text-base font-bold text-ink-900 mb-4">Plan Mix</h3>
                  <div className="space-y-3">
                    {ACTIVE_PLANS.map(plan => (
                      <div key={plan} className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PLAN_COLORS[plan] }} />
                          <span className="text-sm text-ink-700 font-medium">{PLAN_LABELS[plan]}</span>
                        </div>
                        <span className="text-xs bg-ink-100 text-ink-500 px-2 py-0.5 rounded-full font-semibold">{planCounts[plan]} tenancies</span>
                      </div>
                    ))}
                    <div className="border-t border-ink-100 pt-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-ink-700 font-medium">On Call add-on</span>
                        <span className="text-xs bg-ink-100 text-ink-500 px-2 py-0.5 rounded-full font-semibold">{planCounts.onCall}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-ink-700 font-medium">PM Seat add-on</span>
                        <span className="text-xs bg-ink-100 text-ink-500 px-2 py-0.5 rounded-full font-semibold">{planCounts.pmSeat}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-ink-700 font-medium">Setup paid</span>
                        <span className="text-xs bg-ink-100 text-ink-500 px-2 py-0.5 rounded-full font-semibold">{planCounts.setupPaid}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-ink-700 font-medium">No billing</span>
                        <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">{planCounts.noBilling}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent Stripe Events */}
                <div className="bg-white rounded-[10px] border border-ink-200 p-5">
                  <h3 className="font-display text-base font-bold text-ink-900 mb-4">Recent Stripe Events</h3>
                  <div className="space-y-2">
                    {[...stripeWebhookEvents].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4).map(e => (
                      <div key={e.id} className={`px-3 py-2 border-l-[3px] rounded-r-md text-sm bg-ink-50 ${
                        e.status === 'success' ? 'border-l-sage-600' : e.status === 'failed' ? 'border-l-red-600' : 'border-l-yellow-500'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-ink-900 text-xs">{e.type}</span>
                          <span className={`text-[0.65rem] px-1.5 py-0.5 rounded-full font-semibold ${
                            e.status === 'success' ? 'bg-sage-100 text-sage-700' : e.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-yellow-100 text-yellow-700'
                          }`}>{e.status}</span>
                        </div>
                        {e.tenantName && <p className="text-[0.72rem] text-ink-500 mt-0.5">{e.tenantName}{e.amount ? ` · ${fmt(e.amount)}` : ''}</p>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* RBAC Summary */}
                <div className="bg-white rounded-[10px] border border-ink-200 p-5">
                  <h3 className="font-display text-base font-bold text-ink-900 mb-4">RBAC Summary</h3>
                  <div className="space-y-3">
                    {TENANT_ROLES.map(role => {
                      const rolePerms = permissions.filter(p => p.roleId === role.id);
                      const totalPerms = rolePerms.reduce((s, p) => s + p.actions.length, 0);
                      const maxPerms = Object.keys(FEATURE_LABELS).length * 5;
                      const pct = maxPerms > 0 ? Math.round((totalPerms / maxPerms) * 100) : 0;
                      const barColor = pct > 80 ? 'bg-sage-500' : pct > 50 ? 'bg-blue-500' : 'bg-amber-500';
                      return (
                        <div key={role.id}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{role.icon}</span>
                              <span className="text-sm font-medium text-ink-700">{role.name}</span>
                            </div>
                            <span className="text-xs text-ink-500">{totalPerms} perms</span>
                          </div>
                          <div className="h-1.5 bg-ink-100 rounded-full">
                            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* All Tenancies quick list */}
              <div className="bg-white rounded-[10px] border border-ink-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-ink-100 flex items-center justify-between">
                  <h3 className="font-display text-base font-bold text-ink-900">All Tenancies</h3>
                  <button onClick={() => setPage('tenancies')} className="text-xs text-ink-500 font-semibold hover:text-ink-700">View All →</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-5">
                  {tenants.map(t => {
                    const plan = displayPlan(t.subscription.tier);
                    return (
                      <div key={t.id} className="bg-white border border-ink-100 rounded-xl p-4 hover:shadow-md cursor-pointer" onClick={() => { setPage('tenancies'); setSelectedTenancy(t.id); store.setImpersonating(t.id); }}>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold text-ink-900 truncate">{t.name}</h4>
                          <div className="flex gap-1.5 shrink-0">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_BADGE[t.status]}`}>{t.status}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${PLAN_BADGE[t.subscription.tier] || PLAN_BADGE[plan]}`}>{PLAN_LABELS[plan]}</span>
                          </div>
                        </div>
                        <p className="text-xs text-accent-600 font-mono mb-1">{t.subdomain}.getonetwo.com</p>
                        <div className="grid grid-cols-4 gap-2 text-xs">
                          <div><p className="text-ink-400">Units</p><p className="font-bold">{t.totalUnits}</p></div>
                          <div><p className="text-ink-400">Users</p><p className="font-bold">{t.stats.activeUsers}</p></div>
                          <div><p className="text-ink-400">Collect.</p><p className={`font-bold ${t.stats.collectionRate >= 90 ? 'text-sage-600' : 'text-red-600'}`}>{t.stats.collectionRate || '\u2014'}%</p></div>
                          <div><p className="text-ink-400">MRR</p><p className="font-bold">{fmt(t.subscription.monthlyRate)}</p></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ═══ SUBSCRIPTIONS ═══ */}
          {page === 'subscriptions' && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-lg font-bold text-ink-900">Subscription Plans</h2>
                <p className="text-sm text-ink-500 mt-1">Manage plans, pricing, and Chargebee product links</p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {ACTIVE_PLANS.map(plan => {
                  const count = tenants.filter(t => normalizePlan(t.subscription.tier) === plan).length;
                  const cfg = PLANS[plan];
                  return (
                    <div key={plan} className="bg-white rounded-[10px] border border-ink-200 overflow-hidden hover:shadow-md transition-shadow" style={{ borderTop: `3px solid ${PLAN_COLORS[plan]}` }}>
                      <div className="p-5">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-display text-lg font-bold text-ink-900">{PLAN_LABELS[plan]}</h3>
                          <span className="text-xs bg-sage-100 text-sage-700 px-2 py-0.5 rounded-full font-semibold">Active</span>
                        </div>
                        <p className="text-sm text-ink-500 mb-3">{cfg.includes.length} features included</p>
                        <div className="flex items-baseline gap-2 mb-3">
                          <span className="text-2xl font-bold text-ink-900">{fmt(cfg.monthly)}</span>
                          <span className="text-sm text-ink-400">/mo</span>
                          <span className="text-sm text-ink-500 font-semibold ml-2">{fmt(cfg.annual)}/yr</span>
                        </div>
                        <p className="text-xs text-ink-500">{count} tenancies · {cfg.tagline}</p>
                      </div>
                      <div className="bg-ink-50 px-5 py-3 flex items-center gap-2 text-xs border-t border-ink-100">
                        <span className="w-2 h-2 rounded-full bg-sage-600" />
                        <span className="text-ink-500">Chargebee:</span>
                        <code className="text-ink-400 text-[0.7rem]">{plan === 'self_managed' ? 'Self-Managed-USD-Monthly' : 'Facilities-USD-Monthly'}</code>
                        <span className="ml-auto text-sage-600 font-semibold">Synced</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add-ons summary */}
              <div>
                <h3 className="font-display text-base font-bold text-ink-900 mb-3">Add-ons</h3>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="bg-white rounded-[10px] border border-ink-200 p-4">
                    <p className="text-xs font-bold uppercase mb-2 text-ink-500">On Call</p>
                    <p className="text-sm text-ink-700">Self-Managed: {fmt(ON_CALL.self_managed.monthly)}/mo ({ON_CALL.self_managed.hours}h)</p>
                    <p className="text-sm text-ink-700">Facilities: {fmt(ON_CALL.facilities.monthly)}/mo ({ON_CALL.facilities.hours}h)</p>
                    <p className="text-xs text-ink-400 mt-2">{planCounts.onCall} tenancies enrolled</p>
                  </div>
                  <div className="bg-white rounded-[10px] border border-ink-200 p-4">
                    <p className="text-xs font-bold uppercase mb-2 text-ink-500">PM Seat</p>
                    <p className="text-sm text-ink-700">{fmt(PM_SEAT.monthly)}/mo</p>
                    <p className="text-xs text-ink-400 mt-2">{planCounts.pmSeat} tenancies enrolled</p>
                  </div>
                  <div className="bg-white rounded-[10px] border border-ink-200 p-4">
                    <p className="text-xs font-bold uppercase mb-2 text-ink-500">Setup Fee</p>
                    <p className="text-sm text-ink-700">Self-Managed: {fmt(SETUP.self_managed)}</p>
                    <p className="text-sm text-ink-700">Facilities: {fmt(SETUP.facilities)}</p>
                    <p className="text-xs text-ink-400 mt-2">{planCounts.setupPaid} setup fees paid</p>
                  </div>
                </div>
              </div>

              {/* Tenancies by Plan */}
              <div>
                <h3 className="font-display text-base font-bold text-ink-900 mb-3">Tenancies by Plan</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {ACTIVE_PLANS.map(plan => (
                    <div key={plan} className="bg-white rounded-[10px] border border-ink-200 p-4">
                      <p className="text-xs font-bold uppercase mb-3 text-ink-500">{PLAN_LABELS[plan]}</p>
                      {tenants.filter(t => normalizePlan(t.subscription.tier) === plan).map(t => (
                        <div key={t.id} className="flex items-center justify-between py-1.5">
                          <span className="text-sm text-ink-700">{t.name}</span>
                          <div className="flex items-center gap-1.5">
                            {t.subscription.onCall && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">On Call</span>}
                            {t.subscription.pmSeat && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">PM</span>}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_BADGE[t.status]}`}>{t.status}</span>
                          </div>
                        </div>
                      ))}
                      {tenants.filter(t => normalizePlan(t.subscription.tier) === plan).length === 0 && (
                        <p className="text-xs text-ink-400 italic">No tenancies</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Trial Settings */}
              <div className="bg-white rounded-[10px] border border-ink-200 p-5">
                <h3 className="font-display text-base font-bold text-ink-900 mb-1">Trial Settings</h3>
                <p className="text-sm text-ink-500 mb-4">Configure the default trial period for new tenancies. Changes apply to future sign-ups only.</p>
                <div className="flex items-end gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink-600 mb-1">Trial length (days)</label>
                    <input
                      type="number"
                      min={0}
                      max={365}
                      value={trialDaysInput}
                      onChange={e => setTrialDaysInput(Math.max(0, Math.min(365, parseInt(e.target.value) || 0)))}
                      className="w-24 px-3 py-2 border border-ink-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sage-300"
                    />
                  </div>
                  <button
                    disabled={trialDaysSaving || trialDaysInput === store.trialDays}
                    onClick={async () => {
                      setTrialDaysSaving(true);
                      const ok = await store.updateTrialDays(trialDaysInput);
                      setTrialDaysSaving(false);
                      if (ok) {
                        store.addAuditEntry({ actor: ACTOR, actorRole: 'super_admin', action: 'platform.trial_days_updated', target: 'Platform Settings', details: `Trial days changed to ${trialDaysInput}`, buildingId: null });
                      }
                    }}
                    className="px-4 py-2 bg-ink-900 text-white text-sm font-semibold rounded-lg hover:bg-ink-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    {trialDaysSaving ? 'Saving\u2026' : 'Save'}
                  </button>
                </div>
                <p className="text-xs text-ink-400 mt-2">Set to 0 to disable free trials. Maximum 365 days.</p>
              </div>
            </div>
          )}

          {/* ═══ FEATURES ═══ */}
          {page === 'features' && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-lg font-bold text-ink-900">Features</h2>
                <p className="text-sm text-ink-500 mt-1">{Object.keys(FEATURE_LABELS).length} features in {FEATURE_GROUPS.length} groups</p>
              </div>
              {FEATURE_GROUPS.map(group => {
                const groupFeatures = group.features.filter(f => FEATURE_LABELS[f]);
                if (groupFeatures.length === 0) return null;
                return (
                  <div key={group.name} className="bg-white rounded-[10px] border border-ink-200 overflow-hidden">
                    <div className="px-5 py-4 border-b border-ink-100 flex items-center gap-2">
                      <h3 className="font-semibold text-ink-900">{group.name}</h3>
                      <span className="text-xs bg-ink-100 text-ink-500 px-2 py-0.5 rounded-full font-semibold">{groupFeatures.length}</span>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[0.7rem] uppercase tracking-wide text-ink-500 font-semibold border-b-2 border-ink-200 bg-ink-50">
                          <th className="px-5 py-2.5">Feature</th>
                          <th className="px-3 py-2.5">Plans</th>
                          <th className="px-3 py-2.5">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupFeatures.map(featureId => (
                          <tr key={featureId} className="border-b border-ink-100 hover:bg-ink-50">
                            <td className="px-5 py-3 font-medium text-ink-700">{FEATURE_LABELS[featureId]}</td>
                            <td className="px-3 py-3">
                              <div className="flex gap-1.5 flex-wrap">
                                {ACTIVE_PLANS.map(plan => (
                                  TIER_FEATURES[plan][featureId as keyof Tenant['features']] ? (
                                    <span key={plan} className="text-[0.65rem] px-2 py-0.5 rounded-full font-semibold"
                                      style={{ backgroundColor: `${PLAN_COLORS[plan]}20`, color: PLAN_COLORS[plan] }}>
                                      {PLAN_LABELS[plan]}
                                    </span>
                                  ) : null
                                ))}
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <span className="text-xs bg-sage-100 text-sage-700 px-2 py-0.5 rounded-full font-semibold">Active</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}

          {/* ═══ FEATURE MATRIX ═══ */}
          {page === 'matrix' && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-lg font-bold text-ink-900">Feature x Plan Matrix</h2>
                <p className="text-sm text-ink-500 mt-1">Feature availability per plan. Core features are included in both plans.</p>
              </div>
              <div className="bg-white rounded-[10px] border border-ink-200 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[0.7rem] uppercase tracking-wide text-ink-500 font-semibold border-b-2 border-ink-200 bg-ink-50">
                      <th className="px-5 py-3 min-w-[250px]">Feature</th>
                      {ACTIVE_PLANS.map(plan => (
                        <th key={plan} className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PLAN_COLORS[plan] }} />
                            <span>{PLAN_LABELS[plan]}</span>
                          </div>
                          <p className="text-lg font-bold text-ink-900 mt-1 normal-case tracking-normal">{fmt(PLAN_PRICES[plan])}/mo</p>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Core features (always on for both plans) */}
                    <tr className="bg-ink-900">
                      <td colSpan={3} className="px-5 py-2 text-[0.75rem] text-white uppercase font-bold tracking-wider">Core (all plans)</td>
                    </tr>
                    {Object.entries(FEATURE_LABELS).filter(([id]) => {
                      // core = feature is true on both plans
                      return TIER_FEATURES.self_managed[id as keyof Tenant['features']] && TIER_FEATURES.facilities[id as keyof Tenant['features']] && id !== 'facilities' && id !== 'onCall';
                    }).map(([featureId, label]) => (
                      <tr key={featureId} className="border-b border-ink-100 hover:bg-ink-50">
                        <td className="px-5 py-3 font-medium text-ink-700">{label}</td>
                        {ACTIVE_PLANS.map(plan => (
                          <td key={plan} className="px-4 py-3 text-center">
                            <span className="text-lg text-sage-600">{'\u2713'}</span>
                          </td>
                        ))}
                      </tr>
                    ))}

                    {/* Facilities row */}
                    <tr className="bg-ink-900">
                      <td colSpan={3} className="px-5 py-2 text-[0.75rem] text-white uppercase font-bold tracking-wider">Plan-specific</td>
                    </tr>
                    <tr className="border-b border-ink-100 hover:bg-ink-50">
                      <td className="px-5 py-3 font-medium text-ink-700">Facilities (staff, amenities, inspections)</td>
                      <td className="px-4 py-3 text-center"><span className="text-lg text-ink-200">{'\u2014'}</span></td>
                      <td className="px-4 py-3 text-center"><span className="text-lg text-sage-600">{'\u2713'}</span></td>
                    </tr>

                    {/* Add-ons */}
                    <tr className="bg-ink-900">
                      <td colSpan={3} className="px-5 py-2 text-[0.75rem] text-white uppercase font-bold tracking-wider">Add-ons</td>
                    </tr>
                    <tr className="border-b border-ink-100 hover:bg-ink-50">
                      <td className="px-5 py-3 font-medium text-ink-700">
                        <div>On Call</div>
                        <p className="text-xs text-ink-400">SM: {fmt(ON_CALL.self_managed.monthly)}/mo &middot; Fac: {fmt(ON_CALL.facilities.monthly)}/mo</p>
                      </td>
                      <td className="px-4 py-3 text-center"><span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">Add-on</span></td>
                      <td className="px-4 py-3 text-center"><span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">Add-on</span></td>
                    </tr>
                    <tr className="border-b border-ink-100 hover:bg-ink-50">
                      <td className="px-5 py-3 font-medium text-ink-700">
                        <div>PM Seat</div>
                        <p className="text-xs text-ink-400">{fmt(PM_SEAT.monthly)}/mo</p>
                      </td>
                      <td className="px-4 py-3 text-center"><span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold">Add-on</span></td>
                      <td className="px-4 py-3 text-center"><span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold">Add-on</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══ PERMISSIONS ═══ */}
          {page === 'permissions' && <PermissionsTab />}

          {/* ═══ TENANCIES ═══ */}
          {page === 'tenancies' && !selected && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-lg font-bold text-ink-900">Tenancies</h2>
                  <p className="text-sm text-ink-500 mt-1">{tenants.length} buildings on the platform</p>
                </div>
                <button onClick={() => setModal('addTenancy')} className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-semibold hover:bg-ink-800">
                  + Add Tenancy
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tenants.map((t, idx) => {
                  const isLastRow = idx >= tenants.length - 2 && tenants.length > 2;
                  const plan = displayPlan(t.subscription.tier);
                  return (
                    <div key={t.id} className="bg-white border border-ink-200 rounded-xl p-5 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-semibold text-ink-900 truncate">{t.name}</h4>
                          <p className="text-xs text-accent-600 font-mono mt-0.5">{t.subdomain}.getonetwo.com</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_BADGE[t.status] || 'bg-ink-100 text-ink-500'}`}>{t.status}</span>
                          <TenancyMenu
                            tenant={t}
                            isLastRow={isLastRow}
                            onView={() => { setSelectedTenancy(t.id); store.setImpersonating(t.id); }}
                            onImpersonate={() => {
                              store.setImpersonating(t.id);
                              store.addAuditEntry({ actor: ACTOR, actorRole: 'super_admin', action: 'impersonate.start', target: t.name, details: `Viewing as ${t.name}`, buildingId: t.id });
                            }}
                            onActivate={() => {
                              store.updateTenantStatus(t.id, 'active');
                              store.addAuditEntry({ actor: ACTOR, actorRole: 'super_admin', action: 'building.activate', target: t.name, details: 'Activated', buildingId: t.id });
                            }}
                            onSuspend={() => {
                              store.updateTenantStatus(t.id, 'suspended');
                              store.addAuditEntry({ actor: ACTOR, actorRole: 'super_admin', action: 'building.suspend', target: t.name, details: 'Suspended', buildingId: t.id });
                            }}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-ink-400 mb-3">{t.address.street ? `${t.address.street}, ${t.address.city}, ${t.address.state} ${t.address.zip}` : 'No address configured'}</p>
                      <div className="grid grid-cols-4 gap-2 text-xs mb-3">
                        <div>
                          <p className="text-ink-400">Plan</p>
                          <p className="font-semibold" style={{ color: PLAN_COLORS[plan] }}>{PLAN_LABELS[plan]}</p>
                        </div>
                        <div><p className="text-ink-400">Units</p><p className="font-bold text-ink-900">{t.totalUnits}</p></div>
                        <div><p className="text-ink-400">Users</p><p className="font-bold text-ink-900">{t.stats.activeUsers}</p></div>
                        <div><p className="text-ink-400">MRR</p><p className="font-bold text-ink-900">{fmt(t.subscription.monthlyRate)}</p></div>
                      </div>
                      {(t.subscription.onCall || t.subscription.pmSeat) && (
                        <div className="flex gap-1.5 mb-3">
                          {t.subscription.onCall && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold">On Call</span>}
                          {t.subscription.pmSeat && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-semibold">PM Seat</span>}
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-2 border-t border-ink-100">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${t.subscription.chargebeeSubscriptionId ? 'bg-sage-600' : 'bg-amber-500'}`} />
                          <span className="text-xs text-ink-400">{t.subscription.chargebeeSubscriptionId ? 'Chargebee Linked' : 'No billing'}</span>
                        </div>
                        <span className="text-xs text-ink-400">Since {t.createdAt}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ TENANCY DETAIL ═══ */}
          {page === 'tenancies' && selected && (() => {
            const plan = displayPlan(selected.subscription.tier);
            const billingDisabled = selected.subscription.chargebeeSubscriptionId === null;
            return (
            <div className="space-y-6">
              <button onClick={() => { setSelectedTenancy(null); store.setImpersonating(null); }} className="text-sm text-accent-600 font-medium hover:underline">{'\u2190'} Back to Tenancies</button>

              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-display text-2xl font-bold text-ink-900">{selected.name}</h2>
                  <p className="text-sm text-ink-500 mt-1">{selected.address.street}, {selected.address.city}, {selected.address.state} {selected.address.zip}</p>
                  <p className="text-xs text-accent-600 font-mono mt-1">{selected.subdomain}.getonetwo.com</p>
                </div>
                <div className="flex gap-2">
                  <span className={`px-3 py-1 rounded text-sm font-semibold ${STATUS_BADGE[selected.status]}`}>{selected.status}</span>
                  <span className={`px-3 py-1 rounded text-sm font-semibold ${PLAN_BADGE[selected.subscription.tier] || PLAN_BADGE[plan]}`}>{PLAN_LABELS[plan]}</span>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {[
                  { l: 'Units', v: selected.totalUnits },
                  { l: 'Occupied', v: selected.stats.occupiedUnits },
                  { l: 'Users', v: selected.stats.activeUsers },
                  { l: 'Collection', v: `${selected.stats.collectionRate}%` },
                  { l: 'Compliance', v: `${selected.stats.complianceScore}%` },
                  { l: 'Open Cases', v: selected.stats.openCases },
                ].map(s => (
                  <div key={s.l} className="bg-ink-50 rounded-lg p-3">
                    <p className="text-xs text-ink-400">{s.l}</p>
                    <p className="text-lg font-bold text-ink-900">{s.v}</p>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="bg-white border border-ink-200 rounded-[10px] p-5">
                <h4 className="font-bold text-ink-900 mb-3">Actions</h4>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => { store.setImpersonating(selected.id); store.addAuditEntry({ actor: ACTOR, actorRole: 'super_admin', action: 'impersonate.start', target: selected.name, details: `Viewing as ${selected.name}`, buildingId: selected.id }); }}
                    className="px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600">View as Tenant</button>
                  {selected.status !== 'active' && (
                    <button onClick={() => { store.updateTenantStatus(selected.id, 'active'); store.addAuditEntry({ actor: ACTOR, actorRole: 'super_admin', action: 'building.activate', target: selected.name, details: 'Activated', buildingId: selected.id }); }}
                      className="px-4 py-2 bg-sage-600 text-white rounded-lg text-sm font-medium hover:bg-sage-700">Activate</button>
                  )}
                  {selected.status !== 'suspended' && (
                    <button onClick={() => { store.updateTenantStatus(selected.id, 'suspended'); store.addAuditEntry({ actor: ACTOR, actorRole: 'super_admin', action: 'building.suspend', target: selected.name, details: 'Suspended', buildingId: selected.id }); }}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">Suspend</button>
                  )}
                  {selected.status === 'onboarding' && (
                    <button onClick={() => { store.updateTenantStatus(selected.id, 'active'); store.addAuditEntry({ actor: ACTOR, actorRole: 'super_admin', action: 'building.activate', target: selected.name, details: 'Onboarding complete \u2192 Go Live', buildingId: selected.id }); }}
                      className="px-4 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-700">Complete Onboarding</button>
                  )}
                </div>
              </div>

              {/* 2-col: Subscription + Billing */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Subscription & Add-ons */}
                <div className="bg-white border border-ink-200 rounded-[10px] p-5">
                  <h4 className="font-bold text-ink-900 mb-3">Subscription</h4>
                  {billingDisabled && (
                    <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                      No Chargebee subscription linked. Plan changes are disabled until a subscription is created.
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                    <div><p className="text-xs text-ink-400">Plan</p><p className="font-bold text-ink-900">{PLAN_LABELS[plan]}</p></div>
                    <div><p className="text-xs text-ink-400">Status</p><p className="font-bold text-ink-900 capitalize">{selected.subscription.status.replace('_', ' ')}</p></div>
                    <div><p className="text-xs text-ink-400">Rate</p><p className="font-bold text-ink-900">{fmt(selected.subscription.monthlyRate)}/mo</p></div>
                    <div><p className="text-xs text-ink-400">Next Billing</p><p className="font-bold text-ink-900">{selected.subscription.nextBillingDate}</p></div>
                  </div>

                  {/* Plan switch (2 buttons) */}
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-ink-600 mb-2">Switch Plan</p>
                    <div className="flex gap-2">
                      {ACTIVE_PLANS.map(p => (
                        <button key={p}
                          disabled={billingDisabled || plan === p}
                          onClick={() => store.changePlan(selected.id, p, ACTOR)}
                          className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${
                            plan === p
                              ? 'border-accent-500 bg-accent-50 text-accent-700'
                              : billingDisabled
                                ? 'border-ink-100 bg-ink-50 text-ink-300 cursor-not-allowed'
                                : 'border-ink-200 hover:border-ink-300 text-ink-700 hover:bg-ink-50 cursor-pointer'
                          }`}>
                          {PLAN_LABELS[p]}
                          <span className="block text-xs font-normal mt-0.5">{fmt(PLAN_PRICES[p])}/mo</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Add-on toggles */}
                  <div className="space-y-3 border-t border-ink-100 pt-4">
                    <p className="text-xs font-semibold text-ink-600 mb-1">Add-ons</p>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-ink-700">On Call</span>
                        <span className="text-xs text-ink-400 ml-1.5">({fmt(ON_CALL[plan].monthly)}/mo)</span>
                      </div>
                      <Toggle on={selected.subscription.onCall} disabled={billingDisabled} onChange={() => store.setOnCall(selected.id, !selected.subscription.onCall, ACTOR)} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-ink-700">PM Seat</span>
                        <span className="text-xs text-ink-400 ml-1.5">({fmt(PM_SEAT.monthly)}/mo)</span>
                      </div>
                      <Toggle on={selected.subscription.pmSeat} disabled={billingDisabled} onChange={() => store.setPmSeat(selected.id, !selected.subscription.pmSeat, ACTOR)} />
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-ink-100">
                      <div>
                        <span className="text-sm font-medium text-ink-700">Setup Fee</span>
                        <span className="text-xs text-ink-400 ml-1.5">({fmt(SETUP[plan])})</span>
                      </div>
                      <div className="text-right">
                        {selected.subscription.setupPaidAt ? (
                          <span className="text-xs text-sage-700 font-semibold">Paid {selected.subscription.setupPaidAt}{selected.subscription.setupAmount ? ` \u00b7 ${fmt(selected.subscription.setupAmount)}` : ''}</span>
                        ) : (
                          <span className="text-xs text-ink-400">Not paid</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Billing Integration */}
                <div className="bg-white border border-ink-200 rounded-[10px] p-5">
                  <h4 className="font-bold text-ink-900 mb-3">Billing Integration</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><p className="text-xs text-ink-400">Chargebee Sub ID</p><p className="font-mono text-xs text-ink-600">{selected.subscription.chargebeeSubscriptionId || '\u2014 not linked'}</p></div>
                    <div><p className="text-xs text-ink-400">Billing Interval</p><p className="text-sm text-ink-600 capitalize">{selected.subscription.billingInterval}</p></div>
                    <div>
                      <p className="text-xs text-ink-400">Sync Status</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`w-2 h-2 rounded-full ${selected.subscription.chargebeeSubscriptionId ? 'bg-sage-600' : 'bg-amber-500'}`} />
                        <span className="text-sm">{selected.subscription.chargebeeSubscriptionId ? 'Linked' : 'No billing'}</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-ink-400">Last Payment</p>
                      <p className="text-sm text-ink-600">{stripePayments.find(p => p.tenantName === selected.name)?.createdAt?.split('T')[0] || '--'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Feature Flags */}
              <div className="bg-white border border-ink-200 rounded-[10px] p-5">
                <h4 className="font-bold text-ink-900 mb-3">Feature Flags</h4>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {(Object.entries(selected.features) as [keyof Tenant['features'], boolean][]).map(([key, enabled]) => {
                    const planDefault = TIER_FEATURES[plan]?.[key] ?? false;
                    const isOverride = enabled !== planDefault;
                    return (
                      <div key={key} className={`flex items-center justify-between py-2.5 px-3 rounded-lg ${isOverride ? 'bg-yellow-50 border border-yellow-200' : 'bg-ink-50'}`}>
                        <div>
                          <span className="text-sm font-medium text-ink-700">{FEATURE_LABELS[key] || key}</span>
                          {isOverride && <span className="ml-1.5 text-[9px] bg-yellow-200 text-yellow-800 px-1 py-0.5 rounded font-bold">OVERRIDE</span>}
                        </div>
                        <Toggle on={enabled} onChange={() => {
                          store.toggleFeature(selected.id, key);
                          store.addAuditEntry({ actor: ACTOR, actorRole: 'super_admin', action: 'feature.toggle', target: selected.name, details: `${enabled ? 'Disabled' : 'Enabled'} ${FEATURE_LABELS[key] || key}`, buildingId: selected.id });
                        }} />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            );
          })()}

          {/* ═══ USER ROLES ═══ */}
          {page === 'roles' && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-lg font-bold text-ink-900">User Roles</h2>
                <p className="text-sm text-ink-500 mt-1">Role definitions, plan requirements, and permission summary</p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {TENANT_ROLES.map(role => {
                  const rolePerms = permissions.filter(p => p.roleId === role.id);
                  const totalPerms = rolePerms.reduce((s, p) => s + p.actions.length, 0);
                  return (
                    <div key={role.id} className="bg-white rounded-[10px] border border-ink-200 p-5 hover:shadow-md transition-shadow">
                      <div className="text-3xl mb-3">{role.icon}</div>
                      <h3 className="font-display text-lg font-bold text-ink-900 mb-1">{role.name}</h3>
                      <p className="text-sm text-ink-500 mb-4">{role.description}</p>

                      <div className="flex gap-2 mb-4">
                        {[
                          { label: 'Perms', value: totalPerms },
                        ].map(s => (
                          <div key={s.label} className="flex-1 bg-ink-100 rounded-lg p-2 text-center">
                            <p className="text-lg font-bold text-ink-900">{s.value}</p>
                            <p className="text-[0.65rem] text-ink-500">{s.label}</p>
                          </div>
                        ))}
                      </div>

                      <div className="mb-4">
                        <p className="text-[0.72rem] font-semibold text-ink-600 mb-1.5">Requires</p>
                        <div className="flex gap-1.5 flex-wrap">
                          {role.requires === null ? (
                            <span className="text-[0.65rem] px-2 py-0.5 rounded-full font-semibold bg-sage-100 text-sage-700">All plans</span>
                          ) : (
                            <span className="text-[0.65rem] px-2 py-0.5 rounded-full font-semibold bg-accent-100 text-accent-700">
                              {role.requires === 'facilities' ? 'Plus Facilities plan' : 'PM Seat add-on'}
                            </span>
                          )}
                        </div>
                      </div>

                      <button onClick={() => setPage('permissions')}
                        className="w-full px-3 py-2 bg-ink-100 text-ink-700 rounded-lg text-xs font-semibold hover:bg-ink-200 transition-colors">
                        View Permissions {'\u2192'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ STRIPE ═══ */}
          {page === 'stripe' && <BillingTab />}

          {/* ═══ FINANCE ═══ */}
          {page === 'finance' && <FinanceTab />}

          {/* ═══ SUPPORT ═══ */}
          {page === 'support' && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-lg font-bold text-ink-900">Support</h2>
                <p className="text-sm text-ink-500 mt-1">Support tickets and escalations -- coming soon</p>
              </div>
              <div className="bg-white rounded-[10px] border border-ink-200 p-12 text-center">
                <p className="text-ink-400 text-sm">Support management page is under development.</p>
              </div>
            </div>
          )}

          {/* ═══ FEEDBACK ═══ */}
          {page === 'feedback' && <FeedbackTab />}

          {/* ═══ PROBLEM STATEMENTS ═══ */}
          {page === 'problems' && <ProblemsTab />}

        </main>
      </div>

      {/* ═══════════════════════ MODALS ═══════════════════════ */}

      {modal === 'addTenancy' && (
        <Modal title="Add Tenancy" subtitle="Provisions subdomain and starts trial" onClose={() => setModal(null)} onSave={handleAddTenancy} saveLabel="Create & Provision" wide>
          <div className="space-y-4">
            <div className="border-b border-ink-100 pb-2"><p className="text-xs font-semibold text-ink-400 uppercase">Building</p></div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Name *</label>
              <input value={bldgForm.name} onChange={e => setBldgForm({ ...bldgForm, name: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" placeholder="Sunny Acres Condominium" />
            </div>
            {bldgForm.name && (
              <div className="bg-accent-50 border border-accent-200 rounded-lg p-3">
                <p className="text-xs text-accent-800"><strong className="font-mono">{generateSubdomain(bldgForm.name, tenants.map(t => t.subdomain))}.getonetwo.com</strong></p>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Street</label>
              <input value={bldgForm.street} onChange={e => setBldgForm({ ...bldgForm, street: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="block text-sm font-medium text-ink-700 mb-1">City</label><input value={bldgForm.city} onChange={e => setBldgForm({ ...bldgForm, city: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" /></div>
              <div><label className="block text-sm font-medium text-ink-700 mb-1">State</label><input value={bldgForm.state} onChange={e => setBldgForm({ ...bldgForm, state: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" maxLength={2} /></div>
              <div><label className="block text-sm font-medium text-ink-700 mb-1">ZIP</label><input value={bldgForm.zip} onChange={e => setBldgForm({ ...bldgForm, zip: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-sm font-medium text-ink-700 mb-1">Units</label><input type="number" value={bldgForm.units} onChange={e => setBldgForm({ ...bldgForm, units: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" /></div>
              <div><label className="block text-sm font-medium text-ink-700 mb-1">Year Built</label><input value={bldgForm.yearBuilt} onChange={e => setBldgForm({ ...bldgForm, yearBuilt: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" /></div>
            </div>

            <div className="border-b border-ink-100 pb-2 mt-2"><p className="text-xs font-semibold text-ink-400 uppercase">Primary Contact</p></div>
            <div><label className="block text-sm font-medium text-ink-700 mb-1">Name</label><input value={bldgForm.contactName} onChange={e => setBldgForm({ ...bldgForm, contactName: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-sm font-medium text-ink-700 mb-1">Email *</label><input value={bldgForm.contactEmail} onChange={e => setBldgForm({ ...bldgForm, contactEmail: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" /></div>
              <div><label className="block text-sm font-medium text-ink-700 mb-1">Phone</label><input value={bldgForm.contactPhone} onChange={e => setBldgForm({ ...bldgForm, contactPhone: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg" /></div>
            </div>

            <div className="border-b border-ink-100 pb-2 mt-2"><p className="text-xs font-semibold text-ink-400 uppercase">Subscription</p></div>
            <div className="grid grid-cols-2 gap-3">
              {ACTIVE_PLANS.map(p => (
                <button key={p} type="button" onClick={() => setBldgForm({ ...bldgForm, plan: p })}
                  className={`p-3 rounded-xl border-2 text-left ${bldgForm.plan === p ? 'border-accent-500 bg-accent-50' : 'border-ink-100 hover:border-ink-200'}`}>
                  <p className="font-bold text-ink-900">{PLAN_LABELS[p]}</p>
                  <p className="text-lg font-bold text-accent-600">{fmt(PLAN_PRICES[p])}<span className="text-xs font-normal text-ink-400">/mo</span></p>
                  <p className="text-xs text-ink-400 mt-1">{PLANS[p].includes.length} features</p>
                </button>
              ))}
            </div>

            <div className="border-b border-ink-100 pb-2 mt-2"><p className="text-xs font-semibold text-ink-400 uppercase">Chargebee Linking</p></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Chargebee Customer ID</label>
                <input placeholder="cb_xxxxxxxxxxxx" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm font-mono" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Chargebee Subscription ID</label>
                <input placeholder="sub_xxxxxxxxxxxx" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm font-mono" />
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
