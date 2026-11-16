import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, ChevronDown, LogOut, Plus } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { usePlatformAdminStore } from '@/store/usePlatformAdminStore';
import { useTenantContext } from '@/components/TenantProvider';
import { getNavigationForRole, navigation } from '@/lib/rolePermissions';
import { getInitials, cn } from '@/lib/formatters';
import { ROLE_LABELS, type Role } from '@/types/auth';
import SyncIndicator from '@/components/shared/SyncIndicator';
import { activeModule, legacyExtras, meMenu, modulesForRole } from './nav';
import { ROOT_DOMAIN, isEnvironmentHost } from '@/lib/tenantHost';
import type { TenantMembership } from '@/lib/tenantMembership';

/**
 * The redesign's top bar: logo, the five-module pill nav, tenant and role,
 * sync state, the admin role preview and the avatar menu. Same data as the
 * production TopNav; only the layout and order follow the design.
 */
const TENANT_ROLE: Record<string, Role> = {
  board_member: 'BOARD_MEMBER', resident: 'RESIDENT', staff: 'STAFF', property_manager: 'PROPERTY_MANAGER',
};

export default function Ux2TopNav() {
  const { currentUser, currentRole, switchRole, isAdminPreview, signOut } = useAuthStore();
  const permissions = usePlatformAdminStore(s => s.permissions);
  const tenant = useTenantContext();
  const location = useLocation();
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [buildingsOpen, setBuildingsOpen] = useState(false);
  const buildingsRef = useRef<HTMLDivElement>(null);
  // Only accounts with more than one building get a switcher
  const buildings: TenantMembership[] = tenant.buildings ?? [];
  const canSwitch = buildings.length > 1 && !tenant.isDemo;

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
      if (buildingsRef.current && !buildingsRef.current.contains(e.target as Node)) setBuildingsOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);
  useEffect(() => { setMenuOpen(false); setBuildingsOpen(false); }, [location.pathname]);

  const pickBuilding = (id: string) => {
    setMenuOpen(false);
    setBuildingsOpen(false);
    if (id !== tenant.id) void tenant.switchBuilding(id);
  };
  // Signup lives on the root host in production; elsewhere it is this host
  const addBuildingHref = isEnvironmentHost(window.location.hostname)
    ? '/login?create=1'
    : `https://app.${ROOT_DOMAIN}/login?create=1`;
  const buildingItems = (itemRole: 'menuitem' | 'menuitemradio') => (
    <>
      {buildings.map(b => {
        const current = b.tenant_id === tenant.id;
        return (
          <button
            key={b.tenant_id}
            type="button"
            role={itemRole}
            aria-checked={itemRole === 'menuitemradio' ? current : undefined}
            aria-current={itemRole === 'menuitem' && current ? 'true' : undefined}
            onClick={() => pickBuilding(b.tenant_id)}
            className={cn('flex min-h-[44px] w-full items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-left hover:bg-ux2-surface', current && 'bg-ux2-surface')}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ux2-ink">{b.tenant?.name || 'Building'}</span>
              <span className="block truncate text-xs text-ux2-muted">{b.board_title || ROLE_LABELS[TENANT_ROLE[b.role] ?? 'RESIDENT']}</span>
            </span>
            {current && <Check aria-hidden className="h-4 w-4 flex-none text-ux2-teal" />}
          </button>
        );
      })}
      <div className="mx-1.5 my-1 h-px bg-ux2-line" />
      <a href={addBuildingHref} role="menuitem" className="flex min-h-[44px] w-full items-center gap-2 rounded-[10px] px-2.5 text-sm font-semibold text-ux2-teal hover:bg-ux2-surface">
        <Plus aria-hidden className="h-4 w-4" /> Set up another building
      </a>
    </>
  );

  const goTo = (path: string) => { setMenuOpen(false); navigate(path); };

  return (
    <header className="ux2 sticky top-0 z-50 bg-white">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-4 px-6 pt-[22px] pb-3">
        <button type="button" aria-label="ONE two home" onClick={() => goTo('/home')} className="flex h-[46px] items-center">
          <img src="/onetwo-mark.webp" alt="ONE two" className="h-11 w-[46px] object-contain" />
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
          {canSwitch ? (
            <div className="relative hidden sm:block" ref={buildingsRef}>
              <button
                type="button"
                aria-label={`Building: ${tenant.name}. Switch building`}
                aria-haspopup="menu"
                aria-expanded={buildingsOpen}
                onClick={() => setBuildingsOpen(o => !o)}
                className="flex h-9 max-w-[240px] items-center gap-1.5 rounded-full border border-ux2-line-strong bg-white pl-3.5 pr-2.5 text-[13px] font-medium text-ux2-ink hover:border-ux2-teal"
              >
                <span className="truncate">{tenant.name}</span>
                <ChevronDown aria-hidden className="h-4 w-4 flex-none text-ux2-muted" />
              </button>
              {buildingsOpen && (
                <div role="menu" aria-label="Your buildings" className="absolute right-0 top-full z-50 mt-2 w-72 rounded-[14px] border border-ux2-line bg-white p-2 shadow-[0_14px_36px_rgba(13,27,46,.14)]">
                  <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-[.1em] text-ux2-muted">Your buildings</p>
                  {buildingItems('menuitemradio')}
                </div>
              )}
            </div>
          ) : (
            <span className="hidden text-[13px] text-ux2-muted sm:inline">{tenant.name} · {ROLE_LABELS[currentRole]}</span>
          )}
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
                {canSwitch && (
                  // Phones have no room for the top-bar switcher, so it lives here
                  <div className="sm:hidden">
                    <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-[.1em] text-ux2-muted">Your buildings</p>
                    {buildingItems('menuitem')}
                    <div className="mx-1.5 my-1 h-px bg-ux2-line" />
                  </div>
                )}
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
    </header>
  );
}
