import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useTenantContext } from '@/components/TenantProvider';

/**
 * The building's On Call advisor, for buildings with the On Call add-on.
 * `requested` means the add-on is on and ONE two has not assigned anyone yet;
 * `assigned` carries the advisor's name and email. Null when the building
 * does not have the add-on (or in demo data, where there is no backend).
 */
export interface OnCallAdvisor {
  status: 'requested' | 'assigned';
  name: string | null;
  email: string | null;
  assignedAt: string | null;
}

export function useOnCallAdvisor(): OnCallAdvisor | null {
  const tenant = useTenantContext();
  const [advisor, setAdvisor] = useState<OnCallAdvisor | null>(null);
  const tenantId = tenant.isDemo ? null : tenant.id;

  useEffect(() => {
    if (!supabase || !tenantId) return;
    let cancelled = false;
    supabase
      .from('on_call_assignments')
      .select('status, advisor_name, advisor_email, assigned_at')
      .eq('tenant_id', tenantId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setAdvisor(data ? { status: data.status, name: data.advisor_name, email: data.advisor_email, assignedAt: data.assigned_at } : null);
      });
    return () => { cancelled = true; };
  }, [tenantId]);

  return tenantId ? advisor : null;
}
