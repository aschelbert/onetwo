import { Outlet } from 'react-router-dom';
import TopNav from './TopNav';
import BottomNav from './BottomNav';
import OnboardingSetupWidget from '@/components/OnboardingSetupWidget';
import { useTenantContext } from '@/components/TenantProvider';
import { useAuthStore } from '@/store/useAuthStore';
import UndoToastHost from '@/components/ui/UndoToast';

export default function AppShell() {
  const tenant = useTenantContext();
  const currentRole = useAuthStore((s) => s.currentRole);

  // Hide onboarding widget when v2Home is active for board/PM roles
  const isV2Home =
    tenant.features.v2Home &&
    (currentRole === 'BOARD_MEMBER' || currentRole === 'PROPERTY_MANAGER');

  return (
    <div className="flex flex-col min-h-screen bg-bg-page">
      {tenant.isDemo && (
        <div className="bg-accent-600 text-white text-center text-xs font-medium py-1.5 px-4">
          Read-only Demo — {tenant.name}
        </div>
      )}
      <TopNav />
      <main className="flex-1 p-6 pb-[76px] sm:pb-6">
        {tenant.status === 'onboarding' && !isV2Home && <OnboardingSetupWidget />}
        <div className="animate-fade-in">
          <Outlet />
        </div>
      </main>
      <BottomNav />
      <UndoToastHost />
    </div>
  );
}
