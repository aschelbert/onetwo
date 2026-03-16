import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import TopNav from './TopNav';
import Sidebar from './Sidebar';
import OnboardingSetupWidget from '@/components/OnboardingSetupWidget';
import { useTenantContext } from '@/components/TenantProvider';

export default function AppShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === 'true'
  );
  const tenant = useTenantContext();

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  return (
    <div className="min-h-screen">
      {tenant.isDemo && (
        <div className="bg-accent-600 text-white text-center text-xs font-medium py-1.5 px-4">
          Read-only Demo — {tenant.name}
        </div>
      )}
      <TopNav />
      <div className="flex">
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)} />
        <main className="flex-1 p-6">
          {tenant.status === 'onboarding' && <OnboardingSetupWidget />}
          <div className="animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
