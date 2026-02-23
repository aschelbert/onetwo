// src/hooks/useTenant.ts
// Resolves the current tenant from the subdomain in the URL.
// Provides tenant context (name, features, subscription) to the entire app.
// Falls back to demo data when Supabase is not configured.

import { useState, useEffect, useCallback } from 'react';
import { supabase, isBackendEnabled } from '@/lib/supabase';

export interface TenantContext {
  id: string;
  name: string;
  subdomain: string;
  status: string;
  tier: string;
  features: {
    fiscalLens: boolean;
    caseOps: boolean;
    complianceRunbook: boolean;
    aiAdvisor: boolean;
    documentVault: boolean;
    paymentProcessing: boolean;
    votesResolutions: boolean;
    communityPortal: boolean;
    vendorManagement: boolean;
    reserveStudyTools: boolean;
  };
  subscription: {
    tier: string;
    status: string;
    monthlyRate: number;
    trialEndsAt: string | null;
  };
  onboarding: {
    accountCreated: boolean;
    buildingProfileComplete: boolean;
    unitsConfigured: boolean;
    firstUserInvited: boolean;
    bylawsUploaded: boolean;
    financialSetupDone: boolean;
    goLive: boolean;
  };
}

// Extract subdomain from hostname: "sunnyacres.getonetwo.com" → "sunnyacres"
function getSubdomain(): string | null {
  const hostname = window.location.hostname;

  // Local dev: check URL param or default
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const params = new URLSearchParams(window.location.search);
    return params.get('tenant') || null;
  }

  // Production: extract from subdomain
  // Expected format: [subdomain].getonetwo.com
  const parts = hostname.split('.');
  if (parts.length >= 3 && parts.slice(-2).join('.') === 'getonetwo.com') {
    const sub = parts[0];
    // Skip "www" or "app"
    if (sub === 'www' || sub === 'app') return null;
    return sub;
  }

  // Vercel preview or custom domain without subdomain
  return null;
}

// Demo fallback when no Supabase
const DEMO_TENANT: TenantContext = {
  id: 'demo',
  name: 'Sunny Acres Condominium',
  subdomain: 'demo',
  status: 'active',
  tier: 'compliance_pro',
  features: {
    fiscalLens: true, caseOps: true, complianceRunbook: true,
    aiAdvisor: true, documentVault: true, paymentProcessing: true,
    votesResolutions: false, communityPortal: false,
    vendorManagement: true, reserveStudyTools: false,
  },
  subscription: { tier: 'compliance_pro', status: 'active', monthlyRate: 179, trialEndsAt: null },
  onboarding: { accountCreated: true, buildingProfileComplete: true, unitsConfigured: true, firstUserInvited: true, bylawsUploaded: true, financialSetupDone: true, goLive: true },
};

export function useTenant() {
  const [tenant, setTenant] = useState<TenantContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTenant = useCallback(async () => {
    // If no backend, use demo data
    if (!isBackendEnabled || !supabase) {
      setTenant(DEMO_TENANT);
      setLoading(false);
      return;
    }

    const subdomain = getSubdomain();

    // No subdomain = platform root (admin or login page)
    if (!subdomain) {
      setTenant(null);
      setLoading(false);
      return;
    }

    try {
      // Fetch tenant + subscription + features in parallel
      const { data: tenantRow, error: tErr } = await supabase
        .from('tenants')
        .select(`
          id, name, subdomain, status,
          subscriptions ( tier, status, monthly_rate, trial_ends_at ),
          tenant_features ( * ),
          onboarding_checklists ( * )
        `)
        .eq('subdomain', subdomain)
        .single();

      if (tErr || !tenantRow) {
        setError(`Building "${subdomain}" not found`);
        setLoading(false);
        return;
      }

      const sub = Array.isArray(tenantRow.subscriptions)
        ? tenantRow.subscriptions[0]
        : tenantRow.subscriptions;
      const feat = Array.isArray(tenantRow.tenant_features)
        ? tenantRow.tenant_features[0]
        : tenantRow.tenant_features;
      const onb = Array.isArray(tenantRow.onboarding_checklists)
        ? tenantRow.onboarding_checklists[0]
        : tenantRow.onboarding_checklists;

      setTenant({
        id: tenantRow.id,
        name: tenantRow.name,
        subdomain: tenantRow.subdomain,
        status: tenantRow.status,
        tier: sub?.tier || 'essentials',
        features: {
          fiscalLens: feat?.fiscal_lens ?? true,
          caseOps: feat?.case_ops ?? true,
          complianceRunbook: feat?.compliance_runbook ?? true,
          aiAdvisor: feat?.ai_advisor ?? false,
          documentVault: feat?.document_vault ?? false,
          paymentProcessing: feat?.payment_processing ?? false,
          votesResolutions: feat?.votes_resolutions ?? false,
          communityPortal: feat?.community_portal ?? false,
          vendorManagement: feat?.vendor_management ?? false,
          reserveStudyTools: feat?.reserve_study_tools ?? false,
        },
        subscription: {
          tier: sub?.tier || 'essentials',
          status: sub?.status || 'trialing',
          monthlyRate: (sub?.monthly_rate || 4900) / 100,
          trialEndsAt: sub?.trial_ends_at || null,
        },
        onboarding: {
          accountCreated: onb?.account_created ?? false,
          buildingProfileComplete: onb?.building_profile_complete ?? false,
          unitsConfigured: onb?.units_configured ?? false,
          firstUserInvited: onb?.first_user_invited ?? false,
          bylawsUploaded: onb?.bylaws_uploaded ?? false,
          financialSetupDone: onb?.financial_setup_done ?? false,
          goLive: onb?.go_live ?? false,
        },
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load tenant');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTenant(); }, [loadTenant]);

  // Helper: check if a specific feature is enabled
  const hasFeature = (feature: keyof TenantContext['features']): boolean => {
    if (!tenant) return false;
    return tenant.features[feature];
  };

  return { tenant, loading, error, hasFeature, reload: loadTenant };
}

