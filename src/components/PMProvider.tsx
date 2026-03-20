// src/components/PMProvider.tsx
// Context provider for the Property Management module.
// Loads management company data after auth, following TenantProvider's pattern.

import { useEffect, useState, useRef, createContext, useContext, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase, isBackendEnabled } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';
import type { ManagementCompany, ManagementCompanyUser, PMPortfolioBuilding, PMUserContext } from '@/types/portfolio';

const PMContext = createContext<PMUserContext | null>(null);

export function usePMContext(): PMUserContext {
  const ctx = useContext(PMContext);
  if (!ctx) throw new Error('usePMContext must be used inside <PMProvider>');
  return ctx;
}

export default function PMProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loaded, setLoaded] = useState(false);
  const [company, setCompany] = useState<ManagementCompany | null>(null);
  const [companyUser, setCompanyUser] = useState<ManagementCompanyUser | null>(null);
  const [buildings, setBuildings] = useState<PMPortfolioBuilding[]>([]);
  const [accessibleTenantIds, setAccessibleTenantIds] = useState<string[]>([]);
  const hasLoadedRef = useRef(false);

  const activeBuildingId = searchParams.get('bldg') || null;

  const setActiveBuildingId = useCallback((id: string | null) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (id) {
        next.set('bldg', id);
      } else {
        next.delete('bldg');
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    if (!isBackendEnabled || !supabase || !currentUser || hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    (async () => {
      try {
        const sb = supabase;

        // 1. Load the user's management company membership
        const { data: mcUser } = await sb
          .from('management_company_users')
          .select('id, company_id, user_id, role, status, display_name, created_at')
          .eq('user_id', currentUser.id)
          .eq('status', 'active')
          .maybeSingle();

        if (!mcUser) {
          setLoaded(true);
          return;
        }
        setCompanyUser(mcUser);

        // 2. Load the management company
        const { data: mc } = await sb
          .from('management_companies')
          .select('id, name, contact_email, contact_phone, address, created_at')
          .eq('id', mcUser.company_id)
          .maybeSingle();

        if (mc) setCompany(mc);

        // 3. Load managed tenants (buildings)
        const { data: mcts } = await sb
          .from('management_company_tenants')
          .select('id, company_id, tenant_id, assigned_at, tenants:tenant_id(id, name, address, total_units)')
          .eq('company_id', mcUser.company_id);

        if (mcts) {
          const bldgs: PMPortfolioBuilding[] = mcts
            .filter((row: any) => row.tenants)
            .map((row: any) => ({
              tenantId: row.tenants.id,
              name: row.tenants.name,
              address: typeof row.tenants.address === 'string'
                ? JSON.parse(row.tenants.address)
                : row.tenants.address,
              totalUnits: row.tenants.total_units || 0,
            }));
          setBuildings(bldgs);
        }

        // 4. Get accessible tenant IDs via RPC
        const { data: rpcResult } = await sb.rpc('get_pm_accessible_tenant_ids');
        if (rpcResult) {
          setAccessibleTenantIds(rpcResult);
        }
      } catch (err) {
        console.warn('PMProvider: failed to load PM context', err);
      } finally {
        setLoaded(true);
      }
    })();
  }, [currentUser?.id]);

  if (!loaded) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-navy-300 border-t-navy-900 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-ink-400">Loading your portfolio...</p>
        </div>
      </div>
    );
  }

  if (!company || !companyUser) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="text-center max-w-sm">
          <p className="text-lg font-bold text-ink-900 mb-2">No Portfolio Found</p>
          <p className="text-sm text-ink-500">Your account is not linked to a management company.</p>
        </div>
      </div>
    );
  }

  const value: PMUserContext = {
    company,
    companyUser,
    buildings,
    accessibleTenantIds,
    activeBuildingId,
    setActiveBuildingId,
  };

  return <PMContext.Provider value={value}>{children}</PMContext.Provider>;
}
