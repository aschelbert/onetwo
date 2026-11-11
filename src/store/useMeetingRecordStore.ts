/**
 * The parts of a meeting record that don't sit on the meeting row: the board's
 * private side (board-only attachments, attendance by unit) and the owner
 * ballots on agenda items. With the backend on, both come from their own
 * tables (the board sees every ballot, an owner only their unit's) and ballots
 * are cast through the server's checked function. In demo mode they live here.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isBackendEnabled, getActiveTenantId } from '@/lib/supabase';
import * as meetingsSvc from '@/lib/services/meetings';
import type { AgendaAttachment, Ballot, UnitAttendance } from '@/ux2/community/meetingRecord';

interface PrivateRecord { attachments: AgendaAttachment[]; attendance: UnitAttendance[] }
const EMPTY: PrivateRecord = { attachments: [], attendance: [] };

/** Why a ballot didn't go in, in plain words. */
export function ballotError(code: string): string {
  if (/not_your_unit/.test(code)) return "That unit isn't linked to your account.";
  if (/vote_not_open/.test(code)) return 'This vote is not open right now.';
  if (/notice_not_sent/.test(code)) return "Voting opens when the meeting's notice goes out.";
  if (/bad_choice/.test(code)) return "That choice isn't on this ballot.";
  if (/method_not_allowed/.test(code)) return 'Only the board records paper ballots, proxies and the room count.';
  return 'The ballot could not be saved. Try again.';
}

interface MeetingRecordState {
  privateByMeeting: Record<string, PrivateRecord>;
  ballots: Ballot[];
  /** Units that have voted, by meeting and item: what an owner can see of everyone else. */
  counts: Record<string, Record<string, number>>;
  loadPrivate: (meetingId: string) => Promise<void>;
  privateOf: (meetingId: string) => PrivateRecord;
  setPrivateAttachments: (meetingId: string, attachments: AgendaAttachment[]) => void;
  setAttendance: (meetingId: string, attendance: UnitAttendance[]) => void;
  loadBallots: (meetingId: string) => Promise<void>;
  /** Returns an error in plain words, or null when it went in. */
  castBallot: (b: Omit<Ballot, 'castAt'>) => Promise<string | null>;
  removeBallot: (meetingId: string, itemId: string, unit: string) => void;
}

function savePrivate(meetingId: string) {
  if (!isBackendEnabled) return;
  const tid = getActiveTenantId();
  if (!tid) return;
  const rec = useMeetingRecordStore.getState().privateByMeeting[meetingId] ?? EMPTY;
  void meetingsSvc.saveMeetingPrivate(tid, meetingId, rec);
}

export const useMeetingRecordStore = create<MeetingRecordState>()(persist((set, get) => ({
  privateByMeeting: {},
  ballots: [],
  counts: {},

  loadPrivate: async (meetingId) => {
    const rec = await meetingsSvc.fetchMeetingPrivate(meetingId);
    if (rec) set(s => ({ privateByMeeting: { ...s.privateByMeeting, [meetingId]: rec } }));
  },
  privateOf: (meetingId) => get().privateByMeeting[meetingId] ?? EMPTY,
  setPrivateAttachments: (meetingId, attachments) => {
    set(s => ({ privateByMeeting: { ...s.privateByMeeting, [meetingId]: { ...(s.privateByMeeting[meetingId] ?? EMPTY), attachments } } }));
    savePrivate(meetingId);
  },
  setAttendance: (meetingId, attendance) => {
    set(s => ({ privateByMeeting: { ...s.privateByMeeting, [meetingId]: { ...(s.privateByMeeting[meetingId] ?? EMPTY), attendance } } }));
    savePrivate(meetingId);
  },

  loadBallots: async (meetingId) => {
    const [rows, counts] = await Promise.all([meetingsSvc.fetchMeetingBallots(meetingId), meetingsSvc.fetchBallotCounts(meetingId)]);
    set(s => ({
      ballots: rows ? [...s.ballots.filter(b => b.meetingId !== meetingId), ...rows] : s.ballots,
      counts: counts ? { ...s.counts, [meetingId]: counts } : s.counts,
    }));
  },

  castBallot: async (b) => {
    const local: Ballot = { ...b, castAt: new Date().toISOString() };
    const put = (ballot: Ballot) => set(s => {
      const had = s.ballots.some(x => x.meetingId === ballot.meetingId && x.itemId === ballot.itemId && x.unit === ballot.unit);
      const ballots = [...s.ballots.filter(x => !(x.meetingId === ballot.meetingId && x.itemId === ballot.itemId && x.unit === ballot.unit)), ballot];
      const m = { ...(s.counts[ballot.meetingId] ?? {}) };
      if (!had) m[ballot.itemId] = (m[ballot.itemId] ?? 0) + 1;
      return { ballots, counts: { ...s.counts, [ballot.meetingId]: m } };
    });
    if (!isBackendEnabled) { put(local); return null; }
    const r = await meetingsSvc.castMeetingBallot(b);
    if (r.error || !r.ballot) return ballotError(r.error ?? '');
    put(r.ballot);
    return null;
  },

  removeBallot: (meetingId, itemId, unit) => {
    set(s => {
      const had = s.ballots.some(x => x.meetingId === meetingId && x.itemId === itemId && x.unit === unit);
      const m = { ...(s.counts[meetingId] ?? {}) };
      if (had) m[itemId] = Math.max(0, (m[itemId] ?? 1) - 1);
      return { ballots: s.ballots.filter(x => !(x.meetingId === meetingId && x.itemId === itemId && x.unit === unit)), counts: { ...s.counts, [meetingId]: m } };
    });
    if (isBackendEnabled) void meetingsSvc.deleteMeetingBallot(meetingId, itemId, unit);
  },
}), {
  name: 'onetwo-meeting-records',
  version: 1,
  // With the backend on, the tables are the source; don't carry another building's ballots across sessions.
  partialize: (s) => (isBackendEnabled ? {} : { privateByMeeting: s.privateByMeeting, ballots: s.ballots, counts: s.counts }) as Partial<MeetingRecordState>,
}));
