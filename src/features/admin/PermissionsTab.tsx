import { useState, Fragment } from 'react';
import { usePlatformAdminStore, TIER_FEATURES, TENANT_ROLES, PERMISSION_ACTIONS, FEATURE_GROUPS, type SubscriptionTier, type Tenant } from '@/store/usePlatformAdminStore';

const FEATURE_LABELS: Record<string, string> = {
  fiscalLens: 'Fiscal Lens', caseOps: 'Case Ops', complianceRunbook: 'Compliance Runbook',
  aiAdvisor: 'AI Advisor', documentVault: 'Document Vault', paymentProcessing: 'Payment Processing',
  votesResolutions: 'Votes & Resolutions', communityPortal: 'Community Portal',
  vendorManagement: 'Vendor Management', reserveStudyTools: 'Reserve Study Tools',
};

const ROLE_COLORS: Record<string, string> = {
  board_member: 'border-accent-500 bg-accent-50',
  resident: 'border-sage-500 bg-sage-50',
  property_manager: 'border-purple-500 bg-purple-50',
};

export default function PermissionsTab() {
  const store = usePlatformAdminStore();
  const { permissions } = store;
  const [selectedRole, setSelectedRole] = useState('board_member');

  const role = TENANT_ROLES.find(r => r.id === selectedRole)!;
  const rolePermissions = permissions.filter(p => p.roleId === selectedRole);

  const isFeatureAvailable = (featureId: string) => {
    return role.tiers.some(tier => TIER_FEATURES[tier][featureId as keyof Tenant['features']]);
  };

  const getPermission = (featureId: string) => {
    return rolePermissions.find(p => p.featureId === featureId);
  };

  const toggleAction = (featureId: string, action: string) => {
    const perm = getPermission(featureId);
    if (!perm) return;
    const newActions = perm.actions.includes(action)
      ? perm.actions.filter(a => a !== action)
      : [...perm.actions, action];
    store.updatePermission(selectedRole, featureId, newActions);
  };

  const totalPerms = rolePermissions.reduce((s, p) => s + p.actions.length, 0);
  const availableFeatures = Object.keys(FEATURE_LABELS).filter(f => isFeatureAvailable(f));

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-lg font-bold text-ink-900">Role-Based Permissions (RBAC)</h3>
        <p className="text-sm text-ink-500 mt-1">Configure granular per-role, per-feature, per-action permissions for tenant users.</p>
      </div>

      {/* Role Selector */}
      <div className="flex gap-3">
        {TENANT_ROLES.map(r => (
          <button key={r.id} onClick={() => setSelectedRole(r.id)}
            className={`flex-1 px-4 py-3 rounded-xl border-2 text-left transition-all ${selectedRole === r.id ? ROLE_COLORS[r.id] : 'border-ink-100 hover:border-ink-200 bg-white'}`}>
            <div className="flex items-center gap-2">
              <span className="text-xl">{r.icon}</span>
              <span className="font-semibold text-ink-900">{r.name}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Role Summary Card */}
      <div className={`rounded-xl border-2 p-5 ${ROLE_COLORS[selectedRole]}`}>
        <div className="flex items-start gap-4">
          <span className="text-3xl">{role.icon}</span>
          <div className="flex-1">
            <h4 className="font-bold text-ink-900 text-lg">{role.name}</h4>
            <p className="text-sm text-ink-600 mt-1">{role.description}</p>
            <div className="flex gap-6 mt-3">
              <div><span className="text-xs text-ink-400 uppercase font-semibold">Plans</span><p className="font-bold text-ink-900">{role.tiers.length}</p></div>
              <div><span className="text-xs text-ink-400 uppercase font-semibold">Features</span><p className="font-bold text-ink-900">{availableFeatures.length}</p></div>
              <div><span className="text-xs text-ink-400 uppercase font-semibold">Permissions</span><p className="font-bold text-ink-900">{totalPerms}</p></div>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Actions */}
      <div className="flex gap-2">
        <button onClick={() => store.bulkUpdatePermissions(selectedRole, 'grant')}
          className="px-4 py-2 bg-sage-600 text-white rounded-lg text-sm font-medium hover:bg-sage-700">Grant All</button>
        <button onClick={() => store.bulkUpdatePermissions(selectedRole, 'viewonly')}
          className="px-4 py-2 bg-ink-100 text-ink-700 rounded-lg text-sm font-medium hover:bg-ink-200">Set View-Only</button>
        <button onClick={() => { if (confirm('Revoke all permissions for this role?')) store.bulkUpdatePermissions(selectedRole, 'revoke'); }}
          className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">Revoke All</button>
      </div>

      {/* Permission Matrix */}
      <div className="overflow-x-auto border border-ink-100 rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-400 uppercase border-b border-ink-200 bg-mist-50">
              <th className="py-3 px-4 w-64">Feature</th>
              {PERMISSION_ACTIONS.map(a => (
                <th key={a} className="py-3 px-3 text-center w-24">{a}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FEATURE_GROUPS.map(group => {
              const groupFeatures = group.features.filter(f => FEATURE_LABELS[f]);
              if (groupFeatures.length === 0) return null;
              return (
                <Fragment key={group.name}>
                  {/* Group header */}
                  <tr className="bg-ink-50">
                    <td colSpan={6} className="py-2 px-4 text-xs font-bold text-ink-500 uppercase">{group.name}</td>
                  </tr>
                  {/* Feature rows */}
                  {groupFeatures.map(featureId => {
                    const available = isFeatureAvailable(featureId);
                    const perm = getPermission(featureId);
                    return (
                      <tr key={featureId} className={`border-b border-ink-50 ${!available ? 'opacity-40 bg-ink-50' : 'hover:bg-mist-50'}`}>
                        <td className="py-3 px-4">
                          <span className="font-medium text-ink-700">{FEATURE_LABELS[featureId]}</span>
                          {!available && <span className="ml-2 text-[10px] text-ink-400 italic">Not in role's plans</span>}
                        </td>
                        {PERMISSION_ACTIONS.map(action => (
                          <td key={action} className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={perm?.actions.includes(action) || false}
                              disabled={!available}
                              onChange={() => toggleAction(featureId, action)}
                              className="h-4 w-4 rounded border-ink-300 text-accent-600 focus:ring-accent-500 cursor-pointer disabled:cursor-not-allowed"
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-ink-400">
        Permissions determine what actions tenant users can take within features available on their subscription plan.
        Subscription gates feature availability (on/off per plan). Permissions gate actions within available features (granular per role).
      </p>
    </div>
  );
}

