import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { supabase, isBackendEnabled, setActiveTenantId, forgetLocalSession } from '@/lib/supabase';
import type { Role } from '@/types/auth';
import { TIERS, DEFAULT_TRIAL_DAYS } from '@/lib/tiers';
import type { SubscriptionTier } from '@/lib/tiers';
import { tenantLoginUrl } from '@/lib/tenantHost';
import {
  addressLine, chooseTenant, fetchMemberships, needsBuildingChoice, pickMembership, subscriptionLabel,
  type TenantMembership,
} from '@/lib/tenantMembership';

type SessionUser = { id: string; email?: string | null; user_metadata?: { full_name?: string } };

// Name of a building paid for without signing in; survives Chargebee's redirect
const SIGN_IN_LATER_KEY = 'onetwo_sign_in_later';

// Buildings the account had before checkout began, kept across the Chargebee redirect
const KNOWN_TENANTS_KEY = 'onetwo_checkout_known_tenants';

import { NO_CONSENT, missingConsent, recordConsent, type Consent } from '@/lib/consent';
import ConsentBoxes from './ConsentBoxes';
import PasswordRules from './PasswordRules';
import { passwordError } from '@/lib/passwordPolicy';
import SignupCheckout from './signup/SignupCheckout';

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
    const consentGap = missingConsent(consent);
    if (consentGap) { alert(consentGap); return; }

    setDemoSubmitting(true);
    try {
      if (isBackendEnabled && supabase) {
        await recordConsent(supabase, 'demo', demoEmail, consent);
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

  // Leave an account the signup found already signed in, and start the
  // account step again with a blank form.
  const signOutOfSignup = async () => {
    try { await supabase?.auth.signOut({ scope: 'local' }); } catch { /* already gone */ }
    setSignedInAs(null);
    setProfileEmail(''); setFirstName(''); setLastName(''); setPassword(''); setConfirmPassword('');
  };
  const [sessionChecking, setSessionChecking] = useState(true);
  const [sending, setSending] = useState(false);
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

  const [provisioningStatus, setProvisioningStatus] = useState<string | null>(null);
  // "Which building?" — set when a signed-in account has several and none is implied by the host
  const [buildingChoices, setBuildingChoices] = useState<{ user: SessionUser; rows: TenantMembership[] } | null>(null);
  const [rememberBuilding, setRememberBuilding] = useState(false);
  // Set while an already signed-in person is setting up another building: no email or password to enter
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  // Set after a "sign in later" checkout: the login form explains what to do next
  const [signInLaterFor, setSignInLaterFor] = useState<string | null>(() => {
    try { return sessionStorage.getItem(SIGN_IN_LATER_KEY); } catch { return null; }
  });
  // Terms, Privacy and (optional) product emails. Asked on every form that
  // takes an email; nothing is pre-ticked.
  const [consent, setConsent] = useState<Consent>(NO_CONSENT);
  const [provisioningTimedOut, setProvisioningTimedOut] = useState(false);

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

    // Signed in: the "sign in to open your new building" note has done its job
    try { sessionStorage.removeItem(SIGN_IN_LATER_KEY); } catch { /* ignore */ }
    setSignInLaterFor(null);

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
      // The session now belongs to the building's host; keep no copy here
      forgetLocalSession();
      useAuthStore.getState().clearSession();
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
    // Signing in to finish a "sign in later" signup: open the building that
    // was just paid for, not the one they had before and not the picker. It
    // is attached by the payment webhook, so give it a few seconds to appear.
    let paidFor: string | null = null;
    try { paidFor = sessionStorage.getItem(SIGN_IN_LATER_KEY); } catch { /* ignore */ }
    if (paidFor) {
      const wanted = paidFor.trim().toLowerCase();
      for (let attempt = 0; attempt < 12; attempt++) {
        const found = (await fetchMemberships(supabase!, user.id))
          ?.find(m => (m.tenant?.name || '').trim().toLowerCase() === wanted);
        if (found) {
          await loginWithTenantUser(user, found);
          return true;
        }
        await new Promise(r => setTimeout(r, 1200));
      }
      // Still not there: carry on to whatever they do have; the note stays up
    }

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
    setAuthStep('signup-plan');
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // ?demo=1 → show lead capture form before entering demo
    if (params.get('demo') === '1') {
      setAuthStep('demo-lead');
      setSessionChecking(false);
      return;
    }

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

          // A handed-over session is the newest one: it replaces whatever
          // this browser had saved, which may be an old session that no
          // longer works. The tokens leave the address bar either way.
          if (hasUrlTokens) {
            const { data, error } = await supabase!.auth.setSession({
              access_token: sbAccess!,
              refresh_token: sbRefresh!,
            });
            if (!error && data.user) user = data.user;
            window.history.replaceState({}, '', '/login');
            // Nothing usable arrived and nothing was saved: not signed in
            if (!user) useAuthStore.getState().clearSession();
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

            // Signup (?create=1). Only "Set up another building" from inside
            // the app (?add=1) continues as the signed-in person. A plain
            // signup link starts blank even if this browser still holds a
            // session: the visitor did not ask to act as that account, and if
            // they enter its email the form asks how they want to continue.
            if (params.get('create') === '1') {
              if (params.get('add') === '1') startAddBuilding(user);
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
    { const weak = passwordError(password); if (weak) { alert(weak); return; } }
    if (password !== confirmPassword) { alert('Passwords do not match.'); return; }
    const consentGap = missingConsent(consent);
    if (consentGap) { alert(consentGap); return; }
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

        await recordConsent(supabase, 'invitation', finalEmail, consent);

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

  // ── Signup: account, plan, add-ons, address and payment on one page ──
  const isSignupStep = authStep === 'signup-plan' || authStep === 'signup-building' || authStep === 'signup-account';

  if (isSignupStep) {
    return (
      <SignupCheckout
        trialDays={trialDays}
        signedInAs={signedInAs}
        signedInName={`${firstName} ${lastName}`.trim()}
        onLogIn={() => setAuthStep('login')}
        onSignOut={signOutOfSignup}
        provisioningStatus={provisioningStatus}
        onSubscribed={async (user, knownTenantIds) => {
          const opened = await pollForTenantAndRedirect(user.id, user, knownTenantIds);
          // Still being set up: the login form explains, and offers to check again
          if (!opened) setAuthStep('login');
        }}
        onDemoSignup={who => {
          const newMember = {
            id: `user-${Date.now()}`, name: `${who.firstName} ${who.lastName}`.trim(), email: who.email, phone: '',
            role: 'BOARD_MEMBER' as Role, unit: '', status: 'active' as const,
            joined: new Date().toISOString().split('T')[0], boardTitle: null,
          };
          addMember(newMember);
          login(newMember);
        }}
      />
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
            {signInLaterFor !== null && (
              <div role="status" className="bg-sage-50 border border-sage-200 rounded-xl p-4 mb-4">
                <p className="text-sm font-semibold text-ink-900 mb-1">{signInLaterFor ? `${signInLaterFor} is being set up` : 'Your building is being set up'}</p>
                <p className="text-xs text-ink-700">It&apos;s being added to your existing ONE two account. Sign in below with that account&apos;s password to open it. If you don&apos;t know the password, use &ldquo;Forgot password?&rdquo; and we&apos;ll email you a reset link.</p>
              </div>
            )}
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
                <input type="email" name="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-ink-200 rounded-xl text-sm" placeholder="you@example.com" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Password</label>
                <input type="password" name="current-password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}
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
              <ConsentBoxes idPrefix="demo-consent" value={consent} onChange={setConsent} />
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
            <form className="space-y-3" onSubmit={e => { e.preventDefault(); handleCompleteJoin(); }}>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-ink-700 mb-1">First Name *</label>
                  <input name="given-name" autoComplete="given-name" value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="First" /></div>
                <div><label className="block text-xs font-medium text-ink-700 mb-1">Last Name *</label>
                  <input name="family-name" autoComplete="family-name" value={lastName} onChange={e => setLastName(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="Last" /></div>
              </div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Email</label>
                <input type="email" name="email" autoComplete="username" value={profileEmail} onChange={e => setProfileEmail(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="you@example.com" /></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Phone</label>
                <input type="tel" name="tel" autoComplete="tel" value={profilePhone} onChange={e => setProfilePhone(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="(xxx) xxx-xxxx" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-ink-700 mb-1">Password *</label>
                  <input type="password" name="new-password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="••••••••" /></div>
                <div><label className="block text-xs font-medium text-ink-700 mb-1">Confirm *</label>
                  <input type="password" name="confirm-password" autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="••••••••" /></div>
              </div>
              <PasswordRules password={password} />
              <ConsentBoxes idPrefix="join-consent" value={consent} onChange={setConsent} />
              <button type="submit"
                className="w-full py-3 bg-ink-900 text-white rounded-xl font-semibold text-sm hover:bg-ink-800 mt-2">Create Account &amp; Enter</button>
            </form>
            <div className="mt-4 text-center"><a onClick={() => setAuthStep('join-invite')} className="text-sm text-ink-400 hover:text-ink-600 cursor-pointer">&larr; Back</a></div>
          </div>
        )}

      </div>
    </div>
  );
}
