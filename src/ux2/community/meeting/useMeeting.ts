/**
 * Everything one meeting's screens need, in one place: its items, the board,
 * the units, its private side and its ballots, and the edits that keep the
 * meeting row, the private record and the ballots in step.
 */
import { useEffect, useMemo } from 'react';
import { isBackendEnabled } from '@/lib/supabase';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useMeetingRecordStore } from '@/store/useMeetingRecordStore';
import type { CommunitySnapshot, MeetingRow } from '../metrics';
import { itemsOf, presentUnits, quorumUnits, type AgendaAttachment, type AgendaItem, type Ballot, type UnitAttendance } from '../meetingRecord';

const NO_ATT: AgendaAttachment[] = [];
const NO_UNITS: UnitAttendance[] = [];

export function useMeeting(row: MeetingRow, snap: CommunitySnapshot) {
  const m = row.meeting;
  const isBoard = snap.viewer.isBoard;
  const setItemsStore = useMeetingsStore(s => s.setItems);
  const updateMeeting = useMeetingsStore(s => s.updateMeeting);
  const updateSession = useMeetingsStore(s => s.updateSession);
  const board = useBuildingStore(s => s.board);
  const building = useBuildingStore(s => s.name) as string | undefined;
  const priv = useMeetingRecordStore(s => s.privateByMeeting[m.id]);
  const allBallots = useMeetingRecordStore(s => s.ballots);
  const counts = useMeetingRecordStore(s => s.counts[m.id]);
  const loadPrivate = useMeetingRecordStore(s => s.loadPrivate);
  const loadBallots = useMeetingRecordStore(s => s.loadBallots);
  const setPrivateAttachments = useMeetingRecordStore(s => s.setPrivateAttachments);
  const setAttendance = useMeetingRecordStore(s => s.setAttendance);
  const castBallot = useMeetingRecordStore(s => s.castBallot);

  useEffect(() => {
    if (!isBackendEnabled) return;
    if (isBoard) void loadPrivate(m.id);
    void loadBallots(m.id);
  }, [m.id, isBoard, loadPrivate, loadBallots]);

  const items = useMemo(() => itemsOf(m), [m]);
  const ballots = useMemo(() => allBallots.filter(b => b.meetingId === m.id), [allBallots, m.id]);
  const privateAtts = priv?.attachments ?? NO_ATT;
  const checkedIn = priv?.attendance ?? NO_UNITS;
  const units = snap.units;
  const boardNames = useMemo(() => (board.length ? board.map(b => b.name) : [...new Set(snap.meetings.flatMap(x => x.attendees.board))]), [board, snap.meetings]);
  const present = useMemo(() => presentUnits(checkedIn, ballots, units), [checkedIn, ballots, units]);
  const quorum = quorumUnits(units.length, m.session?.quorumPct);

  /** The items as they are in the store right now: edits build on this, never on what was rendered, so two quick edits can't undo each other. */
  const fresh = (): AgendaItem[] => itemsOf(useMeetingsStore.getState().meetings.find(x => x.id === m.id) ?? m);
  const freshPrivate = () => useMeetingRecordStore.getState().privateByMeeting[m.id] ?? { attachments: NO_ATT, attendance: NO_UNITS };
  const setItems = (next: AgendaItem[] | ((cur: AgendaItem[]) => AgendaItem[])) => setItemsStore(m.id, typeof next === 'function' ? next(fresh()) : next);
  const patchItem = (id: string, patch: Partial<AgendaItem> | ((it: AgendaItem) => Partial<AgendaItem>)) =>
    setItems(cur => cur.map(it => (it.id === id ? { ...it, ...(typeof patch === 'function' ? patch(it) : patch) } : it)));
  /** Attachments on an item: everyone's from the meeting, plus the board's own when the viewer is on the board. */
  const attachmentsOf = (it: AgendaItem) => (isBoard ? [...it.attachments, ...privateAtts.filter(a => a.itemId === it.id)] : it.attachments);
  const addAttachment = (it: AgendaItem, a: AgendaAttachment) => {
    if (a.audience === 'board') setPrivateAttachments(m.id, [...freshPrivate().attachments, { ...a, itemId: it.id }]);
    else patchItem(it.id, x => ({ attachments: [...x.attachments, a] }));
  };
  const removeAttachment = (it: AgendaItem, a: AgendaAttachment) => {
    if (a.audience === 'board') setPrivateAttachments(m.id, freshPrivate().attachments.filter(x => x.id !== a.id));
    else patchItem(it.id, x => ({ attachments: x.attachments.filter(y => y.id !== a.id) }));
  };
  const ballotsFor = (itemId: string): Ballot[] => ballots.filter(b => b.itemId === itemId);
  const votedCount = (itemId: string) => (isBoard ? ballotsFor(itemId).length : counts?.[itemId] ?? ballotsFor(itemId).length);

  return {
    m, row, snap, isBoard, items, units, boardNames, ballots, checkedIn, present, quorum, privateAtts,
    building: building || 'The building',
    fresh, freshPrivate, setItems, patchItem, attachmentsOf, addAttachment, removeAttachment, ballotsFor, votedCount,
    setPrivateAttachments: (a: AgendaAttachment[]) => setPrivateAttachments(m.id, a),
    setAttendance: (a: UnitAttendance[]) => setAttendance(m.id, a),
    castBallot,
    update: (patch: Parameters<typeof updateMeeting>[1]) => updateMeeting(m.id, patch),
    updateSession: (patch: Parameters<typeof updateSession>[1]) => updateSession(m.id, patch),
  };
}

export type MeetingCtx = ReturnType<typeof useMeeting>;
