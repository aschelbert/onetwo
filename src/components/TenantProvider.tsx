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
    // First, try to get tenant info from the platform admin store (already loaded)
    const adminTenant = usePlatformAdminStore.getState().tenants.find(t => t.id === tenantId);

    let tenantInfo: TenantInfo;

    if (adminTenant) {
      // Use data from the platform admin store — already fetched, no extra DB round-trip
      tenantInfo = {
        id: adminTenant.id,
        name: adminTenant.name,
        subdomain: adminTenant.subdomain,
        status: adminTenant.status,
        tier: adminTenant.subscription.tier,
        features: adminTenant.features as Record<string, boolean>,
        address: adminTenant.address,
        totalUnits: adminTenant.totalUnits,
        isDemo: false,
      };
    } else if (supabase) {
      // Fallback: query DB directly
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

      tenantInfo = {
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
    } else {
      return;
    }

    setTenant(tenantInfo);
    setActiveTenantId(tenantInfo.id);
    resetStoresForRealTenant();

    updateName(tenantInfo.name);
    updateAddress(tenantInfo.address);
    updateDetails({ totalUnits: tenantInfo.totalUnits });

    // Load per-tenant store data from DB if available
    if (supabase) {
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
    }
  }, [updateName, updateAddress, updateDetails]);

  // When a PLATFORM_ADMIN impersonates a tenant, load that tenant's data.
  // Skip on initial mount — the initial useEffect handles that case after loadFromDb.
  const impersonatingMountedRef = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || !currentUser || currentUser.role !== 'PLATFORM_ADMIN') return;
    if (!isBackendEnabled || !supabase) return;

    // Skip the first run — let the initial useEffect handle loading on mount
    if (!impersonatingMountedRef.current) {
      impersonatingMountedRef.current = true;
      return;
    }

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

  // Block access for churned tenants
  if (tenant.status === 'churned' && !tenant.isDemo && currentUser?.role !== 'PLATFORM_ADMIN') {
    return (
      <TenantContext.Provider value={tenant}>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gradient-to-br from-ink-50 via-white to-mist-50">
          <div className="bg-white rounded-2xl shadow-xl border border-ink-100 p-8 max-w-md mx-4 text-center">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="font-display text-xl font-bold text-ink-900 mb-2">Account Inactive</h2>
            <p className="text-sm text-ink-500 mb-6">
              Your subscription has ended and access to {tenant.name} is no longer available.
              Please contact support or a board member to reactivate your account.
            </p>
            <div className="flex flex-col gap-3">
              <a
                href="mailto:support@getonetwo.com"
                className="w-full py-3 bg-accent-600 text-white rounded-xl font-semibold text-sm hover:bg-accent-700 transition-all text-center"
              >
                Contact Support
              </a>
              <button
                onClick={() => {
                  useAuthStore.getState().signOut();
                  window.location.href = '/login';
                }}
                className="w-full py-3 border border-ink-200 text-ink-600 rounded-xl font-semibold text-sm hover:bg-ink-50 transition-all"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </TenantContext.Provider>
    );
  }

  return (
    <TenantContext.Provider value={tenant}>
      {children}
    </TenantContext.Provider>
  );
}

