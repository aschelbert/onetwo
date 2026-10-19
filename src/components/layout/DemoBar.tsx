import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useTenantContext } from '@/components/TenantProvider';
import RoleChip from '@/components/ui/RoleChip';

export default function DemoBar() {
  const { currentUser, signOut, leaveDemo } = useAuthStore();
  const tenant = useTenantContext();
  const navigate = useNavigate();

  const isDemoUser = currentUser.id === 'user1' || currentUser.id.startsWith('user-');
  if (!tenant.isDemo || !isDemoUser) return null;

  const handleStart = () => {
    leaveDemo('bar');
    navigate('/login?create=1&from=demo');
  };

  const handleSignOut = () => {
    signOut();
    navigate('/login');
  };

  return (
    <div className="w-full bg-brand-teal text-white" style={{ height: 40 }}>
      <div className="h-full px-4 sm:px-6 flex items-center justify-between">
        {/* Left */}
        <div className="flex items-center gap-2 min-w-0">
          <RoleChip label="Demo" tone="teal" />
          <span className="text-xs text-white/90 truncate hidden sm:inline">
            Exploring Sunny Acres — a sample building
          </span>
          <span className="text-xs text-white/90 truncate sm:hidden">
            Sample building
          </span>
        </div>

        {/* Right */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleStart}
            className="text-xs font-semibold text-brand-cyan hover:text-white transition-colors whitespace-nowrap"
          >
            Start your own building
          </button>
          <button
            onClick={handleSignOut}
            className="text-xs text-white/70 hover:text-white transition-colors whitespace-nowrap"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
