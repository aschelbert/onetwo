// src/components/TenantProvider.tsx
// Wraps the app. After Supabase Auth login, loads the tenant context
// and overwrites the building store with real data.

import { useEffect, useState, createContext, useContext } from 'react';
import { supabase, isBackendEnabled } from '@/lib/supabase';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useElectionStore } from '@/store/useElectionStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useArchiveStore } from '@/store/useArchiveStore';
import { usePlatformAdminStore } from '@/store/usePlatformAdminStore';
import { useVendorTrackerStore } from '@/store/useVendorTrackerStore';
import { useSpendingStore } from '@/store/useSpendingStore';
import { useLetterStore } from '@/store/useLetterStore';
import { usePropertyLogStore } from '@/store/usePropertyLogStore';
import { useReportStore } from '@/store/useReportStore';
import { useScorecardStore } from '@/store/useScorecardStore';

export interface TenantInfo {
  id: string;
  name: string;
  subdomain: string;
  status: string;
  tier: string;
  features: Record<string, boolean>;
  address: { street: string; city: string; state: string; zip: string };
  totalUnits: number;
  isDemo: boolean;
}

const defaultTenant: TenantInfo = {
  id: 'demo', name: 'Sunny Acres Condominium', subdomain: 'demo',
  status: 'active', tier: 'compliance_pro', features: {},
  address: { street: '1234 Constitution Avenue NW', city: 'Washington', state: 'District of Columbia', zip: '20001' },
  totalUnits: 50, isDemo: true,
};

const TenantContext = createContext<TenantInfo>(defaultTenant);
export const useTenantContext = () => useContext(TenantContext);

export default function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenant, setTenant] = useState<TenantInfo>(defaultTenant);
  const [loaded, setLoaded] = useState(false);
  const { currentUser, isAuthenticated } = useAuthStore();
  const updateName = useBuildingStore(s => s.updateName);
  const updateAddress = useBuildingStore(s => s.updateAddress);
  const updateDetails = useBuildingStore(s => s.updateDetails);

  useEffect(() => {
    if (!isAuthenticated || !currentUser) {
      setLoaded(true);
      return;
    }

    // Demo users (from seed data) — keep demo tenant
    if (!isBackendEnabled || !supabase || currentUser.role === 'PLATFORM_ADMIN') {
      // Hydrate platform admin store if backend is available and user is platform admin
      if (isBackendEnabled && currentUser.role === 'PLATFORM_ADMIN') {
        usePlatformAdminStore.getState().loadFromDb().then(() => setLoaded(true));
        return;
      }
      setLoaded(true);
      return;
    }

    // Check if this user was authenticated via Supabase (has a UUID-style id)
    const isSupabaseUser = currentUser.id.length === 36 && currentUser.id.includes('-');
    if (!isSupabaseUser) {
      // Demo store user
      setLoaded(true);
      return;
    }

    // Load tenant from Supabase
    (async () => {
      try {
        // Get user's tenant membership
        const { data: tu } = await supabase
          .from('tenant_users')
          .select('tenant_id')
          .eq('user_id', currentUser.id)
          .maybeSingle();

        if (!tu?.tenant_id) {
          setLoaded(true);
          return;
        }

        // Fetch tenant + subscription + features
        const { data: t } = await supabase
          .from('tenants')
          .select('id, name, subdomain, status, address, total_units')
          .eq('id', tu.tenant_id)
          .maybeSingle();

        if (!t) {
          setLoaded(true);
          return;
        }

        const { data: sub } = await supabase
          .from('subscriptions')
          .select('tier')
          .eq('tenant_id', tu.tenant_id)
          .maybeSingle();

        const { data: feat } = await supabase
          .from('tenant_features')
          .select('*')
          .eq('tenant_id', tu.tenant_id)
          .maybeSingle();

        const addr = typeof t.address === 'string' ? JSON.parse(t.address) : (t.address || {});

        const tenantInfo: TenantInfo = {
          id: t.id,
          name: t.name,
          subdomain: t.subdomain,
          status: t.status,
          tier: sub?.tier || 'essentials',
          features: feat || {},
          address: {
            street: addr.street || '',
            city: addr.city || '',
            state: addr.state || '',
            zip: addr.zip || '',
          },
          totalUnits: t.total_units || 0,
          isDemo: false,
        };

        setTenant(tenantInfo);

        // Hydrate building store with real tenant data
        updateName(tenantInfo.name);
        updateAddress(tenantInfo.address);
        updateDetails({ totalUnits: tenantInfo.totalUnits });

        // Probe a single table to check if operational schema exists.
        // If PGRST205 (table not found), skip all store hydration — stores
        // keep their seed/localStorage data. Reduces ~30 browser 404s to 1.
        const { error: schemaProbe } = await supabase
          .from('cases').select('id').limit(0);
        const schemaReady = !schemaProbe || schemaProbe.code !== 'PGRST205';

        if (schemaReady) {
          await Promise.all([
            useComplianceStore.getState().loadFromDb(tenantInfo.id),
            useMeetingsStore.getState().loadFromDb(tenantInfo.id),
            useIssuesStore.getState().loadFromDb(tenantInfo.id),
            useElectionStore.getState().loadFromDb(tenantInfo.id),
            useBuildingStore.getState().loadFromDb(tenantInfo.id),
            useFinancialStore.getState().loadFromDb(tenantInfo.id),
            useArchiveStore.getState().loadFromDb(tenantInfo.id),
            useVendorTrackerStore.getState().loadFromDb(tenantInfo.id),
            useSpendingStore.getState().loadFromDb(tenantInfo.id),
            useLetterStore.getState().loadFromDb(tenantInfo.id),
            usePropertyLogStore.getState().loadFromDb(tenantInfo.id),
            useReportStore.getState().loadFromDb(tenantInfo.id),
            useScorecardStore.getState().loadFromDb(tenantInfo.id),
          ]);
        }

      } catch (err) {
        console.warn('Failed to load tenant, using demo:', err);
      } finally {
        setLoaded(true);
      }
    })();
  }, [isAuthenticated, currentUser?.id]);

  if (!loaded) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-ink-300 border-t-ink-900 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-ink-400">Loading your building...</p>
        </div>
      </div>
    );
  }

  return (
    <TenantContext.Provider value={tenant}>
      {children}
    </TenantContext.Provider>
  );
}

