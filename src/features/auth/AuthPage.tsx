import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
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

export default function AuthPage() {
  const { authStep, setAuthStep, setAuthJoinRole, authJoinRole, skipToDemo, login, buildingMembers, buildingInvites, addMember } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteMatch, setInviteMatch] = useState<typeof buildingInvites[0] | null>(null);

  // Profile form
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileUnit, setProfileUnit] = useState('');
  const [boardTitle, setBoardTitle] = useState('President');

  // Building form
  const [bldgName, setBldgName] = useState('');
  const [bldgStreet, setBldgStreet] = useState('');
  const [bldgCity, setBldgCity] = useState('');
  const [bldgState, setBldgState] = useState('');
  const [bldgZip, setBldgZip] = useState('');
  const [bldgUnits, setBldgUnits] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('create') === '1' && authStep === 'welcome') {
      setAuthStep('join-role');
    }
  }, []);

  const handleLogin = () => {
    const member = buildingMembers.find(
      (m) => m.email.toLowerCase() === email.toLowerCase() && m.status === 'active'
    );
    if (!member) { alert('No account found with that email.'); return; }
    if (!password) { alert('Please enter your password.'); return; }
    if (member.role === 'PLATFORM_ADMIN' && password !== 'SuperCooperis9') { alert('Invalid password.'); return; }
    login(member);
  };

  const handleInviteCode = () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code) { alert('Please enter your invitation code.'); return; }
    const inv = buildingInvites.find(i => i.code === code && i.status === 'pending');
    if (!inv) { alert('Invalid or expired invitation code.'); return; }
    setInviteMatch(inv);
    setAuthJoinRole(inv.role);
    setProfileEmail(inv.email);
    setProfileUnit(inv.unit || '');
    setAuthStep('join-create');
  };

  const handleCompleteJoin = () => {
    if (!firstName || !lastName) { alert('Please enter your name.'); return; }
    const name = `${firstName.trim()} ${lastName.trim()}`;
    const finalEmail = profileEmail || email;
    const newMember = {
      id: `user-${Date.now()}`, name, email: finalEmail, phone: profilePhone,
      role: (inviteMatch?.role || authJoinRole) as Role,
      unit: inviteMatch?.unit || profileUnit, status: 'active' as const,
      joined: new Date().toISOString().split('T')[0], boardTitle: authJoinRole === 'BOARD_MEMBER' ? boardTitle : null,
    };
    addMember(newMember);
    login(newMember);
  };

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
            <div className="border-t border-ink-100 mt-4 pt-4 flex items-center justify-between">
              <a href="/index-landing.html" className="text-xs text-accent-600 hover:text-accent-700 font-medium">← Back to website</a>
              <button onClick={skipToDemo} className="text-xs text-ink-300 hover:text-ink-500 cursor-pointer">Skip to demo →</button>
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
              <button onClick={handleLogin} className="w-full py-3.5 bg-ink-900 text-white rounded-xl font-semibold text-sm hover:bg-ink-800">Sign In</button>
              <p className="text-center text-xs text-ink-400"><a className="text-accent-600 hover:underline cursor-pointer">Forgot password?</a></p>
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
              <p className="text-center text-xs text-ink-400">Demo codes: <span className="font-mono text-ink-600">SA-BRD-7X4K</span> or <span className="font-mono text-ink-600">SA-RES-9M2P</span></p>
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

        {/* ══════ BOARD — SUBSCRIBE ══════ */}
        {authStep === 'board-subscribe' && (
          <div className="bg-white rounded-2xl shadow-xl border border-ink-100 p-8">
            <Logo />
            <StepIndicator steps={['Subscribe','Building','Profile']} current={0} />
            <h2 className="font-display text-lg font-bold text-ink-900 text-center mb-1">Subscribe to <span className="font-bold">ONE two</span></h2>
            <p className="text-sm text-ink-400 text-center mb-6">Start managing your building with confidence</p>
            <div className="bg-gradient-to-br from-ink-900 to-ink-700 rounded-xl p-6 text-white mb-6">
              <div className="flex items-baseline gap-1 mb-3"><span className="text-3xl font-bold">$49</span><span className="text-ink-300">/month per building</span></div>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2"><span className="text-sage-400">✓</span> Full compliance runbook & tracking</li>
                <li className="flex items-center gap-2"><span className="text-sage-400">✓</span> Financial management & GL</li>
                <li className="flex items-center gap-2"><span className="text-sage-400">✓</span> Case management with legal guides</li>
                <li className="flex items-center gap-2"><span className="text-sage-400">✓</span> Unlimited users & units</li>
              </ul>
            </div>
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Card Number</label>
                <input className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="4242 4242 4242 4242" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-ink-700 mb-1">Expiry</label>
                  <input className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="MM / YY" /></div>
                <div><label className="block text-xs font-medium text-ink-700 mb-1">CVC</label>
                  <input className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="123" /></div>
              </div>
              <button onClick={() => setAuthStep('board-building')}
                className="w-full py-3.5 bg-accent-600 text-white rounded-xl font-semibold text-sm hover:bg-accent-700">Subscribe — $49/mo →</button>
            </div>
            <div className="mt-4 text-center"><a onClick={() => setAuthStep('join-invite')} className="text-sm text-ink-400 hover:text-ink-600 cursor-pointer">← Back</a></div>
          </div>
        )}

        {/* ══════ BOARD — BUILDING INFO ══════ */}
        {authStep === 'board-building' && (
          <div className="bg-white rounded-2xl shadow-xl border border-ink-100 p-8">
            <Logo />
            <StepIndicator steps={['Subscribe','Building','Profile']} current={1} />
            <h2 className="font-display text-lg font-bold text-ink-900 text-center mb-4">Building Information</h2>
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Building / Association Name *</label>
                <input value={bldgName} onChange={e => setBldgName(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="e.g., Sunny Acres Condominium" /></div>
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
              <button onClick={() => setAuthStep('board-profile')}
                className="w-full py-3 bg-ink-900 text-white rounded-xl font-semibold text-sm hover:bg-ink-800 mt-2">Continue →</button>
            </div>
            <div className="mt-4 text-center"><a onClick={() => setAuthStep('board-subscribe')} className="text-sm text-ink-400 hover:text-ink-600 cursor-pointer">← Back</a></div>
          </div>
        )}

        {/* ══════ BOARD — PROFILE ══════ */}
        {authStep === 'board-profile' && (
          <div className="bg-white rounded-2xl shadow-xl border border-ink-100 p-8">
            <Logo />
            <StepIndicator steps={['Subscribe','Building','Profile']} current={2} />
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
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Phone</label>
                <input value={profilePhone} onChange={e => setProfilePhone(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="(xxx) xxx-xxxx" /></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Your Unit # (optional)</label>
                <input value={profileUnit} onChange={e => setProfileUnit(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="e.g., 301" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-ink-700 mb-1">Password *</label>
                  <input type="password" className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="••••••••" /></div>
                <div><label className="block text-xs font-medium text-ink-700 mb-1">Confirm *</label>
                  <input type="password" className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm" placeholder="••••••••" /></div>
              </div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Board Role</label>
                <select value={boardTitle} onChange={e => setBoardTitle(e.target.value)} className="w-full px-3 py-2.5 border border-ink-200 rounded-lg text-sm bg-white">
                  <option>President</option><option>Vice President</option><option>Treasurer</option><option>Secretary</option><option>Member at Large</option>
                </select></div>
              <button onClick={handleCompleteOnboarding}
                className="w-full py-3 bg-accent-600 text-white rounded-xl font-semibold text-sm hover:bg-accent-700 mt-2">Create Account & Enter →</button>
            </div>
            <div className="mt-4 text-center"><a onClick={() => setAuthStep('board-building')} className="text-sm text-ink-400 hover:text-ink-600 cursor-pointer">← Back</a></div>
          </div>
        )}

      </div>
    </div>
  );
}

