import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const TOKEN = '3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d';
const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) }, isBackendEnabled: true }));

import UnsubscribePage from '@/features/auth/UnsubscribePage';
import { isUnsubscribeToken, myPreference, setMyPreference } from '@/lib/marketingPrefs';

const at = (path: string) => render(
  <MemoryRouter initialEntries={[path]}><Routes><Route path="/unsubscribe" element={<UnsubscribePage />} /></Routes></MemoryRouter>,
);

describe('UnsubscribePage', () => {
  beforeEach(() => { cleanup(); rpc.mockReset(); });

  it('asks before changing anything, then unsubscribes on the button', async () => {
    rpc.mockResolvedValueOnce({ data: { email_hint: 'd***@example.com', subscribed: true }, error: null });
    at(`/unsubscribe?t=${TOKEN}`);
    expect(await screen.findByRole('heading', { name: 'Stop product emails?' })).toBeTruthy();
    expect(screen.getByText('d***@example.com')).toBeTruthy();
    // Opening the page only read the status
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('marketing_by_token', { p_token: TOKEN });

    rpc.mockResolvedValueOnce({ data: { email_hint: 'd***@example.com', subscribed: false }, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }));
    expect(await screen.findByRole('heading', { name: 'You’re unsubscribed' })).toBeTruthy();
    expect(rpc).toHaveBeenLastCalledWith('set_marketing_by_token', { p_token: TOKEN, p_opt_in: false });
    expect(screen.getByText(/invoices, notices and password resets, are not affected/)).toBeTruthy();
  });

  it('offers to subscribe again', async () => {
    rpc.mockResolvedValueOnce({ data: { email_hint: 'd***@example.com', subscribed: false }, error: null });
    at(`/unsubscribe?t=${TOKEN}`);
    expect(await screen.findByRole('heading', { name: 'You’re not subscribed' })).toBeTruthy();
    rpc.mockResolvedValueOnce({ data: { email_hint: 'd***@example.com', subscribed: true }, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe again' }));
    expect(await screen.findByRole('heading', { name: 'You’re subscribed again' })).toBeTruthy();
    expect(rpc).toHaveBeenLastCalledWith('set_marketing_by_token', { p_token: TOKEN, p_opt_in: true });
  });

  it('does not call the server for a missing or malformed link', async () => {
    at('/unsubscribe?t=not-a-token');
    expect(await screen.findByRole('heading', { name: /don’t recognise this link|don't recognise this link/ })).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('says so when the link is well formed but unknown', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    at(`/unsubscribe?t=${TOKEN}`);
    expect(await screen.findByRole('heading', { name: /recognise this link/ })).toBeTruthy();
  });

  it('reports a server failure without claiming a change', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'down' } });
    at(`/unsubscribe?t=${TOKEN}`);
    await waitFor(() => expect(screen.getByRole('heading', { name: /couldn.t reach the server/ })).toBeTruthy());
    expect(screen.getByText(/Nothing has changed/)).toBeTruthy();
  });
});

describe('marketingPrefs', () => {
  it('recognises link tokens', () => {
    expect(isUnsubscribeToken(TOKEN)).toBe(true);
    expect(isUnsubscribeToken('abc')).toBe(false);
    expect(isUnsubscribeToken(null)).toBe(false);
  });

  it('reads and saves the signed-in preference', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = { rpc: vi.fn() } as any;
    sb.rpc.mockResolvedValueOnce({ data: true, error: null });
    expect(await myPreference(sb)).toBe('on');
    sb.rpc.mockResolvedValueOnce({ data: null, error: { message: 'no function' } });
    expect(await myPreference(sb)).toBeNull();
    // Not subscribed: asks whether a confirmation email is waiting
    sb.rpc.mockResolvedValueOnce({ data: false, error: null }).mockResolvedValueOnce({ data: true, error: null });
    expect(await myPreference(sb)).toBe('pending');
    expect(sb.rpc).toHaveBeenLastCalledWith('my_marketing_pending');
    sb.rpc.mockResolvedValueOnce({ data: false, error: null }).mockResolvedValueOnce({ data: false, error: null });
    expect(await myPreference(sb)).toBe('off');

    sb.rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await setMyPreference(sb, false)).toBe('off');
    expect(sb.rpc).toHaveBeenLastCalledWith('set_my_marketing_preference', { p_opt_in: false });
    sb.rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await setMyPreference(sb, true)).toBe('pending');
    sb.rpc.mockResolvedValueOnce({ data: true, error: null });
    expect(await setMyPreference(sb, true)).toBe('on');
    sb.rpc.mockResolvedValueOnce({ data: null, error: { message: 'down' } });
    expect(await setMyPreference(sb, true)).toBeNull();
  });
});
