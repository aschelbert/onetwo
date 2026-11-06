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
        <Card tone={next.noticeOverdue && isBoard ? 'navy' : 'surface'} aria-label="Next meeting">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <SectionLabel className={next.noticeOverdue && isBoard ? 'text-white/[0.66]' : undefined}>Next meeting{next.noticeOverdue && isBoard ? ' · needs you' : ''}</SectionLabel>
              <div className="text-xl font-semibold">{next.meeting.title} · {dayLabel(next.meeting.date)}{next.meeting.time ? `, ${next.meeting.time}` : ''}</div>
              <div className={`text-sm ${next.noticeOverdue && isBoard ? 'text-white/[0.8]' : 'text-ux2-muted'}`}>{next.meeting.location || 'Location to set'}{next.meeting.virtualLink ? ' · remote link' : ''} · {next.agendaCount} agenda item{next.agendaCount === 1 ? '' : 's'} · {next.rsvpUnits} owner{next.rsvpUnits === 1 ? '' : 's'} and {next.rsvpBoard} board member{next.rsvpBoard === 1 ? '' : 's'} going</div>
            </div>
            <div className="flex items-center gap-2">
              {isBoard && <Chip tone={next.noticeSent ? 'sage' : next.noticeOverdue ? 'red' : 'amber'}>{next.noticeSent ? 'Notice sent' : next.noticeOverdue ? `Notice overdue · due ${dayLabel(next.noticeDue)}` : `Notice due ${dayLabel(next.noticeDue)}`}</Chip>}
              <Rsvp row={next} snap={snap} />
            </div>
          </div>
          {next.meeting.agenda.length > 0 && (
            <ol className={`m-0 list-decimal pl-5 text-sm ${next.noticeOverdue && isBoard ? 'text-white/[0.9]' : 'text-ux2-ink'}`}>
              {next.meeting.agenda.map((a, i) => <li key={i} className="py-0.5">{a}</li>)}
            </ol>
          )}
          <Inner className={`text-xs ${next.noticeOverdue && isBoard ? 'border-white/20 bg-white/10 text-white/[0.8]' : 'text-ux2-muted'}`}>
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
