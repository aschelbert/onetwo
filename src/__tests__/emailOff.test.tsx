/**
 * When our email provider stops delivering to someone (they pressed its
 * Unsubscribe, or their mailbox turned us away), the app says so: to them,
 * with a way to turn email back on; to the board, in what a send reports.
 * And a signed-in person can change their password without any email.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const rpc = vi.fn();
const invoke = vi.fn();
const updateUser = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    auth: { updateUser: (...a: unknown[]) => updateUser(...a), getSession: async () => ({ data: { session: { access_token: 't' } } }) },
  },
  isBackendEnabled: true,
  getActiveTenantId: () => 't1',
  logDbError: () => {},
}));

import { supabase } from '@/lib/supabase';
import { buildingEmailOff, myEmailOff, restoreMemberEmail } from '@/lib/emailStatus';
import { callEmailFunction } from '@/lib/services/email';
import { EmailOffRow, PasswordRow } from '@/ux2/me/tabs/AccountTab';

const sb = supabase!;
const respond = (body: unknown) => vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));

beforeEach(() => {
  cleanup();
  vi.restoreAllMocks();
  rpc.mockReset(); invoke.mockReset(); updateUser.mockReset();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://sb.example');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
});

describe('emailStatus', () => {
  it('reads my own status, and nothing when email reaches me', async () => {
    rpc.mockResolvedValueOnce({ data: { reason: 'unsubscribed', since: '2026-11-19T23:09:08Z' }, error: null });
    expect(await myEmailOff(sb)).toEqual({ reason: 'unsubscribed', since: '2026-11-19T23:09:08Z' });
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await myEmailOff(sb)).toBeNull();
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'down' } });
    expect(await myEmailOff(sb)).toBeNull();
  });

  it('lists a building’s members who are not being reached', async () => {
    rpc.mockResolvedValueOnce({ data: [{ email: 'Dana@Example.com', reason: 'hard_bounce', since: '2026-11-01T00:00:00Z' }], error: null });
    expect(await buildingEmailOff(sb, 't1')).toEqual([{ email: 'dana@example.com', reason: 'hard_bounce', since: '2026-11-01T00:00:00Z' }]);
    expect(rpc).toHaveBeenCalledWith('building_email_suppressions', { p_tenant_id: 't1' });
  });

  it('passes on why a restore was refused', async () => {
    invoke.mockResolvedValueOnce({ data: { success: true }, error: null });
    expect(await restoreMemberEmail(sb, 't1', 'dana@example.com')).toBeNull();
    expect(invoke).toHaveBeenCalledWith('email-suppression', { body: { action: 'restore-member', tenantId: 't1', email: 'dana@example.com' } });
    invoke.mockResolvedValueOnce({ data: null, error: { context: new Response(JSON.stringify({ error: 'Only they can turn it back on.' }), { status: 409 }) } });
    expect(await restoreMemberEmail(sb, 't1', 'dana@example.com')).toBe('Only they can turn it back on.');
  });
});

describe('what a send reports', () => {
  it('does not count people with email turned off as sent or as failures', async () => {
    respond({ success: true, sent: 9, total: 10, optedOut: 1 });
    expect(await callEmailFunction('send-announcement', {})).toEqual({ sent: 9, reason: '1 has email turned off (see Users)' });
    respond({ success: true, sent: 7, total: 10, optedOut: 2 });
    expect(await callEmailFunction('send-announcement', {})).toEqual({ sent: 7, reason: "1 of 10 couldn't be delivered; 2 have email turned off (see Users)" });
    respond({ success: true, sent: 0, total: 1, optedOut: 1 });
    expect(await callEmailFunction('send-announcement', {})).toEqual({ sent: 0, reason: 'everyone on the list has email turned off (see Users)' });
  });
});

describe('Account', () => {
  it('shows nothing about email when it reaches me', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const { container } = render(<EmailOffRow />);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('my_email_suppression'));
    expect(container.textContent).toBe('');
  });

  it('says email is off and turns it back on', async () => {
    rpc.mockResolvedValueOnce({ data: { reason: 'unsubscribed', since: '2026-11-19T23:09:08Z' }, error: null });
    render(<EmailOffRow />);
    expect(await screen.findByText('Email to you is turned off')).toBeTruthy();
    expect(screen.getByText(/Meeting notices, invoices and password resets are not reaching you/)).toBeTruthy();
    invoke.mockResolvedValueOnce({ data: { success: true }, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Turn email back on' }));
    expect(await screen.findByText(/Email is back on/)).toBeTruthy();
    expect(invoke).toHaveBeenCalledWith('email-suppression', { body: { action: 'restore-self' } });
  });

  it('keeps saying email is off when turning it on fails', async () => {
    rpc.mockResolvedValueOnce({ data: { reason: 'spam', since: '' }, error: null });
    render(<EmailOffRow />);
    await screen.findByText('Email to you is turned off');
    invoke.mockResolvedValueOnce({ data: { success: false, error: 'Could not reach the email service. Try again in a moment.' }, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Turn email back on' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Could not reach the email service/);
    expect(screen.getByText('Email to you is turned off')).toBeTruthy();
  });

  it('changes the password in place, holding it to the password rules', async () => {
    render(<MemoryRouter><PasswordRow live /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    const [first, second] = [screen.getByLabelText('New password'), screen.getByLabelText('New password, again')];
    fireEvent.change(first, { target: { value: 'short' } });
    fireEvent.change(second, { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Your password needs/);
    expect(updateUser).not.toHaveBeenCalled();

    fireEvent.change(first, { target: { value: 'Correct-Horse-Battery-9' } });
    fireEvent.change(second, { target: { value: 'Correct-Horse-Battery-8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/don’t match/);

    fireEvent.change(second, { target: { value: 'Correct-Horse-Battery-9' } });
    updateUser.mockResolvedValueOnce({ error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByText(/Changed just now/)).toBeTruthy();
    expect(updateUser).toHaveBeenCalledWith({ password: 'Correct-Horse-Battery-9' });
  });
});
