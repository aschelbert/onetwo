import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { supabase, isBackendEnabled } from '@/lib/supabase';
import type { Role } from '@/types/auth';

const Logo = () => (
  <div className="text-center mb-8">
    <svg className="w-14 h-14 mx-auto mb-4" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="4" fill="#3D3D3D" />
      <rect x="13.5" y="7" width="5" height="18" rx="1" fill="white" />
      <rect x="7" y="13.5" width="18" height="5" rx="1" fill="white" />
    </svg>
    <h1 className="font-display text-2xl font-bold text-ink-900">
      <span className="font-bold">ONE two</span> HOA
    </h1>
    <p className="text-sm text-ink-400 mt-1">HOA compliance made simple</p>
  </div>
);

const StepIndicator = ({ steps, current }: { steps: string[]; current: number }) => (
  <div className="flex items-center justify-center gap-2 mb-6">
    {steps.map((label, i) => (
      <div key={label} className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <div className={`w-7 h-7 rounded-full text-xs flex items-center justify-center font-bold ${
            i < current ? 'bg-sage-500 text-white' : i === current ? 'bg-ink-900 text-white' : 'bg-ink-200 text-ink-500'
          }`}>{i < current ? '✓' : i + 1}</div>
          <span className={`text-xs font-medium ${i <= current ? 'text-ink-900' : 'text-ink-400'}`}>{label}</span>
        </div>
        {i < steps.length - 1 && <div className="w-6 h-px bg-ink-200" />}
      </div>
    ))}
  </div>
);

type SubscriptionTier = 'essentials' | 'compliance_pro' | 'advanced_governance';

const TIERS: { id: SubscriptionTier; name: string; price: number; features: string[] }[] = [
  { id: 'essentials', name: 'Essentials', price: 49, features: ['Compliance runbook', 'Financial dashboard', 'Case management'] },
  { id: 'compliance_pro', name: 'Compliance Pro', price: 179, features: ['Everything in Essentials', 'AI Advisor', 'Document vault', 'Payment processing', 'Vendor management'] },
  { id: 'advanced_governance', name: 'Advanced Governance', price: 299, features: ['Everything in Pro', 'Votes & Resolutions', 'Community portal', 'Reserve study tools'] },
];

export default function AuthPage() {
  const { authStep, setAuthStep, setAuthJoinRole, authJoinRole, login, buildingMembers, buildingInvites, addMember } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteMatch, setInviteMatch] = useState<typeof buildingInvites[0] | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>('compliance_pro');

  // Profile form
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileUnit, setProfileUnit] = useState('');
  const [boardTitle, setBoardTitle] = useState('President');

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

  useEffect(() => {
    // Only auto-suggest if user hasn't manually edited the subdomain
    if (!bldgSubdomain || bldgSubdomain === sanitizeSubdomain(bldgName.slice(0, -1)) || bldgSubdomain === sanitizeSubdomain(bldgName + 'x')) {
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('create') === '1' && authStep === 'welcome') {
      setAuthStep('join-role');
    }
    if (params.get('provisioned') === '1') {
      setAuthStep('login');
    }
    // Auto-fill invite code from email link
    const urlInvite = params.get('invite');
    if (urlInvite) {
      setInviteCode(urlInvite.toUpperCase());
      setAuthStep('join-invite');
    }

    // Check for existing Supabase session (e.g. after password reset)
    if (isBackendEnabled && supabase && !params.get('sb_access') && !urlInvite) {
      (async () => {
        try {
          const { data: { session } } = await supabase!.auth.getSession();
          if (session?.user) {
            setLoginLoading(true);
            const { data: tu } = await supabase!
              .from('tenant_users')
              .select('tenant_id, role, board_title, unit')
              .eq('user_id', session.user.id)
              .maybeSingle();

            if (tu) {
              const roleMap: Record<string, Role> = { board_member: 'BOARD_MEMBER', resident: 'RESIDENT', property_manager: 'PROPERTY_MANAGER' };
              const m = {
                id: session.user.id,
                name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
                email: session.user.email || '',
                phone: '',
                role: roleMap[tu.role] || ('BOARD_MEMBER' as Role),
                unit: tu.unit || '',
                status: 'active' as const,
                joined: new Date().toISOString().split('T')[0],
                boardTitle: tu.board_title || null,
              };
              addMember(m);
              login(m);
              setLoginLoading(false);
              return;
            }
            setLoginLoading(false);
          }
        } catch (err) {
          console.warn('Session check failed:', err);
        }
      })();
    }

    // Restore Supabase session from redirect (subdomain handoff)
    const sbAccess = params.get('sb_access');
    const sbRefresh = params.get('sb_refresh');
    if (sbAccess && sbRefresh && isBackendEnabled && supabase) {
      (async () => {
        setLoginLoading(true);
        try {
          const { data, error } = await supabase.auth.setSession({
            access_token: sbAccess,
            refresh_token: sbRefresh,
          });
          if (!error && data.user) {
            // Clean URL
            window.history.replaceState({}, '', '/login');

            // Look up tenant user and log in
            const { data: tu } = await supabase!
              .from('tenant_users')
              .select('tenant_id, role, board_title, unit')
              .eq('user_id', data.user.id)
              .maybeSingle();

            if (tu) {
              const roleMap: Record<string, Role> = { board_member: 'BOARD_MEMBER', resident: 'RESIDENT', property_manager: 'PROPERTY_MANAGER' };
              const m = {
                id: data.user.id,
                name: data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || 'User',
                email: data.user.email || '',
                phone: '',
                role: roleMap[tu.role] || ('BOARD_MEMBER' as Role),
                unit: tu.unit || '',
                status: 'active' as const,
                joined: new Date().toISOString().split('T')[0],
                boardTitle: tu.board_title || null,
              };
              addMember(m);
              login(m);
            }
          }
        } catch (err) {
          console.warn('Session restore failed:', err);
        }
        setLoginLoading(false);
      })();
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

        if (!error && data.user) {
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

            // Redirect to tenant subdomain if on root domain
            const hostname = window.location.hostname;
            if (tenant?.subdomain && !hostname.startsWith(tenant.subdomain)) {
              // Pass session tokens so the subdomain can restore the auth state
              const { data: sessionData } = await supabase.auth.getSession();
              const accessToken = sessionData?.session?.access_token || '';
              const refreshToken = sessionData?.session?.refresh_token || '';
              window.location.href = `https://${tenant.subdomain}.getonetwo.com/login?sb_access=${accessToken}&sb_refresh=${refreshToken}`;
              return;
            }

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

    // Fall back to demo store
    const member = buildingMembers.find(
      (m) => m.email.toLowerCase() === email.toLowerCase() && m.status === 'active'
    );
    if (!member) { alert('No account found with that email.'); return; }
    if (member.role === 'PLATFORM_ADMIN' && password !== 'SuperCooperis9') { alert('Invalid password.'); return; }
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
          setAuthJoinRole(data.role === 'board_member' ? 'BOARD_MEMBER' : data.role === 'property_manager' ? 'PROPERTY_MANAGER' : 'RESIDENT');
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
    const name = `${firstName.trim()} ${lastName.trim()}`;
    const finalEmail = profileEmail || email;

    // If we have Supabase invite data, create auth user and accept invitation
    if (inviteData?.valid && isBackendEnabled && supabase) {
      setSending(true);
      try {
        // Sign up user
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: finalEmail,
          password: password || 'temp-' + Date.now(),
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
          role: (inviteData.role === 'board_member' ? 'BOARD_MEMBER' : inviteData.role === 'property_manager' ? 'PROPERTY_MANAGER' : 'RESIDENT') as Role,
          unit: inviteData.unit || profileUnit, status: 'active' as const,
          joined: new Date().toISOString().split('T')[0], boardTitle: null,
        };
        addMember(member);
        login(member);

        // Redirect to tenant subdomain
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
      id: `user-${Date.now()}`, name, email: finalEmail, phone: profilePhone,
      role: (inviteMatch?.role || authJoinRole) as Role,
      unit: inviteMatch?.unit || profileUnit, status: 'active' as const,
      joined: new Date().toISOString().split('T')[0], boardTitle: authJoinRole === 'BOARD_MEMBER' ? boardTitle : null,
    };
    addMember(newMember);
    login(newMember);
  };

  // Stripe Checkout — creates a checkout session and redirects
  const handleStripeCheckout = async () => {
    if (!isBackendEnabled || !supabase) {
      // Demo mode fallback — skip payment
      setAuthStep('board-building');
      return;
    }

    setCheckoutLoading(true);
    try {
      // First, sign up the user with Supabase Auth
      const signupEmail = profileEmail || email;
      if (!signupEmail) { alert('Please enter your email first.'); setCheckoutLoading(false); return; }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: signupEmail,
        password: password || 'temp-password-' + Date.now(), // Will be set properly later
      });

      if (authError) {
        // If user already exists, try signing in
        if (authError.message.includes('already registered')) {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: signupEmail,
            password: password,
          });
          if (signInError) { alert('Account exists. Please sign in instead.'); setCheckoutLoading(false); return; }
        } else {
          alert(authError.message); setCheckoutLoading(false); return;
        }
      }

      // Get the session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { alert('Authentication failed. Please try again.'); setCheckoutLoading(false); return; }

      // Call create-checkout Edge Function
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
            buildingName: bldgName,
            subdomain: bldgSubdomain,
            address: { street: bldgStreet, city: bldgCity, state: bldgState, zip: bldgZip },
            totalUnits: parseInt(bldgUnits) || 0,
            yearBuilt: '',
            contactName: `${firstName} ${lastName}`.trim(),
            contactPhone: profilePhone,
            boardTitle,
          }),
        }
      );

      const data = await res.json();
      if (data.error) { alert(data.error); setCheckoutLoading(false); return; }

      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert('Failed to create checkout session'); setCheckoutLoading(false);
      }
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
              <button onClick={() => setAuthStep('join-role')}
                className="w-full py-3.5 border-2 border-accent-500 text-accent-700 rounded-xl font-semibold text-sm hover:bg-accent-50 transition-all">Create Account</button>
            </div>
            <div className="mt-6 bg-gradient-to-br from-ink-900 to-ink-700 rounded-xl p-5 text-white">
              <p className="text-xs font-semibold text-accent-300 uppercase tracking-wide mb-2">Plans from</p>
              <div className="flex items-baseline gap-1 mb-3"><span className="text-3xl font-bold">$49</span><span className="text-ink-300">/month per building</span></div>
              <ul className="space-y-1.5 text-sm text-ink-200">
                <li className="flex items-center gap-2"><span className="text-sage-400">✓</span> Resident &amp; Board portals</li>
                <li className="flex items-center gap-2"><span className="text-sage-400">✓</span> Financial dashboard</li>
                <li className="flex items-center gap-2"><span className="text-sage-400">✓</span> Meeting management</li>
                <li className="flex items-center gap-2"><span className="text-sage-400">✓</span> Document library &amp; contacts</li>
              </ul>
              <button onClick={() => setAuthStep('join-role')}
                className="w-full mt-4 py-2.5 bg-accent-600 text-white rounded-lg text-sm font-semibold hover:bg-accent-700 transition-all">Start Free Trial →</button>
            </div>
            <p className="text-center text-xs text-ink-400 mt-5">By continuing, you agree to our Terms of Service and Privacy Policy.</p>
            <div className="border-t border-ink-100 mt-4 pt-4 flex items-center justify-center">
              <a href="/" className="text-xs text-accent-600 hover:text-accent-700 font-medium">← Back to website</a>
            </div>
          </div>
        )}

        {/* ══════ LOGIN ══════ */}
        {authStep === 'login' && (
          <div className="bg-white rounded-2xl shadow-xl border border-ink-100 p-8">
            <Logo />
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
              <p className="text-sm text-ink-500">Don&apos;t have an account?{' '}<a onClick={() => setAuthStep('join-role')} className="text-accent-600 font-semibold cursor-pointer hover:underline">Create one</a></p>
            </div>
          </div>
        )}

        {/* ══════ ROLE SELECTION ══════ */}
        {authStep === 'join-role' && (
          <div className="bg-white rounded-2xl shadow-xl border border-ink-100 p-8">
            <Logo />
            <h2 className="font-display text-lg font-bold text-ink-900 text-center mb-1">Create Your Account</h2>
            <p className="text-sm text-ink-400 text-center mb-6">What best describes you?</p>
            <div className="space-y-3">
              {[
                { role: 'RESIDENT' as const, icon: '🏠', label: 'Resident / Unit Owner', desc: 'I live in or own a unit — I have an invite code', bg: 'bg-accent-100', next: 'join-invite' as const },
                { role: 'BOARD_MEMBER' as const, icon: '📋', label: 'Board Member', desc: 'I serve on the board — join existing or set up new', bg: 'bg-sage-100', next: 'join-invite' as const },
                { role: 'PROPERTY_MANAGER' as const, icon: '🔧', label: 'Property Manager', desc: 'I manage buildings professionally', bg: 'bg-mist-100', next: 'join-invite' as const },
              ].map(({ role, icon, label, desc, bg, next }) => (
                <button key={role} onClick={() => { setAuthJoinRole(role); setAuthStep(next); }}
                  className="w-full p-4 border-2 border-ink-200 rounded-xl text-left hover:border-accent-400 hover:bg-accent-50 transition-all group">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center text-lg`}>{icon}</div>
                    <div><p className="font-semibold text-ink-900 text-sm">{label}</p><p className="text-xs text-ink-400">{desc}</p></div>
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-6 text-center"><a onClick={() => setAuthStep('welcome')} className="text-sm text-ink-400 hover:text-ink-600 cursor-pointer">← Back</a></div>
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
                <button onClick={() => setAuthStep('board-subscribe')}
                  className="px-6 py-2.5 bg-accent-600 text-white rounded-lg text-sm font-semibold hover:bg-accent-700">Subscribe & Create Building →</button>
              </div>
            ) : (
              <div className="bg-mist-50 border border-mist-200 rounded-xl p-5 text-center">
                <p className="text-sm font-semibold text-ink-900 mb-2">Don&apos;t have a code?</p>
                <p className="text-xs text-ink-500 mb-3">Ask your building&apos;s board or management company to invite you.</p>
                <button onClick={() => { setAuthJoinRole('BOARD_MEMBER'); setAuthStep('board-subscribe'); }}
                  className="px-5 py-2 bg-ink-900 text-white rounded-lg text-xs font-semibold hover:bg-ink-800">I&apos;m a board member — subscribe today</button>
              </div>
            )}
            <div className="mt-6 text-center"><a onClick={() => setAuthStep('join-role')} className="text-sm text-ink-400 hover:text-ink-600 cursor-pointer">← Back</a></div>
          </div>
        )}

        {/* ══════ JOIN — CREATE PROFILE (after valid invite) ══════ */}
        {authStep === 'join-create' && (
          <div className="bg-white rounded-2xl shadow-xl border border-ink-100 p-8">
            <Logo />
            <h2 className="font-display text-lg font-bold text-ink-900 text-center mb-1">Create Your Account</h2>
            {inviteMatch && (
              <p className="text-xs text-accent-600 text-center mb-4">
                Joining as {inviteMatch.role === 'BOARD_MEMBER' ? 'Board Member' : inviteMatch.role === 'PROPERTY_MANAGER' ? 'Property Manager' : 'Resident'}
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
                  <input type="password" className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="••••••••" /></div>
                <div><label className="block text-xs font-medium text-ink-700 mb-1">Confirm *</label>
                  <input type="password" className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="••••••••" /></div>
              </div>
              <button onClick={handleCompleteJoin}
                className="w-full py-3 bg-ink-900 text-white rounded-xl font-semibold text-sm hover:bg-ink-800 mt-2">Create Account & Enter</button>
            </div>
            <div className="mt-4 text-center"><a onClick={() => setAuthStep('join-invite')} className="text-sm text-ink-400 hover:text-ink-600 cursor-pointer">← Back</a></div>
          </div>
        )}

        {/* ══════ BOARD — SUBSCRIBE (Tier Selection) ══════ */}
        {authStep === 'board-subscribe' && (
          <div className="bg-white rounded-2xl shadow-xl border border-ink-100 p-8">
            <Logo />
            <StepIndicator steps={['Plan','Building','Profile & Pay']} current={0} />
            <h2 className="font-display text-lg font-bold text-ink-900 text-center mb-1">Choose Your Plan</h2>
            <p className="text-sm text-ink-400 text-center mb-6">30-day free trial on all plans. Cancel anytime.</p>
            <div className="space-y-3">
              {TIERS.map(tier => (
                <button key={tier.id} onClick={() => setSelectedTier(tier.id)}
                  className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                    selectedTier === tier.id ? 'border-accent-500 bg-accent-50' : 'border-ink-200 hover:border-ink-300'
                  }`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-bold text-ink-900">{tier.name}</p>
                    <p className="text-lg font-bold text-accent-600">${tier.price}<span className="text-xs font-normal text-ink-400">/mo</span></p>
                  </div>
                  <ul className="space-y-1">
                    {tier.features.map(f => (
                      <li key={f} className="text-xs text-ink-500 flex items-center gap-1.5">
                        <span className="text-sage-500">✓</span> {f}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
            <button onClick={() => setAuthStep('board-building')}
              className="w-full py-3.5 bg-accent-600 text-white rounded-xl font-semibold text-sm hover:bg-accent-700 mt-4">
              Continue with {TIERS.find(t => t.id === selectedTier)?.name} →
            </button>
            <div className="mt-4 text-center"><a onClick={() => setAuthStep('join-invite')} className="text-sm text-ink-400 hover:text-ink-600 cursor-pointer">← Back</a></div>
          </div>
        )}

        {/* ══════ BOARD — BUILDING INFO ══════ */}
        {authStep === 'board-building' && (
          <div className="bg-white rounded-2xl shadow-xl border border-ink-100 p-8">
            <Logo />
            <StepIndicator steps={['Plan','Building','Profile & Pay']} current={1} />
            <h2 className="font-display text-lg font-bold text-ink-900 text-center mb-4">Building Information</h2>
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Building / Association Name *</label>
                <input value={bldgName} onChange={e => setBldgName(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="e.g., Sunny Acres Condominium" /></div>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Building Short Name (URL) *</label>
                <div className="flex items-center gap-0">
                  <input value={bldgSubdomain}
                    onChange={e => setBldgSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20))}
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
                  {subdomainStatus === 'available' && bldgSubdomain.length >= 3 && <p className="text-xs text-sage-600">✓ {bldgSubdomain}.getonetwo.com is available</p>}
                  {subdomainStatus === 'taken' && <p className="text-xs text-red-600">✗ Already taken — try a different name</p>}
                  {subdomainStatus === 'idle' && bldgSubdomain.length > 0 && bldgSubdomain.length < 3 && <p className="text-xs text-ink-400">Must be at least 3 characters</p>}
                </div>
              </div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Street Address *</label>
                <input value={bldgStreet} onChange={e => setBldgStreet(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="123 Main St" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-xs font-medium text-ink-700 mb-1">City</label>
                  <input value={bldgCity} onChange={e => setBldgCity(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="City" /></div>
                <div><label className="block text-xs font-medium text-ink-700 mb-1">State</label>
                  <input value={bldgState} onChange={e => setBldgState(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="DC" maxLength={2} /></div>
                <div><label className="block text-xs font-medium text-ink-700 mb-1">ZIP</label>
                  <input value={bldgZip} onChange={e => setBldgZip(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="20001" /></div>
              </div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Total Units</label>
                <input value={bldgUnits} onChange={e => setBldgUnits(e.target.value)} type="number" className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="14" /></div>
              <button onClick={() => {
                  if (!bldgName) { alert('Please enter your building name.'); return; }
                  if (!bldgSubdomain || bldgSubdomain.length < 3) { alert('Please enter a short name (at least 3 characters) for your building URL.'); return; }
                  if (subdomainStatus === 'taken') { alert('That short name is already taken. Please choose another.'); return; }
                  if (subdomainStatus === 'checking') { alert('Still checking availability — please wait a moment.'); return; }
                  setAuthStep('board-profile');
                }}
                className="w-full py-3 bg-ink-900 text-white rounded-xl font-semibold text-sm hover:bg-ink-800 mt-2">Continue →</button>
            </div>
            <div className="mt-4 text-center"><a onClick={() => setAuthStep('board-subscribe')} className="text-sm text-ink-400 hover:text-ink-600 cursor-pointer">← Back</a></div>
          </div>
        )}

        {/* ══════ BOARD — PROFILE & CHECKOUT ══════ */}
        {authStep === 'board-profile' && (
          <div className="bg-white rounded-2xl shadow-xl border border-ink-100 p-8">
            <Logo />
            <StepIndicator steps={['Plan','Building','Profile & Pay']} current={2} />
            <h2 className="font-display text-lg font-bold text-ink-900 text-center mb-4">Your Profile</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-ink-700 mb-1">First Name *</label>
                  <input value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="First" /></div>
                <div><label className="block text-xs font-medium text-ink-700 mb-1">Last Name *</label>
                  <input value={lastName} onChange={e => setLastName(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="Last" /></div>
              </div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Email *</label>
                <input type="email" value={profileEmail} onChange={e => setProfileEmail(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="you@example.com" /></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Password *</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="••••••••" /></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Phone</label>
                <input value={profilePhone} onChange={e => setProfilePhone(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="(xxx) xxx-xxxx" /></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Your Unit # (optional)</label>
                <input value={profileUnit} onChange={e => setProfileUnit(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="e.g., 301" /></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Board Role</label>
                <select value={boardTitle} onChange={e => setBoardTitle(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm bg-white">
                  <option>President</option><option>Vice President</option><option>Treasurer</option><option>Secretary</option><option>Member at Large</option>
                </select></div>

              {/* Summary */}
              <div className="bg-mist-50 border border-mist-200 rounded-xl p-4 mt-2">
                <p className="text-xs font-semibold text-ink-400 uppercase mb-2">Order Summary</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-700">{TIERS.find(t => t.id === selectedTier)?.name}</span>
                  <span className="font-bold text-ink-900">${TIERS.find(t => t.id === selectedTier)?.price}/mo</span>
                </div>
                <div className="flex items-center justify-between text-xs text-ink-400 mt-1">
                  <span>{bldgName || 'Your building'}</span>
                  <span>30-day free trial</span>
                </div>
                {bldgSubdomain && <p className="text-xs text-ink-400 mt-1">URL: <span className="font-mono text-ink-600">{bldgSubdomain}.getonetwo.com</span></p>}
              </div>

              {isBackendEnabled ? (
                <button onClick={handleStripeCheckout} disabled={checkoutLoading}
                  className="w-full py-3.5 bg-accent-600 text-white rounded-xl font-semibold text-sm hover:bg-accent-700 mt-2 disabled:opacity-50">
                  {checkoutLoading ? 'Setting up...' : `Start Free Trial → Checkout`}
                </button>
              ) : (
                <button onClick={handleCompleteOnboarding}
                  className="w-full py-3 bg-accent-600 text-white rounded-xl font-semibold text-sm hover:bg-accent-700 mt-2">Create Account & Enter →</button>
              )}
              <p className="text-center text-[10px] text-ink-400">You&apos;ll be redirected to Stripe for secure payment. No charge during trial.</p>
            </div>
            <div className="mt-4 text-center"><a onClick={() => setAuthStep('board-building')} className="text-sm text-ink-400 hover:text-ink-600 cursor-pointer">← Back</a></div>
          </div>
        )}

      </div>
    </div>
  );
}

