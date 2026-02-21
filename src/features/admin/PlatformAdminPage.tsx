import { useState } from 'react';
import { usePlatformAdminStore, type Tenant, type PlatformUser, type SubscriptionTier } from '@/store/usePlatformAdminStore';
import { fmt } from '@/lib/formatters';
import Modal from '@/components/ui/Modal';

const TABS = [
  { id: 'overview', label: '◎ Overview' },
  { id: 'buildings', label: '🏢 Buildings' },
  { id: 'users', label: '👤 Platform Users' },
  { id: 'audit', label: '📋 Audit Log' },
];

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-sage-100 text-sage-700', onboarding: 'bg-accent-100 text-accent-700',
  suspended: 'bg-red-100 text-red-700', archived: 'bg-ink-100 text-ink-500',
  trial: 'bg-yellow-100 text-yellow-700', past_due: 'bg-red-100 text-red-700',
  cancelled: 'bg-ink-100 text-ink-500',
};
const TIER_BADGE: Record<string, string> = {
  essentials: 'bg-ink-100 text-ink-600', compliance_pro: 'bg-accent-100 text-accent-700',
  advanced_governance: 'bg-sage-100 text-sage-700',
};
const TIER_PRICES: Record<SubscriptionTier, number> = { essentials: 49, compliance_pro: 179, advanced_governance: 299 };
const TIER_LABELS: Record<string, string> = {
  essentials: 'Essentials', compliance_pro: 'Compliance Pro', advanced_governance: 'Advanced Governance',
};
const ROLE_BADGE: Record<string, string> = {
  super_admin: 'bg-red-100 text-red-700', support: 'bg-accent-100 text-accent-700',
  billing: 'bg-sage-100 text-sage-700', readonly: 'bg-ink-100 text-ink-500',
};

// ═══════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════

function OverviewTab() {
  const { tenants, auditLog, getPlatformMetrics } = usePlatformAdminStore();
  const metrics = getPlatformMetrics();

  return (
    <div className="space-y-6">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Active Buildings', value: metrics.activeBuildings, sub: `of ${metrics.totalBuildings} total` },
          { label: 'Monthly Revenue', value: fmt(metrics.mrr), sub: `ARR ${fmt(metrics.arr)}` },
          { label: 'Platform Users', value: metrics.totalUsers, sub: `across all buildings` },
          { label: 'Avg Compliance', value: `${metrics.avgCompliance}%`, sub: metrics.avgCompliance >= 80 ? 'Healthy' : 'Needs attention' },
        ].map(m => (
          <div key={m.label} className="bg-white border border-ink-100 rounded-xl p-4 hover:shadow-sm transition-all">
            <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide">{m.label}</p>
            <p className="text-2xl font-bold text-ink-900 mt-1">{m.value}</p>
            <p className="text-xs text-ink-400 mt-0.5">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {metrics.pastDueBuildings > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <span className="text-xl">⚠️</span>
          <div className="flex-1"><p className="font-semibold text-red-800">{metrics.pastDueBuildings} building{metrics.pastDueBuildings > 1 ? 's' : ''} past due</p><p className="text-xs text-red-600">Subscription payment overdue — action required</p></div>
        </div>
      )}
      {metrics.trialBuildings > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-center gap-3">
          <span className="text-xl">🕐</span>
          <div className="flex-1"><p className="font-semibold text-yellow-800">{metrics.trialBuildings} building{metrics.trialBuildings > 1 ? 's' : ''} on trial</p><p className="text-xs text-yellow-600">Follow up for conversion before trial ends</p></div>
        </div>
      )}

      {/* Tier Breakdown */}
      <div>
        <h3 className="font-display text-lg font-bold text-ink-900 mb-3">Subscription Mix</h3>
        <div className="grid grid-cols-3 gap-3">
          {(['essentials','compliance_pro','advanced_governance'] as SubscriptionTier[]).map(tier => {
            const count = tenants.filter(t => t.subscription.tier === tier).length;
            const rev = tenants.filter(t => t.subscription.tier === tier && ['active','trial'].includes(t.subscription.status)).reduce((s,t) => s + t.subscription.monthlyRate, 0);
            return (
              <div key={tier} className={`rounded-xl p-4 border ${TIER_BADGE[tier].replace('text-','border-').split(' ')[0].replace('bg-','border-')} ${TIER_BADGE[tier].split(' ')[0]}`}>
                <p className="text-xs font-semibold uppercase tracking-wide">{TIER_LABELS[tier]}</p>
                <p className="text-2xl font-bold text-ink-900 mt-1">{count}</p>
                <p className="text-xs text-ink-500">{fmt(rev)}/mo · {fmt(TIER_PRICES[tier])}/bldg</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Building summary cards */}
      <div>
        <h3 className="font-display text-lg font-bold text-ink-900 mb-3">All Buildings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {tenants.map(t => (
            <div key={t.id} className="bg-white border border-ink-100 rounded-xl p-4 hover:shadow-md hover:border-ink-300 transition-all">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-ink-900 truncate">{t.name}</h4>
                <div className="flex gap-1.5 shrink-0">
                  <span className={`pill px-2 py-0.5 rounded text-xs font-semibold ${STATUS_BADGE[t.status]}`}>{t.status}</span>
                  <span className={`pill px-2 py-0.5 rounded text-xs font-semibold ${TIER_BADGE[t.subscription.tier]}`}>{TIER_LABELS[t.subscription.tier]}</span>
                </div>
              </div>
              <p className="text-xs text-ink-400 mb-2">{t.address.street}, {t.address.city} {t.address.state}</p>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div><p className="text-ink-400">Units</p><p className="font-bold">{t.totalUnits}</p></div>
                <div><p className="text-ink-400">Users</p><p className="font-bold">{t.stats.activeUsers}</p></div>
                <div><p className="text-ink-400">Collection</p><p className={`font-bold ${t.stats.collectionRate >= 90 ? 'text-sage-600' : 'text-red-600'}`}>{t.stats.collectionRate}%</p></div>
                <div><p className="text-ink-400">MRR</p><p className="font-bold">{fmt(t.subscription.monthlyRate)}</p></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent audit */}
      <div>
        <h3 className="font-display text-lg font-bold text-ink-900 mb-3">Recent Activity</h3>
        <div className="space-y-1">
          {auditLog.slice(0, 6).map(e => (
            <div key={e.id} className="flex items-center gap-3 py-2 text-sm border-b border-ink-50">
              <span className="text-xs text-ink-300 w-28 shrink-0">{new Date(e.timestamp).toLocaleDateString()}</span>
              <span className={`pill px-1.5 py-0.5 rounded text-xs shrink-0 ${ROLE_BADGE[e.actorRole]}`}>{e.actorRole.replace('_',' ')}</span>
              <span className="text-ink-700 shrink-0">{e.actor}</span>
              <span className="text-ink-300">→</span>
              <span className="text-ink-500 truncate">{e.details}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BuildingDetail({ bldgId, onBack }: { bldgId: string; onBack: () => void }) {
  const { tenants, auditLog, updateTenantStatus, updateSubscription, toggleFeature, addAuditEntry } = usePlatformAdminStore();
  const b = tenants.find(t => t.id === bldgId);
  if (!b) return null;

  const ACTOR = 'Alex Rivera';

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-sm text-accent-600 hover:text-accent-700 font-medium">← Back to Buildings</button>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-display text-2xl font-bold text-ink-900">{b.name}</h3>
          <p className="text-sm text-ink-500">{b.address.street}, {b.address.city}, {b.address.state} {b.address.zip}</p>
          <p className="text-xs text-ink-400 mt-1">Created {b.createdAt} · {b.totalUnits} units · Built {b.yearBuilt}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <span className={`pill px-3 py-1 rounded text-sm font-semibold ${STATUS_BADGE[b.status]}`}>{b.status}</span>
          <span className={`pill px-3 py-1 rounded text-sm font-semibold ${TIER_BADGE[b.subscription.tier]}`}>{TIER_LABELS[b.subscription.tier]}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {[
          { l: 'Units', v: b.totalUnits }, { l: 'Occupied', v: b.stats.occupiedUnits },
          { l: 'Users', v: b.stats.activeUsers }, { l: 'Collection', v: `${b.stats.collectionRate}%` },
          { l: 'Compliance', v: `${b.stats.complianceScore}%` }, { l: 'Open Cases', v: b.stats.openCases },
        ].map(s => (
          <div key={s.l} className="bg-mist-50 rounded-lg p-3"><p className="text-xs text-ink-400">{s.l}</p><p className="text-lg font-bold text-ink-900">{s.v}</p></div>
        ))}
      </div>

      {/* Status Actions */}
      <div className="bg-white border border-ink-100 rounded-xl p-5">
        <h4 className="font-display font-bold text-ink-900 mb-3">Account Actions</h4>
        <div className="flex gap-2 flex-wrap">
          {b.status !== 'active' && (
            <button onClick={() => { updateTenantStatus(b.id, 'active'); addAuditEntry({ actor: ACTOR, actorRole: 'super_admin', action: 'building.activate', target: b.name, details: 'Account set to active', buildingId: b.id }); }}
              className="px-4 py-2 bg-sage-600 text-white rounded-lg text-sm font-medium hover:bg-sage-700">✓ Set Active</button>
          )}
          {b.status !== 'suspended' && (
            <button onClick={() => { updateTenantStatus(b.id, 'suspended'); addAuditEntry({ actor: ACTOR, actorRole: 'super_admin', action: 'building.suspend', target: b.name, details: 'Account suspended by admin', buildingId: b.id }); }}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">⛔ Suspend</button>
          )}
          {b.status !== 'archived' && (
            <button onClick={() => { updateTenantStatus(b.id, 'archived'); addAuditEntry({ actor: ACTOR, actorRole: 'super_admin', action: 'building.archive', target: b.name, details: 'Account archived', buildingId: b.id }); }}
              className="px-4 py-2 border border-ink-200 text-ink-600 rounded-lg text-sm font-medium hover:bg-ink-50">📦 Archive</button>
          )}
          {b.status === 'onboarding' && (
            <button onClick={() => { updateTenantStatus(b.id, 'active'); addAuditEntry({ actor: ACTOR, actorRole: 'super_admin', action: 'building.activate', target: b.name, details: 'Onboarding complete — activated', buildingId: b.id }); }}
              className="px-4 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-700">🚀 Complete Onboarding</button>
          )}
        </div>
      </div>

      {/* Subscription */}
      <div className="bg-accent-50 border border-accent-200 rounded-xl p-5">
        <h4 className="font-display font-bold text-ink-900 mb-3">Subscription Management</h4>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm mb-4">
          <div><p className="text-xs text-ink-400">Tier</p><p className="font-bold capitalize">{TIER_LABELS[b.subscription.tier]}</p></div>
          <div><p className="text-xs text-ink-400">Status</p><p className="font-bold capitalize">{b.subscription.status.replace('_',' ')}</p></div>
          <div><p className="text-xs text-ink-400">Rate</p><p className="font-bold">{fmt(b.subscription.monthlyRate)}/mo</p></div>
          <div><p className="text-xs text-ink-400">Start</p><p className="font-bold">{b.subscription.startDate}</p></div>
          <div><p className="text-xs text-ink-400">Next Billing</p><p className="font-bold">{b.subscription.nextBillingDate}</p></div>
        </div>
        {b.subscription.trialEndsAt && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-sm">
            <p className="text-yellow-800 font-semibold">🕐 Trial expires {b.subscription.trialEndsAt}</p>
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          {(['essentials','compliance_pro','advanced_governance'] as SubscriptionTier[]).filter(t => t !== b.subscription.tier).map(tier => (
            <button key={tier} onClick={() => {
              updateSubscription(b.id, { tier, monthlyRate: TIER_PRICES[tier] });
              addAuditEntry({ actor: ACTOR, actorRole: 'super_admin', action: 'subscription.change', target: b.name, details: `Tier changed: ${TIER_LABELS[b.subscription.tier]} → ${TIER_LABELS[tier]} (${fmt(TIER_PRICES[tier])}/mo)`, buildingId: b.id });
            }} className="px-3 py-1.5 border border-ink-200 rounded-lg text-xs font-medium hover:shadow-sm">
              {TIER_LABELS[tier]} ({fmt(TIER_PRICES[tier])}/mo)
            </button>
          ))}
          {b.subscription.status === 'past_due' && (
            <button onClick={() => { updateSubscription(b.id, { status: 'active' }); addAuditEntry({ actor: ACTOR, actorRole: 'super_admin', action: 'subscription.resolve', target: b.name, details: 'Past-due status resolved', buildingId: b.id }); }}
              className="px-3 py-1.5 bg-sage-600 text-white rounded-lg text-xs font-medium hover:bg-sage-700">✓ Mark Paid</button>
          )}
        </div>
      </div>

      {/* Primary Contact */}
      <div className="bg-white border border-ink-100 rounded-xl p-5">
        <h4 className="font-display font-bold text-ink-900 mb-3">Primary Contact</h4>
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-ink-900 flex items-center justify-center shrink-0">
            <span className="text-white font-bold">{b.primaryContact.name.split(' ').map(n => n[0]).join('')}</span>
          </div>
          <div>
            <p className="font-semibold text-ink-900">{b.primaryContact.name}</p>
            <p className="text-sm text-accent-600">{b.primaryContact.role}</p>
            <p className="text-xs text-ink-500">{b.primaryContact.email} · {b.primaryContact.phone}</p>
          </div>
        </div>
      </div>

      {/* Feature Flags */}
      <div className="bg-white border border-ink-100 rounded-xl p-5">
        <h4 className="font-display font-bold text-ink-900 mb-3">Feature Flags</h4>
        <p className="text-xs text-ink-400 mb-3">Toggle features for this building. Changes take effect immediately.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(Object.entries(b.features) as [keyof Tenant['features'], boolean][]).map(([key, enabled]) => {
            const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
            return (
              <div key={key} className="flex items-center justify-between py-2.5 px-3 bg-mist-50 rounded-lg">
                <span className="text-sm font-medium text-ink-700">{label}</span>
                <button onClick={() => {
                  toggleFeature(b.id, key);
                  addAuditEntry({ actor: ACTOR, actorRole: 'super_admin', action: 'feature.toggle', target: b.name, details: `${enabled ? 'Disabled' : 'Enabled'} ${label}`, buildingId: b.id });
                }} className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${enabled ? 'bg-sage-500' : 'bg-ink-200'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Building Audit Trail */}
      <div>
        <h4 className="font-display font-bold text-ink-900 mb-3">Audit Trail for {b.name}</h4>
        <div className="bg-white border border-ink-100 rounded-xl overflow-hidden">
          {auditLog.filter(e => e.buildingId === b.id).length === 0 ? (
            <p className="p-4 text-sm text-ink-400">No audit entries for this building.</p>
          ) : (
            <div className="divide-y divide-ink-50">
              {auditLog.filter(e => e.buildingId === b.id).map(e => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-mist-50">
                  <span className="text-xs text-ink-300 w-28 shrink-0">{new Date(e.timestamp).toLocaleDateString()}</span>
                  <span className={`pill px-1.5 py-0.5 rounded text-xs shrink-0 ${ROLE_BADGE[e.actorRole]}`}>{e.actor}</span>
                  <span className="font-mono text-xs text-ink-400 shrink-0">{e.action}</span>
                  <span className="text-ink-600 truncate">{e.details}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════

export default function PlatformAdminPage() {
  const { tenants, platformUsers, auditLog, addTenant, addPlatformUser, removePlatformUser, addAuditEntry, getPlatformMetrics } = usePlatformAdminStore();
  const metrics = getPlatformMetrics();
  const [tab, setTab] = useState('overview');
  const [selectedBldg, setSelectedBldg] = useState<string | null>(null);
  const [showAddBldg, setShowAddBldg] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [auditFilter, setAuditFilter] = useState('');

  const [bldgForm, setBldgForm] = useState({ name: '', street: '', city: '', state: '', zip: '', units: '', yearBuilt: '', contactName: '', contactEmail: '', contactPhone: '', tier: 'compliance_pro' as SubscriptionTier });
  const [userForm, setUserForm] = useState({ name: '', email: '', role: 'support' as PlatformUser['role'] });

  const handleAddBuilding = () => {
    if (!bldgForm.name || !bldgForm.contactEmail) { alert('Building name and contact email required'); return; }
    const id = `bld-${Date.now()}`;
    const today = new Date().toISOString().split('T')[0];
    const trialEnd = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    addTenant({
      id, name: bldgForm.name,
      address: { street: bldgForm.street, city: bldgForm.city, state: bldgForm.state, zip: bldgForm.zip },
      totalUnits: parseInt(bldgForm.units) || 0, yearBuilt: bldgForm.yearBuilt, status: 'onboarding', createdAt: today,
      subscription: { tier: bldgForm.tier, status: 'trial', startDate: today, nextBillingDate: trialEnd, monthlyRate: TIER_PRICES[bldgForm.tier], trialEndsAt: trialEnd },
      stats: { activeUsers: 0, occupiedUnits: 0, collectionRate: 0, complianceScore: 0, openCases: 0, monthlyRevenue: 0 },
      primaryContact: { name: bldgForm.contactName, email: bldgForm.contactEmail, phone: bldgForm.contactPhone, role: 'Primary Contact' },
      features: { fiscalLens: true, caseOps: true, complianceRunbook: true, aiAdvisor: bldgForm.tier !== 'essentials', documentVault: bldgForm.tier !== 'essentials', paymentProcessing: bldgForm.tier !== 'essentials' },
    });
    addAuditEntry({ actor: 'Alex Rivera', actorRole: 'super_admin', action: 'building.create', target: bldgForm.name, details: `New building onboarded — ${bldgForm.tier} trial`, buildingId: id });
    setBldgForm({ name: '', street: '', city: '', state: '', zip: '', units: '', yearBuilt: '', contactName: '', contactEmail: '', contactPhone: '', tier: 'compliance_pro' });
    setShowAddBldg(false);
  };

  const handleAddUser = () => {
    if (!userForm.name || !userForm.email) { alert('Name and email required'); return; }
    addPlatformUser({ id: `padm-${Date.now()}`, name: userForm.name, email: userForm.email, role: userForm.role, status: 'active', lastLogin: '', createdAt: new Date().toISOString().split('T')[0], buildings: ['*'] });
    addAuditEntry({ actor: 'Alex Rivera', actorRole: 'super_admin', action: 'user.create', target: userForm.name, details: `Platform user created (${userForm.role})`, buildingId: null });
    setUserForm({ name: '', email: '', role: 'support' });
    setShowAddUser(false);
  };

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="bg-gradient-to-r from-ink-900 via-ink-800 to-red-900 rounded-t-xl p-6 text-white">
        <div className="flex items-center gap-3 mb-1">
          <span className="px-2 py-0.5 bg-red-500 bg-opacity-30 rounded text-xs font-bold tracking-wide uppercase">Platform Admin</span>
        </div>
        <h2 className="font-display text-2xl font-bold">Multi-Tenancy Console</h2>
        <p className="text-red-200 text-sm mt-1">{metrics.totalBuildings} buildings · {metrics.totalUnits} units · {metrics.totalUsers} users · MRR {fmt(metrics.mrr)}</p>
      </div>

      {/* Tabs */}
      <div className="bg-white border-x border-b border-ink-100 overflow-x-auto">
        <div className="flex min-w-max px-4">
          {TABS.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setSelectedBldg(null); }}
              className={`px-5 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t.id ? 'border-red-600 text-ink-900' : 'border-transparent text-ink-400 hover:text-ink-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-b-xl border-x border-b border-ink-100 p-6">

        {tab === 'overview' && <OverviewTab />}

        {/* ═══ BUILDINGS LIST ═══ */}
        {tab === 'buildings' && !selectedBldg && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-ink-900">Buildings ({tenants.length})</h3>
              <button onClick={() => setShowAddBldg(true)} className="px-4 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 text-sm font-medium">+ Onboard Building</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-400 uppercase tracking-wide border-b border-ink-100">
                    <th className="py-2 pr-3">Building</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Tier</th>
                    <th className="py-2 pr-3 text-right">Units</th><th className="py-2 pr-3 text-right">Users</th>
                    <th className="py-2 pr-3 text-right">MRR</th><th className="py-2 pr-3 text-right">Collect.</th>
                    <th className="py-2 pr-3 text-right">Compl.</th><th className="py-2">Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map(t => (
                    <tr key={t.id} className="border-b border-ink-50 hover:bg-mist-50 cursor-pointer" onClick={() => setSelectedBldg(t.id)}>
                      <td className="py-3 pr-3"><p className="font-semibold text-ink-900">{t.name}</p><p className="text-xs text-ink-400">{t.address.city}, {t.address.state}</p></td>
                      <td className="py-3 pr-3"><span className={`pill px-2 py-0.5 rounded text-xs font-semibold ${STATUS_BADGE[t.status]}`}>{t.status}</span></td>
                      <td className="py-3 pr-3"><span className={`pill px-2 py-0.5 rounded text-xs font-semibold ${TIER_BADGE[t.subscription.tier]}`}>{TIER_LABELS[t.subscription.tier]}</span></td>
                      <td className="py-3 pr-3 text-right">{t.totalUnits}</td>
                      <td className="py-3 pr-3 text-right">{t.stats.activeUsers}</td>
                      <td className="py-3 pr-3 text-right font-semibold">{fmt(t.subscription.monthlyRate)}</td>
                      <td className="py-3 pr-3 text-right"><span className={t.stats.collectionRate >= 90 ? 'text-sage-600' : 'text-red-600'}>{t.stats.collectionRate || '—'}%</span></td>
                      <td className="py-3 pr-3 text-right"><span className={t.stats.complianceScore >= 80 ? 'text-sage-600' : t.stats.complianceScore >= 60 ? 'text-yellow-600' : 'text-ink-400'}>{t.stats.complianceScore || '—'}%</span></td>
                      <td className="py-3 text-xs text-ink-500">{t.primaryContact.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══ BUILDING DETAIL ═══ */}
        {tab === 'buildings' && selectedBldg && (
          <BuildingDetail bldgId={selectedBldg} onBack={() => setSelectedBldg(null)} />
        )}

        {/* ═══ PLATFORM USERS ═══ */}
        {tab === 'users' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-ink-900">Platform Users ({platformUsers.length})</h3>
              <button onClick={() => setShowAddUser(true)} className="px-4 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 text-sm font-medium">+ Add Admin User</button>
            </div>
            <p className="text-sm text-ink-500">Platform-level administrative accounts. These users can access the admin console and manage buildings.</p>
            <div className="space-y-3">
              {platformUsers.map(u => (
                <div key={u.id} className="bg-white border border-ink-100 rounded-xl p-4 flex items-center justify-between hover:shadow-sm transition-all">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-full ${u.status === 'active' ? 'bg-ink-900' : 'bg-ink-300'} flex items-center justify-center shrink-0`}>
                      <span className="text-white font-bold text-sm">{u.name.split(' ').map(n => n[0]).join('')}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-ink-900">{u.name}</p>
                        <span className={`pill px-2 py-0.5 rounded text-xs font-semibold ${ROLE_BADGE[u.role]}`}>{u.role.replace('_',' ')}</span>
                        {u.status === 'inactive' && <span className="pill px-2 py-0.5 rounded text-xs bg-ink-100 text-ink-500">inactive</span>}
                      </div>
                      <p className="text-xs text-ink-500">{u.email}</p>
                      <p className="text-xs text-ink-400">
                        Last login: {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Never'} ·
                        Access: {u.buildings.includes('*') ? 'All buildings' : `${u.buildings.length} building(s)`} ·
                        Created {u.createdAt}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => { if(confirm(`Remove ${u.name}?`)) { removePlatformUser(u.id); addAuditEntry({ actor: 'Alex Rivera', actorRole: 'super_admin', action: 'user.remove', target: u.name, details: `Removed platform user (${u.role})`, buildingId: null }); }}}
                    className="px-3 py-1.5 text-red-500 hover:text-red-700 text-xs font-medium hover:bg-red-50 rounded">Remove</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ AUDIT LOG ═══ */}
        {tab === 'audit' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className="font-display text-lg font-bold text-ink-900">Audit Log ({auditLog.length} entries)</h3>
              <input value={auditFilter} onChange={e => setAuditFilter(e.target.value)} placeholder="Filter by actor, action, or details..." className="px-3 py-2 border border-ink-200 rounded-lg text-sm w-72" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-400 uppercase tracking-wide border-b border-ink-100">
                    <th className="py-2 pr-3 w-40">Timestamp</th><th className="py-2 pr-3">Actor</th><th className="py-2 pr-3">Role</th>
                    <th className="py-2 pr-3">Action</th><th className="py-2 pr-3">Target</th><th className="py-2">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog
                    .filter(e => !auditFilter || [e.actor, e.action, e.target, e.details].some(f => f.toLowerCase().includes(auditFilter.toLowerCase())))
                    .map(e => (
                    <tr key={e.id} className="border-b border-ink-50 hover:bg-mist-50">
                      <td className="py-2.5 pr-3 text-xs text-ink-400 whitespace-nowrap">{new Date(e.timestamp).toLocaleString()}</td>
                      <td className="py-2.5 pr-3 font-medium text-ink-900 whitespace-nowrap">{e.actor}</td>
                      <td className="py-2.5 pr-3"><span className={`pill px-1.5 py-0.5 rounded text-xs ${ROLE_BADGE[e.actorRole]}`}>{e.actorRole.replace('_',' ')}</span></td>
                      <td className="py-2.5 pr-3 text-ink-600 font-mono text-xs whitespace-nowrap">{e.action}</td>
                      <td className="py-2.5 pr-3 text-ink-700 whitespace-nowrap">{e.target}</td>
                      <td className="py-2.5 text-ink-500 truncate max-w-xs">{e.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ═══ ADD BUILDING MODAL ═══ */}
      {showAddBldg && (
        <Modal title="Onboard New Building" subtitle="Create a new tenant with trial subscription" onClose={() => setShowAddBldg(false)} onSave={handleAddBuilding} saveLabel="Create Building" wide>
          <div className="space-y-4">
            <div className="border-b border-ink-100 pb-3 mb-1"><p className="text-xs font-semibold text-ink-400 uppercase">Building Information</p></div>
            <div><label className="block text-sm font-medium text-ink-700 mb-1">Building / Association Name *</label><input value={bldgForm.name} onChange={e => setBldgForm({...bldgForm, name: e.target.value})} className="w-full px-3 py-2 border border-ink-200 rounded-lg" placeholder="e.g., Sunny Acres Condominium" /></div>
            <div><label className="block text-sm font-medium text-ink-700 mb-1">Street Address</label><input value={bldgForm.street} onChange={e => setBldgForm({...bldgForm, street: e.target.value})} className="w-full px-3 py-2 border border-ink-200 rounded-lg" placeholder="123 Main St" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="block text-sm font-medium text-ink-700 mb-1">City</label><input value={bldgForm.city} onChange={e => setBldgForm({...bldgForm, city: e.target.value})} className="w-full px-3 py-2 border border-ink-200 rounded-lg" /></div>
              <div><label className="block text-sm font-medium text-ink-700 mb-1">State</label><input value={bldgForm.state} onChange={e => setBldgForm({...bldgForm, state: e.target.value})} className="w-full px-3 py-2 border border-ink-200 rounded-lg" maxLength={2} /></div>
              <div><label className="block text-sm font-medium text-ink-700 mb-1">ZIP</label><input value={bldgForm.zip} onChange={e => setBldgForm({...bldgForm, zip: e.target.value})} className="w-full px-3 py-2 border border-ink-200 rounded-lg" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-sm font-medium text-ink-700 mb-1">Total Units</label><input type="number" value={bldgForm.units} onChange={e => setBldgForm({...bldgForm, units: e.target.value})} className="w-full px-3 py-2 border border-ink-200 rounded-lg" /></div>
              <div><label className="block text-sm font-medium text-ink-700 mb-1">Year Built</label><input value={bldgForm.yearBuilt} onChange={e => setBldgForm({...bldgForm, yearBuilt: e.target.value})} className="w-full px-3 py-2 border border-ink-200 rounded-lg" /></div>
            </div>
            <div className="border-b border-ink-100 pb-3 mb-1 mt-2"><p className="text-xs font-semibold text-ink-400 uppercase">Primary Contact</p></div>
            <div><label className="block text-sm font-medium text-ink-700 mb-1">Contact Name</label><input value={bldgForm.contactName} onChange={e => setBldgForm({...bldgForm, contactName: e.target.value})} className="w-full px-3 py-2 border border-ink-200 rounded-lg" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-sm font-medium text-ink-700 mb-1">Email *</label><input type="email" value={bldgForm.contactEmail} onChange={e => setBldgForm({...bldgForm, contactEmail: e.target.value})} className="w-full px-3 py-2 border border-ink-200 rounded-lg" /></div>
              <div><label className="block text-sm font-medium text-ink-700 mb-1">Phone</label><input value={bldgForm.contactPhone} onChange={e => setBldgForm({...bldgForm, contactPhone: e.target.value})} className="w-full px-3 py-2 border border-ink-200 rounded-lg" /></div>
            </div>
            <div className="border-b border-ink-100 pb-3 mb-1 mt-2"><p className="text-xs font-semibold text-ink-400 uppercase">Subscription</p></div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-2">Tier</label>
              <div className="grid grid-cols-3 gap-3">
                {(['essentials','compliance_pro','advanced_governance'] as SubscriptionTier[]).map(tier => (
                  <button key={tier} type="button" onClick={() => setBldgForm({...bldgForm, tier})}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${bldgForm.tier === tier ? 'border-accent-500 bg-accent-50' : 'border-ink-100 hover:border-ink-200'}`}>
                    <p className="font-bold text-ink-900">{TIER_LABELS[tier]}</p>
                    <p className="text-lg font-bold text-accent-600">{fmt(TIER_PRICES[tier])}<span className="text-xs font-normal text-ink-400">/mo</span></p>
                    <p className="text-xs text-ink-400 mt-1">{tier === 'essentials' ? 'Portals, Financial, Meetings, Docs' : tier === 'compliance_pro' ? '+ Compliance, Case Ops, AI, Payments' : '+ Community, Invoicing, PM Tools'}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ═══ ADD USER MODAL ═══ */}
      {showAddUser && (
        <Modal title="Add Platform User" subtitle="Grant administrative access to the platform" onClose={() => setShowAddUser(false)} onSave={handleAddUser} saveLabel="Create User">
          <div className="space-y-4">
            <div><label className="block text-sm font-medium text-ink-700 mb-1">Full Name *</label><input value={userForm.name} onChange={e => setUserForm({...userForm, name: e.target.value})} className="w-full px-3 py-2 border border-ink-200 rounded-lg" /></div>
            <div><label className="block text-sm font-medium text-ink-700 mb-1">Email *</label><input type="email" value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})} className="w-full px-3 py-2 border border-ink-200 rounded-lg" /></div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Role</label>
              <select value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value as PlatformUser['role']})} className="w-full px-3 py-2 border border-ink-200 rounded-lg bg-white">
                <option value="super_admin">Super Admin — full access</option>
                <option value="support">Support — manage buildings, assist users</option>
                <option value="billing">Billing — subscriptions and payments</option>
                <option value="readonly">Read Only — view only</option>
              </select>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
