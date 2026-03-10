// Global test setup — mock Supabase so stores run in pure local mode
vi.mock('@/lib/supabase', () => ({
  supabase: null,
  isBackendEnabled: false,
  setActiveTenantId: () => {},
  getActiveTenantId: () => null,
  logDbError: () => {},
}));
