import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { supabase, isBackendEnabled, setActiveTenantId } from '@/lib/supabase';
import type { Role } from '@/types/auth';
import { TIERS, ADDONS, DEFAULT_TRIAL_DAYS, getAddOnPrice } from '@/lib/tiers';
import type { SubscriptionTier, BillingInterval, AddOnId } from '@/lib/tiers';
import { tenantLoginUrl } from '@/lib/tenantHost';
import {
  addressLine, chooseTenant, fetchMemberships, isSameBuilding, needsBuildingChoice, pickMembership, subscriptionLabel,
  type TenantMembership,
} from '@/lib/tenantMembership';

type SessionUser = { id: string; email?: string | null; user_metadata?: { full_name?: string } };

// The signup form, kept while its owner leaves to open an emailed sign-in link
const SIGNUP_DRAFT_KEY = 'onetwo_signup_draft';
const SIGNUP_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Buildings the account had before checkout began, kept across the Chargebee redirect
const KNOWN_TENANTS_KEY = 'onetwo_checkout_known_tenants';
import { loadOpenAIPixel, readAdClickRef, setOpenAIPixelUser } from '@/lib/openaiPixel';
import { loadRedditPixel, trackBuildingCreated } from '@/lib/adConversions';
import { readAttribution } from '@/lib/attribution';

const Logo = () => (
  <div className="text-center mb-8">
    <div className="flex items-center justify-center gap-4 mb-2">
      <img src="/onetwo-wordmark-dark.jpg" alt="ONE two" className="h-20 object-contain rounded-lg" />
      <img src="/onetwo-icon-1t.jpg" alt="ONE two icon" className="h-20 object-contain rounded-lg" />
    </div>
    <p className="text-sm text-ink-400 mt-1">HOA compliance made simple</p>
  </div>
);

// TIERS, SubscriptionTier, and BillingInterval imported from @/lib/tiers

export default function AuthPage() {
  const { authStep, setAuthStep, setAuthJoinRole, authJoinRole, login, skipToDemo, buildingMembers, buildingInvites, addMember } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteMatch, setInviteMatch] = useState<typeof buildingInvites[0] | null>(null);
  // Demo lead form
  const [demoFirstName, setDemoFirstName] = useState('');
  const [demoLastName, setDemoLastName] = useState('');
  const [demoEmail, setDemoEmail] = useState('');
  const [demoCondoName, setDemoCondoName] = useState('');
  const [demoUnitCount, setDemoUnitCount] = useState('');
  const [demoMemberType, setDemoMemberType] = useState('board_member');
  const [demoSubscriptionInterest, setDemoSubscriptionInterest] = useState<SubscriptionTier>('self_managed');
  const [demoSubmitting, setDemoSubmitting] = useState(false);

  const handleDemoLeadSubmit = async () => {
    if (!demoFirstName.trim() || !demoLastName.trim()) { alert('Please enter your name.'); return; }
    if (!demoEmail.trim()) { alert('Please enter your email.'); return; }
    if (!demoCondoName.trim()) { alert('Please enter your condo / community name.'); return; }

    setDemoSubmitting(true);
    try {
      if (isBackendEnabled && supabase) {
        await supabase.rpc('submit_demo_lead', {
          p_name: `${demoFirstName.trim()} ${demoLastName.trim()}`,
          p_email: demoEmail.trim(),
          p_condo_name: demoCondoName.trim(),
          p_unit_count: demoUnitCount ? parseInt(demoUnitCount) : null,
          p_member_type: demoMemberType,
          p_subscription_interest: demoSubscriptionInterest,
        });

        // Fire-and-forget: notify the internal signup inbox
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
          body: JSON.stringify({
            type: 'demo',
            name: `${demoFirstName.trim()} ${demoLastName.trim()}`,
            email: demoEmail.trim(),
            condo_name: demoCondoName.trim(),
            unit_count: demoUnitCount ? parseInt(demoUnitCount) : null,
            member_type: demoMemberType,
            subscription_interest: demoSubscriptionInterest,
          }),
        }).catch(() => { /* non-critical */ });
      }
    } catch (err) {
      console.warn('Demo lead submission failed (non-blocking):', err);
    }
    setDemoSubmitting(false);
    skipToDemo();
  };

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>('self_managed');
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');
  const [selectedAddOns, setSelectedAddOns] = useState<Set<AddOnId>>(new Set());

  const toggleAddOn = (id: AddOnId) => {
    setSelectedAddOns(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const [trialDays, setTrialDays] = useState(DEFAULT_TRIAL_DAYS);
  // The trial can be turned off in the Admin Console (0 days): billing then starts at signup.
  const hasTrial = trialDays > 0;

  useEffect(() => {
    if (!supabase) return;
    supabase.rpc('get_trial_days').then(({ data }) => {
      if (typeof data === 'number' && data >= 0) setTrialDays(data);
    });
  }, []);

  // Profile form
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileUnit, setProfileUnit] = useState('');
  const [boardTitle, setBoardTitle] = useState('President');

  const [confirmPassword, setConfirmPassword] = useState('');

  // Building form
  const [bldgName, setBldgName] = useState('');
  const [bldgSubdomain, setBldgSubdomain] = useState('');
  const [subdomainStatus, setSubdomainStatus] = useState<'idle'|'checking'|'available'|'taken'>('idle');
  const [bldgStreet, setBldgStreet] = useState('');
  const [bldgCity, setBldgCity] = useState('');
  const [bldgState, setBldgState] = useState('');
  const [bldgZip, setBldgZip] = useState('');
  const [bldgUnits, setBldgUnits] = useState('');

  // Auto-suggest subdomain from building name
  const sanitizeSubdomain = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  const subdomainManuallyEdited = useRef(false);

  useEffect(() => {
    // Only auto-suggest if user hasn't manually edited the subdomain
    if (!subdomainManuallyEdited.current) {
      const suggested = sanitizeSubdomain(
        bldgName.replace(/\b(condominium|condos?|hoa|association|residences|towers|gardens|estates|the|of)\b/gi, '')
      );
      setBldgSubdomain(suggested);
    }
  }, [bldgName]);

  // Check subdomain uniqueness with debounce
  useEffect(() => {
    if (!bldgSubdomain || bldgSubdomain.length < 3 || !isBackendEnabled || !supabase) {
      setSubdomainStatus('idle');
      return;
    }
    setSubdomainStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase!
          .from('tenants')
          .select('id')
          .eq('subdomain', bldgSubdomain)
          .maybeSingle();
        setSubdomainStatus(data ? 'taken' : 'available');
      } catch {
        setSubdomainStatus('idle');
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [bldgSubdomain]);

  const [provisioningStatus, setProvisioningStatus] = useState<string | null>(null);
  // "Which building?" — set when a signed-in account has several and none is implied by the host
  const [buildingChoices, setBuildingChoices] = useState<{ user: SessionUser; rows: TenantMembership[] } | null>(null);
  const [rememberBuilding, setRememberBuilding] = useState(false);
  // Set while an already signed-in person is setting up another building: no email or password to enter
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  // Signing up with an email that already has an account: the account step
  // becomes a one-field sign-in instead of "choose a password". `error` is
  // shown when the password entered there is wrong.
  const [existingAccount, setExistingAccount] = useState<{ email: string; error: boolean } | null>(null);
  // The emailed sign-in link, for someone who can't or won't use the password
  const [emailLink, setEmailLink] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [provisioningTimedOut, setProvisioningTimedOut] = useState(false);

  // Chargebee Drop-in initialization
  const cbInstanceRef = useRef<any>(null);

  const ensureChargebee = () => {
    if (cbInstanceRef.current) return cbInstanceRef.current;
    const cbSite = import.meta.env.VITE_CB_SITE || import.meta.env.VITE_CHARGEBEE_SITE;
    if (!cbSite || !(window as any).Chargebee) return null;
    try {
      cbInstanceRef.current = (window as any).Chargebee.init({ site: cbSite });
    } catch (e) {
      console.warn('Chargebee init failed:', e);
    }
    return cbInstanceRef.current;
  };

  useEffect(() => {
    if (!isBackendEnabled) return;
    if ((window as any).Chargebee) { ensureChargebee(); }
    else {
      const timer = setInterval(() => {
        if ((window as any).Chargebee) { clearInterval(timer); ensureChargebee(); }
      }, 200);
      setTimeout(() => clearInterval(timer), 5000);
    }
  }, []);

  // Helper: look up tenant_users and log the user in + redirect to subdomain
  // Extracted to component level so both session-check and handleCheckout can use it
  const loginWithTenantUser = async (
    user: { id: string; email?: string | null; user_metadata?: { full_name?: string } },
    tu: { tenant_id: string; role: string; board_title: string | null; unit: string | null },
  ) => {
    const { data: tenant } = await supabase!
      .from('tenants')
      .select('name, subdomain')
      .eq('id', tu.tenant_id)
      .maybeSingle();

    // This is now the building this browser is in
    chooseTenant(tu.tenant_id);
    setActiveTenantId(tu.tenant_id);

    const roleMap: Record<string, Role> = { board_member: 'BOARD_MEMBER', resident: 'RESIDENT', staff: 'STAFF', property_manager: 'PROPERTY_MANAGER' };
    const m = {
      id: user.id,
      name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
      email: user.email || '',
      phone: '',
      role: roleMap[tu.role] || ('BOARD_MEMBER' as Role),
      unit: tu.unit || '',
      status: 'active' as const,
      joined: new Date().toISOString().split('T')[0],
      boardTitle: tu.board_title || null,
    };
    addMember(m);
    login(m);

    // Hop to the building's own host in production; stay put on staging,
    // previews and localhost, whose sessions belong to their own project.
    const { data: sessionData } = await supabase!.auth.getSession();
    const target = tenantLoginUrl(tenant?.subdomain, {
      accessToken: sessionData?.session?.access_token || '',
      refreshToken: sessionData?.session?.refresh_token || '',
    });
    if (target) {
      window.location.href = target;
      return true; // redirecting
    }
    // Added a building while already signed in on this host: reload so the
    // app starts clean in the new building instead of staying on signup.
    if (new URLSearchParams(window.location.search).get('create') === '1') {
      window.location.assign('/home');
      return true;
    }
    return false;
  };

  // Enter the account's building, or ask which one when it has several.
  // Returns false when the account has no building at all.
  const enterBuilding = async (user: SessionUser): Promise<boolean> => {
    const rows = await fetchMemberships(supabase!, user.id);
    if (!rows || rows.length === 0) return false;
    if (needsBuildingChoice(rows)) {
      setBuildingChoices({ user, rows });
      return true;
    }
    await loginWithTenantUser(user, pickMembership(rows)!);
    return true;
  };

  const pickBuilding = async (m: TenantMembership) => {
    if (!buildingChoices) return;
    chooseTenant(m.tenant_id, rememberBuilding);
    setLoginLoading(true);
    const redirecting = await loginWithTenantUser(buildingChoices.user, m);
    if (!redirecting) setBuildingChoices(null);
    setLoginLoading(false);
  };

  // A signed-in person setting up another building: skip straight to the
  // plan step with their details filled in.
  const startAddBuilding = (user: SessionUser) => {
    const [first = '', ...rest] = (user.user_metadata?.full_name || '').trim().split(/\s+/);
    setSignedInAs(user.email || '');
    setProfileEmail(user.email || '');
    if (first) setFirstName(first);
    if (rest.length) setLastName(rest.join(' '));
    setBuildingChoices(null);
    setExistingAccount(null);
    // Back from an emailed sign-in link: pick the signup up where it stopped.
    // The draft is consumed on first use, so a second call (the session check
    // can run twice) must not send them back to the plan step.
    if (restoreSignupDraft(user.email || '')) {
      draftRestored.current = true;
      setAuthStep('signup-account');
    } else if (!draftRestored.current) {
      setAuthStep('signup-plan');
    }
  };
  const draftRestored = useRef(false);

  const saveSignupDraft = (forEmail: string) => {
    try {
      localStorage.setItem(SIGNUP_DRAFT_KEY, JSON.stringify({
        savedAt: Date.now(), email: forEmail.trim().toLowerCase(),
        selectedTier, billingInterval, addOns: [...selectedAddOns],
        bldgName, bldgSubdomain, bldgStreet, bldgCity, bldgState, bldgZip, bldgUnits,
        firstName, lastName, profilePhone, profileUnit, boardTitle,
      }));
    } catch { /* storage unavailable: they re-enter the form after the link */ }
  };

  /** Refill the form from a saved draft for this email. Returns whether one was restored. */
  const restoreSignupDraft = (forEmail: string): boolean => {
    try {
      const raw = localStorage.getItem(SIGNUP_DRAFT_KEY);
      if (!raw) return false;
      localStorage.removeItem(SIGNUP_DRAFT_KEY);
      const d = JSON.parse(raw);
      if (!d || d.email !== forEmail.trim().toLowerCase()) return false;
      if (typeof d.savedAt !== 'number' || Date.now() - d.savedAt > SIGNUP_DRAFT_MAX_AGE_MS) return false;
      if (d.selectedTier === 'self_managed' || d.selectedTier === 'facilities') setSelectedTier(d.selectedTier);
      if (d.billingInterval === 'monthly' || d.billingInterval === 'annual') setBillingInterval(d.billingInterval);
      if (Array.isArray(d.addOns)) setSelectedAddOns(new Set(d.addOns as AddOnId[]));
      const str = (v: unknown) => (typeof v === 'string' ? v : '');
      setBldgName(str(d.bldgName));
      subdomainManuallyEdited.current = true; // keep the short name they chose
      setBldgSubdomain(str(d.bldgSubdomain));
      setBldgStreet(str(d.bldgStreet)); setBldgCity(str(d.bldgCity)); setBldgState(str(d.bldgState));
      setBldgZip(str(d.bldgZip)); setBldgUnits(str(d.bldgUnits));
      if (str(d.firstName)) setFirstName(str(d.firstName));
      if (str(d.lastName)) setLastName(str(d.lastName));
      setProfilePhone(str(d.profilePhone)); setProfileUnit(str(d.profileUnit));
      if (str(d.boardTitle)) setBoardTitle(str(d.boardTitle));
      return !!str(d.bldgName);
    } catch { return false; }
  };

  // Prove ownership of an existing account by email instead of by password.
  // The link signs them in and returns here, where the saved form is restored.
  const sendSignInLink = async () => {
    const target = (profileEmail || email).trim();
    if (!supabase || !target) return;
    setEmailLink('sending');
    saveSignupDraft(target);
    const { error } = await supabase.auth.signInWithOtp({
      email: target,
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/login?create=1` },
    });
    setEmailLink(error ? 'failed' : 'sent');
  };

  // Poll for tenant provisioning after checkout success
  // `knownTenantIds` are buildings the user already had before this checkout:
  // someone adding another building must wait for the new one, not land in an old one.
  const pollForTenantAndRedirect = async (userId: string, user: any, knownTenantIds: string[] = []) => {
    setProvisioningStatus('Setting up your building...');
    for (let attempt = 0; attempt < 15; attempt++) {
      const rows = await fetchMemberships(supabase!, userId);
      const tu = rows?.find(r => !knownTenantIds.includes(r.tenant_id));
      if (tu) {
        try { sessionStorage.removeItem(KNOWN_TENANTS_KEY); } catch { /* ignore */ }
        setProvisioningStatus('Redirecting to your building...');
        await loginWithTenantUser(user, tu);
        setProvisioningStatus(null);
        return true;
      }
      await new Promise(r => setTimeout(r, 1200));
    }
    setProvisioningStatus(null);
    setProvisioningTimedOut(true);
    return false;
  };

  // OpenAI and Reddit Ads pixels: load only once the visitor is in the signup steps, so
  // nobody signing in or using the app is tracked.
  const inSignupSteps = authStep === 'signup-plan' || authStep === 'signup-building' || authStep === 'signup-account';
  useEffect(() => {
    if (inSignupSteps) { loadOpenAIPixel(); loadRedditPixel(); }
  }, [inSignupSteps]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // ?demo=1 → show lead capture form before entering demo
    if (params.get('demo') === '1') {
      setAuthStep('demo-lead');
      setSessionChecking(false);
      return;
    }

    // Read plan/interval from marketing page CTAs
    const urlPlan = params.get('plan');
    const urlInterval = params.get('interval');
    if (urlPlan === 'self_managed' || urlPlan === 'facilities') setSelectedTier(urlPlan);
    if (urlInterval === 'annual') setBillingInterval('annual');

    // Direct /login visit (e.g. "Log In" button) — go straight to login form
    // /login?create=1 (e.g. "Get Started" button) — jump to signup-plan
    if (params.get('create') === '1') {
      setAuthStep('signup-plan');
    } else if (authStep === 'welcome') {
      setAuthStep('login');
    }
    const isProvisioned = params.get('provisioned') === '1';
    if (isProvisioned) {
      setAuthStep('login');
    }
    // Auto-fill invite code from email link
    const urlInvite = params.get('invite');
    if (urlInvite) {
      setInviteCode(urlInvite.toUpperCase());
      setAuthStep('join-invite');
    }

    // Unified session check — always await getSession() first to avoid
    // NavigatorLockManager conflicts with Supabase's internal session recovery.
    const sbAccess = params.get('sb_access');
    const sbRefresh = params.get('sb_refresh');
    const hasUrlTokens = !!(sbAccess && sbRefresh);
    const tokenHash = params.get('token_hash');

    if (isBackendEnabled && supabase && !urlInvite) {
      // Timeout so the login form is never stuck on loading
      const timeoutMs = isProvisioned ? 20000 : (hasUrlTokens || tokenHash) ? 12000 : 3000;
      const timeout = setTimeout(() => {
        setSessionChecking(false);
        setLoginLoading(false);
        setProvisioningStatus(null);
      }, timeoutMs);
      (async () => {
        try {
          setLoginLoading(true);

          // Always wait for internal session lock to resolve first
          await supabase!.auth.getSession();

          // If URL tokens are present (subdomain handoff), restore that session
          let user = (await supabase!.auth.getSession()).data.session?.user ?? null;

          // Handle token_hash from admin console (platform admin handoff)
          if (tokenHash && !user) {
            const { data, error } = await supabase!.auth.verifyOtp({
              token_hash: tokenHash,
              type: 'magiclink',
            });
            if (!error && data.user) {
              user = data.user;
              window.history.replaceState({}, '', '/login');
            }
          }

          if (hasUrlTokens && !user) {
            const { data, error } = await supabase!.auth.setSession({
              access_token: sbAccess!,
              refresh_token: sbRefresh!,
            });
            if (!error && data.user) {
              user = data.user;
              window.history.replaceState({}, '', '/login');
            }
          }

          // Restore session from pre-checkout save if session was lost during Stripe redirect
          if (!user && isProvisioned) {
            try {
              const saved = sessionStorage.getItem('onetwo_checkout_tokens');
              if (saved) {
                const { access_token, refresh_token } = JSON.parse(saved);
                const { data, error } = await supabase!.auth.setSession({ access_token, refresh_token });
                if (!error && data.user) {
                  user = data.user;
                }
                sessionStorage.removeItem('onetwo_checkout_tokens');
              }
            } catch { /* ignore parse errors */ }
          }

          if (user) {
            // If returning from checkout, poll for tenant_users row
            // (Stripe webhook may not have fired yet)
            if (isProvisioned) {
              setProvisioningStatus('Setting up your building...');
              window.history.replaceState({}, '', '/login');
              const maxAttempts = 15;
              // Buildings the user had before this checkout (saved by handleCheckout)
              let knownTenantIds: string[] = [];
              try {
                const savedKnown = JSON.parse(sessionStorage.getItem(KNOWN_TENANTS_KEY) || '[]');
                if (Array.isArray(savedKnown)) knownTenantIds = savedKnown;
              } catch { /* ignore parse errors */ }
              for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const rows = await fetchMemberships(supabase!, user.id);
                const tu = rows?.find(r => !knownTenantIds.includes(r.tenant_id));

                if (tu) {
                  setProvisioningStatus('Redirecting to your building...');
                  sessionStorage.removeItem('onetwo_checkout_tokens');
                  sessionStorage.removeItem(KNOWN_TENANTS_KEY);
                  await loginWithTenantUser(user, tu);
                  clearTimeout(timeout);
                  setSessionChecking(false);
                  setLoginLoading(false);
                  setProvisioningStatus(null);
                  return;
                }

                // Wait before next attempt
                await new Promise(r => setTimeout(r, 1200));
              }
              // Timed out waiting for webhook — show error with retry guidance
              setProvisioningStatus(null);
              setProvisioningTimedOut(true);
              setLoginLoading(false);
              clearTimeout(timeout);
              setSessionChecking(false);
              return;
            }

            // Signed in and here to set up another building (?create=1):
            // go to signup instead of into the building they already have.
            if (params.get('create') === '1') {
              startAddBuilding(user);
              setLoginLoading(false);
              clearTimeout(timeout);
              setSessionChecking(false);
              return;
            }

            if (await enterBuilding(user)) {
              setLoginLoading(false);
              clearTimeout(timeout);
              setSessionChecking(false);
              return;
            }

            // Check if user is a platform admin
            const { data: admin } = await supabase!
              .from('platform_admins')
              .select('name, role')
              .eq('user_id', user.id)
              .maybeSingle();

            if (admin) {
              const m = {
                id: user.id,
                name: admin.name || user.email?.split('@')[0] || 'Admin',
                email: user.email || '',
                phone: '',
                role: 'PLATFORM_ADMIN' as Role,
                unit: '',
                status: 'active' as const,
                joined: new Date().toISOString().split('T')[0],
                boardTitle: null,
              };
              addMember(m);
              login(m);
              // On tenant subdomains (via token_hash), switch to board member
              // view so admin sees all tenant features with role toggle
              if (tokenHash) {
                useAuthStore.getState().switchRole('BOARD_MEMBER');
              }
              setLoginLoading(false);
              clearTimeout(timeout);
              setSessionChecking(false);
              return;
            }

            setLoginLoading(false);
          }
        } catch (err) {
          console.warn('Session check failed:', err);
        }
        clearTimeout(timeout);
        setSessionChecking(false);
        setProvisioningStatus(null);
        setLoginLoading(false);
      })();
    } else {
      setSessionChecking(false);
    }
  }, []);

  const [loginLoading, setLoginLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) { alert('Please enter email and password.'); return; }

    // Try Supabase Auth first if backend is enabled
    if (isBackendEnabled && supabase) {
      setLoginLoading(true);
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.toLowerCase(),
          password,
        });

        if (error) {
          alert('Incorrect email or password.');
          setLoginLoading(false);
          return;
        }

        if (data.user) {
          // Check if user is a platform admin
          const { data: admin } = await supabase!
            .from('platform_admins')
            .select('name, role')
            .eq('user_id', data.user.id)
            .maybeSingle();

          if (admin) {
            const member = buildingMembers.find(
              (m) => m.email.toLowerCase() === email.toLowerCase()
            );
            if (member) {
              login(member);
            } else {
              const adminMember = {
                id: data.user.id, name: admin.name, email: data.user.email || email,
                phone: '', role: 'PLATFORM_ADMIN' as Role, unit: '', status: 'active' as const,
                joined: new Date().toISOString().split('T')[0], boardTitle: null,
              };
              addMember(adminMember);
              login(adminMember);
            }
            setLoginLoading(false);
            return;
          }

          // Check if user belongs to a tenant
          if (await enterBuilding(data.user)) {
            setLoginLoading(false);
            return;
          }

          // User exists but not linked to tenant or admin
          alert('Your account is not linked to a building yet. Contact your building administrator.');
          setLoginLoading(false);
          return;
        }
      } catch (err) {
        console.warn('Supabase login attempt failed, trying demo:', err);
      }
      setLoginLoading(false);
    }

    // Fall back to demo store (only when demo mode is enabled)
    const isDemoEnabled = import.meta.env.VITE_DEMO_ENABLED === 'true';
    if (!isDemoEnabled) {
      alert('No account found with that email.');
      return;
    }
    const member = buildingMembers.find(
      (m) => m.email.toLowerCase() === email.toLowerCase() && m.status === 'active'
    );
    if (!member) { alert('No account found with that email.'); return; }
    login(member);
  };

  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteData, setInviteData] = useState<any>(null);

  const handleInviteCode = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code) { alert('Please enter your invitation code.'); return; }

    // Try Supabase validation first
    if (isBackendEnabled && supabase) {
      setInviteLoading(true);
      try {
        const { data, error } = await supabase.rpc('validate_invite_code', { p_code: code });
        if (!error && data?.valid) {
          setInviteData(data);
          setAuthJoinRole(data.role === 'board_member' ? 'BOARD_MEMBER' : data.role === 'property_manager' ? 'PROPERTY_MANAGER' : data.role === 'staff' ? 'STAFF' : 'RESIDENT');
          setProfileEmail(data.email || '');
          setProfileUnit(data.unit || '');
          setInviteLoading(false);
          setAuthStep('join-create');
          return;
        } else if (data?.error) {
          alert(data.error);
          setInviteLoading(false);
          return;
        }
      } catch (err) {
        console.warn('Supabase invite check failed, trying demo:', err);
      }
      setInviteLoading(false);
    }

    // Demo fallback
    const inv = buildingInvites.find(i => i.code === code && i.status === 'pending');
    if (!inv) { alert('Invalid or expired invitation code.'); return; }
    setInviteMatch(inv);
    setAuthJoinRole(inv.role);
    setProfileEmail(inv.email);
    setProfileUnit(inv.unit || '');
    setAuthStep('join-create');
  };

  const handleCompleteJoin = async () => {
    if (!firstName || !lastName) { alert('Please enter your name.'); return; }
    if (!password || password.length < 6) { alert('Please enter a password (at least 6 characters).'); return; }
    if (password !== confirmPassword) { alert('Passwords do not match.'); return; }
    const name = `${firstName.trim()} ${lastName.trim()}`;
    const finalEmail = profileEmail || email;

    // If we have Supabase invite data, create auth user and accept invitation
    if (inviteData?.valid && isBackendEnabled && supabase) {
      setSending(true);
      try {
        // Sign up user
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: finalEmail,
          password: password,
          options: { data: { full_name: name } },
        });

        if (authError) {
          // Try sign in if already registered
          if (authError.message.includes('already registered')) {
            const { data: signIn } = await supabase.auth.signInWithPassword({ email: finalEmail, password });
            if (!signIn?.user) { alert('Account exists. Please sign in.'); setSending(false); return; }
          } else {
            alert(authError.message); setSending(false); return;
          }
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { alert('Authentication failed'); setSending(false); return; }

        // Accept the invitation via RPC
        const { data: acceptResult, error: acceptErr } = await supabase.rpc('accept_invitation', {
          p_code: inviteCode.trim().toUpperCase(),
          p_user_id: user.id,
          p_name: name,
        });

        if (acceptErr || !acceptResult?.success) {
          alert(acceptResult?.error || acceptErr?.message || 'Failed to accept invitation');
          setSending(false);
          return;
        }

        // Log in and redirect to tenant subdomain
        const member = {
          id: user.id, name, email: finalEmail, phone: profilePhone,
          role: (inviteData.role === 'board_member' ? 'BOARD_MEMBER' : inviteData.role === 'property_manager' ? 'PROPERTY_MANAGER' : inviteData.role === 'staff' ? 'STAFF' : 'RESIDENT') as Role,
          unit: inviteData.unit || profileUnit, status: 'active' as const,
          joined: new Date().toISOString().split('T')[0], boardTitle: null,
        };
        addMember(member);
        login(member);

        // Hop to the building's own host in production; stay put elsewhere
        if (inviteData.subdomain) {
          const { data: sessionData } = await supabase.auth.getSession();
          const target = tenantLoginUrl(inviteData.subdomain, {
            accessToken: sessionData?.session?.access_token || '',
            refreshToken: sessionData?.session?.refresh_token || '',
          });
          if (target) window.location.href = target;
        }

        setSending(false);
        return;
      } catch (err: any) {
        alert(err.message || 'Failed to join');
        setSending(false);
        return;
      }
    }

    // Demo fallback
    const newMember = {
      id: `user-${Date.now()}`, name, email: finalEmail, phone: profilePhone,
      role: (inviteMatch?.role || authJoinRole) as Role,
      unit: inviteMatch?.unit || profileUnit, status: 'active' as const,
      joined: new Date().toISOString().split('T')[0], boardTitle: authJoinRole === 'BOARD_MEMBER' ? boardTitle : null,
    };
    addMember(newMember);
    login(newMember);
  };

  // Chargebee Checkout — creates a checkout session and redirects
  const handleCheckout = async () => {
    if (!isBackendEnabled || !supabase) {
      // Demo mode fallback — skip payment
      handleCompleteOnboarding();
      return;
    }

    setCheckoutLoading(true);
    try {
      // Validate required fields before creating auth user
      const signupEmail = profileEmail || email;
      if (!signupEmail) { alert('Please enter your email first.'); setCheckoutLoading(false); return; }
      // Already signed in as this person (setting up another building): no
      // password to check and no account to create.
      const { data: { session: openSession } } = await supabase.auth.getSession();
      const alreadySignedIn = !!signedInAs
        && openSession?.user?.email?.toLowerCase() === signupEmail.toLowerCase();

      // The email is already known to have an account: sign in, don't sign up
      const knownAccount = !alreadySignedIn && existingAccount?.email === signupEmail.trim().toLowerCase();

      if (!alreadySignedIn && !knownAccount && (!password || password.length < 6)) { alert('Please enter a password (at least 6 characters).'); setCheckoutLoading(false); return; }
      if (!firstName || !lastName) { alert('Please enter your name.'); setCheckoutLoading(false); return; }

      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

      // Try to sign up — if the email already has an account, sign in instead
      const { error: authError } = alreadySignedIn ? { error: null }
        : knownAccount ? { error: { message: 'already registered' } }
        : await supabase.auth.signUp({
          email: signupEmail,
          password: password,
          options: { data: { full_name: fullName } },
        });

      if (authError) {
        if (authError.message.includes('already registered')) {
          // The building is added to the existing account, which needs that
          // account's password. Whatever was typed as a "new" password is
          // tried first (it works for someone retrying an abandoned signup);
          // otherwise ask for the real one, once, in place of the two fields.
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: signupEmail,
            password: password,
          });
          if (signInError) {
            setExistingAccount({ email: signupEmail.trim().toLowerCase(), error: knownAccount });
            setPassword('');
            setConfirmPassword('');
            setCheckoutLoading(false);
            return;
          }
          setExistingAccount(null);
        } else {
          alert(authError.message); setCheckoutLoading(false); return;
        }
      }

      // Get the session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { alert('Authentication failed. Please try again.'); setCheckoutLoading(false); return; }

      // An existing account may add another building. Only stop when this is
      // a building the account already has (same address, or same name when no
      // address is on file) — that is a repeat of a finished checkout.
      const memberships = await fetchMemberships(supabase, session.user.id);
      if (memberships === null) {
        alert('We could not check your account. Please try again.');
        setCheckoutLoading(false);
        return;
      }
      const newBuilding = {
        name: bldgName,
        address: { street: bldgStreet, city: bldgCity, state: bldgState, zip: bldgZip },
      };
      const alreadyHas = memberships.some(m =>
        !!m.tenant && isSameBuilding(newBuilding, { name: m.tenant.name, address: m.tenant.address }));
      if (alreadyHas) {
        alert('Your account is already set up. Redirecting to login...');
        setAuthStep('login');
        setCheckoutLoading(false);
        return;
      }
      const knownTenantIds = memberships.map(m => m.tenant_id);

      // Open Chargebee Drop-in checkout modal (lazy-init if needed)
      if (!ensureChargebee()) {
        alert('Payment system is still loading. Please try again in a moment.');
        setCheckoutLoading(false);
        return;
      }

      const currentSession = session;

      // Save session tokens so we can restore them if Chargebee redirects away
      try {
        sessionStorage.setItem('onetwo_checkout_tokens', JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }));
        sessionStorage.setItem(KNOWN_TENANTS_KEY, JSON.stringify(knownTenantIds));
      } catch { /* sessionStorage may be unavailable */ }

      console.log('[checkout] Opening Chargebee Drop-in...');

      // Track hostedPage errors separately since Chargebee swallows them
      let hostedPageError: string | null = null;

      // One id shared by the browser pixel and the server-side conversion
      // report, so OpenAI Ads counts this signup once.
      const conversionEventId = `signup_${
        typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`
      }`;

      cbInstanceRef.current.openCheckout({
        hostedPage: async () => {
          try {
            console.log('[checkout] Fetching hosted page from edge function...');
            const res = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chargebee-checkout`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${currentSession.access_token}`,
                  'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({
                  plan: selectedTier,
                  interval: billingInterval,
                  onCall: selectedAddOns.has('on_call'),
                  pmSeat: selectedAddOns.has('pm_seat'),
                  building: {
                    name: bldgName,
                    subdomain: bldgSubdomain,
                    address: { street: bldgStreet, city: bldgCity, state: bldgState, zip: bldgZip },
                    totalUnits: parseInt(bldgUnits) || 0,
                    contactName: `${firstName} ${lastName}`.trim(),
                    boardTitle,
                    firstName: firstName.trim(),
                    lastName: lastName.trim(),
                  },
                  origin: window.location.origin,
                  conversionEventId,
                  // Global Privacy Control: skip the server-side OpenAI Ads report too
                  adMeasurementOptOut:
                    (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true,
                  // ChatGPT ad click reference, for the server-side conversion report
                  adClickRef: readAdClickRef(),
                  // Which ad sent this visitor (UTM tags), saved on the building
                  attribution: readAttribution(),
                }),
              }
            );
            const data = await res.json();
            console.log('[checkout] Edge function response:', JSON.stringify(data).slice(0, 500));
            if (data.error) {
              hostedPageError = data.error;
              throw new Error(data.error);
            }
            if (!data.hosted_page) {
              hostedPageError = 'No hosted_page in response: ' + JSON.stringify(data).slice(0, 200);
              throw new Error(hostedPageError);
            }
            console.log('[checkout] hosted_page id:', data.hosted_page.id, 'embed:', data.hosted_page.embed);
            return data.hosted_page;
          } catch (e: any) {
            hostedPageError = hostedPageError || e.message || String(e);
            console.error('[checkout] hostedPage callback error:', hostedPageError);
            throw e;
          }
        },
        success: async (_hostedPageId: string) => {
          console.log('[checkout] Checkout success, polling for tenant...');
          // OpenAI Ads conversion: paid trial signup completed. Attach the
          // hashed email and user ID first so OpenAI can match it to the ad.
          await setOpenAIPixelUser({ email: signupEmail, userId: currentSession?.user?.id });
          window.oaiq?.('measure', 'trial_started', { type: 'plan_enrollment' }, { event_id: conversionEventId });
          // Google Ads and Reddit Ads conversion for the same signup
          trackBuildingCreated({ eventId: conversionEventId, plan: selectedTier, interval: billingInterval });
          let user = (await supabase!.auth.getUser()).data?.user;
          // Fall back to the session we saved if getUser fails
          if (!user && currentSession?.user) {
            console.log('[checkout] getUser failed, using saved session user');
            user = currentSession.user;
          }
          if (user) {
            await pollForTenantAndRedirect(user.id, user, knownTenantIds);
          } else {
            console.error('[checkout] No user available after checkout success');
            // Redirect to provisioned page so session-check can retry
            window.location.href = '/login?provisioned=1';
          }
          setCheckoutLoading(false);
        },
        close: () => {
          console.log('[checkout] Checkout modal closed');
          setCheckoutLoading(false);
        },
        error: (error: any) => {
          const detail = hostedPageError || error?.message || JSON.stringify(error);
          console.error('[checkout] Chargebee error:', detail, error);
          alert('Checkout failed: ' + detail);
          setCheckoutLoading(false);
        },
      });
    } catch (err: any) {
      alert(err.message || 'Checkout failed');
      setCheckoutLoading(false);
    }
  };

  // Non-Stripe onboarding completion (demo mode)
  const handleCompleteOnboarding = () => {
    if (!firstName || !lastName) { alert('Please enter your name.'); return; }
    const name = `${firstName.trim()} ${lastName.trim()}`;
    const newMember = {
      id: `user-${Date.now()}`, name, email: profileEmail, phone: profilePhone,
      role: 'BOARD_MEMBER' as Role, unit: profileUnit, status: 'active' as const,
      joined: new Date().toISOString().split('T')[0], boardTitle,
    };
    addMember(newMember);
    login(newMember);
  };

  // ── Loading state ──
  if (sessionChecking) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gradient-to-br from-mist-100 via-white to-sage-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-ink-300 border-t-ink-900 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-ink-400">{provisioningStatus || 'Checking session...'}</p>
        </div>
      </div>
    );
  }

  // ── Signup steps: production-style layout ──
  const isSignupStep = authStep === 'signup-plan' || authStep === 'signup-building' || authStep === 'signup-account';

  if (isSignupStep) {
    const currentStepIndex = authStep === 'signup-plan' ? 0 : authStep === 'signup-building' ? 1 : 2;
    const stepLabels = ['Your plan', 'Your building', 'Your account'];
    const currentTier = TIERS.find(t => t.id === selectedTier);
    const tierMonthly = billingInterval === 'annual' ? Math.round((currentTier?.annual ?? 0) / 12) : (currentTier?.monthly ?? 0);
    const tierAnnual = currentTier?.annual ?? 0;
    const addOnMonthly = ADDONS.filter(a => selectedAddOns.has(a.id))
      .reduce((sum, a) => sum + (billingInterval === 'annual' ? Math.round(getAddOnPrice(a, selectedTier, 'annual') / 12) : getAddOnPrice(a, selectedTier, billingInterval)), 0);
    const addOnAnnual = ADDONS.filter(a => selectedAddOns.has(a.id))
      .reduce((sum, a) => sum + getAddOnPrice(a, selectedTier, 'annual'), 0);
    const totalMonthly = tierMonthly + addOnMonthly;
    const totalAnnual = tierAnnual + addOnAnnual;
    // With no trial, the first period is charged at signup.
    const dueToday = `$${billingInterval === 'annual' ? totalAnnual.toLocaleString() : totalMonthly}`;

    return (
      <div className="fixed inset-0 z-[100] bg-bg-page overflow-y-auto">
        {/* ── Top nav bar ── */}
        <header className="sticky top-0 z-50 bg-navy">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between" style={{ minHeight: 72 }}>
            <a href="https://getonetwo.com" className="flex items-center gap-2.5 no-underline">
              <img src="/onetwo-logo-navy.jpg" alt="ONE two" className="w-9 h-[34px] object-cover" />
              <span className="font-display text-[22px] font-bold text-white">ONE <span className="font-medium">two</span></span>
            </a>
            <div className="hidden lg:flex items-center gap-3 text-sm">
              {stepLabels.map((label, i) => (
                <span key={label} className="flex items-center gap-3">
                  {i > 0 && <span className="text-navy-500">&middot;</span>}
                  <span className={i === currentStepIndex ? 'font-bold text-white' : i < currentStepIndex ? 'text-navy-300' : 'text-navy-500'}>
                    {i + 1} {label}
                  </span>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              {signedInAs ? (
                // Signed in already: leaving signup goes back to their buildings
                <a href="/login" className="inline-flex items-center justify-center px-4 font-semibold text-sm text-white border border-[rgba(255,255,255,0.45)] rounded-[10px] cursor-pointer hover:border-white" style={{ minHeight: 42 }}>Cancel</a>
              ) : (<>
              <span className="text-navy-300 hidden sm:inline">Already have an account?</span>
              <a onClick={() => setAuthStep('login')} className="inline-flex items-center justify-center px-4 font-semibold text-sm text-white border border-[rgba(255,255,255,0.45)] rounded-[10px] cursor-pointer hover:border-white" style={{ minHeight: 42 }}>Log in</a>
              </>)}
            </div>
          </div>
        </header>

        {/* ── Two-column content ── */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col lg:flex-row gap-6 items-start">

            {/* ── Main card ── */}
            <div className="flex-1 min-w-0">
              <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-8">

                {/* Breadcrumb */}
                <div className="border-b border-ink-100 pb-4 mb-6">
                  <div className="flex items-center gap-1 sm:gap-3 text-sm">
                    {stepLabels.map((label, i) => (
                      <span key={label} className="flex items-center gap-1 sm:gap-3">
                        {i > 0 && <span className="text-ink-300">&middot;</span>}
                        <span className={i === currentStepIndex ? 'font-bold text-ink-900' : i < currentStepIndex ? 'text-ink-600' : 'text-ink-400'}>
                          {i + 1} {label}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Mobile order summary bar */}
                <div className="lg:hidden bg-navy text-white p-3 rounded-lg mb-6 flex items-center justify-between">
                  <span className="text-sm font-medium">{currentTier?.name}, ${billingInterval === 'annual' ? totalAnnual.toLocaleString() : totalMonthly} / {billingInterval === 'annual' ? 'yr' : 'mo'}</span>
                  <span className="text-sm font-bold">Due today $0</span>
                </div>

                {/* ══════ STEP 1 — Pick your plan ══════ */}
                {authStep === 'signup-plan' && (
                  <>
                    <h1 className="font-display text-3xl font-bold text-ink-900 mb-2">Pick your plan</h1>
                    <p className="text-ink-500 mb-6">{hasTrial ? 'Choose one to continue; nothing is billed until your trial ends.' : 'Choose one to continue.'}</p>

                    {/* Billing toggle */}
                    <div className="mb-6">
                      <div className="inline-flex rounded-full border border-ink-200 p-0.5">
                        <button onClick={() => setBillingInterval('monthly')}
                          className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                            billingInterval === 'monthly' ? 'bg-navy text-white' : 'text-ink-500 hover:text-ink-700'
                          }`}>Monthly</button>
                        <button onClick={() => setBillingInterval('annual')}
                          className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                            billingInterval === 'annual' ? 'bg-navy text-white' : 'text-ink-500 hover:text-ink-700'
                          }`}>Annual, two months free</button>
                      </div>
                    </div>

                    {/* Plan cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                      {TIERS.map(tier => {
                        const displayPrice = billingInterval === 'annual' ? Math.round(tier.annual / 12) : tier.monthly;
                        const isSelected = selectedTier === tier.id;
                        return (
                          <button key={tier.id} onClick={() => setSelectedTier(tier.id)}
                            className={`p-6 rounded-2xl border-2 text-left transition-all ${
                              isSelected ? 'border-solid border-brand-teal bg-[#F0FBFF]' : 'border-dashed border-ink-200 hover:border-ink-300'
                            }`}>
                            <p className="font-bold text-ink-900 text-lg">{tier.name}</p>
                            <p className="font-bold text-brand-teal text-lg mt-1">${displayPrice}<span className="font-normal text-brand-teal"> / mo</span></p>
                            {billingInterval === 'annual' && (
                              <p className="text-xs text-ink-400 mt-0.5">${tier.annual.toLocaleString()} / yr</p>
                            )}
                            <p className="text-sm text-ink-400 mt-2">{tier.tagline}</p>
                          </button>
                        );
                      })}
                    </div>

                    {/* Add-ons */}
                    <div className="mb-8">
                      <p className="text-sm font-bold text-ink-900 mb-3">Add-ons for {currentTier?.name}{hasTrial ? ', free during your trial' : ''}</p>
                      <div className="space-y-3">
                        {ADDONS.map(addon => {
                          const isSelected = selectedAddOns.has(addon.id);
                          const price = billingInterval === 'annual' ? Math.round(getAddOnPrice(addon, selectedTier, 'annual') / 12) : getAddOnPrice(addon, selectedTier, billingInterval);
                          return (
                            <button key={addon.id} onClick={() => toggleAddOn(addon.id)}
                              className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${
                                isSelected ? 'border-brand-teal bg-[#F0FBFF]' : 'border-ink-200 hover:border-ink-300'
                              }`}>
                              <div className="flex items-start gap-3">
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                                  isSelected ? 'bg-brand-teal border-brand-teal' : 'border-ink-300'
                                }`}>
                                  {isSelected && <span className="text-white text-xs">&#10003;</span>}
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-ink-900">{addon.name}, ${price} / mo{hasTrial ? ' after the trial' : ''}</p>
                                  <p className="text-xs text-ink-400 mt-1">{addon.description}</p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Continue button */}
                    <div className="flex justify-end">
                      <button onClick={() => setAuthStep('signup-building')}
                        className="bg-brand-red hover:bg-[#B82230] text-white rounded-full px-10 py-3 font-semibold text-sm transition-all">
                        Continue
                      </button>
                    </div>
                  </>
                )}

                {/* ══════ STEP 2 — Your building ══════ */}
                {authStep === 'signup-building' && (
                  <>
                    <h1 className="font-display text-3xl font-bold text-ink-900 mb-6">Your building</h1>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-ink-700 mb-1">Building / Association Name *</label>
                        <input value={bldgName} onChange={e => setBldgName(e.target.value)}
                          className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="e.g., Sunny Acres Condominium" autoFocus />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-ink-700 mb-1">Building Short Name (URL) *</label>
                        <div className="flex items-center gap-0">
                          <input value={bldgSubdomain}
                            onChange={e => { subdomainManuallyEdited.current = true; setBldgSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)); }}
                            className={`flex-1 px-3 py-2.5 border rounded-l-lg text-sm font-mono ${
                              subdomainStatus === 'taken' ? 'border-red-400 bg-red-50' :
                              subdomainStatus === 'available' ? 'border-sage-400 bg-sage-50' :
                              'border-ink-200'
                            }`}
                            placeholder="sunnyacres" />
                          <span className="px-3 py-2.5 bg-ink-100 border border-l-0 border-ink-200 rounded-r-lg text-xs text-ink-500">.getonetwo.com</span>
                        </div>
                        <div className="mt-1 h-4">
                          {subdomainStatus === 'checking' && <p className="text-xs text-ink-400">Checking availability...</p>}
                          {subdomainStatus === 'available' && bldgSubdomain.length >= 3 && <p className="text-xs text-sage-600">&#10003; {bldgSubdomain}.getonetwo.com is available</p>}
                          {subdomainStatus === 'taken' && <p className="text-xs text-red-600">&#10007; Already taken — try a different name</p>}
                          {subdomainStatus === 'idle' && bldgSubdomain.length > 0 && bldgSubdomain.length < 3 && <p className="text-xs text-ink-400">Must be at least 3 characters</p>}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-ink-700 mb-1">Street Address *</label>
                        <input value={bldgStreet} onChange={e => setBldgStreet(e.target.value)}
                          className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="123 Main St" />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-ink-700 mb-1">City</label>
                          <input value={bldgCity} onChange={e => setBldgCity(e.target.value)}
                            className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="City" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-ink-700 mb-1">State</label>
                          <input value={bldgState} onChange={e => setBldgState(e.target.value)}
                            className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="DC" maxLength={2} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-ink-700 mb-1">ZIP</label>
                          <input value={bldgZip} onChange={e => setBldgZip(e.target.value)}
                            className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="20001" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-ink-700 mb-1">Total Units</label>
                        <input value={bldgUnits} onChange={e => setBldgUnits(e.target.value)} type="number"
                          className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="14" />
                      </div>
                    </div>

                    <div className="flex flex-col items-center gap-3 mt-8">
                      <button onClick={() => {
                          if (!bldgName.trim()) { alert('Please enter your building name.'); return; }
                          if (!bldgSubdomain || bldgSubdomain.length < 3) { alert('Please enter a short name (at least 3 characters) for your building URL.'); return; }
                          if (subdomainStatus === 'taken') { alert('That short name is already taken. Please choose another.'); return; }
                          if (subdomainStatus === 'checking') { alert('Still checking availability — please wait a moment.'); return; }
                          if (!bldgStreet.trim()) { alert('Please enter your building\'s street address.'); return; }
                          setAuthStep('signup-account');
                        }}
                        className="bg-brand-red hover:bg-[#B82230] text-white rounded-full px-10 py-3 font-semibold text-sm transition-all">
                        Continue
                      </button>
                      <a onClick={() => setAuthStep('signup-plan')} className="text-sm text-ink-400 hover:text-ink-600 cursor-pointer">&larr; Back to Plan</a>
                    </div>
                  </>
                )}

                {/* ══════ STEP 3 — Your account ══════ */}
                {authStep === 'signup-account' && (
                  <>
                    <h1 className="font-display text-3xl font-bold text-ink-900 mb-6">Your account</h1>

                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-ink-700 mb-1">First Name *</label>
                          <input value={firstName} onChange={e => setFirstName(e.target.value)}
                            className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="First" autoFocus />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-ink-700 mb-1">Last Name *</label>
                          <input value={lastName} onChange={e => setLastName(e.target.value)}
                            className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="Last" />
                        </div>
                      </div>
                      {signedInAs ? (
                        <p className="rounded-lg border border-ink-200 bg-ink-50 px-3 py-2.5 text-sm text-ink-700">
                          Signed in as <span className="font-semibold">{signedInAs}</span>. This building is added to the same account.
                        </p>
                      ) : (<>
                      <div>
                        <label className="block text-xs font-medium text-ink-700 mb-1">Email *</label>
                        <input type="email" value={profileEmail} onChange={e => { setProfileEmail(e.target.value); setExistingAccount(null); setEmailLink('idle'); }}
                          className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="you@example.com" />
                      </div>
                      {existingAccount ? (
                        <div role="status" className="rounded-lg border border-ink-200 bg-ink-50 px-3 py-3">
                          <p className="text-sm font-semibold text-ink-900">You already have a ONE two account with this email.</p>
                          <p className="mt-0.5 text-sm text-ink-700">This building will be added to it. Confirm it&apos;s you with your password, or with a link we email you.</p>
                          <label htmlFor="existing-account-password" className="mt-3 block text-xs font-medium text-ink-700 mb-1">Your ONE two password *</label>
                          <input id="existing-account-password" type="password" value={password} autoFocus
                            onChange={e => { setPassword(e.target.value); setExistingAccount(x => x && { ...x, error: false }); }}
                            aria-invalid={existingAccount.error || undefined}
                            className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm bg-white" placeholder="••••••••" />
                          {existingAccount.error && <p className="mt-1.5 text-sm text-red-700">That password doesn&apos;t match this account. Try again, or use the email link below.</p>}
                          <div className="mt-3 border-t border-ink-200 pt-3">
                            {emailLink === 'sent' ? (
                              <p role="status" className="text-sm text-ink-800">
                                <span className="font-semibold">Check {existingAccount.email}.</span> Open the link in this browser and you&apos;ll come back here signed in, with this form filled in. The link expires in an hour.
                              </p>
                            ) : (
                              <>
                                <p className="text-sm text-ink-700">Don&apos;t know the password, or don&apos;t want to use it?</p>
                                <button type="button" onClick={sendSignInLink} disabled={emailLink === 'sending'}
                                  className="mt-1.5 rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm font-semibold text-ink-900 hover:border-ink-900 disabled:opacity-50">
                                  {emailLink === 'sending' ? 'Sending…' : 'Email me a sign-in link instead'}
                                </button>
                                {emailLink === 'failed' && <p className="mt-1.5 text-sm text-red-700">We couldn&apos;t send the email just now. Wait a minute and try again.</p>}
                              </>
                            )}
                          </div>
                        </div>
                      ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-ink-700 mb-1">Password *</label>
                          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                            className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="••••••••" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-ink-700 mb-1">Confirm *</label>
                          <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                            className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="••••••••" />
                        </div>
                      </div>
                      )}
                      </>)}
                      <div>
                        <label className="block text-xs font-medium text-ink-700 mb-1">Phone</label>
                        <input value={profilePhone} onChange={e => setProfilePhone(e.target.value)}
                          className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="(xxx) xxx-xxxx" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-ink-700 mb-1">Your Unit # (optional)</label>
                        <input value={profileUnit} onChange={e => setProfileUnit(e.target.value)}
                          className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="e.g., 301" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-ink-700 mb-1">Association Role</label>
                        <select value={boardTitle} onChange={e => setBoardTitle(e.target.value)}
                          className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm bg-white">
                          <option>President</option><option>Vice President</option><option>Treasurer</option><option>Secretary</option><option>Member at Large</option><option>Unit Owner</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-col items-center gap-3 mt-8">
                      {isBackendEnabled ? (
                        <button onClick={() => {
                            if (!firstName.trim() || !lastName.trim()) { alert('Please enter your name.'); return; }
                            if (!profileEmail.trim()) { alert('Please enter your email.'); return; }
                            if (existingAccount) {
                              if (!password) { alert('Please enter your ONE two password.'); return; }
                            } else if (!signedInAs) {
                              if (!password || password.length < 6) { alert('Please enter a password (at least 6 characters).'); return; }
                              if (password !== confirmPassword) { alert('Passwords do not match.'); return; }
                            }
                            handleCheckout();
                          }} disabled={checkoutLoading}
                          className="bg-brand-red hover:bg-[#B82230] text-white rounded-full px-10 py-3 font-semibold text-sm transition-all disabled:opacity-50">
                          {checkoutLoading
                            ? 'Setting up...'
                            : existingAccount
                              ? (hasTrial ? 'Sign In & Start Free Trial' : 'Sign In & Start today!')
                              : (hasTrial ? 'Start Free Trial' : 'Start today!')}
                        </button>
                      ) : (
                        <button onClick={() => {
                            if (!firstName.trim() || !lastName.trim()) { alert('Please enter your name.'); return; }
                            if (!profileEmail.trim()) { alert('Please enter your email.'); return; }
                            if (!password || password.length < 6) { alert('Please enter a password (at least 6 characters).'); return; }
                            if (password !== confirmPassword) { alert('Passwords do not match.'); return; }
                            handleCompleteOnboarding();
                          }}
                          className="bg-brand-red hover:bg-[#B82230] text-white rounded-full px-10 py-3 font-semibold text-sm transition-all">
                          Create Account &amp; Enter
                        </button>
                      )}
                      {hasTrial && <p className="text-[10px] text-ink-400">No charge during your {trialDays}-day trial.</p>}
                      <a onClick={() => setAuthStep('signup-building')} className="text-sm text-ink-400 hover:text-ink-600 cursor-pointer">&larr; Back to Building</a>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── Desktop order summary card ── */}
            <div className="hidden lg:block w-[340px] flex-shrink-0">
              <div className="bg-navy rounded-2xl p-6 text-white sticky top-20">
                <p className="text-brand-cyan text-xs font-bold uppercase tracking-wide">{hasTrial ? `YOUR ${trialDays} DAY TRIAL` : 'YOUR PLAN'}</p>
                <div className="w-12 h-0.5 bg-brand-cyan mt-1 mb-4" />

                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{currentTier?.name}</span>
                    <span className="text-sm font-semibold">${billingInterval === 'annual' ? tierAnnual.toLocaleString() : tierMonthly} / {billingInterval === 'annual' ? 'yr' : 'mo'}</span>
                  </div>
                  {ADDONS.filter(a => selectedAddOns.has(a.id)).map(addon => {
                    const addonPrice = getAddOnPrice(addon, selectedTier, billingInterval);
                    return (
                      <div key={addon.id} className="flex items-center justify-between">
                        <span className="text-sm text-navy-300">{addon.name}</span>
                        <span className="text-sm font-semibold">${addonPrice.toLocaleString()} / {billingInterval === 'annual' ? 'yr' : 'mo'}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-navy-700 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Due today</span>
                    <span className="text-3xl font-bold text-brand-cyan">{hasTrial ? '$0' : dueToday}</span>
                  </div>
                  <p className="text-sm text-navy-300 mt-1">{hasTrial ? `After ${trialDays} days: ` : 'Then '}${billingInterval === 'annual' ? totalAnnual.toLocaleString() : totalMonthly} / {billingInterval === 'annual' ? 'yr' : 'mo'}, before tax.</p>
                </div>

                <div className="bg-navy-800 rounded-xl p-4 mt-4">
                  <p className="font-bold text-sm mb-2">What happens next</p>
                  <p className="text-xs text-navy-300 leading-relaxed">You land in your own building in Setup Season. Add your units and bylaws facts, or load a sample building to look around first. Invite the board, the owners or your manager whenever you like.</p>
                </div>

                {authStep !== 'signup-plan' && bldgName && (
                  <div className="border-t border-navy-700 mt-4 pt-4">
                    <p className="text-xs text-navy-300">{bldgName}</p>
                    {bldgSubdomain && <p className="text-xs text-navy-400 font-mono">{bldgSubdomain}.getonetwo.com</p>}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // ── Non-signup steps: original layout ──
  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-ink-50 via-white to-mist-50 flex items-center justify-center overflow-y-auto py-8">
      <div className="w-full max-w-md mx-4">

        {/* ══════ WELCOME ══════ */}
        {authStep === 'welcome' && (
          <div className="bg-white rounded-2xl shadow-xl border border-ink-100 p-8">
            <Logo />
            <div className="space-y-3">
              <button onClick={() => setAuthStep('login')}
                className="w-full py-3.5 bg-ink-900 text-white rounded-xl font-semibold text-sm hover:bg-ink-800 transition-all">Sign In</button>
              <button onClick={() => setAuthStep('signup-plan')}
                className="w-full py-3.5 border-2 border-accent-500 text-accent-700 rounded-xl font-semibold text-sm hover:bg-accent-50 transition-all">Create Account</button>
            </div>
            <div className="mt-6 bg-gradient-to-br from-ink-900 to-ink-700 rounded-xl p-5 text-white">
              <p className="text-xs font-semibold text-accent-300 uppercase tracking-wide mb-2">Plans from</p>
              <div className="flex items-baseline gap-1 mb-3"><span className="text-3xl font-bold">$179</span><span className="text-ink-300">/month per building</span></div>
              <ul className="space-y-1.5 text-sm text-ink-200">
                <li className="flex items-center gap-2"><span className="text-sage-400">&#10003;</span> Fiduciary Alerts &amp; compliance grades</li>
                <li className="flex items-center gap-2"><span className="text-sage-400">&#10003;</span> Double-entry GL, budgets &amp; reserves</li>
                <li className="flex items-center gap-2"><span className="text-sage-400">&#10003;</span> Case Workflow with escalation paths</li>
                <li className="flex items-center gap-2"><span className="text-sage-400">&#10003;</span> DC jurisdiction compliance built in</li>
              </ul>
              <button onClick={() => setAuthStep('signup-plan')}
                className="w-full mt-4 py-2.5 bg-accent-600 text-white rounded-lg text-sm font-semibold hover:bg-accent-700 transition-all">{hasTrial ? 'Start Free Trial' : 'Start today!'} &rarr;</button>
            </div>
            <p className="text-center text-xs text-ink-400 mt-5">By continuing, you agree to our Terms of Service and Privacy Policy.</p>
            <div className="border-t border-ink-100 mt-4 pt-4 flex items-center justify-center">
              <a href="https://getonetwo.com" className="text-xs text-accent-600 hover:text-accent-700 font-medium">&larr; Back to website</a>
            </div>
          </div>
        )}

        {/* ══════ WHICH BUILDING? ══════ */}
        {buildingChoices && (
          <div className="bg-white rounded-2xl shadow-xl border border-ink-100 p-8">
            <Logo />
            <h1 className="text-center font-display text-xl font-bold text-ink-900">Which building?</h1>
            <p className="mt-1 text-center text-sm text-ink-500">Signed in as {buildingChoices.user.email}</p>
            <ul className="mt-5 space-y-2.5">
              {buildingChoices.rows.map(m => {
                const sub = subscriptionLabel(m);
                const roleLabel = m.board_title || ({ board_member: 'Board member', resident: 'Resident', staff: 'Staff', property_manager: 'Property manager' } as Record<string, string>)[m.role] || 'Member';
                const street = addressLine(m.tenant?.address);
                return (
                  <li key={m.tenant_id}>
                    <button type="button" onClick={() => pickBuilding(m)} disabled={loginLoading}
                      className="flex w-full items-center gap-3 rounded-xl border border-ink-200 px-4 py-3 text-left transition-colors hover:border-ink-900 focus-visible:border-ink-900 disabled:opacity-50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink-900">{m.tenant?.name || 'Building'}</span>
                        <span className="block truncate text-xs text-ink-500">{[street, roleLabel].filter(Boolean).join(' · ')}</span>
                      </span>
                      {sub && (
                        <span className={`flex-none rounded-full px-2 py-0.5 text-[11px] font-semibold ${sub.tone === 'ok' ? 'bg-sage-50 text-sage-700' : sub.tone === 'bad' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>{sub.text}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            <label className="mt-4 flex items-center justify-center gap-2 text-sm text-ink-600">
              <input id="remember-building" type="checkbox" checked={rememberBuilding} onChange={e => setRememberBuilding(e.target.checked)} className="h-4 w-4" />
              Open the building I pick next time
            </label>
            <div className="border-t border-ink-100 mt-6 pt-4 flex items-center justify-between text-sm">
              <a onClick={() => startAddBuilding(buildingChoices.user)} className="text-accent-600 font-semibold cursor-pointer hover:underline">+ Set up another building</a>
              <a onClick={async () => { await supabase?.auth.signOut(); setBuildingChoices(null); setAuthStep('login'); }} className="text-ink-400 hover:text-ink-600 cursor-pointer">Sign out</a>
            </div>
          </div>
        )}

        {/* ══════ LOGIN ══════ */}
        {authStep === 'login' && !buildingChoices && (
          <div className="bg-white rounded-2xl shadow-xl border border-ink-100 p-8">
            <Logo />
            {provisioningTimedOut && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                <p className="text-sm font-semibold text-amber-900 mb-1">Your building is still being set up</p>
                <p className="text-xs text-amber-700 mb-3">Payment was received but setup is taking longer than usual. Please sign in below — your building will be ready shortly.</p>
                <button onClick={() => { setProvisioningTimedOut(false); window.location.href = '/login?provisioned=1'; }}
                  className="w-full py-2 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700">Retry Setup Check</button>
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-ink-200 rounded-xl text-sm" placeholder="you@example.com" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-ink-200 rounded-xl text-sm" placeholder="••••••••"
                  onKeyDown={e => e.key === 'Enter' && handleLogin()} />
              </div>
              <button onClick={handleLogin} disabled={loginLoading}
                className="w-full py-3.5 bg-ink-900 text-white rounded-xl font-semibold text-sm hover:bg-ink-800 disabled:opacity-50">
                {loginLoading ? 'Signing in...' : 'Sign In'}</button>
              <p className="text-center text-xs text-ink-400"><a href="/reset-password" className="text-accent-600 hover:underline cursor-pointer">Forgot password?</a></p>
            </div>
            <div className="border-t border-ink-100 mt-6 pt-4 text-center">
              <p className="text-sm text-ink-500">Don&apos;t have an account?{' '}<a onClick={() => setAuthStep('signup-plan')} className="text-accent-600 font-semibold cursor-pointer hover:underline">Create one</a></p>
            </div>
          </div>
        )}

        {/* ══════ DEMO LEAD CAPTURE ══════ */}
        {authStep === 'demo-lead' && (
          <div className="bg-white rounded-2xl shadow-xl border border-ink-100 p-8">
            <Logo />
            <h2 className="font-display text-lg font-bold text-ink-900 text-center mb-1">Try the Demo</h2>
            <p className="text-sm text-ink-400 text-center mb-6">Tell us a bit about yourself, then explore the full platform</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-ink-700 mb-1">First Name *</label>
                  <input value={demoFirstName} onChange={e => setDemoFirstName(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="First" autoFocus /></div>
                <div><label className="block text-xs font-medium text-ink-700 mb-1">Last Name *</label>
                  <input value={demoLastName} onChange={e => setDemoLastName(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="Last" /></div>
              </div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Email *</label>
                <input type="email" value={demoEmail} onChange={e => setDemoEmail(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="you@example.com" /></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Condo / Community Name *</label>
                <input value={demoCondoName} onChange={e => setDemoCondoName(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="e.g., Sunny Acres Condominium" /></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Number of Units</label>
                <input type="number" value={demoUnitCount} onChange={e => setDemoUnitCount(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="e.g., 14" /></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Community Member Type *</label>
                <select value={demoMemberType} onChange={e => setDemoMemberType(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm bg-white">
                  <option value="resident">Resident</option>
                  <option value="board_member">Board Member</option>
                  <option value="property_manager">Property Manager</option>
                  <option value="other">Other</option>
                </select></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Subscription Interest *</label>
                <select value={demoSubscriptionInterest} onChange={e => setDemoSubscriptionInterest(e.target.value as SubscriptionTier)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm bg-white">
                  {TIERS.map(tier => (
                    <option key={tier.id} value={tier.id}>{tier.name} — ${tier.monthly}/mo</option>
                  ))}
                </select></div>
              <button onClick={handleDemoLeadSubmit} disabled={demoSubmitting}
                className="w-full py-3.5 bg-accent-600 text-white rounded-xl font-semibold text-sm hover:bg-accent-700 disabled:opacity-50 mt-2">
                {demoSubmitting ? 'Loading...' : 'Enter Demo →'}</button>
            </div>
            <div className="border-t border-ink-100 mt-6 pt-4 flex items-center justify-center">
              <a href="https://getonetwo.com" className="text-xs text-accent-600 hover:text-accent-700 font-medium">&larr; Back to website</a>
            </div>
          </div>
        )}

        {/* ══════ JOIN INVITE CODE ══════ */}
        {authStep === 'join-invite' && (
          <div className="bg-white rounded-2xl shadow-xl border border-ink-100 p-8">
            <Logo />
            <h2 className="font-display text-lg font-bold text-ink-900 text-center mb-1">Join a Building</h2>
            <p className="text-sm text-ink-400 text-center mb-6">Enter your invitation code, or start a new building</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Invitation Code</label>
                <input value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())}
                  className="w-full px-4 py-3 border border-ink-200 rounded-xl text-sm font-mono tracking-wider text-center uppercase"
                  placeholder="SA-XXX-XXXX" maxLength={12}
                  onKeyDown={e => e.key === 'Enter' && handleInviteCode()} />
              </div>
              <button onClick={handleInviteCode}
                className="w-full py-3.5 bg-ink-900 text-white rounded-xl font-semibold text-sm hover:bg-ink-800">Continue with Code</button>
            </div>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-ink-200" /></div>
              <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-ink-400">or</span></div>
            </div>

            {authJoinRole === 'BOARD_MEMBER' || authJoinRole === 'PROPERTY_MANAGER' ? (
              <div className="bg-accent-50 border border-accent-200 rounded-xl p-5 text-center">
                <p className="text-sm font-semibold text-ink-900 mb-2">Starting fresh?</p>
                <p className="text-xs text-ink-500 mb-3">Subscribe to <span className="font-bold">ONE two</span> and set up your building today.</p>
                <button onClick={() => setAuthStep('signup-plan')}
                  className="px-6 py-2.5 bg-accent-600 text-white rounded-lg text-sm font-semibold hover:bg-accent-700">Subscribe &amp; Create Building &rarr;</button>
              </div>
            ) : (
              <div className="bg-mist-50 border border-mist-200 rounded-xl p-5 text-center">
                <p className="text-sm font-semibold text-ink-900 mb-2">Don&apos;t have a code?</p>
                <p className="text-xs text-ink-500 mb-3">Ask your building&apos;s board or management company to invite you.</p>
                <button onClick={() => { setAuthJoinRole('BOARD_MEMBER'); setAuthStep('signup-plan'); }}
                  className="px-5 py-2 bg-ink-900 text-white rounded-lg text-xs font-semibold hover:bg-ink-800">I&apos;m a board member — subscribe today</button>
              </div>
            )}
            <div className="mt-6 text-center"><a onClick={() => setAuthStep('login')} className="text-sm text-ink-400 hover:text-ink-600 cursor-pointer">&larr; Back</a></div>
          </div>
        )}

        {/* ══════ JOIN — CREATE PROFILE (after valid invite) ══════ */}
        {authStep === 'join-create' && (
          <div className="bg-white rounded-2xl shadow-xl border border-ink-100 p-8">
            <Logo />
            <h2 className="font-display text-lg font-bold text-ink-900 text-center mb-1">Create Your Account</h2>
            {inviteMatch && (
              <p className="text-xs text-accent-600 text-center mb-4">
                Joining as {inviteMatch.role === 'BOARD_MEMBER' ? 'Board Member' : inviteMatch.role === 'PROPERTY_MANAGER' ? 'Property Manager' : inviteMatch.role === 'STAFF' ? 'Staff' : 'Resident'}
                {inviteMatch.unit ? ` · Unit ${inviteMatch.unit}` : ''}
              </p>
            )}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-ink-700 mb-1">First Name *</label>
                  <input value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="First" /></div>
                <div><label className="block text-xs font-medium text-ink-700 mb-1">Last Name *</label>
                  <input value={lastName} onChange={e => setLastName(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="Last" /></div>
              </div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Email</label>
                <input type="email" value={profileEmail} onChange={e => setProfileEmail(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="you@example.com" /></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Phone</label>
                <input value={profilePhone} onChange={e => setProfilePhone(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="(xxx) xxx-xxxx" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-ink-700 mb-1">Password *</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="••••••••" /></div>
                <div><label className="block text-xs font-medium text-ink-700 mb-1">Confirm *</label>
                  <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="••••••••" /></div>
              </div>
              <button onClick={handleCompleteJoin}
                className="w-full py-3 bg-ink-900 text-white rounded-xl font-semibold text-sm hover:bg-ink-800 mt-2">Create Account &amp; Enter</button>
            </div>
            <div className="mt-4 text-center"><a onClick={() => setAuthStep('join-invite')} className="text-sm text-ink-400 hover:text-ink-600 cursor-pointer">&larr; Back</a></div>
          </div>
        )}

      </div>
    </div>
  );
}
