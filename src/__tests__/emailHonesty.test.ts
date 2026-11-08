/**
 * Emails the app sends say what really happened. A function without Mailjet
 * keys answers 200 with success: false, which is reported as email not being
 * set up, never as sent. A meeting notice is posted in-app and logged either
 * way, and the note says whether it was emailed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) } }, isBackendEnabled: false, getActiveTenantId: () => 't1', logDbError: () => {} }));

import { EMAIL_NOT_SET_UP, callEmailFunction } from '@/lib/services/email';
import { sendMeetingNotice } from '@/ux2/community/meetingNotice';
import { useComplianceStore } from '@/store/useComplianceStore';
import { noticeSentFor } from '@/ux2/runbook/adapters';
import type { Meeting } from '@/store/useMeetingsStore';

const respond = (status: number, body: unknown) => vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
const meeting: Meeting = { id: 'm1', title: 'Annual Meeting', type: 'ANNUAL', status: 'SCHEDULED', date: '2026-12-10', time: '19:00', location: 'Community Room', virtualLink: '', agenda: ['Budget', 'Election'], notes: '', attendees: { board: [], owners: [], guests: [] }, minutes: '', votes: [], linkedCaseIds: [], linkedVoteIds: [], documents: [], minutesApprovals: [] };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://sb.example');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
  useComplianceStore.setState({ announcements: [], communications: [] });
});

describe('callEmailFunction', () => {
  it('reports email not set up, sent counts, partial sends and missing functions honestly', async () => {
    respond(200, { success: false, error: 'Email not configured — Mailjet credentials missing' });
    expect(await callEmailFunction('send-announcement', {})).toEqual({ sent: 0, reason: EMAIL_NOT_SET_UP });
    respond(200, { success: true, sent: 12, total: 12 });
    expect(await callEmailFunction('send-meeting-notice', {})).toEqual({ sent: 12 });
    respond(200, { success: true, sent: 9, total: 12 });
    expect(await callEmailFunction('send-meeting-notice', {})).toEqual({ sent: 9, reason: '3 of 12 couldn\'t be delivered' });
    respond(200, { success: true, sent: 0, message: 'No recipients found' });
    expect(await callEmailFunction('send-meeting-notice', {})).toEqual({ sent: 0, reason: 'no recipients found' });
    respond(404, 'not found');
    expect(await callEmailFunction('send-meeting-notice', {})).toEqual({ sent: 0, reason: "the send-meeting-notice function isn't deployed" });
  });
});

describe('sending a meeting notice', () => {
  it('posts it in-app, logs it (which marks the notice sent) and says it was not emailed when email is not set up', async () => {
    respond(200, { success: false, error: 'Email not configured' });
    const r = await sendMeetingNotice(meeting, 'Bea Board', '2026-11-20');
    expect(r.emailed).toBe(0);
    expect(r.note).toBe(`Notice posted in-app for every member, but not emailed: ${EMAIL_NOT_SET_UP}. Owners who don't use the app need it another way (print it, or forward it).`);
    const { announcements, communications } = useComplianceStore.getState();
    expect(announcements[0]).toMatchObject({ title: 'Meeting notice: Annual Meeting', category: 'meeting', pinned: true });
    expect(announcements[0].body).toContain('1. Budget');
    expect(communications[0]).toMatchObject({ type: 'notice', status: 'sent', method: 'portal', respondedBy: 'Bea Board' });
    expect(noticeSentFor(meeting, communications)).toBe(true);
  });

  it('says how many it was emailed to when email works', async () => {
    respond(200, { success: true, sent: 24, total: 24 });
    const r = await sendMeetingNotice(meeting, 'Bea Board', '2026-11-20');
    expect(r).toEqual({ emailed: 24, note: 'Notice posted in-app and emailed to 24 members.' });
    expect(useComplianceStore.getState().communications[0].method).toBe('email+portal');
  });
});
