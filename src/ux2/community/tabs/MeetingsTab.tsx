import BoardRoomPage from '@/features/boardroom/BoardRoomPage';
import CommunityRoomPage from '@/features/community/CommunityRoomPage';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { Button, Card, Chip, Inner, SectionLabel } from '../../components';
import { dayLabel } from '../../home/calendar';
import { meetingRows, meetingsSummary, type MeetingRow, type CommunitySnapshot } from '../metrics';

function Rsvp({ row, snap }: { row: MeetingRow; snap: CommunitySnapshot }) {
  const updateAttendees = useMeetingsStore(s => s.updateAttendees);
  const m = row.meeting;
  const key = snap.viewer.isBoard ? 'board' : 'owners';
  const toggle = () => {
    const list = m.attendees[key];
    const next = row.mine ? list.filter(n => n !== snap.viewer.name) : [...list, snap.viewer.name];
    updateAttendees(m.id, { ...m.attendees, [key]: next });
  };
  return <Button size="sm" variant={row.mine ? 'ghost' : 'primary'} onClick={toggle}>{row.mine ? 'Going · change' : 'RSVP'}</Button>;
}

export default function MeetingsTab({ snap, highlightId }: { snap: CommunitySnapshot; highlightId: string | null }) {
  const rows = meetingRows(snap);
  const sum = meetingsSummary(rows);
  const isBoard = snap.viewer.isBoard;
  const next = (highlightId && rows.find(r => r.meeting.id === highlightId && r.state === 'upcoming')) || sum.upcoming.find(r => !r.datePassed) || sum.next;
  const boardCount = new Set(snap.meetings.flatMap(m => m.attendees.board)).size;

  return (
    <div className="flex flex-col gap-5">
      {next ? (
        <Card tone={next.noticeOverdue && isBoard ? 'outline' : 'surface'} aria-label="Next meeting">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <SectionLabel>Next meeting{next.noticeOverdue && isBoard ? ' · needs you' : ''}</SectionLabel>
                {isBoard && <Chip tone={next.noticeSent ? 'sage' : next.noticeOverdue ? 'red' : 'amber'}>{next.noticeSent ? 'Notice sent' : next.noticeOverdue ? `Notice overdue · due ${dayLabel(next.noticeDue)}` : `Notice due ${dayLabel(next.noticeDue)}`}</Chip>}
              </div>
              <div className="font-display text-2xl font-semibold text-ux2-ink">{next.meeting.title} · {dayLabel(next.meeting.date)}{next.meeting.time ? `, ${next.meeting.time}` : ''}</div>
              <div className="text-sm text-ux2-muted">{next.meeting.location || 'Location to set'}{next.meeting.virtualLink ? ' · remote link' : ''} · {next.agendaCount} agenda item{next.agendaCount === 1 ? '' : 's'} · {next.rsvpUnits} owner{next.rsvpUnits === 1 ? '' : 's'} and {next.rsvpBoard} board member{next.rsvpBoard === 1 ? '' : 's'} going</div>
            </div>
            <Rsvp row={next} snap={snap} />
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <Inner className="flex flex-col gap-1">
              <span className="text-xs text-ux2-muted">Notice</span>
              <span className={`text-[15px] font-semibold ${next.noticeSent ? 'text-ux2-ink' : next.noticeOverdue ? 'text-ux2-red-ink' : 'text-ux2-ink'}`}>{next.noticeSent ? 'Sent' : next.noticeOverdue ? `Not sent · due ${dayLabel(next.noticeDue)}` : `Due ${dayLabel(next.noticeDue)}`}</span>
              <span className="text-xs text-ux2-muted">Goes by email and in-app card to all {snap.units.length} units from the Board Room outbox.</span>
            </Inner>
            <Inner className="flex flex-col gap-1">
              <span className="text-xs text-ux2-muted">Agenda</span>
              <span className="text-[15px] font-semibold text-ux2-ink">{next.agendaCount} item{next.agendaCount === 1 ? '' : 's'}</span>
              <span className="truncate text-xs text-ux2-muted">{next.meeting.agenda.slice(0, 3).join(', ') || 'Nothing on it yet'}{next.meeting.agenda.length > 3 ? ', …' : ''}</span>
            </Inner>
            <Inner className="flex flex-col gap-1">
              <span className="text-xs text-ux2-muted">RSVP</span>
              <span className="text-[15px] font-semibold text-ux2-ink">{next.rsvpUnits} of {snap.units.length} units</span>
              <span className="text-xs text-ux2-muted">{next.rsvpBoard} board member{next.rsvpBoard === 1 ? '' : 's'} confirmed.</span>
            </Inner>
            <Inner className="flex flex-col gap-1">
              <span className="text-xs text-ux2-muted">Room</span>
              <span className="text-[15px] font-semibold text-ux2-ink">{next.meeting.location || 'To set'}</span>
              <span className="text-xs text-ux2-muted">{next.meeting.virtualLink ? 'Remote link is in the notice.' : 'In person; add a remote link on the meeting.'}</span>
            </Inner>
          </div>
          <Inner className="text-xs text-ux2-muted">
            {isBoard ? 'Edit the meeting, send the notice, take attendance and record minutes below; sending the notice clears the Home card and the obligation.' : 'RSVP so quorum is known. The agenda goes out with the notice; minutes are posted here once the board approves them.'}
          </Inner>
        </Card>
      ) : (
        <Inner className="text-sm text-ux2-muted">No meeting is scheduled.{isBoard ? ' Schedule one below.' : ''}</Inner>
      )}

      <Card aria-label="All meetings">
        <SectionLabel>All meetings · {sum.upcoming.length} upcoming · {sum.past.length} past</SectionLabel>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.06em] text-ux2-muted">
                <th className="py-2 pr-3 font-semibold">Meeting</th><th className="py-2 pr-3 font-semibold">When</th>{isBoard && <th className="hidden py-2 pr-3 font-semibold md:table-cell">Notice</th>}<th className="hidden py-2 pr-3 font-semibold md:table-cell">Agenda</th><th className="hidden py-2 pr-3 font-semibold md:table-cell">Attendance</th><th className="py-2 font-semibold">Minutes</th>
              </tr>
            </thead>
            <tbody>
              {[...sum.upcoming, ...sum.past].map(r => (
                <tr key={r.meeting.id} data-meeting={r.meeting.id} className={`border-t border-ux2-line ${r.meeting.id === highlightId ? 'bg-ux2-cyan/30' : ''}`}>
                  <td className="py-2 pr-3"><div className="font-semibold text-ux2-ink">{r.meeting.title}</div><div className="text-xs text-ux2-dim">{r.meeting.type.toLowerCase()} · {r.state === 'upcoming' ? (r.datePassed ? 'scheduled · date passed' : 'upcoming') : r.meeting.status.toLowerCase()}</div></td>
                  <td className="py-2 pr-3 whitespace-nowrap text-ux2-ink">{dayLabel(r.meeting.date)}{r.meeting.time ? `, ${r.meeting.time}` : ''}</td>
                  {isBoard && <td className="hidden py-2 pr-3 md:table-cell">{r.state === 'upcoming' ? <Chip tone={r.noticeSent ? 'sage' : r.noticeOverdue ? 'red' : 'amber'}>{r.noticeSent ? 'Sent' : r.noticeOverdue ? 'Overdue' : `Due ${dayLabel(r.noticeDue)}`}</Chip> : <span className="text-xs text-ux2-dim">{r.noticeSent ? 'Sent' : '—'}</span>}</td>}
                  <td className="hidden py-2 pr-3 text-xs text-ux2-muted md:table-cell">{r.agendaCount} item{r.agendaCount === 1 ? '' : 's'}</td>
                  <td className="hidden py-2 pr-3 text-xs text-ux2-muted md:table-cell">{r.rsvpBoard} of {Math.max(boardCount, r.rsvpBoard)} board · {r.rsvpUnits} owners</td>
                  <td className="py-2"><Chip tone={r.minutes === 'approved' ? 'sage' : r.minutes === 'draft' ? 'amber' : 'ghost'}>{r.minutes === 'approved' ? 'Approved' : r.minutes === 'draft' ? 'Awaiting approval' : r.state === 'upcoming' ? 'After the meeting' : 'None'}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Inner className="text-xs text-ux2-muted">Schedule a meeting sets the date, room and remote link and creates the notice and agenda with the right lead time; sending the notice emails every active member. Minutes are approved by a board majority and then posted to owners.</Inner>
      </Card>

      <Card aria-label="Meeting details">
        <SectionLabel>{isBoard ? 'Schedule, notices, attendance, minutes and approvals' : 'Agendas, documents and minutes'}</SectionLabel>
        <div className="ux2-legacy">{isBoard ? <BoardRoomPage embedded tab="meetings" /> : <CommunityRoomPage embedded tab="meetings" />}</div>
      </Card>
    </div>
  );
}
