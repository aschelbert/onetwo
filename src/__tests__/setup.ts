// Global test setup — mock Supabase so stores run in pure local mode
vi.mock('@/lib/supabase', () => ({
  supabase: null,
  isBackendEnabled: false,
  setActiveTenantId: () => {},
  getActiveTenantId: () => null,
  logDbError: () => {},
}));

// jsdom has no scrollIntoView; the UX2 header buttons scroll to a card.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
