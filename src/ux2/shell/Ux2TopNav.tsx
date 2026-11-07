import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, X } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { usePlatformAdminStore } from '@/store/usePlatformAdminStore';
import { useTenantContext } from '@/components/TenantProvider';
import { getNavigationForRole, navigation } from '@/lib/rolePermissions';
import { getInitials, cn } from '@/lib/formatters';
import { ROLE_LABELS, type Role } from '@/types/auth';
import SyncIndicator from '@/components/shared/SyncIndicator';
import { activeModule, legacyExtras, meMenu, modulesForRole } from './nav';

/**
 * The redesign's top bar: logo, the five-module pill nav, tenant and role,
 * sync state, the admin role preview and the avatar menu. Same data as the
 * production TopNav; only the layout and order follow the design.
 */
export default function Ux2TopNav() {
  const { currentUser, currentRole, switchRole, isAdminPreview, signOut } = useAuthStore();
  const permissions = usePlatformAdminStore(s => s.permissions);
  const tenant = useTenantContext();
  const location = useLocation();
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const legacyNav = permissions.length > 0
    ? getNavigationForRole(currentRole, permissions, tenant.features)
    : navigation[currentRole] ?? [];
  const modules = modulesForRole(currentRole, legacyNav);
  const extras = legacyExtras(legacyNav);
  const active = activeModule(location.pathname, modules);
  const menu = meMenu(currentRole, tenant.isDemo);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);
  useEffect(() => { setMobileOpen(false); setMenuOpen(false); }, [location.pathname]);

  const goTo = (path: string) => { setMenuOpen(false); setMobileOpen(false); navigate(path); };

  return (
    <header className="ux2 sticky top-0 z-50 bg-white">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-4 px-6 pt-[22px] pb-3">
        <button type="button" aria-label="ONE two home" onClick={() => goTo('/home')} className="flex h-[46px] items-center">
          <img src="/onetwo-mark.webp" alt="ONE two" className="h-11 w-[46px] object-contain" />
        </button>
        <button
          type="button"
          className="rounded-full border border-ux2-line-strong p-2 text-ink-700 min-[1080px]:hidden"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMobileOpen(o => !o)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <div className="flex-1" />

        <nav aria-label="Primary" className="hidden items-center gap-0.5 rounded-full border border-ux2-line bg-ux2-surface p-[3px] min-[1080px]:flex">
          {modules.map(m => {
            const on = active === m.id;
            return (
              <button
                key={m.id}
                type="button"
                aria-current={on ? 'page' : undefined}
                onClick={() => goTo(m.path)}
                className={cn('flex h-11 items-center rounded-full px-5 text-sm transition-colors', on ? 'bg-ux2-navy text-white' : 'text-ink-700 hover:bg-white')}
              >
                {m.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <SyncIndicator />
          <span className="hidden text-[13px] text-ux2-muted sm:inline">{tenant.name} · {ROLE_LABELS[currentRole]}</span>
          {isAdminPreview && (
            <select
              aria-label="Preview as role"
              value={currentRole}
              onChange={e => { switchRole(e.target.value as Role); navigate('/home'); }}
              className="hidden h-9 rounded-full border border-ux2-line-strong bg-white px-3 text-xs text-ink-700 sm:block"
            >
              {(Object.keys(ROLE_LABELS) as Role[])
                .filter(r => r !== 'PLATFORM_ADMIN' && r !== 'PM_COMPANY')
                .map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          )}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label="Me"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(o => !o)}
              className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-ux2-navy text-[13px] font-bold text-white"
            >
              {getInitials(currentUser.name)}
            </button>
            {menuOpen && (
              <div role="menu" aria-label="Me" className="absolute right-0 top-full z-50 mt-2 w-72 rounded-[14px] border border-ux2-line bg-white p-2 shadow-[0_14px_36px_rgba(13,27,46,.14)]">
                <div className="px-2.5 pb-2 pt-1.5">
                  <p className="text-[15px] font-semibold leading-tight text-ux2-ink">{currentUser.name}</p>
                  <p className="mt-0.5 text-xs text-ux2-muted">{ROLE_LABELS[currentRole]} · {tenant.name}</p>
                </div>
                <div className="mx-1.5 my-1 h-px bg-ux2-line" />
                {menu.map(item => (
                  <button key={item.id} type="button" role="menuitem" onClick={() => goTo(item.path)} className="flex min-h-[44px] w-full items-center rounded-[10px] px-2.5 text-left text-sm font-medium text-ux2-ink hover:bg-ux2-surface">
                    {item.label}
                  </button>
                ))}
                {extras.length > 0 && (
                  <>
                    <div className="mx-1.5 my-1 h-px bg-ux2-line" />
                    {extras.map(item => (
                      <button key={item.id} type="button" role="menuitem" onClick={() => goTo(item.path)} className="flex min-h-[44px] w-full items-center justify-between rounded-[10px] px-2.5 text-left text-sm text-ux2-ink hover:bg-ux2-surface">
                        <span>{item.label}</span>
                        <span className="text-[11px] text-ux2-dim">moving soon</span>
                      </button>
                    ))}
                  </>
                )}
                <div className="mx-1.5 my-1 h-px bg-ux2-line" />
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); signOut(); navigate('/login'); }} className="flex min-h-[44px] w-full items-center gap-2 rounded-[10px] px-2.5 text-left text-sm font-semibold text-ux2-red-ink hover:bg-ux2-red-tint">
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-ux2-line px-4 py-3 min-[1080px]:hidden">
          <div className="flex flex-col gap-1">
            {modules.map(m => {
              const on = active === m.id;
              return (
                <button key={m.id} type="button" onClick={() => goTo(m.path)} className={cn('flex h-11 items-center rounded-full px-4 text-sm font-medium', on ? 'bg-ux2-navy text-white' : 'text-ink-700 hover:bg-ux2-surface')}>
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
