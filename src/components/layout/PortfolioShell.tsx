import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import PortfolioTopNav from './PortfolioTopNav';
import PortfolioSidebar from './PortfolioSidebar';

export default function PortfolioShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('pm-sidebar-collapsed') === 'true'
  );

  useEffect(() => {
    localStorage.setItem('pm-sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  return (
    <div className="min-h-screen">
      <PortfolioTopNav />
      <div className="flex">
        <PortfolioSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)} />
        <main className="flex-1 p-6 bg-sand-50">
          <div className="animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
