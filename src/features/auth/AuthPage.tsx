import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { supabase, isBackendEnabled } from '@/lib/supabase';
import type { Role } from '@/types/auth';
import { BOARD_ROLE_LABELS } from '@/types/auth';
import { DEFAULT_TRIAL_DAYS } from '@/lib/tiers';
import DemoLeadModal, { wasAlreadyShown } from './DemoLeadModal';
import { useSignupState } from './signup/useSignupState';
import SignupLayout from './signup/SignupLayout';
import SignupBuildingStep from './signup/SignupBuildingStep';
import SignupPlanStep from './signup/SignupPlanStep';
import SignupAccountStep from './signup/SignupAccountStep';

const Logo = () => (
  <div className="text-center mb-8">
    <div className="flex items-center justify-center gap-4 mb-2">
      <img src="/onetwo-wordmark-dark.jpg" alt="ONE two" className="h-20 object-contain rounded-lg" />
      <img src="/onetwo-icon-1t.jpg" alt="ONE two icon" className="h-20 object-contain rounded-lg" />
    </div>
    <p className="text-sm text-ink-400 mt-1">HOA compliance made simple</p>
  </div>
);

export default function AuthPage() {
  const { authStep, setAuthStep, setAuthJoinRole, login, skipToDemo, buildingMembers, buildingInvites, addMember, demoExitSource } = useAuthStore();

  // ── Core form state (login + invite) ──
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  // ── Invite code ──
  const [inviteCode, setInviteCode] = useState('');
  const [showInviteField, setShowInviteField] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteData, setInviteData] = useState<any>(null);
  const [inviteMatch, setInviteMatch] = useState<typeof buildingInvites[0] | null>(null);

  // ── Signup wizard state (3-step) ──
  const signup = useSignupState();

  // ── UI state ──
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [provisioningStatus, setProvisioningStatus] = useState<string | null>(null);
  const [provisioningTimedOut, setProvisioningTimedOut] = useState(false);
  const [trialDays, setTrialDays] = useState(DEFAULT_TRIAL_DAYS);
  const [showLeadModal, setShowLeadModal] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.rpc('get_trial_days').then(({ data }) => {
      if (typeof data === 'number' && data >= 0) setTrialDays(data);
    });
  }, []);

  // ── Session check on mount ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Clear stale demo session — demo users shouldn't persist on the login page.
    // This must run before setAuthStep so signOut's reset doesn't overwrite it.
    const { currentUser: cu } = useAuthStore.getState();
    if (cu.id === 'user1' || cu.id.startsWith('user-')) {
      useAuthStore.getState().signOut();
    }

    // ?create=1 → show signup wizard
    if (params.get('create') === '1') {
      setAuthStep('signup');
      if (params.get('from') === 'demo' && !wasAlreadyShown()) {
        setShowLeadModal(true);
      }
      setSessionChecking(false);
      return;
    }

    const isProvisioned = params.get('provisioned') === '1';
    if (isProvisioned) {
      setAuthStep('login');
    }

    // Auto-fill invite code from email link
    const urlInvite = params.get('invite');
    if (urlInvite) {
      setInviteCode(urlInvite.toUpperCase());
      setShowInviteField(true);
      setAuthStep('signup');
    }

    // Helper: look up tenant_users and log the user in + redirect to subdomain
    const loginWithTenantUser = async (
      user: { id: string; email?: string | null; user_metadata?: { full_name?: string } },
      tu: { tenant_id: string; role: string; board_title: string | null; unit: string | null },
    ) => {
      const { data: tenant } = await supabase!
        .from('tenants')
        .select('name, subdomain')
        .eq('id', tu.tenant_id)
        .maybeSingle();

      const roleMap: Record<string, Role> = { board_member: 'BOARD_MEMBER', resident: 'RESIDENT', property_manager: 'PROPERTY_MANAGER' };
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

      const hostname = window.location.hostname;
      if (tenant?.subdomain && !hostname.startsWith(tenant.subdomain)) {
        const { data: sessionData } = await supabase!.auth.getSession();
        const accessToken = sessionData?.session?.access_token || '';
        const refreshToken = sessionData?.session?.refresh_token || '';
        window.location.href = `https://${tenant.subdomain}.getonetwo.com/login?sb_access=${accessToken}&sb_refresh=${refreshToken}`;
        return true;
      }
      return false;
    };

    const sbAccess = params.get('sb_access');
    const sbRefresh = params.get('sb_refresh');
    const hasUrlTokens = !!(sbAccess && sbRefresh);
    const tokenHash = params.get('token_hash');

    if (isBackendEnabled && supabase && !urlInvite) {
      const timeoutMs = isProvisioned ? 20000 : (hasUrlTokens || tokenHash) ? 12000 : 3000;
      const timeout = setTimeout(() => {
        setSessionChecking(false);
        setLoginLoading(false);
        setProvisioningStatus(null);
      }, timeoutMs);
      (async () => {
        try {
          setLoginLoading(true);
          await supabase!.auth.getSession();

          let user = (await supabase!.auth.getSession()).data.session?.user ?? null;

          if (tokenHash && !user) {
            const { data, error } = await supabase!.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
            if (!error && data.user) { user = data.user; window.history.replaceState({}, '', '/login'); }
          }

          if (hasUrlTokens && !user) {
            const { data, error } = await supabase!.auth.setSession({ access_token: sbAccess!, refresh_token: sbRefresh! });
            if (!error && data.user) { user = data.user; window.history.replaceState({}, '', '/login'); }
          }

          if (!user && isProvisioned) {
            try {
              const saved = sessionStorage.getItem('onetwo_checkout_tokens');
              if (saved) {
                const { access_token, refresh_token } = JSON.parse(saved);
                const { data, error } = await supabase!.auth.setSession({ access_token, refresh_token });
                if (!error && data.user) user = data.user;
                sessionStorage.removeItem('onetwo_checkout_tokens');
              }
            } catch { /* ignore */ }
          }

          if (user) {
            if (isProvisioned) {
              setProvisioningStatus('Setting up your building...');
              window.history.replaceState({}, '', '/login');
              const maxAttempts = 15;
              for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const { data: tu } = await supabase!
                  .from('tenant_users')
                  .select('tenant_id, role, board_title, unit')
                  .eq('user_id', user.id)
                  .maybeSingle();
                if (tu) {
                  setProvisioningStatus('Redirecting to your building...');
                  sessionStorage.removeItem('onetwo_checkout_tokens');
                  // Log in directly instead of cross-domain subdomain redirect
                  const roleMap: Record<string, Role> = { board_member: 'BOARD_MEMBER', resident: 'RESIDENT', property_manager: 'PROPERTY_MANAGER' };
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
                  clearTimeout(timeout);
                  setSessionChecking(false);
                  setLoginLoading(false);
                  setProvisioningStatus(null);
                  return;
                }
                await new Promise(r => setTimeout(r, 1200));
              }
              setProvisioningStatus(null);
              setProvisioningTimedOut(true);
              setLoginLoading(false);
              clearTimeout(timeout);
              setSessionChecking(false);
              return;
            }

            const { data: tu } = await supabase!
              .from('tenant_users')
              .select('tenant_id, role, board_title, unit')
              .eq('user_id', user.id)
              .maybeSingle();

            if (tu) {
              await loginWithTenantUser(user, tu);
              setLoginLoading(false);
              clearTimeout(timeout);
              setSessionChecking(false);
              return;
            }

            const { data: admin } = await supabase!
              .from('platform_admins')
              .select('name, role')
              .eq('user_id', user.id)
              .maybeSingle();

            if (admin) {
              const m = {
                id: user.id, name: admin.name || user.email?.split('@')[0] || 'Admin',
                email: user.email || '', phone: '', role: 'PLATFORM_ADMIN' as Role,
                unit: '', status: 'active' as const,
                joined: new Date().toISOString().split('T')[0], boardTitle: null,
              };
              addMember(m);
              login(m);
              if (tokenHash) useAuthStore.getState().switchRole('BOARD_MEMBER');
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

  // ── Login handler ──
  const handleLogin = async () => {
    if (!email || !password) return;

    if (isBackendEnabled && supabase) {
      setLoginLoading(true);
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.toLowerCase(), password });
        if (error) { console.error('Incorrect email or password.'); setLoginLoading(false); return; }

        if (data.user) {
          const { data: admin } = await supabase!
            .from('platform_admins')
            .select('name, role')
            .eq('user_id', data.user.id)
            .maybeSingle();

          if (admin) {
            const member = buildingMembers.find(m => m.email.toLowerCase() === email.toLowerCase());
            if (member) { login(member); } else {
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

          const { data: tenantUser } = await supabase!
            .from('tenant_users')
            .select('tenant_id, role, board_title, unit')
            .eq('user_id', data.user.id)
            .maybeSingle();

          if (tenantUser) {
            const { data: tenant } = await supabase!
              .from('tenants')
              .select('name, subdomain')
              .eq('id', tenantUser.tenant_id)
              .maybeSingle();

            const roleMap: Record<string, Role> = {
              board_member: 'BOARD_MEMBER', resident: 'RESIDENT', staff: 'STAFF', property_manager: 'PROPERTY_MANAGER',
            };

            const member = {
              id: data.user.id,
              name: data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || 'User',
              email: data.user.email || email, phone: '',
              role: roleMap[tenantUser.role] || ('BOARD_MEMBER' as Role),
              unit: tenantUser.unit || '', status: 'active' as const,
              joined: new Date().toISOString().split('T')[0],
              boardTitle: tenantUser.board_title || null,
            };

            addMember(member);
            login(member);

            const hostname = window.location.hostname;
            if (tenant?.subdomain && !hostname.startsWith(tenant.subdomain)) {
              const { data: sessionData } = await supabase.auth.getSession();
              const accessToken = sessionData?.session?.access_token || '';
              const refreshToken = sessionData?.session?.refresh_token || '';
              window.location.href = `https://${tenant.subdomain}.getonetwo.com/login?sb_access=${accessToken}&sb_refresh=${refreshToken}`;
              return;
            }

            setLoginLoading(false);
            return;
          }

          console.error('Your account is not linked to a building yet.');
          setLoginLoading(false);
          return;
        }
      } catch (err) {
        console.warn('Supabase login attempt failed:', err);
      }
      setLoginLoading(false);
    }

    // Fall back to demo store
    const isDemoEnabled = import.meta.env.VITE_DEMO_ENABLED === 'true';
    if (!isDemoEnabled) { console.error('No account found.'); return; }
    const member = buildingMembers.find(m => m.email.toLowerCase() === email.toLowerCase() && m.status === 'active');
    if (!member) { console.error('No account found.'); return; }
    login(member);
  };

  // ── Invite code handler ──
  const handleInviteCode = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code) return;

    if (isBackendEnabled && supabase) {
      setInviteLoading(true);
      try {
        const { data, error } = await supabase.rpc('validate_invite_code', { p_code: code });
        if (!error && data?.valid) {
          setInviteData(data);
          setAuthJoinRole(data.role === 'board_member' ? 'BOARD_MEMBER' : data.role === 'property_manager' ? 'PROPERTY_MANAGER' : data.role === 'staff' ? 'STAFF' : 'RESIDENT');
          setInviteLoading(false);
          return true;
        } else if (data?.error) {
          console.error(data.error);
          setInviteLoading(false);
          return false;
        }
      } catch (err) {
        console.warn('Invite check failed:', err);
      }
      setInviteLoading(false);
    }

    const inv = buildingInvites.find(i => i.code === code && i.status === 'pending');
    if (!inv) return false;
    setInviteMatch(inv);
    setAuthJoinRole(inv.role);
    return true;
  };

  // ── Signup handler (Screen 1: validates invite or goes to wizard) ──
  const handleSignup = async () => {
    if (!email) return;
    if (!password || password.length < 8) return;

    if (inviteCode.trim()) {
      const valid = await handleInviteCode();
      if (!valid) return;
      setAuthStep('confirm');
      return;
    }

    // Carry email/password into the wizard
    signup.set('email', email);
    signup.set('password', password);
    setAuthStep('building');
  };

  // ── Complete join for invite code users ──
  const handleCompleteJoin = async () => {
    if (!firstName || !lastName) return;
    if (!password || password.length < 8) return;
    const name = `${firstName.trim()} ${lastName.trim()}`;
    const finalEmail = email;

    if (inviteData?.valid && isBackendEnabled && supabase) {
      setSending(true);
      try {
        const { error: authError } = await supabase.auth.signUp({
          email: finalEmail, password, options: { data: { full_name: name } },
        });

        if (authError) {
          if (authError.message.includes('already registered')) {
            const { data: signIn } = await supabase.auth.signInWithPassword({ email: finalEmail, password });
            if (!signIn?.user) { console.error('Account exists. Please sign in.'); setSending(false); return; }
          } else { console.error(authError.message); setSending(false); return; }
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { console.error('Authentication failed'); setSending(false); return; }

        const { data: acceptResult, error: acceptErr } = await supabase.rpc('accept_invitation', {
          p_code: inviteCode.trim().toUpperCase(), p_user_id: user.id, p_name: name,
        });

        if (acceptErr || !acceptResult?.success) {
          console.error(acceptResult?.error || acceptErr?.message || 'Failed to accept invitation');
          setSending(false);
          return;
        }

        const member = {
          id: user.id, name, email: finalEmail, phone: '',
          role: (inviteData.role === 'board_member' ? 'BOARD_MEMBER' : inviteData.role === 'property_manager' ? 'PROPERTY_MANAGER' : inviteData.role === 'staff' ? 'STAFF' : 'RESIDENT') as Role,
          unit: inviteData.unit || '', status: 'active' as const,
          joined: new Date().toISOString().split('T')[0], boardTitle: null,
        };
        addMember(member);
        login(member);

        if (inviteData.subdomain) {
          const { data: sessionData } = await supabase.auth.getSession();
          const at = sessionData?.session?.access_token || '';
          const rt = sessionData?.session?.refresh_token || '';
          window.location.href = `https://${inviteData.subdomain}.getonetwo.com/login?sb_access=${at}&sb_refresh=${rt}`;
        }

        setSending(false);
        return;
      } catch (err: any) {
        console.error(err.message || 'Failed to join');
        setSending(false);
        return;
      }
    }

    // Demo fallback
    const newMember = {
      id: `user-${Date.now()}`, name, email: finalEmail, phone: '',
      role: (inviteMatch?.role || 'BOARD_MEMBER') as Role,
      unit: inviteMatch?.unit || '', status: 'active' as const,
      joined: new Date().toISOString().split('T')[0], boardTitle: null,
    };
    addMember(newMember);
    login(newMember);
  };

  // ── 3-step wizard: Start (creates auth user + calls chargebee-checkout) ──
  const handleStart = async () => {
    const s = signup.state;
    if (!s.email || !s.password || s.password.length < 8) return;

    if (!isBackendEnabled || !supabase) {
      // Demo fallback
      const name = `${s.firstName.trim()} ${s.lastName.trim()}`.trim() || 'Demo User';
      const newMember = {
        id: `user-${Date.now()}`, name, email: s.email, phone: '',
        role: 'BOARD_MEMBER' as Role, unit: '', status: 'active' as const,
        joined: new Date().toISOString().split('T')[0],
        boardTitle: s.roleKey ? BOARD_ROLE_LABELS[s.roleKey] : 'President',
      };
      addMember(newMember);
      login(newMember);
      return;
    }

    setCheckoutLoading(true);
    try {
      const fullName = `${s.firstName.trim()} ${s.lastName.trim()}`.trim();

      const { data: signUpData, error: authError } = await supabase.auth.signUp({
        email: s.email, password: s.password, options: { data: { full_name: fullName } },
      });

      let session = signUpData?.session ?? null;

      if (authError) {
        if (authError.message.includes('already registered')) {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email: s.email, password: s.password });
          if (signInError) {
            console.error('An account with this email already exists. Please sign in.');
            setCheckoutLoading(false);
            return;
          }
          session = signInData.session;
        } else { console.error(authError.message); setCheckoutLoading(false); return; }
      }

      if (!session) {
        // Fallback: read from local cache in case signUp set it asynchronously
        session = (await supabase.auth.getSession()).data.session;
      }
      if (!session) { console.error('Authentication failed.'); setCheckoutLoading(false); return; }

      const { data: existingTenant } = await supabase
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (existingTenant) {
        setAuthStep('login');
        setCheckoutLoading(false);
        return;
      }

      // Derive role/roleKey for the building payload
      const role = s.iAmRole === 'other' ? null : s.iAmRole;
      const roleKey = role === 'board_member' ? (s.roleKey || 'president') : null;
      const addressFlag = s.addressResult?.status || 'skip';

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chargebee-checkout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            plan: s.planPicker.plan,
            interval: s.planPicker.interval,
            onCall: s.planPicker.onCall,
            pmSeat: s.planPicker.pmSeat,
            setup: s.planPicker.setup,
            building: {
              name: s.buildingName,
              address: { street: s.addressResult?.fullAddress || s.addressQuery, city: '', state: 'DC', zip: '' },
              totalUnits: typeof s.totalUnits === 'number' ? s.totalUnits : 0,
              contactName: fullName,
              boardTitle: roleKey ? BOARD_ROLE_LABELS[roleKey] : undefined,
              marAddressId: s.addressResult?.marAddressId || null,
              ssl: s.addressResult?.ssl || null,
              ward: s.addressResult?.ward || null,
              // Extended fields for provision_tenant
              role,
              roleKey,
              firstName: s.firstName,
              lastName: s.lastName,
              addressFlag,
            },
          }),
        }
      );

      const data = await res.json();
      if (data.error) { console.error(data.error); setCheckoutLoading(false); return; }

      if (data.provisioned) {
        const fromDemo = new URLSearchParams(window.location.search).get('from') === 'demo';
        if (fromDemo && supabase) {
          supabase.rpc('link_demo_lead', { p_email: s.email.trim().toLowerCase() }).then(() => {}, () => {});
        }
        // Log in directly — session is already active, tenant_users row exists
        const roleMap: Record<string, Role> = { board_member: 'BOARD_MEMBER', resident: 'RESIDENT', property_manager: 'PROPERTY_MANAGER' };
        const memberRole = roleMap[role || 'board_member'] || ('BOARD_MEMBER' as Role);
        const m = {
          id: session.user.id,
          name: fullName || session.user.email?.split('@')[0] || 'User',
          email: s.email,
          phone: '',
          role: memberRole,
          unit: '',
          status: 'active' as const,
          joined: new Date().toISOString().split('T')[0],
          boardTitle: roleKey ? BOARD_ROLE_LABELS[roleKey] : 'President',
        };
        addMember(m);
        login(m);
        // LoginRoute will detect isAuthenticated and redirect to /dashboard
        setCheckoutLoading(false);
        return;
      }

      if (data.url) {
        const fromDemo = new URLSearchParams(window.location.search).get('from') === 'demo';
        if (fromDemo && supabase) {
          supabase.rpc('link_demo_lead', { p_email: s.email.trim().toLowerCase() }).then(() => {}, () => {});
        }
        sessionStorage.setItem('onetwo_checkout_tokens', JSON.stringify({
          access_token: session.access_token, refresh_token: session.refresh_token,
        }));
        window.location.href = data.url;
      } else {
        console.error('Failed to create checkout session');
        setCheckoutLoading(false);
      }
    } catch (err: any) {
      console.error(err.message || 'Checkout failed');
      setCheckoutLoading(false);
    }
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

  const isInviteFlow = !!(inviteData?.valid || inviteMatch);

  // ── 3-step wizard gets its own full-screen layout ──
  if (authStep === 'building') {
    return (
      <>
        <SignupLayout state={signup.state} trialDays={trialDays}>
          {signup.state.step === 'building' && (
            <SignupBuildingStep
              state={signup.state}
              set={signup.set}
              setAmenities={signup.setAmenities}
              canAdvance={signup.canAdvanceFromBuilding}
              onNext={signup.goNext}
            />
          )}

          {signup.state.step === 'plan' && (
            <SignupPlanStep
              state={signup.state}
              setPlanPicker={signup.setPlanPicker}
              trialDays={trialDays}
              canAdvance={signup.canAdvanceFromPlan}
              onNext={signup.goNext}
              onBack={signup.goBack}
            />
          )}

          {signup.state.step === 'account' && (
            <SignupAccountStep
              state={signup.state}
              set={signup.set}
              setPlanPicker={signup.setPlanPicker}
              canSubmit={signup.canSubmit}
              submitting={checkoutLoading}
              onSubmit={handleStart}
              onBack={signup.goBack}
            />
          )}
        </SignupLayout>

        {showLeadModal && (
          <DemoLeadModal
            onClose={(capturedEmail) => {
              setShowLeadModal(false);
              if (capturedEmail) setEmail(capturedEmail);
            }}
          />
        )}
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-ink-50 via-white to-mist-50 flex items-center justify-center overflow-y-auto py-8">
      <div className="w-full max-w-md mx-4">

        {/* ══════ SCREEN: LOGIN ══════ */}
        {authStep === 'login' && (
          <div className="bg-white rounded-2xl shadow-xl border border-ink-100 p-8">
            <Logo />
            {provisioningTimedOut && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                <p className="text-sm font-semibold text-amber-900 mb-1">Your building is still being set up</p>
                <p className="text-xs text-amber-700 mb-3">Payment was received but setup is taking longer than usual. Please sign in below.</p>
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
              <p className="text-sm text-ink-500">Don&apos;t have an account?{' '}<a onClick={() => setAuthStep('signup')} className="text-accent-600 font-semibold cursor-pointer hover:underline">Get Started</a></p>
            </div>
          </div>
        )}

        {/* ══════ SCREEN 1: GET STARTED (Signup) ══════ */}
        {authStep === 'signup' && (
          <div className="bg-white rounded-2xl shadow-xl border border-ink-100 p-8">
            <Logo />
            <h2 className="font-display text-lg font-bold text-ink-900 text-center mb-1">Get Started</h2>
            <p className="text-sm text-ink-400 text-center mb-6">Create your account in seconds</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-ink-200 rounded-xl text-sm" placeholder="you@example.com" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-ink-200 rounded-xl text-sm" placeholder="At least 8 characters"
                  onKeyDown={e => e.key === 'Enter' && !showInviteField && handleSignup()} />
              </div>

              {!showInviteField ? (
                <button onClick={() => setShowInviteField(true)}
                  className="text-sm text-accent-600 hover:text-accent-700 font-medium cursor-pointer">
                  Have an invite code?
                </button>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-1">Invitation Code</label>
                  <input value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())}
                    className="w-full px-4 py-3 border border-ink-200 rounded-xl text-sm font-mono tracking-wider text-center uppercase"
                    placeholder="SA-XXX-XXXX" maxLength={12}
                    onKeyDown={e => e.key === 'Enter' && handleSignup()} />
                </div>
              )}

              <button onClick={handleSignup} disabled={inviteLoading}
                className="w-full py-3.5 bg-ink-900 text-white rounded-xl font-semibold text-sm hover:bg-ink-800 disabled:opacity-50">
                {inviteLoading ? 'Validating...' : 'Get Started'}</button>

              <div className="flex items-center justify-between text-sm pt-1">
                <a onClick={() => setAuthStep('login')} className="text-ink-500 hover:text-ink-700 cursor-pointer">Already have an account? <span className="text-accent-600 font-semibold">Sign In</span></a>
              </div>
            </div>
            <p className="text-center text-xs text-ink-400 mt-5">By continuing, you agree to our Terms of Service and Privacy Policy.</p>
          </div>
        )}

        {/* ══════ SCREEN: CONFIRM (invite code users) ══════ */}
        {authStep === 'confirm' && isInviteFlow && (
          <div className="bg-white rounded-2xl shadow-xl border border-ink-100 p-8">
            <Logo />
            <h2 className="font-display text-lg font-bold text-ink-900 text-center mb-1">Create Your Account</h2>
            <p className="text-xs text-accent-600 text-center mb-4">
              Joining as {inviteData?.role === 'board_member' ? 'Board Member' : inviteData?.role === 'property_manager' ? 'Property Manager' : inviteMatch?.role === 'BOARD_MEMBER' ? 'Board Member' : inviteMatch?.role === 'PROPERTY_MANAGER' ? 'Property Manager' : 'Resident'}
              {(inviteData?.unit || inviteMatch?.unit) ? ` \u00B7 Unit ${inviteData?.unit || inviteMatch?.unit}` : ''}
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-ink-700 mb-1">First Name</label>
                  <input value={firstName} onChange={e => setFirstName(e.target.value)}
                    className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="First" autoFocus />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-700 mb-1">Last Name</label>
                  <input value={lastName} onChange={e => setLastName(e.target.value)}
                    className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="Last" />
                </div>
              </div>
              <button onClick={handleCompleteJoin} disabled={sending}
                className="w-full py-3 bg-ink-900 text-white rounded-xl font-semibold text-sm hover:bg-ink-800 disabled:opacity-50 mt-2">
                {sending ? 'Creating Account...' : 'Create Account & Enter'}</button>
            </div>
            <div className="mt-4 text-center">
              <a onClick={() => setAuthStep('signup')} className="text-sm text-ink-400 hover:text-ink-600 cursor-pointer">&larr; Back</a>
            </div>
          </div>
        )}

        {/* ══════ SCREEN: DEMO (direct entry — only if VITE_DEMO_ENABLED) ══════ */}
        {authStep === 'demo' && (
          <div className="bg-white rounded-2xl shadow-xl border border-ink-100 p-8">
            <Logo />
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-ink-300 border-t-ink-900 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-ink-400">Entering demo...</p>
            </div>
          </div>
        )}

      </div>

      {showLeadModal && (
        <DemoLeadModal
          onClose={(capturedEmail) => {
            setShowLeadModal(false);
            if (capturedEmail) setEmail(capturedEmail);
          }}
        />
      )}
    </div>
  );
}
