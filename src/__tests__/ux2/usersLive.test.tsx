/**
 * Me › User Management on a live building: Change role, Link to unit and
 * Remove go through the database functions that check the caller is on the
 * board (040, 041), and a refusal is shown instead of a false "done".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const db = vi.hoisted(() => ({
  members: [
    { id: 'm-board', user_id: 'u-board', role: 'board_member', unit: null, board_title: 'President', status: 'active', created_at: '2026-01-01', name: 'Bea Board', email: 'bea@example.com' },
    { id: 'm-owner', user_id: 'u-owner', role: 'resident', unit: '101', board_title: null, status: 'active', created_at: '2026-02-01', name: 'Olu Owner', email: 'olu@example.com' },
  ],
  rpc: vi.fn(),
}));

function query(rows: unknown[]) {
  const q: Record<string, unknown> = {};
  const self = () => q;
  Object.assign(q, { select: self, eq: self, order: self, then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok) });
  return q;
}

vi.mock('@/lib/supabase', () => ({
  isBackendEnabled: true,
  getActiveTenantId: () => 't1',
  logDbError: () => {},
  supabase: {
    from: (table: string) => query(table === 'tenant_users' ? db.members : []),
    rpc: db.rpc,
    auth: { getSession: async () => ({ data: { session: null } }) },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  },
}));
vi.mock('@/lib/adminSupabase', () => ({ adminSupabase: null }));
vi.mock('@/components/TenantProvider', () => ({
  useTenantContext: () => ({ name: 'Sunny Acres', isDemo: false, status: 'active', tier: 'self_managed', features: {}, id: 't1', subdomain: 'sunny' }),
}));

import { useAuthStore } from '@/store/useAuthStore';
import MeModule from '@/ux2/me/MeModule';

function renderUsers() {
  return render(<MemoryRouter initialEntries={['/admin/users']}><Routes><Route path="/admin/users" element={<MeModule tab="users" />} /></Routes></MemoryRouter>);
}
const openMenu = async (name: string) => {
  const row = await waitFor(() => {
    const el = document.querySelector('[data-member="m-owner"]');
    if (!el) throw new Error('members not loaded yet');
    return el as HTMLElement;
  });
  fireEvent.click(within(row).getByRole('button', { name: `Actions for ${name}` }));
};

describe('User Management on a live building', () => {
  beforeEach(() => {
    db.rpc.mockReset();
    useAuthStore.setState({ currentRole: 'BOARD_MEMBER' });
  });

  it('changes a role through set_member_role and shows a refusal', async () => {
    db.rpc.mockResolvedValueOnce({ data: { success: true, role: 'staff' }, error: null });
    renderUsers();
    await openMenu('Olu Owner');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Change role' }));
    fireEvent.change(document.getElementById('change-role')!, { target: { value: 'staff' } });
    fireEvent.click(within(document.querySelector('[aria-label="Change role"]') as HTMLElement).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(db.rpc).toHaveBeenCalledWith('set_member_role', { p_member_id: 'm-owner', p_role: 'staff' }));
    expect(await screen.findByText(/Olu Owner is now/)).toBeTruthy();

    db.rpc.mockResolvedValueOnce({ data: { success: false, error: 'The building needs at least one board member' }, error: null });
    await openMenu('Olu Owner');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Change role' }));
    fireEvent.click(within(document.querySelector('[aria-label="Change role"]') as HTMLElement).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Role not changed: The building needs at least one board member')).toBeTruthy();
  });

  it('removes through remove_member, and links a unit through set_member_unit', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    db.rpc.mockResolvedValueOnce({ data: { success: true }, error: null });
    renderUsers();
    await openMenu('Olu Owner');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }));
    await waitFor(() => expect(db.rpc).toHaveBeenCalledWith('remove_member', { p_member_id: 'm-owner' }));
    expect(await screen.findByText('Olu Owner no longer has access to this building. Their unit, ledger and votes stay.')).toBeTruthy();

    db.rpc.mockResolvedValueOnce({ data: { success: true, unit: null }, error: null });
    await openMenu('Olu Owner');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Change unit' }));
    const panel = document.querySelector('[aria-label="Link to a unit"]') as HTMLElement;
    fireEvent.change(within(panel).getByLabelText('Unit for Olu Owner'), { target: { value: '' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(db.rpc).toHaveBeenCalledWith('set_member_unit', { p_member_id: 'm-owner', p_unit: null }));
    expect(await screen.findByText('Olu Owner is no longer linked to a unit.')).toBeTruthy();
  });
});
