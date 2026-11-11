/**
 * Pieces shared by the meetings list and the single-meeting page: the brand
 * gradient behind a meeting's header, the button styles that read on it, the
 * RSVP toggle and plain-words labels for a meeting's type and state.
 */
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { Button } from '../components';
import type { CommunitySnapshot, MeetingRow } from './metrics';

/** Brand navy sweeping diagonally into brand red, with a soft red glow in the far corner. */
export const MEETING_BG = 'radial-gradient(120% 140% at 100% 100%, rgba(226, 59, 78, 0.9) 0%, rgba(226, 59, 78, 0) 55%), linear-gradient(125deg, #0D1B2E 0%, #0D1B2E 35%, #3B1E3C 68%, #E23B4E 100%)';
/** A white detail tile on the gradient. */
export const MEETING_TILE = 'flex flex-col gap-1 rounded-[14px] border border-white bg-white px-3.5 py-3';
export const ON_DARK_GHOST = '!border-white/30 !bg-white/10 !text-white hover:!bg-white/20';
export const ON_DARK_PRIMARY = '!bg-ux2-cyan !text-ux2-navy hover:!bg-white';

export const typeLabel = (type: string) => (/board/i.test(type) ? 'Board meeting' : /annual/i.test(type) ? 'Annual meeting' : /special/i.test(type) ? 'Special meeting' : /quarter/i.test(type) ? 'Quarterly meeting' : `${type.charAt(0)}${type.slice(1).toLowerCase()} meeting`);
export const stateLabel = (r: MeetingRow) => (r.state === 'cancelled' ? 'Cancelled' : r.state === 'past' ? 'Held' : r.datePassed ? 'Date passed · not marked held' : r.daysLeft === 0 ? 'Today' : `In ${r.daysLeft} day${r.daysLeft === 1 ? '' : 's'}`);
export const itemKind = (s: string) => (/vote|adopt|approve|elect/i.test(s) ? 'Vote' : /update|report/i.test(s) ? 'Update' : 'Discussion');

export function Rsvp({ row, snap, onDark }: { row: MeetingRow; snap: CommunitySnapshot; onDark?: boolean }) {
  const updateAttendees = useMeetingsStore(s => s.updateAttendees);
  const m = row.meeting;
  const key = snap.viewer.isBoard ? 'board' : 'owners';
  const toggle = () => {
    const list = m.attendees[key];
    const next = row.mine ? list.filter(n => n !== snap.viewer.name) : [...list, snap.viewer.name];
    updateAttendees(m.id, { ...m.attendees, [key]: next });
  };
  return <Button size="sm" variant={row.mine ? 'ghost' : 'primary'} className={onDark ? (row.mine ? ON_DARK_GHOST : ON_DARK_PRIMARY) : undefined} onClick={toggle}>{row.mine ? 'Going · change' : 'RSVP'}</Button>;
}
