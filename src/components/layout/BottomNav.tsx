import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { usePlatformAdminStore } from '@/store/usePlatformAdminStore';
import { useTenantContext } from '@/components/TenantProvider';
import { getNavigationForRole, navigation, type NavItem } from '@/lib/rolePermissions';
import {
  LayoutDashboard,
  Gavel,
  DollarSign,
  MessageCircle,
  Building2,
  Users,
  Archive,
  Home,
  MoreHorizontal,
  X,
  Shield,
} from 'lucide-react';

const BOTTOM_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  boardroom: Gavel,
  financial: DollarSign,
  community: MessageCircle,
  contacts: Building2,
  'association-team': Users,
  archives: Archive,
  'my-unit': Home,
  'admin-console': Shield,
};

// Primary tabs shown in the bottom bar (by nav item id)
const PRIMARY_IDS = new Set(['dashboard', 'boardroom', 'financial', 'community']);

export default function BottomNav() {
  const { currentRole } = useAuthStore();
  const permissions = usePlatformAdminStore(s => s.permissions);
  const tenant = useTenantContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  const navItems = permissions.length > 0
    ? getNavigationForRole(currentRole, permissions, tenant.features)
    : navigation[currentRole];

  const filtered = navItems.filter(i => !i.separator);
  const primaryTabs = filtered.filter(i => PRIMARY_IDS.has(i.id));
  const overflowTabs = filtered.filter(i => !PRIMARY_IDS.has(i.id));

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const goTo = (path: string) => {
    setMoreOpen(false);
    navigate(path);
  };

  // Check if any overflow item is active
  const overflowActive = overflowTabs.some(i => isActive(i.path));

  return (
    <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50">
      {/* More flyout */}
      {moreOpen && overflowTabs.length > 0 && (
        <div className="bg-navy border-t border-white/10 px-4 py-3 space-y-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-white/50 font-medium">More</span>
            <button onClick={() => setMoreOpen(false)} className="text-white/50 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          {overflowTabs.map((item) => {
            const Icon = BOTTOM_ICONS[item.icon || item.id];
            const active = isActive(item.path);
            return (
              <button
                key={item.id}
                onClick={() => goTo(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active ? 'text-brand-cyan bg-white/10' : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                {Icon && <Icon className="w-4 h-4" />}
                {item.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Bottom bar */}
      <div className="bg-navy border-t border-white/10" style={{ height: 60 }}>
        <div className="h-full flex items-center justify-around px-2">
          {primaryTabs.map((item) => {
            const Icon = BOTTOM_ICONS[item.icon || item.id];
            const active = isActive(item.path);
            return (
              <button
                key={item.id}
                onClick={() => goTo(item.path)}
                className="flex flex-col items-center gap-0.5 min-w-0 px-2 py-1"
              >
                <div className="relative">
                  {Icon && <Icon className={`w-5 h-5 ${active ? 'text-brand-cyan' : 'text-white/40'}`} />}
                  {active && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand-cyan" />}
                </div>
                <span className={`text-[10px] font-medium leading-tight ${active ? 'text-brand-cyan' : 'text-white/40'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}

          {/* More button (only if there are overflow items) */}
          {overflowTabs.length > 0 && (
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              className="flex flex-col items-center gap-0.5 min-w-0 px-2 py-1"
            >
              <div className="relative">
                <MoreHorizontal className={`w-5 h-5 ${moreOpen || overflowActive ? 'text-brand-cyan' : 'text-white/40'}`} />
                {overflowActive && !moreOpen && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand-cyan" />}
              </div>
              <span className={`text-[10px] font-medium leading-tight ${moreOpen || overflowActive ? 'text-brand-cyan' : 'text-white/40'}`}>
                More
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
