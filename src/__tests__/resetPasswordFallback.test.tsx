/**
 * Password reset when the app's own email (Mailjet) isn't set up: the
 * reset-password function says so (fallback), and the page asks Supabase
 * Auth to send its built-in reset email instead of claiming one was sent.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const auth = vi.hoisted(() => ({ resetPasswordForEmail: vi.fn(async () => ({ error: null as null | { message: string } })) }));
vi.mock('@/lib/supabase', () => ({ isBackendEnabled: true, supabase: { auth } }));

import ResetPasswordPage from '@/features/auth/ResetPasswordPage';

describe('password reset without the app email service', () => {
  it('falls back to the built-in reset email', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true, fallback: true }), { status: 200 }));
    render(<MemoryRouter><ResetPasswordPage /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'owner@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send|reset/i }));
    await waitFor(() => expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('owner@example.com', { redirectTo: `${window.location.origin}/reset-password` }));
    expect(await screen.findByText(/Check your email for a password reset link/)).toBeTruthy();
  });

  it('says so when even the built-in email fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true, fallback: true }), { status: 200 }));
    auth.resetPasswordForEmail.mockResolvedValueOnce({ error: { message: 'Email rate limit exceeded' } });
    render(<MemoryRouter><ResetPasswordPage /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'owner@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send|reset/i }));
    expect(await screen.findByText("The reset email couldn't be sent: Email rate limit exceeded")).toBeTruthy();
  });
});
