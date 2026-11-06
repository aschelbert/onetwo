import { useLocation, useNavigate } from 'react-router-dom';
import { Building2, DollarSign, Gavel, Home, MessageCircle, CreditCard } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { usePlatformAdminStore } from '@/store/usePlatformAdminStore';
import { useTenantContext } from '@/components/TenantProvider';
import { getNavigationForRole, navigation } from '@/lib/rolePermissions';
import { cn } from '@/lib/formatters';
import { modulesForRole, phoneTabs } from './nav';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  home: Home,
  building: Building2,
  community: MessageCircle,
  funds: DollarSign,
  pay: CreditCard,
  boardroom: Gavel,
};

/** Phone bottom nav: five tabs for the board, four for residents, no More flyout. */
export default function Ux2BottomNav() {
  const { currentRole } = useAuthStore();
  const permissions = usePlatformAdminStore(s => s.permissions);
  const tenant = useTenantContext();
  const location = useLocation();
  const navigate = useNavigate();

  const legacyNav = permissions.length > 0
    ? getNavigationForRole(currentRole, permissions, tenant.features)
    : navigation[currentRole] ?? [];
  const tabs = phoneTabs(currentRole, modulesForRole(currentRole, legacyNav));
  const isOn = (matches: string[]) => matches.some(p => location.pathname === p || location.pathname.startsWith(p + '/'));

  return (
    <nav aria-label="Primary" className="ux2 fixed bottom-0 left-0 right-0 z-50 border-t border-ux2-line bg-white px-3 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 sm:hidden">
      <div className="flex items-center justify-around rounded-full border border-ux2-line bg-ux2-surface p-1">
        {tabs.map(t => {
          const Icon = ICONS[t.id] ?? Home;
          const on = isOn(t.matches);
          return (
            <button
              key={t.id}
              type="button"
              aria-label={t.label}
              aria-current={on ? 'page' : undefined}
              onClick={() => navigate(t.path)}
              className={cn('flex h-11 min-w-[52px] flex-1 items-center justify-center rounded-full', on ? 'bg-ux2-navy text-white' : 'text-ink-700')}
            >
              <Icon className="h-5 w-5" />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
