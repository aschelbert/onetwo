import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
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
import CommunityRoomPage from '@/features/community/CommunityRoomPage';
import AIAdvisor from '@/components/AIAdvisor';
import TenantProvider from '@/components/TenantProvider';
import ResetPasswordPage from '@/features/auth/ResetPasswordPage';

// Wait one tick for Zustand persist to hydrate from localStorage
function HydrationGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  if (!ready) {
    return <div className="min-h-screen flex items-center justify-center bg-mist-50"><div className="animate-pulse text-accent-600 font-display text-lg font-bold">Loading...</div></div>;
  }
  return <>{children}</>;
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
    return <Navigate to={currentRole === 'PLATFORM_ADMIN' ? '/admin/console' : '/dashboard'} replace />;
  }
  return <AuthPage />;
}

function CatchAll() {
  const { isAuthenticated, currentRole } = useAuthStore();
  if (isAuthenticated) {
    return <Navigate to={currentRole === 'PLATFORM_ADMIN' ? '/admin/console' : '/dashboard'} replace />;
  }
  return <Navigate to="/login" replace />;
}

function AIAdvisorWrapper() {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return null;
  return <AIAdvisor />;
}

export default function App() {
  return (
    <HydrationGate>
    <BrowserRouter>
      <Routes>
        {/* Login */}
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

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
          <Route path="/community" element={<CommunityRoomPage />} />
          <Route path="/my-unit" element={<MyUnitPage />} />
          <Route path="/account" element={<AccountSettingsPage />} />
          <Route path="/admin/users" element={<UserManagementPage />} />
          <Route path="/admin/console" element={<PlatformAdminPage />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<CatchAll />} />
      </Routes>
      <AIAdvisorWrapper />
    </BrowserRouter>
    </HydrationGate>
  );
}
