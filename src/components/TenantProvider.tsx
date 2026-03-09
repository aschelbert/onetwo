// src/components/TenantProvider.tsx
// Wraps the app. After Supabase Auth login, loads the tenant context
// and overwrites the building store with real data.

import { useEffect, useState, useRef, createContext, useContext, useCallback } from 'react';
import { supabase, isBackendEnabled, setActiveTenantId } from '@/lib/supabase';
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
import { resetStoresForRealTenant } from '@/store/resetStores';

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
  const hasLoadedDataRef = useRef(false);
  const impersonating = usePlatformAdminStore(s => s.impersonating);

  // Load a specific tenant's data into the context and all stores
  const loadTenantById = useCallback(async (tenantId: string) => {
    if (!supabase) return;

    const { data: t } = await supabase
      .from('tenants')
      .select('id, name, subdomain, status, address, total_units')
      .eq('id', tenantId)
      .maybeSingle();

    if (!t) return;

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('tier')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    const { data: feat } = await supabase
      .from('tenant_features')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    const addr = typeof t.address === 'string' ? JSON.parse(t.address) : (t.address || {});

    const tenantInfo: TenantInfo = {
      id: t.id,
      name: t.name,
      subdomain: t.subdomain,
      status: t.status,
      tier: sub?.tier || 'compliance_pro',
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
    setActiveTenantId(tenantInfo.id);
    resetStoresForRealTenant();

    updateName(tenantInfo.name);
    updateAddress(tenantInfo.address);
    updateDetails({ totalUnits: tenantInfo.totalUnits });

    // Probe schema before loading stores
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
  }, [updateName, updateAddress, updateDetails]);

  // When a PLATFORM_ADMIN impersonates a tenant, load that tenant's data
  useEffect(() => {
    if (!isAuthenticated || !currentUser || currentUser.role !== 'PLATFORM_ADMIN') return;
    if (!isBackendEnabled || !supabase) return;

    if (impersonating) {
      loadTenantById(impersonating);
    } else {
      // Reset to default when impersonation ends
      setTenant(defaultTenant);
      setActiveTenantId(null);
    }
  }, [impersonating, isAuthenticated, currentUser, loadTenantById]);

  useEffect(() => {
    if (!isAuthenticated || !currentUser) {
      setLoaded(true);
      return;
    }

    // Demo users (from seed data) — keep demo tenant
    if (!isBackendEnabled || !supabase || currentUser.role === 'PLATFORM_ADMIN') {
      // Hydrate platform admin store if backend is available and user is platform admin
      if (isBackendEnabled && supabase && currentUser.role === 'PLATFORM_ADMIN') {
        // Wait for Supabase session to be ready before querying RLS-protected tables
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session) {
            usePlatformAdminStore.getState().loadFromDb().then(() => {
              // If already impersonating on load, hydrate that tenant
              const impersonatingId = usePlatformAdminStore.getState().impersonating;
              if (impersonatingId) {
                loadTenantById(impersonatingId).then(() => setLoaded(true));
              } else {
                setLoaded(true);
              }
            });
          } else {
            setLoaded(true);
          }
        });
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

    // Load tenant from Supabase (only once per session — prevents re-runs
    // from wiping in-flight store data via resetStoresForRealTenant)
    if (hasLoadedDataRef.current) return;
    hasLoadedDataRef.current = true;

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
          tier: sub?.tier || 'compliance_pro',
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
        setActiveTenantId(tenantInfo.id);

        // Clear all seed/demo data before hydrating with real DB data.
        // This ensures new buildings start clean even if the schema probe
        // fails and loadFromDb() calls are skipped.
        resetStoresForRealTenant();

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

