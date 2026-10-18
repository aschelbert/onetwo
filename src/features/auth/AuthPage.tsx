import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { supabase, isBackendEnabled } from '@/lib/supabase';
import type { Role } from '@/types/auth';
import { TIERS, DEFAULT_TRIAL_DAYS, DEFAULT_BILLING_INTERVAL, describeTier, recommendTier } from '@/lib/tiers';
import type { ActiveTier, BuildingAmenity } from '@/lib/tiers';
import { Check } from 'lucide-react';

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
  const { authStep, setAuthStep, setAuthJoinRole, login, skipToDemo, buildingMembers, buildingInvites, addMember } = useAuthStore();

  // ── Core form state ──
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

  // ── Building form ──
  const [bldgName, setBldgName] = useState('');
  const [bldgSubdomain, setBldgSubdomain] = useState('');
  const [subdomainStatus, setSubdomainStatus] = useState<'idle'|'checking'|'available'|'taken'>('idle');
  const [bldgStreet, setBldgStreet] = useState('');
  const [bldgUnits, setBldgUnits] = useState<number | ''>('');
  const [bldgAmenities, setBldgAmenities] = useState<BuildingAmenity[]>([]);
  const [selectedTier, setSelectedTier] = useState<ActiveTier>('essentials');

  // ── UI state ──
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [provisioningStatus, setProvisioningStatus] = useState<string | null>(null);
  const [provisioningTimedOut, setProvisioningTimedOut] = useState(false);
  const [trialDays, setTrialDays] = useState(DEFAULT_TRIAL_DAYS);

  useEffect(() => {
    if (!supabase) return;
    supabase.rpc('get_trial_days').then(({ data }) => {
      if (typeof data === 'number' && data >= 0) setTrialDays(data);
    });
  }, []);

  // ── Subdomain auto-generation (silent) ──
  const sanitizeSubdomain = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);

  useEffect(() => {
    const suggested = sanitizeSubdomain(
      bldgName.replace(/\b(condominium|condos?|hoa|association|residences|towers|gardens|estates|the|of)\b/gi, '')
    );
    setBldgSubdomain(suggested);
  }, [bldgName]);

  // ── Subdomain availability check (silent) ──
  useEffect(() => {
    if (!bldgSubdomain || bldgSubdomain.length < 3 || !isBackendEnabled || !supabase) {
      setSubdomainStatus('idle');
      return;
    }
    setSubdomainStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const { data } = await supabase!
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

  // ── Session check on mount ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // ?demo=1 → skip directly to demo (no lead form)
    if (params.get('demo') === '1') {
      skipToDemo();
      return;
    }

    // ?create=1 → show signup screen
    if (params.get('create') === '1') {
      setAuthStep('signup');
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

      // Redirect to tenant subdomain if on root domain
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

    // Unified session check
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
                  await loginWithTenantUser(user, tu);
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

  // ── Login handler (preserved) ──
  const handleLogin = async () => {
    if (!email || !password) { alert('Please enter email and password.'); return; }

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
              board_member: 'BOARD_MEMBER',
              resident: 'RESIDENT',
              staff: 'STAFF',
              property_manager: 'PROPERTY_MANAGER',
            };

            const member = {
              id: data.user.id,
              name: data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || 'User',
              email: data.user.email || email,
              phone: '',
              role: roleMap[tenantUser.role] || ('BOARD_MEMBER' as Role),
              unit: tenantUser.unit || '',
              status: 'active' as const,
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

          alert('Your account is not linked to a building yet. Contact your building administrator.');
          setLoginLoading(false);
          return;
        }
      } catch (err) {
        console.warn('Supabase login attempt failed, trying demo:', err);
      }
      setLoginLoading(false);
    }

    // Fall back to demo store
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

  // ── Invite code handler (inline on signup screen) ──
  const handleInviteCode = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code) { alert('Please enter your invitation code.'); return; }

    if (isBackendEnabled && supabase) {
      setInviteLoading(true);
      try {
        const { data, error } = await supabase.rpc('validate_invite_code', { p_code: code });
        if (!error && data?.valid) {
          setInviteData(data);
          setAuthJoinRole(data.role === 'board_member' ? 'BOARD_MEMBER' : data.role === 'property_manager' ? 'PROPERTY_MANAGER' : data.role === 'staff' ? 'STAFF' : 'RESIDENT');
          setInviteLoading(false);
          return true; // valid
        } else if (data?.error) {
          alert(data.error);
          setInviteLoading(false);
          return false;
        }
      } catch (err) {
        console.warn('Supabase invite check failed, trying demo:', err);
      }
      setInviteLoading(false);
    }

    // Demo fallback
    const inv = buildingInvites.find(i => i.code === code && i.status === 'pending');
    if (!inv) { alert('Invalid or expired invitation code.'); return false; }
    setInviteMatch(inv);
    setAuthJoinRole(inv.role);
    return true;
  };

  // ── Signup handler (Screen 1 → creates auth user) ──
  const handleSignup = async () => {
    if (!email) { alert('Please enter your email.'); return; }
    if (!password || password.length < 6) { alert('Please enter a password (at least 6 characters).'); return; }

    // If invite code is entered, validate it first
    if (inviteCode.trim()) {
      const valid = await handleInviteCode();
      if (!valid) return;
      // Invite users skip building screen → go to confirm
      setAuthStep('confirm');
      return;
    }

    // New subscriber → go to building screen
    setAuthStep('building');
  };

  // ── Complete join for invite code users (on confirm screen) ──
  const handleCompleteJoin = async () => {
    if (!firstName || !lastName) { alert('Please enter your name.'); return; }
    if (!password || password.length < 6) { alert('Please enter a password (at least 6 characters).'); return; }
    const name = `${firstName.trim()} ${lastName.trim()}`;
    const finalEmail = email;

    if (inviteData?.valid && isBackendEnabled && supabase) {
      setSending(true);
      try {
        const { error: authError } = await supabase.auth.signUp({
          email: finalEmail,
          password: password,
          options: { data: { full_name: name } },
        });

        if (authError) {
          if (authError.message.includes('already registered')) {
            const { data: signIn } = await supabase.auth.signInWithPassword({ email: finalEmail, password });
            if (!signIn?.user) { alert('Account exists. Please sign in.'); setSending(false); return; }
          } else {
            alert(authError.message); setSending(false); return;
          }
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { alert('Authentication failed'); setSending(false); return; }

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
        alert(err.message || 'Failed to join');
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

  // ── Building screen → confirm screen ──
  const handleBuildingContinue = () => {
    if (!bldgName) { alert('Please enter your building name.'); return; }
    if (!bldgStreet.trim()) { alert('Please enter your building\'s street address.'); return; }
    if (!firstName || !lastName) { alert('Please enter your name.'); return; }
    if (subdomainStatus === 'taken') {
      // Auto-append a number to make it unique
      setBldgSubdomain(bldgSubdomain + Math.floor(Math.random() * 99));
    }
    setAuthStep('confirm');
  };

  // ── Stripe Checkout (simplified: Community Plus monthly only) ──
  const handleStripeCheckout = async () => {
    if (!isBackendEnabled || !supabase) {
      // Demo mode fallback — skip payment, enter app
      handleDemoOnboarding();
      return;
    }

    setCheckoutLoading(true);
    try {
      const signupEmail = email;
      if (!signupEmail) { alert('Please enter your email first.'); setCheckoutLoading(false); return; }
      if (!password || password.length < 6) { alert('Please enter a password (at least 6 characters).'); setCheckoutLoading(false); return; }

      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

      const { error: authError } = await supabase.auth.signUp({
        email: signupEmail,
        password: password,
        options: { data: { full_name: fullName } },
      });

      if (authError) {
        if (authError.message.includes('already registered')) {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: signupEmail,
            password: password,
          });
          if (signInError) {
            alert('An account with this email already exists. Please sign in with the correct password, or use a different email.');
            setCheckoutLoading(false);
            return;
          }
        } else {
          alert(authError.message); setCheckoutLoading(false); return;
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { alert('Authentication failed. Please try again.'); setCheckoutLoading(false); return; }

      // Check if user already has a tenant
      const { data: existingTenant } = await supabase
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (existingTenant) {
        alert('Your account is already set up. Redirecting to login...');
        setAuthStep('login');
        setCheckoutLoading(false);
        return;
      }

      const tier = TIERS.find(t => t.id === selectedTier)!;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            tier: selectedTier,
            priceId: tier.stripePriceMonthly,
            billingInterval: DEFAULT_BILLING_INTERVAL,
            buildingName: bldgName,
            subdomain: bldgSubdomain,
            address: { street: bldgStreet, city: '', state: '', zip: '' },
            totalUnits: typeof bldgUnits === 'number' ? bldgUnits : 0,
            yearBuilt: '',
            contactName: `${firstName} ${lastName}`.trim(),
            contactPhone: '',
            boardTitle: 'President',
            origin: window.location.origin,
          }),
        }
      );

      const data = await res.json();
      if (data.error) { alert(data.error); setCheckoutLoading(false); return; }

      if (data.url) {
        sessionStorage.setItem('onetwo_checkout_tokens', JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }));
        window.location.href = data.url;
      } else {
        alert('Failed to create checkout session'); setCheckoutLoading(false);
      }
    } catch (err: any) {
      alert(err.message || 'Checkout failed');
      setCheckoutLoading(false);
    }
  };

  // ── Demo mode onboarding (no Stripe) ──
  const handleDemoOnboarding = () => {
    const name = `${firstName.trim()} ${lastName.trim()}`.trim() || 'Demo User';
    const newMember = {
      id: `user-${Date.now()}`, name, email, phone: '',
      role: 'BOARD_MEMBER' as Role, unit: '', status: 'active' as const,
      joined: new Date().toISOString().split('T')[0], boardTitle: 'President',
    };
    addMember(newMember);
    login(newMember);
  };

  // ── "Explore First" — create account without payment ──
  const handleExploreFirst = async () => {
    if (isBackendEnabled && supabase) {
      setSending(true);
      try {
        const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
        const { error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });

        if (authError) {
          if (authError.message.includes('already registered')) {
            const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
            if (signInError) {
              alert('An account with this email already exists. Please sign in.');
              setSending(false);
              return;
            }
          } else {
            alert(authError.message); setSending(false); return;
          }
        }
        // In the real flow, "Explore First" enters the app in trial mode.
        // The tenant will be provisioned when they eventually set up payment.
        // For now, fall through to demo onboarding.
      } catch (err: any) {
        console.warn('Explore First signup failed, entering demo:', err);
      }
      setSending(false);
    }
    handleDemoOnboarding();
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

  // ── Is this an invite-code signup? (for confirm screen logic) ──
  const isInviteFlow = !!(inviteData?.valid || inviteMatch);

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
                  className="w-full px-4 py-3 border border-ink-200 rounded-xl text-sm" placeholder="At least 6 characters"
                  onKeyDown={e => e.key === 'Enter' && !showInviteField && handleSignup()} />
              </div>

              {/* Expandable invite code field */}
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
                <a onClick={() => skipToDemo()} className="text-accent-600 font-semibold cursor-pointer hover:underline">Try the Demo</a>
              </div>
            </div>
            <p className="text-center text-xs text-ink-400 mt-5">By continuing, you agree to our Terms of Service and Privacy Policy.</p>
          </div>
        )}

        {/* ══════ SCREEN 2: NAME YOUR BUILDING (new subscribers only) ══════ */}
        {authStep === 'building' && (() => {
          const unitVal = typeof bldgUnits === 'number' ? bldgUnits : 0;
          const recommended = recommendTier(unitVal, bldgAmenities);
          const amenityOptions: { id: BuildingAmenity; label: string }[] = [
            { id: 'elevator', label: 'Elevator' },
            { id: 'pool', label: 'Pool' },
            { id: 'gym', label: 'Gym' },
            { id: 'sport_court', label: 'Tennis / Sport Court' },
            { id: 'parking_garage', label: 'Parking Garage' },
            { id: 'roof_deck', label: 'Roof Deck' },
          ];
          const toggleAmenity = (a: BuildingAmenity) => {
            setBldgAmenities(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);
          };
          // Auto-update selected tier when recommendation changes
          if (selectedTier !== recommended && !(['board', 'estate'].includes(selectedTier) && recommended === 'essentials')) {
            // Only auto-select when user hasn't manually chosen a higher tier
          }
          return (
          <div className="bg-white rounded-2xl shadow-xl border border-ink-100 p-8">
            <Logo />
            <h2 className="font-display text-lg font-bold text-ink-900 text-center mb-1">Name Your Building</h2>
            <p className="text-sm text-ink-400 text-center mb-6">Tell us about your building to get started</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Building / Association Name</label>
                <input value={bldgName} onChange={e => setBldgName(e.target.value)}
                  className="w-full px-4 py-3 border border-ink-200 rounded-xl text-sm" placeholder="e.g., Sunny Acres Condominium" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Street Address</label>
                <input value={bldgStreet} onChange={e => setBldgStreet(e.target.value)}
                  className="w-full px-4 py-3 border border-ink-200 rounded-xl text-sm" placeholder="123 Main St" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">How many units?</label>
                <input type="number" min={1} value={bldgUnits} onChange={e => {
                  const v = e.target.value === '' ? '' : parseInt(e.target.value) || 0;
                  setBldgUnits(v);
                  if (typeof v === 'number') {
                    setSelectedTier(recommendTier(v, bldgAmenities));
                  }
                }}
                  className="w-full px-4 py-3 border border-ink-200 rounded-xl text-sm" placeholder="e.g., 12" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Which of these does your building have?</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {amenityOptions.map(a => (
                    <button key={a.id} type="button"
                      onClick={() => {
                        const next = bldgAmenities.includes(a.id) ? bldgAmenities.filter(x => x !== a.id) : [...bldgAmenities, a.id];
                        setBldgAmenities(next);
                        const uv = typeof bldgUnits === 'number' ? bldgUnits : 0;
                        setSelectedTier(recommendTier(uv, next));
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        bldgAmenities.includes(a.id)
                          ? 'bg-accent-50 border-accent-400 text-accent-700'
                          : 'bg-white border-ink-200 text-ink-600 hover:border-ink-300'
                      }`}>
                      {a.label}
                    </button>
                  ))}
                  <button type="button"
                    onClick={() => { setBldgAmenities([]); setSelectedTier(recommendTier(typeof bldgUnits === 'number' ? bldgUnits : 0, [])); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      bldgAmenities.length === 0
                        ? 'bg-ink-100 border-ink-300 text-ink-700'
                        : 'bg-white border-ink-200 text-ink-600 hover:border-ink-300'
                    }`}>
                    None
                  </button>
                </div>
              </div>

              {/* Plan recommendation */}
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-2">Recommended plan</label>
                <div className="space-y-2">
                  {TIERS.map(tier => {
                    const isRec = tier.id === recommended;
                    const isSel = tier.id === selectedTier;
                    const features = describeTier(tier.id).slice(0, 4);
                    return (
                      <button key={tier.id} type="button"
                        onClick={() => setSelectedTier(tier.id)}
                        className={`w-full p-3 rounded-xl border-2 text-left transition-all ${
                          isSel ? 'border-accent-500 bg-accent-50' : 'border-ink-200 hover:border-ink-300'
                        }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-ink-900 text-sm">{tier.name}</p>
                            {isRec && <span className="text-[10px] bg-accent-100 text-accent-700 px-1.5 py-0.5 rounded font-semibold">Recommended</span>}
                          </div>
                          <p className="text-sm font-bold text-accent-600">${tier.monthly}<span className="text-xs font-normal text-ink-400">/mo</span></p>
                        </div>
                        {isSel && features.length > 0 && (
                          <ul className="mt-1.5 space-y-0.5">
                            {features.map((f, i) => (
                              <li key={i} className="text-xs text-ink-500 flex items-start gap-1.5">
                                <Check className="w-3 h-3 text-sage-500 mt-0.5 flex-shrink-0" />
                                {f}
                              </li>
                            ))}
                          </ul>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-1">First Name</label>
                  <input value={firstName} onChange={e => setFirstName(e.target.value)}
                    className="w-full px-4 py-3 border border-ink-200 rounded-xl text-sm" placeholder="First" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-1">Last Name</label>
                  <input value={lastName} onChange={e => setLastName(e.target.value)}
                    className="w-full px-4 py-3 border border-ink-200 rounded-xl text-sm" placeholder="Last" />
                </div>
              </div>
              <button onClick={handleBuildingContinue}
                className="w-full py-3.5 bg-ink-900 text-white rounded-xl font-semibold text-sm hover:bg-ink-800">
                Continue</button>
            </div>
            <div className="mt-4 text-center">
              <a onClick={() => setAuthStep('signup')} className="text-sm text-ink-400 hover:text-ink-600 cursor-pointer">&larr; Back</a>
            </div>
          </div>
          );
        })()}

        {/* ══════ SCREEN 3: YOU'RE IN (Confirmation + soft payment ask) ══════ */}
        {authStep === 'confirm' && (
          <div className="bg-white rounded-2xl shadow-xl border border-ink-100 p-8">
            <Logo />

            {isInviteFlow ? (
              /* ── Invite code user: collect name, then enter app ── */
              <>
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
              </>
            ) : (
              /* ── New subscriber: welcome + soft payment ask ── */
              <>
                {/* Checkmark animation */}
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 rounded-full bg-sage-100 flex items-center justify-center">
                    <svg className="w-8 h-8 text-sage-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
                <h2 className="font-display text-xl font-bold text-ink-900 text-center mb-1">
                  Welcome to {bldgName || 'your building'}
                </h2>
                <p className="text-sm text-ink-400 text-center mb-6">
                  Your {trialDays}-day free trial is active
                </p>

                <div className="space-y-3">
                  <button onClick={handleStripeCheckout} disabled={checkoutLoading}
                    className="w-full py-3.5 bg-accent-600 text-white rounded-xl font-semibold text-sm hover:bg-accent-700 disabled:opacity-50">
                    {checkoutLoading ? 'Setting up...' : 'Set Up Payment'}</button>

                  <button onClick={handleExploreFirst} disabled={sending}
                    className="w-full py-3.5 border-2 border-ink-200 text-ink-700 rounded-xl font-semibold text-sm hover:bg-ink-50 disabled:opacity-50">
                    {sending ? 'Setting up...' : 'Explore First \u2192'}</button>
                </div>

                <p className="text-center text-xs text-ink-400 mt-4">
                  You can set up payment anytime in Settings
                </p>
              </>
            )}
          </div>
        )}

        {/* ══════ SCREEN: DEMO (direct entry) ══════ */}
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
    </div>
  );
}
