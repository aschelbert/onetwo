import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { supabase, isBackendEnabled } from '@/lib/supabase';
import type { Role } from '@/types/auth';
import AppShell from '@/components/layout/AppShell';
import AuthPage from '@/features/auth/AuthPage';
import DashboardPage from '@/features/dashboard/DashboardPage';
import FinancialPage from '@/features/financial/FinancialPage';
import IssuesPage from '@/features/issues/IssuesPage';
import BuildingPage from '@/features/building/BuildingPage';
import ArchivesPage from '@/features/archives/ArchivesPage';
import MyUnitPage from '@/features/unit-manager/MyUnitPage';
import AccountSettingsPage from '@/features/account/AccountSettingsPage';
import UserManagementPage from '@/features/user-management/UserManagementPage';
import PlatformAdminPage from '@/features/admin/PlatformAdminPage';
import VotingPage from '@/features/elections/ElectionsPage';
import BoardRoomPage from '@/features/boardroom/BoardRoomPage';
import PropertyLogPage from '@/features/property-log/PropertyLogPage';
import CommunityRoomPage from '@/features/community/CommunityRoomPage';
import SupportPage from '@/features/support/SupportPage';
import SubscriptionPage from '@/features/subscription/SubscriptionPage';
import AIAdvisor from '@/components/AIAdvisor';
import ActiveCaseWidget from '@/components/ActiveCaseWidget';
import TenantProvider from '@/components/TenantProvider';
import ResetPasswordPage from '@/features/auth/ResetPasswordPage';

// Wait for Zustand persist to hydrate auth store from localStorage
function HydrationGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // onFinishHydration fires once the persisted state has been loaded
    const unsub = useAuthStore.persist.onFinishHydration(() => setReady(true));
    // If hydration already happened before this effect ran, set ready immediately
    if (useAuthStore.persist.hasHydrated()) setReady(true);
    return unsub;
  }, []);
  if (!ready) {
    return <div className="min-h-screen flex items-center justify-center bg-mist-50"><div className="animate-pulse text-accent-600 font-display text-lg font-bold">Loading...</div></div>;
  }
  return <>{children}</>;
}

// Global Supabase auth state listener — keeps auth store in sync with session
function AuthListener() {
  const ranRef = useRef(false);
  useEffect(() => {
    if (!isBackendEnabled || !supabase || ranRef.current) return;
    ranRef.current = true;
    const sb = supabase; // narrow for TS inside async callback

    const { data: { subscription } } = sb.auth.onAuthStateChange(async (event, session) => {
      const { isAuthenticated, login, signOut, addMember } = useAuthStore.getState();

      if (event === 'SIGNED_OUT' || !session) {
        if (isAuthenticated) signOut();
        return;
      }

      // On INITIAL_SESSION / SIGNED_IN / TOKEN_REFRESHED — restore auth if not already set
      if (session && !isAuthenticated) {
        try {
          // Check if platform admin first
          const { data: admin } = await sb
            .from('platform_admins')
            .select('name, role')
            .eq('user_id', session.user.id)
            .maybeSingle();

          if (admin) {
            const m = {
              id: session.user.id,
              name: admin.name || session.user.email?.split('@')[0] || 'Admin',
              email: session.user.email || '',
              phone: '',
              role: 'PLATFORM_ADMIN' as Role,
              unit: '',
              status: 'active' as const,
              joined: new Date().toISOString().split('T')[0],
              boardTitle: null,
            };
            addMember(m);
            login(m);
            return;
          }

          // Check tenant user
          const { data: tu } = await sb
            .from('tenant_users')
            .select('role, unit, tenant_id')
            .eq('user_id', session.user.id)
            .maybeSingle();

          if (tu) {
            const roleMap: Record<string, Role> = { board_member: 'BOARD_MEMBER', resident: 'RESIDENT', staff: 'STAFF', property_manager: 'PROPERTY_MANAGER' };
            const m = {
              id: session.user.id,
              name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
              email: session.user.email || '',
              phone: '',
              role: roleMap[tu.role] || ('BOARD_MEMBER' as Role),
              unit: tu.unit || '',
              status: 'active' as const,
              joined: new Date().toISOString().split('T')[0],
              boardTitle: null,
            };
            addMember(m);
            login(m);
          }
        } catch {
          // Session exists but lookup failed — don't crash
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

function LoginRoute() {
  const { isAuthenticated, currentRole } = useAuthStore();
  if (isAuthenticated) {
    // On tenant subdomains, platform admins should see the tenant dashboard
    const host = window.location.hostname;
    const isTenantSubdomain = host.endsWith('.getonetwo.com') && host !== 'app.getonetwo.com';
    const target = currentRole === 'PLATFORM_ADMIN' && !isTenantSubdomain ? '/admin/console' : '/dashboard';
    return <Navigate to={target} replace />;
  }
  return <AuthPage />;
}

function CatchAll() {
  const { isAuthenticated, currentRole } = useAuthStore();
  if (isAuthenticated) {
    const host = window.location.hostname;
    const isTenantSubdomain = host.endsWith('.getonetwo.com') && host !== 'app.getonetwo.com';
    const target = currentRole === 'PLATFORM_ADMIN' && !isTenantSubdomain ? '/admin/console' : '/dashboard';
    return <Navigate to={target} replace />;
  }
  return <Navigate to="/" replace />;
}

function AIAdvisorWrapper() {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return null;
  return <AIAdvisor />;
}

function ActiveCaseWidgetWrapper() {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return null;
  return <ActiveCaseWidget />;
}

export default function App() {
  return (
    <HydrationGate>
    <BrowserRouter>
      <AuthListener />
      <Routes>
        {/* Public */}
        {/* Landing page is served by static index.html via Vite middleware */}
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Admin console — own layout (sidebar nav), outside AppShell */}
        <Route path="/admin/console" element={<RequireAuth><TenantProvider><PlatformAdminPage /></TenantProvider></RequireAuth>} />

        {/* Protected app routes */}
        <Route element={<RequireAuth><TenantProvider><AppShell /></TenantProvider></RequireAuth>}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/financial" element={<FinancialPage />} />
          <Route path="/issues" element={<IssuesPage />} />
          <Route path="/building" element={<BuildingPage />} />
          <Route path="/compliance" element={<Navigate to="/boardroom" replace />} />
          <Route path="/archives" element={<ArchivesPage />} />
          <Route path="/voting" element={<Navigate to="/boardroom" replace />} />
          <Route path="/boardroom" element={<BoardRoomPage />} />
          <Route path="/board-ops" element={<Navigate to="/boardroom" replace />} />
          <Route path="/property-log" element={<PropertyLogPage />} />
          <Route path="/community" element={<CommunityRoomPage />} />
          <Route path="/my-unit" element={<MyUnitPage />} />
          <Route path="/account" element={<AccountSettingsPage />} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/subscription" element={<SubscriptionPage />} />
          <Route path="/admin/users" element={<UserManagementPage />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<CatchAll />} />
      </Routes>
      {/* AI Advisor hidden — revisiting how it fits with workflow context widget */}
      {/* <AIAdvisorWrapper /> */}
      <ActiveCaseWidgetWrapper />
    </BrowserRouter>
    </HydrationGate>
  );
}
