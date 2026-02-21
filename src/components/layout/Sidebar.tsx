import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { navigation } from '@/lib/rolePermissions';
import { ROLE_LABELS, type Role } from '@/types/auth';

export default function Sidebar() {
  const { currentRole, switchRole } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const navItems = navigation[currentRole];
  const isAdmin = currentRole === 'PLATFORM_ADMIN';

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <aside
      className="w-60 bg-white border-r border-ink-100 sticky top-[53px] overflow-y-auto"
      style={{ height: 'calc(100vh - 53px)' }}
    >
      <div className="p-4">
        {/* Admin branding or Role Selector */}
        {isAdmin ? (
          <div className="mb-6 bg-red-50 rounded-xl p-4 border border-red-200">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-1.5 py-0.5 bg-red-600 text-white rounded text-[10px] font-bold uppercase tracking-wide">Admin</span>
            </div>
            <p className="text-sm font-bold text-ink-900">Platform Console</p>
            <p className="text-xs text-ink-400 mt-1">Multi-tenancy management</p>
          </div>
        ) : (
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
        )}

        {/* Navigation Menu */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            if (item.separator) {
              return (
                <div key={item.id} className="my-2 mx-2 border-t border-ink-200" />
              );
            }

            const active = isActive(item.path);

            return (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                className={`w-full px-3 py-2.5 rounded-lg text-left text-sm font-medium transition-colors ${
                  active
                    ? isAdmin ? 'bg-red-700 text-white' : 'bg-ink-900 text-white'
                    : 'text-ink-700 hover:bg-ink-50'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Quick Stats — only for customer roles */}
        {!isAdmin && (
          <div className="mt-6 space-y-3">
            <div className="bg-accent-50 rounded-lg p-3 border border-accent-200">
              <p className="text-xs text-accent-600 font-medium">Next Meeting</p>
              <p className="text-sm font-bold text-ink-900">Feb 20</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
