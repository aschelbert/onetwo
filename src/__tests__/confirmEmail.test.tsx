import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const TOKEN = '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) }, isBackendEnabled: true }));

import ConfirmEmailPage from '@/features/auth/ConfirmEmailPage';

const at = (path: string) => render(
  <MemoryRouter initialEntries={[path]}><Routes><Route path="/confirm-email" element={<ConfirmEmailPage />} /></Routes></MemoryRouter>,
);
const status = (subscribed: boolean, state: string) => ({ data: { email_hint: 'd***@example.com', subscribed, state }, error: null });

describe('ConfirmEmailPage', () => {
  beforeEach(() => { cleanup(); rpc.mockReset(); });

  it('asks before subscribing, then subscribes on Confirm', async () => {
    rpc.mockResolvedValueOnce(status(false, 'pending'));
    at(`/confirm-email?t=${TOKEN}`);
    expect(await screen.findByRole('heading', { name: 'Confirm product emails?' })).toBeTruthy();
    expect(screen.getByText('d***@example.com')).toBeTruthy();
    // Opening the page only read the link (mail scanners open links)
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('marketing_confirmation_by_token', { p_token: TOKEN });

    rpc.mockResolvedValueOnce(status(true, 'used'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByRole('heading', { name: 'You’re subscribed' })).toBeTruthy();
    expect(rpc).toHaveBeenLastCalledWith('confirm_marketing_by_token', { p_token: TOKEN });
  });

  it('says so when already subscribed, with nothing to press', async () => {
    rpc.mockResolvedValueOnce(status(true, 'used'));
    at(`/confirm-email?t=${TOKEN}`);
    expect(await screen.findByRole('heading', { name: 'You’re already subscribed' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
  });

  it('explains an expired link', async () => {
    rpc.mockResolvedValueOnce(status(false, 'expired'));
    at(`/confirm-email?t=${TOKEN}`);
    expect(await screen.findByRole('heading', { name: 'This link has expired' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
  });

  it('does not resubscribe from a used link after unsubscribing', async () => {
    rpc.mockResolvedValueOnce(status(false, 'used'));
    at(`/confirm-email?t=${TOKEN}`);
    expect(await screen.findByRole('heading', { name: /not subscribed/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
  });

  it('does not call the server for a malformed link', async () => {
    at('/confirm-email?t=nope');
    expect(await screen.findByRole('heading', { name: /recognise this link/ })).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reports a server failure without claiming a change', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'down' } });
    at(`/confirm-email?t=${TOKEN}`);
    await waitFor(() => expect(screen.getByRole('heading', { name: /couldn.t reach the server/ })).toBeTruthy());
  });
});
