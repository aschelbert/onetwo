import { Outlet } from 'react-router-dom';
import { useTenantContext } from '@/components/TenantProvider';
import Ux2TopNav from './Ux2TopNav';
import Ux2BottomNav from './Ux2BottomNav';
import CaseDock, { useCaseDock } from './CaseDock';
import { cn } from '@/lib/formatters';

/**
 * The redesign's shell. Phase 0 renders the production pages inside it: same
 * demo banner, same onboarding widget, same Outlet. Module pages replace the
 * production ones behind their own flags in later phases.
 */
export default function Ux2Shell() {
  const tenant = useTenantContext();
  // While a case is docked the page keeps room at the bottom, so the dock never covers the last row.
  const docked = !!useCaseDock();
  return (
    <div className="ux2 ux2-page flex min-h-screen flex-col">
      {tenant.isDemo && (
        <div className="bg-ux2-red px-4 py-1.5 text-center text-xs font-medium text-white">
          Read-only demo · {tenant.name}
        </div>
      )}
      <Ux2TopNav />
      <main className={cn('mx-auto w-full max-w-[1200px] flex-1 px-6 pt-4', docked ? 'pb-[164px] min-[1080px]:pb-[112px]' : 'pb-[88px] min-[1080px]:pb-10')}>
        <div className="animate-fade-in">
          <Outlet />
        </div>
      </main>
      <CaseDock />
      <Ux2BottomNav />
    </div>
  );
}
