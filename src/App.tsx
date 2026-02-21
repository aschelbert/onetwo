import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import AppShell from '@/components/layout/AppShell';
import AuthPage from '@/features/auth/AuthPage';
import DashboardPage from '@/features/dashboard/DashboardPage';
import FinancialPage from '@/features/financial/FinancialPage';
import IssuesPage from '@/features/issues/IssuesPage';
import BuildingPage from '@/features/building/BuildingPage';
import CompliancePage from '@/features/compliance/CompliancePage';
import ArchivesPage from '@/features/archives/ArchivesPage';
import MyUnitPage from '@/features/unit-manager/MyUnitPage';
import AccountSettingsPage from '@/features/account/AccountSettingsPage';
import UserManagementPage from '@/features/user-management/UserManagementPage';
import PlatformAdminPage from '@/features/admin/PlatformAdminPage';
import AIAdvisor from '@/components/AIAdvisor';

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
    <BrowserRouter>
      <Routes>
        {/* Login */}
        <Route path="/login" element={<LoginRoute />} />

        {/* Protected app routes */}
        <Route element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/financial" element={<FinancialPage />} />
          <Route path="/issues" element={<IssuesPage />} />
          <Route path="/building" element={<BuildingPage />} />
          <Route path="/compliance" element={<CompliancePage />} />
          <Route path="/archives" element={<ArchivesPage />} />
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
  );
}

