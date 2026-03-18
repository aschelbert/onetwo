import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { usePlatformAdminStore } from '@/store/usePlatformAdminStore';
import { useTenantContext } from '@/components/TenantProvider';
import { getNavigationForRole, navigation } from '@/lib/rolePermissions';
import { ROLE_LABELS, type Role } from '@/types/auth';
import { useState } from 'react';
import {
  LayoutDashboard,
  Gavel,
  Building2,
  DollarSign,
  ClipboardList,
  Archive,
  MessageCircle,
  Shield,
  AlertCircle,
  Home,
  Users,
  PanelLeftClose,
  PanelLeft,
  ChevronDown,
} from 'lucide-react';

const NAV_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  boardroom: Gavel,
  contacts: Building2,
  financial: DollarSign,
  'property-log': ClipboardList,
  archives: Archive,
  community: MessageCircle,
  'admin-console': Shield,
  issues: AlertCircle,
  'my-unit': Home,
  'user-mgmt': Users,
};

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { currentRole, switchRole, isAdminPreview } = useAuthStore();
  const permissions = usePlatformAdminStore(s => s.permissions);
  const tenant = useTenantContext();
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = currentRole === 'PLATFORM_ADMIN';
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Build navigation dynamically from admin console permissions + tenant features.
  // Falls back to static navigation if permissions haven't loaded yet.
  const navItems = permissions.length > 0
    ? getNavigationForRole(currentRole, permissions, tenant.features)
    : navigation[currentRole];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  // Check if any child of a parent is active
  const isGroupActive = (item: typeof navItems[number]) => {
    if (item.children) return item.children.some(child => isActive(child.path));
    return isActive(item.path);
  };

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Auto-expand groups that have an active child
  const isExpanded = (item: typeof navItems[number]) => {
    if (expandedGroups[item.id] !== undefined) return expandedGroups[item.id];
    return isGroupActive(item);
  };

  return (
    <aside
      className={`${collapsed ? 'w-16' : 'w-60'} bg-white border-r border-ink-100 sticky top-[53px] flex flex-col transition-all duration-300`}
      style={{ height: 'calc(100vh - 53px)' }}
    >
      <div className="flex-1 overflow-y-auto p-4">
        {/* Admin branding or Role Selector — hidden when collapsed */}
        {!collapsed && (
          <>
            {isAdmin ? (
              <div className="mb-6 bg-red-50 rounded-xl p-4 border border-red-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-1.5 py-0.5 bg-red-600 text-white rounded text-[10px] font-bold uppercase tracking-wide">Admin</span>
                </div>
                <p className="text-sm font-bold text-ink-900">Platform Console</p>
                <p className="text-xs text-ink-400 mt-1">Multi-tenancy management</p>
              </div>
            ) : isAdminPreview ? (
              <div className="mb-6 bg-sand-100 rounded-xl p-4 border border-ink-100">
                <label className="block text-xs font-medium text-ink-700 mb-2">View As:</label>
                <select
                  value={currentRole}
                  onChange={(e) => {
                    switchRole(e.target.value as Role);
                    navigate('/dashboard');
                  }}
                  className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm font-medium bg-white"
                >
                  {(Object.keys(ROLE_LABELS) as Role[]).filter(r => r !== 'PLATFORM_ADMIN').map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-ink-400 mt-2">Switch roles to see different views</p>
              </div>
            ) : (
              <div className="mb-6 bg-sand-100 rounded-xl p-4 border border-ink-100">
                <p className="text-sm font-bold text-ink-900">{ROLE_LABELS[currentRole]}</p>
                <p className="text-xs text-ink-400 mt-1">Your current role</p>
              </div>
            )}
          </>
        )}

        {/* Navigation Menu */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            if (item.separator) {
              if (collapsed) return null;
              return (
                <div key={item.id} className="my-2 mx-2 border-t border-ink-200" />
              );
            }

            const Icon = item.icon ? NAV_ICONS[item.icon] : null;

            // Parent with children — expandable group
            if (item.children && item.children.length > 0) {
              const groupActive = isGroupActive(item);
              const expanded = isExpanded(item);

              if (collapsed) {
                return (
                  <button
                    key={item.id}
                    onClick={() => navigate(item.children![0].path)}
                    title={item.label}
                    className={`w-full flex items-center justify-center py-2.5 rounded-lg transition-colors ${
                      groupActive
                        ? isAdmin ? 'bg-red-700 text-white' : 'bg-ink-900 text-white'
                        : 'text-ink-700 hover:bg-ink-50'
                    }`}
                  >
                    {Icon && <Icon className="w-5 h-5" />}
                  </button>
                );
              }

              return (
                <div key={item.id}>
                  <button
                    onClick={() => toggleGroup(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium transition-colors ${
                      groupActive
                        ? 'bg-ink-100 text-ink-900'
                        : 'text-ink-700 hover:bg-ink-50'
                    }`}
                  >
                    {Icon && <Icon className="w-5 h-5 shrink-0" />}
                    <span className="flex-1">{item.label}</span>
                    <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                  </button>
                  {expanded && (
                    <div className="ml-4 mt-1 space-y-0.5 border-l-2 border-ink-100 pl-3">
                      {item.children.map(child => {
                        const childActive = isActive(child.path);
                        const ChildIcon = child.icon ? NAV_ICONS[child.icon] : null;
                        return (
                          <button
                            key={child.id}
                            onClick={() => navigate(child.path)}
                            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-sm transition-colors ${
                              childActive
                                ? isAdmin ? 'bg-red-700 text-white' : 'bg-ink-900 text-white'
                                : 'text-ink-600 hover:bg-ink-50'
                            }`}
                          >
                            {ChildIcon && <ChildIcon className="w-4 h-4 shrink-0" />}
                            {child.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            // Regular nav item (no children)
            const active = isActive(item.path);

            if (collapsed) {
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.path)}
                  title={item.label}
                  className={`w-full flex items-center justify-center py-2.5 rounded-lg transition-colors ${
                    active
                      ? isAdmin ? 'bg-red-700 text-white' : 'bg-ink-900 text-white'
                      : 'text-ink-700 hover:bg-ink-50'
                  }`}
                >
                  {Icon && <Icon className="w-5 h-5" />}
                </button>
              );
            }

            return (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium transition-colors ${
                  active
                    ? isAdmin ? 'bg-red-700 text-white' : 'bg-ink-900 text-white'
                    : 'text-ink-700 hover:bg-ink-50'
                }`}
              >
                {Icon && <Icon className="w-5 h-5 shrink-0" />}
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Quick Stats — only for customer roles, hidden when collapsed */}
        {!isAdmin && !collapsed && (
          <div className="mt-6 space-y-3">
            <div className="bg-accent-50 rounded-lg p-3 border border-accent-200">
              <p className="text-xs text-accent-600 font-medium">Next Meeting</p>
              <p className="text-sm font-bold text-ink-900">Feb 20</p>
            </div>
          </div>
        )}
      </div>

      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="border-t border-ink-100 p-3 flex items-center justify-end text-ink-400 hover:text-ink-700 hover:bg-ink-50 transition-colors"
      >
        {collapsed ? <PanelLeft className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
      </button>
    </aside>
  );
}
