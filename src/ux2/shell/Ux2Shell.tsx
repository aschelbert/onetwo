import { Outlet } from 'react-router-dom';
import OnboardingSetupWidget from '@/components/OnboardingSetupWidget';
import { useTenantContext } from '@/components/TenantProvider';
import Ux2TopNav from './Ux2TopNav';
import Ux2BottomNav from './Ux2BottomNav';
import ReturnToCaseBar from './ReturnToCaseBar';

/**
 * The redesign's shell. Phase 0 renders the production pages inside it: same
 * demo banner, same onboarding widget, same Outlet. Module pages replace the
 * production ones behind their own flags in later phases.
 */
export default function Ux2Shell() {
  const tenant = useTenantContext();
  return (
    <div className="ux2 ux2-page flex min-h-screen flex-col">
      {tenant.isDemo && (
        <div className="bg-ux2-red px-4 py-1.5 text-center text-xs font-medium text-white">
          Read-only demo · {tenant.name}
        </div>
      )}
      <Ux2TopNav />
      <ReturnToCaseBar />
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 pb-[88px] pt-4 min-[1080px]:pb-10">
        {tenant.status === 'onboarding' && <div className="ux2-onboarding"><OnboardingSetupWidget /></div>}
        <div className="animate-fade-in">
          <Outlet />
        </div>
      </main>
      <Ux2BottomNav />
    </div>
  );
}
