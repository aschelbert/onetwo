import { Outlet } from 'react-router-dom';
import TopNav from './TopNav';
import BottomNav from './BottomNav';
import OnboardingSetupWidget from '@/components/OnboardingSetupWidget';
import { useTenantContext } from '@/components/TenantProvider';

export default function AppShell() {
  const tenant = useTenantContext();

  return (
    <div className="flex flex-col min-h-screen bg-bg-page">
      {tenant.isDemo && (
        <div className="bg-accent-600 text-white text-center text-xs font-medium py-1.5 px-4">
          Read-only Demo — {tenant.name}
        </div>
      )}
      <TopNav />
      <main className="flex-1 p-6 pb-[76px] sm:pb-6">
        {tenant.status === 'onboarding' && <OnboardingSetupWidget />}
        <div className="animate-fade-in">
          <Outlet />
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
