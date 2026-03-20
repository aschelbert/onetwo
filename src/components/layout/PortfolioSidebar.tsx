import { useLocation, useNavigate } from 'react-router-dom';
import { usePMContext } from '@/components/PMProvider';
import {
  LayoutDashboard,
  AlertCircle,
  Shield,
  ClipboardList,
  BookOpen,
  BarChart3,
  UserCheck,
  Users,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  separator?: false;
}

interface NavSeparator {
  id: string;
  separator: true;
}

type NavEntry = NavItem | NavSeparator;

const NAV_ITEMS: NavEntry[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/portfolio', icon: LayoutDashboard },
  { id: 'cases', label: 'Case Queue', path: '/portfolio/cases', icon: AlertCircle },
  { id: 'compliance', label: 'Compliance', path: '/portfolio/compliance', icon: Shield },
  { id: 'tasks', label: 'Task Tracking', path: '/portfolio/tasks', icon: ClipboardList },
  { id: 'log', label: 'Property Log', path: '/portfolio/log', icon: BookOpen },
  { id: 'scorecard', label: 'PM Scorecard', path: '/portfolio/scorecard', icon: BarChart3 },
  { id: 'sep', separator: true },
  { id: 'assignments', label: 'My Assignments', path: '/portfolio/assignments', icon: UserCheck },
  { id: 'users', label: 'User Management', path: '/portfolio/users', icon: Users },
];

interface PortfolioSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function PortfolioSidebar({ collapsed, onToggle }: PortfolioSidebarProps) {
  const { company, buildings, activeBuildingId, setActiveBuildingId } = usePMContext();
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => {
    if (path === '/portfolio') return location.pathname === '/portfolio' || location.pathname === '/portfolio/dashboard';
    return location.pathname.startsWith(path);
  };

  return (
    <aside
      className={`${collapsed ? 'w-16' : 'w-60'} bg-[#0D1B2E] sticky top-[53px] flex flex-col transition-all duration-300`}
      style={{ height: 'calc(100vh - 53px)' }}
    >
      <div className="flex-1 overflow-y-auto p-4">
        {/* Header block — hidden when collapsed */}
        {!collapsed && (
          <div className="mb-6 bg-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-1.5 py-0.5 bg-navy-600 text-white rounded text-[10px] font-bold uppercase tracking-wide">PM</span>
            </div>
            <p className="text-sm font-bold text-white">{company.name}</p>
            <p className="text-xs text-slate-400 mt-1">Property Portfolio</p>
          </div>
        )}

        {/* Building filter — hidden when collapsed */}
        {!collapsed && buildings.length > 0 && (
          <div className="mb-4">
            <select
              value={activeBuildingId || ''}
              onChange={(e) => setActiveBuildingId(e.target.value || null)}
              className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/30"
            >
              <option value="" className="text-ink-900">All Buildings</option>
              {buildings.map(b => (
                <option key={b.tenantId} value={b.tenantId} className="text-ink-900">
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Navigation Menu */}
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            if (item.separator) {
              if (collapsed) return null;
              return <div key={item.id} className="my-2 mx-2 border-t border-white/10" />;
            }

            const active = isActive(item.path);
            const Icon = item.icon;

            if (collapsed) {
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.path)}
                  title={item.label}
                  className={`w-full flex items-center justify-center py-2.5 rounded-lg transition-colors ${
                    active
                      ? 'bg-white/10 text-white'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </button>
              );
            }

            return (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium transition-colors ${
                  active
                    ? 'bg-white/10 text-white'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="border-t border-white/10 p-3 flex items-center justify-end text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
      >
        {collapsed ? <PanelLeft className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
      </button>
    </aside>
  );
}
