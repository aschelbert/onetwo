import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { usePlatformAdminStore } from '@/store/usePlatformAdminStore';
import { useTenantContext } from '@/components/TenantProvider';
import { getNavigationForRole, navigation } from '@/lib/rolePermissions';
import { getInitials } from '@/lib/formatters';
import { ROLE_LABELS, type Role } from '@/types/auth';
import {
  ChevronDown,
  User,
  Home,
  Users,
  HelpCircle,
  LogOut,
  CreditCard,
  Menu,
  X,
} from 'lucide-react';

export default function TopNav() {
  const { currentUser, currentRole, switchRole, isAdminPreview, signOut } = useAuthStore();
  const permissions = usePlatformAdminStore(s => s.permissions);
  const tenant = useTenantContext();
  const location = useLocation();
  const navigate = useNavigate();

  const [avatarOpen, setAvatarOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

  // Build nav items (same logic as old Sidebar)
  const navItems = permissions.length > 0
    ? getNavigationForRole(currentRole, permissions, tenant.features)
    : navigation[currentRole];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  // Close avatar dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) setAvatarOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const goTo = (path: string) => {
    setAvatarOpen(false);
    setMobileOpen(false);
    navigate(path);
  };

  return (
    <nav className="bg-navy sticky top-0 z-50" style={{ height: 58 }}>
      <div className="h-full px-4 sm:px-6 flex items-center justify-between">
        {/* Left: Logo + hamburger (mobile) */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="cursor-pointer" onClick={() => goTo('/dashboard')}>
            <img src="/onetwo-logo-mark.jpg" alt="ONE two" className="w-8 h-8 rounded object-cover" />
          </div>
          <button
            className="min-[1080px]:hidden text-white/70 hover:text-white p-1.5"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Center (>=1080px): Horizontal nav links */}
        <div className="hidden min-[1080px]:flex items-center gap-1 mx-6">
          {navItems.filter(i => !i.separator).map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.id}
                onClick={() => goTo(item.path)}
                className={`relative px-3 py-2 text-sm font-medium rounded transition-colors ${
                  active
                    ? 'text-white'
                    : 'text-white/[0.48] hover:text-white/[0.72]'
                }`}
              >
                {item.label}
                {active && (
                  <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-brand-cyan rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Tenant name + role (hidden on small) */}
          <div className="hidden sm:block text-right">
            <p className="text-sm font-medium text-white leading-tight">{tenant.name}</p>
            <p className="text-[11px] text-white/50">{ROLE_LABELS[currentRole]}</p>
          </div>

          {/* Admin preview role selector */}
          {isAdminPreview && (
            <select
              value={currentRole}
              onChange={(e) => {
                switchRole(e.target.value as Role);
                navigate('/dashboard');
              }}
              className="hidden sm:block text-xs bg-navy-800 text-white border border-white/20 rounded px-2 py-1"
            >
              {(Object.keys(ROLE_LABELS) as Role[])
                .filter(r => r !== 'PLATFORM_ADMIN' && r !== 'PM_COMPANY')
                .map((role) => (
                  <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                ))}
            </select>
          )}

          {/* Avatar dropdown */}
          <div className="relative" ref={avatarRef}>
            <button
              onClick={() => setAvatarOpen(!avatarOpen)}
              className="flex items-center gap-1.5 group"
            >
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold group-hover:bg-white/30 transition-colors">
                {getInitials(currentUser.name)}
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-white/50 group-hover:text-white/70 transition-transform ${
                  avatarOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {avatarOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-ink-100 py-2 z-50">
                <div className="px-4 py-2.5 border-b border-ink-100">
                  <p className="text-sm font-semibold text-ink-900">{currentUser.name}</p>
                  <p className="text-xs text-ink-400">{currentUser.email}</p>
                </div>
                <button onClick={() => goTo('/account')} className="w-full text-left px-4 py-2.5 text-sm text-ink-700 hover:bg-mist-50 flex items-center gap-3">
                  <User className="w-4 h-4 text-ink-400" /> My Account
                </button>
                <button onClick={() => goTo('/my-unit')} className="w-full text-left px-4 py-2.5 text-sm text-ink-700 hover:bg-mist-50 flex items-center gap-3">
                  <Home className="w-4 h-4 text-ink-400" /> My Unit
                </button>
                {(currentRole === 'BOARD_MEMBER' || currentRole === 'PROPERTY_MANAGER') && (
                  <button onClick={() => goTo('/admin/users')} className="w-full text-left px-4 py-2.5 text-sm text-ink-700 hover:bg-mist-50 flex items-center gap-3">
                    <Users className="w-4 h-4 text-ink-400" /> User Management
                  </button>
                )}
                {currentRole === 'BOARD_MEMBER' && !tenant.isDemo && (
                  <button onClick={() => goTo('/subscription')} className="w-full text-left px-4 py-2.5 text-sm text-ink-700 hover:bg-mist-50 flex items-center gap-3">
                    <CreditCard className="w-4 h-4 text-ink-400" /> Subscription
                  </button>
                )}
                <button onClick={() => goTo('/support')} className="w-full text-left px-4 py-2.5 text-sm text-ink-700 hover:bg-mist-50 flex items-center gap-3">
                  <HelpCircle className="w-4 h-4 text-ink-400" /> Help & Support
                </button>
                <div className="border-t border-ink-100 mt-1 pt-1">
                  <button
                    onClick={() => { setAvatarOpen(false); signOut(); navigate('/login'); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3"
                  >
                    <LogOut className="w-4 h-4 text-red-400" /> Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile dropdown overlay */}
      {mobileOpen && (
        <div className="min-[1080px]:hidden absolute top-[58px] left-0 right-0 bg-navy border-t border-white/10 shadow-lg z-40">
          <div className="px-4 py-3 space-y-1">
            {navItems.filter(i => !i.separator).map((item) => {
              const active = isActive(item.path);
              return (
                <button
                  key={item.id}
                  onClick={() => goTo(item.path)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'text-white bg-white/10'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
            {/* Mobile admin preview role selector */}
            {isAdminPreview && (
              <div className="pt-2 mt-2 border-t border-white/10">
                <label className="block text-xs text-white/50 mb-1 px-3">View As:</label>
                <select
                  value={currentRole}
                  onChange={(e) => {
                    switchRole(e.target.value as Role);
                    setMobileOpen(false);
                    navigate('/dashboard');
                  }}
                  className="w-full text-sm bg-navy-800 text-white border border-white/20 rounded-lg px-3 py-2"
                >
                  {(Object.keys(ROLE_LABELS) as Role[])
                    .filter(r => r !== 'PLATFORM_ADMIN' && r !== 'PM_COMPANY')
                    .map((role) => (
                      <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                    ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
