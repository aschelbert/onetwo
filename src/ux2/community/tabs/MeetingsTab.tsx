import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { Button, Card, Chip, Inner, PillTabs, SectionLabel, Table, Th, Td, Cell, Why, Field, INPUT, HeaderActions } from '../../components';
import { dayLabel } from '../../home/calendar';
import { meetingRows, meetingsSummary, type MeetingRow, type CommunitySnapshot } from '../metrics';
import { sendMeetingNotice } from '../meetingNotice';

type Filter = 'all' | 'upcoming' | 'past' | 'board' | 'owner';

/** The next meeting sits on brand navy sweeping diagonally into brand red, with a soft red glow in the far corner. */
const NEXT_MEETING_BG = 'radial-gradient(120% 140% at 100% 100%, rgba(226, 59, 78, 0.9) 0%, rgba(226, 59, 78, 0) 55%), linear-gradient(125deg, #0D1B2E 0%, #0D1B2E 35%, #3B1E3C 68%, #E23B4E 100%)';
const NEXT_TILE = 'flex flex-col gap-1 rounded-[14px] border border-white bg-white px-3.5 py-3';
const ON_DARK_GHOST = '!border-white/30 !bg-white/10 !text-white hover:!bg-white/20';
const ON_DARK_PRIMARY = '!bg-ux2-cyan !text-ux2-navy hover:!bg-white';

function Rsvp({ row, snap, onDark }: { row: MeetingRow; snap: CommunitySnapshot; onDark?: boolean }) {
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

function ScheduleForm({ onClose }: { onClose: () => void }) {
  const add = useMeetingsStore(s => s.addMeeting);
  const [title, setTitle] = useState('Board meeting');
  const [type, setType] = useState('BOARD');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('19:00');
  const [location, setLocation] = useState('Community room');
  const [link, setLink] = useState('');
  return (
    <form aria-label="Schedule a meeting" onSubmit={e => { e.preventDefault(); if (!date) return; add({ title, type, status: 'SCHEDULED', date, time, location, virtualLink: link, agenda: [], notes: '' }); onClose(); }} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <div className="w-full text-sm font-semibold text-ux2-ink">Schedule a meeting · sets the date, room and remote link, and creates the notice draft and the agenda with the right lead time</div>
      <Field label="Title" className="min-w-[200px] flex-1"><input value={title} onChange={e => setTitle(e.target.value)} className={INPUT} /></Field>
      <Field label="Type" className="w-[150px]"><select value={type} onChange={e => setType(e.target.value)} className={INPUT}><option value="BOARD">Board</option><option value="ANNUAL">Annual</option><option value="SPECIAL">Special</option><option value="QUARTERLY">Quarterly</option></select></Field>
      <Field label="Date" className="w-[160px]"><input type="date" value={date} onChange={e => setDate(e.target.value)} className={INPUT} /></Field>
      <Field label="Time" className="w-[120px]"><input type="time" value={time} onChange={e => setTime(e.target.value)} className={INPUT} /></Field>
      <Field label="Room" className="w-[180px]"><input value={location} onChange={e => setLocation(e.target.value)} className={INPUT} /></Field>
      <Field label="Remote link" className="min-w-[200px] flex-1"><input value={link} onChange={e => setLink(e.target.value)} placeholder="https://" className={INPUT} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={!date}>Schedule</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

export default function MeetingsTab({ snap, highlightId }: { snap: CommunitySnapshot; highlightId: string | null }) {
  const navigate = useNavigate();
  const rows = meetingRows(snap);
  const sum = meetingsSummary(rows);
  const isBoard = snap.viewer.isBoard;
  const [noticeNote, setNoticeNote] = useState<string | null>(null);
  const [sendingNotice, setSendingNotice] = useState(false);
  const sendNotice = async (m: MeetingRow['meeting']) => {
    setSendingNotice(true); setNoticeNote(null);
    try { setNoticeNote((await sendMeetingNotice(m, snap.viewer.name, snap.today)).note); } finally { setSendingNotice(false); }
  };
  const board = useBuildingStore(s => s.board);
  const cases = useIssuesStore(s => s.cases);
  const updateMeeting = useMeetingsStore(s => s.updateMeeting);
  const approveMinutes = useMeetingsStore(s => s.approveMinutes);
  const [filter, setFilter] = useState<Filter>('all');
  const [scheduling, setScheduling] = useState(false);
  const [editingAgenda, setEditingAgenda] = useState<number | 'new' | null>(null);
  const [agendaText, setAgendaText] = useState('');
  const next = (highlightId && rows.find(r => r.meeting.id === highlightId && r.state === 'upcoming')) || sum.upcoming.find(r => !r.datePassed) || sum.next;
  const boardCount = board.length || new Set(snap.meetings.flatMap(m => m.attendees.board)).size;
  const list = useMemo(() => {
    const all = [...sum.upcoming, ...sum.past];
    return all.filter(r => filter === 'all' ? true : filter === 'upcoming' ? r.state === 'upcoming' : filter === 'past' ? r.state === 'past' : filter === 'board' ? /board/i.test(r.meeting.type) : !/board/i.test(r.meeting.type));
  }, [sum.upcoming, sum.past, filter]);
  const minutesDrafts = sum.past.filter(r => r.minutes !== 'none').slice(0, 3);
  const approvedBy = (r: MeetingRow) => r.meeting.minutesApprovals?.map(a => a.name) ?? [];
  const majority = Math.max(1, Math.ceil(boardCount / 2));
  const lastPast = sum.past[0];
  const saveAgenda = () => {
    if (!next) return;
    const agenda = [...next.meeting.agenda];
    if (editingAgenda === 'new') { if (agendaText.trim()) agenda.push(agendaText.trim()); }
    else if (typeof editingAgenda === 'number') agenda[editingAgenda] = agendaText.trim() || agenda[editingAgenda];
    updateMeeting(next.meeting.id, { agenda });
    setEditingAgenda(null); setAgendaText('');
  };
  const itemKind = (s: string) => (/vote|adopt|approve|elect/i.test(s) ? 'Vote' : /update|report/i.test(s) ? 'Update' : 'Discussion');
  const linkedCase = (s: string) => cases.find(c => c.status !== 'closed' && s.toLowerCase().includes(c.title.toLowerCase().split(' ')[0]) && c.title.length > 6);

  return (
    <div className="flex flex-col gap-4">
      {isBoard && <HeaderActions><Button onClick={() => setScheduling(v => !v)}>Schedule a meeting</Button></HeaderActions>}
      {scheduling && <ScheduleForm onClose={() => setScheduling(false)} />}

      {next ? (
        <Card tone="navy" aria-label="Next meeting" data-overdue={next.noticeOverdue && isBoard ? '1' : undefined} style={{ backgroundImage: NEXT_MEETING_BG }} className="border-transparent">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2"><SectionLabel className="!text-white/[0.72]">Next meeting{next.noticeOverdue && isBoard ? ' · needs you' : ''}</SectionLabel>{isBoard && <Chip tone={next.noticeSent ? 'sage' : next.noticeOverdue ? 'red' : 'amber'}>{next.noticeSent ? 'Notice sent' : next.noticeOverdue ? `Notice overdue · due ${dayLabel(next.noticeDue)}` : `Notice due ${dayLabel(next.noticeDue)}`}</Chip>}</div>
              <div className="font-display text-2xl font-semibold text-white">{next.meeting.title} · {dayLabel(next.meeting.date)}{next.meeting.time ? `, ${next.meeting.time}` : ''}</div>
              <div className="text-sm text-white/[0.78]">{next.meeting.location || 'Location to set'}{next.meeting.virtualLink ? ' and remote' : ''} · open to all owners · {next.agendaCount} agenda item{next.agendaCount === 1 ? '' : 's'} · {next.rsvpUnits} of {snap.units.length} units have replied</div>
            </div>
            <div className="flex gap-1.5">
              {isBoard ? <><Button size="sm" variant="ghost" className={ON_DARK_GHOST} onClick={() => setEditingAgenda('new')}>Edit the draft</Button>{!next.noticeSent && <Button size="sm" className={ON_DARK_PRIMARY} disabled={sendingNotice} onClick={() => { void sendNotice(next.meeting); }}>{sendingNotice ? 'Sending…' : 'Send notice'}</Button>}</> : <Rsvp row={next} snap={snap} onDark />}
            </div>
          </div>
          {noticeNote && <div role="status" className="text-[13px] text-white">{noticeNote}</div>}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <div className={NEXT_TILE}><span className="text-xs text-ux2-muted">Notice</span><span className={`text-[15px] font-semibold ${next.noticeOverdue ? 'text-ux2-red-ink' : 'text-ux2-ink'}`}>{next.noticeSent ? 'Sent' : next.noticeOverdue ? `Not sent · ${Math.abs(Math.round((Date.parse(snap.today) - Date.parse(next.noticeDue)) / 86400000))} day${Math.abs(Math.round((Date.parse(snap.today) - Date.parse(next.noticeDue)) / 86400000)) === 1 ? '' : 's'} late` : `Due ${dayLabel(next.noticeDue)}`}</span><span className="text-xs text-ux2-muted">Posted in-app for every member and emailed to everyone with an address on file. Ten days' notice per the bylaws and DC Code § 29-1101 et seq.</span></div>
            <div className={NEXT_TILE}><span className="text-xs text-ux2-muted">Agenda</span><span className="text-[15px] font-semibold text-ux2-ink">{next.agendaCount} item{next.agendaCount === 1 ? '' : 's'}</span><span className="truncate text-xs text-ux2-muted">{next.meeting.agenda.slice(0, 4).join(', ') || 'Nothing on it yet'}. Goes out with the notice.</span></div>
            <div className={NEXT_TILE}><span className="text-xs text-ux2-muted">RSVP</span><span className="text-[15px] font-semibold text-ux2-ink">{next.rsvpUnits} of {snap.units.length} units</span><span className="text-xs text-ux2-muted">Board: {next.rsvpBoard} of {boardCount} confirmed{board.filter(b => !next.meeting.attendees.board.includes(b.name))[0] ? `, ${board.filter(b => !next.meeting.attendees.board.includes(b.name))[0].name.split(' ')[0]} not yet` : ''}.</span></div>
            <div className={NEXT_TILE}><span className="text-xs text-ux2-muted">Room</span><span className="text-[15px] font-semibold text-ux2-ink">{next.meeting.location ? `${next.meeting.location} reserved` : 'To set'}</span><span className="text-xs text-ux2-muted">{next.meeting.virtualLink ? 'Remote link added to the notice.' : 'In person; add a remote link on the meeting.'}</span></div>
          </div>
          <Why className="!text-white/[0.72]">{isBoard ? 'This item is also on Home and in Building › Obligations. Sending the notice clears all three.' : 'RSVP so quorum is known. The agenda goes out with the notice; minutes are posted here once the board approves them.'}</Why>
        </Card>
      ) : <Inner className="text-sm text-ux2-muted">No meeting is scheduled.{isBoard ? ' Schedule one above.' : ''}</Inner>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PillTabs size="filter" aria-label="Meeting filters" value={filter} onChange={setFilter} tabs={[{ id: 'all', label: 'All meetings' }, { id: 'upcoming', label: `Upcoming · ${sum.upcoming.length}` }, { id: 'past', label: `Past · ${sum.past.length}` }, { id: 'board', label: 'Board meetings' }, { id: 'owner', label: 'Owner meetings' }]} />
        <span className="text-xs text-ux2-muted"><button type="button" onClick={() => navigate('/home?view=calendar')} className="font-semibold text-ux2-teal hover:underline">Open the calendar</button> · Minutes archive is in <button type="button" onClick={() => navigate('/building?tab=documents')} className="font-semibold text-ux2-teal hover:underline">Building › Documents</button></span>
      </div>

      <Card aria-label="All meetings" className="gap-2.5">
        <SectionLabel>Schedule</SectionLabel>
        {list.length === 0 ? <Inner className="text-sm text-ux2-muted">Nothing here.</Inner> : (
          <Table minWidth={820}>
            <thead><tr><Th>Meeting</Th><Th>When and where</Th>{isBoard && <Th>Notice</Th>}<Th>Agenda</Th><Th>Attendance</Th><Th>Minutes</Th></tr></thead>
            <tbody>
              {list.map(r => (
                <tr key={r.meeting.id} data-meeting={r.meeting.id} className={r.meeting.id === highlightId ? 'bg-ux2-cyan/30' : ''}>
                  <Td><Cell title={r.meeting.title} note={`${/board/i.test(r.meeting.type) ? 'Open to owners' : r.meeting.type.toLowerCase()} · ${r.state === 'upcoming' ? (r.datePassed ? 'date passed' : 'upcoming') : r.meeting.status.toLowerCase()}`} /></Td>
                  <Td><Cell title={<span className="font-normal">{dayLabel(r.meeting.date)}{r.meeting.time ? `, ${r.meeting.time}` : ''}</span>} note={`${r.meeting.location || 'Room to set'}${r.meeting.virtualLink ? ' and remote' : ''}`} /></Td>
                  {isBoard && <Td>{r.state === 'upcoming' ? <Chip tone={r.noticeSent ? 'sage' : r.noticeOverdue ? 'red' : 'amber'}>{r.noticeSent ? 'Sent' : r.noticeOverdue ? `Overdue · due ${dayLabel(r.noticeDue)}` : `Due ${dayLabel(r.noticeDue)}`}</Chip> : <span className="text-ux2-muted">{r.noticeSent ? 'Sent' : '—'}</span>}</Td>}
                  <Td className="text-ux2-muted">{r.agendaCount ? `${r.agendaCount} item${r.agendaCount === 1 ? '' : 's'}` : 'Not started'}</Td>
                  <Td className="text-ux2-muted">{r.state === 'upcoming' ? `${r.rsvpUnits} of ${snap.units.length} RSVP` : `${r.rsvpBoard} of ${boardCount} board · ${r.rsvpUnits} of ${snap.units.length} units`}</Td>
                  <Td>{r.minutes === 'approved' ? <span className="text-ux2-ink">Approved{r.meeting.minutesApprovals?.[0]?.date ? ` ${dayLabel(r.meeting.minutesApprovals[0].date.slice(0, 10))}` : ''} · <span className="font-semibold text-ux2-teal">posted</span></span> : r.minutes === 'draft' ? <Chip tone="amber">Awaiting approval</Chip> : <span className="text-ux2-muted">After the meeting</span>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Why>Schedule a meeting sets the date, room and remote link, and creates the notice draft and the agenda with the right lead time. Rescheduling re-sends the notice.</Why>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
        <Card aria-label="Agenda" className="gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Agenda{next ? ` · ${dayLabel(next.meeting.date)} · ${next.agendaCount} item${next.agendaCount === 1 ? '' : 's'}, about ${Math.max(15, next.agendaCount * 15)} minutes` : ''}</SectionLabel>{isBoard && next && <Button size="sm" variant="ghost" onClick={() => { setEditingAgenda('new'); setAgendaText(''); }}>Add an item</Button>}</div>
          {!next ? <Why>No upcoming meeting.</Why> : next.meeting.agenda.length === 0 && editingAgenda === null ? <Inner className="text-sm text-ux2-muted">Nothing on the agenda yet.</Inner> : (
            <div className="flex flex-col gap-2">
              {next.meeting.agenda.map((item, i) => {
                const c = linkedCase(item);
                return (
                  <Fragment key={i}>
                    <Inner className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ux2-navy text-xs font-bold text-white">{i + 1}</span><Cell title={item} note={c ? <button type="button" onClick={() => navigate(`/issues?view=case:${c.id}`)} className="font-semibold text-ux2-teal hover:underline">{c.id}</button> : `${itemKind(item)} · 15 min`} /></span>
                      <span className="flex shrink-0 items-center gap-1.5"><Chip tone={itemKind(item) === 'Vote' ? 'plum' : 'ghost'}>{itemKind(item)}</Chip>{isBoard && <Button size="sm" variant="ghost" onClick={() => { setEditingAgenda(i); setAgendaText(item); }}>Edit</Button>}</span>
                    </Inner>
                    {editingAgenda === i && <form onSubmit={e => { e.preventDefault(); saveAgenda(); }} className="flex gap-2"><input aria-label="Agenda item" value={agendaText} onChange={e => setAgendaText(e.target.value)} className={INPUT} /><Button type="submit" size="sm">Save</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditingAgenda(null)}>Cancel</Button></form>}
                  </Fragment>
                );
              })}
              {editingAgenda === 'new' && <form aria-label="Add an agenda item" onSubmit={e => { e.preventDefault(); saveAgenda(); }} className="flex gap-2"><input aria-label="Agenda item" value={agendaText} onChange={e => setAgendaText(e.target.value)} placeholder="Insurance renewal 2026 · board vote" className={INPUT} /><Button type="submit" size="sm">Add</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditingAgenda(null)}>Cancel</Button></form>}
            </div>
          )}
          <Why>Vote items open on the Votes tab when the meeting starts. Owners can propose an item up to 7 days before; the board accepts or declines.</Why>
        </Card>
        <div className="flex flex-col gap-3">
          <Card aria-label="Approvals" className="gap-2.5">
            <div className="flex items-center justify-between gap-2"><SectionLabel>Approvals</SectionLabel><Chip tone="ghost">{minutesDrafts.filter(r => r.minutes === 'approved').length + (next?.noticeSent ? 1 : 0)} of {minutesDrafts.length + (next ? 1 : 0)} done</Chip></div>
            {minutesDrafts.map(r => (
              <Inner key={r.meeting.id} className="flex items-center justify-between gap-3">
                <Cell title={`${dayLabel(r.meeting.date)} minutes`} note={r.minutes === 'approved' ? `approved by ${approvedBy(r).slice(0, 2).join(', ')}${approvedBy(r).length > 2 ? ` +${approvedBy(r).length - 2}` : ''} · posted to owners` : `drafted · ${approvedBy(r).length} of ${majority} approvals`} />
                {r.minutes === 'approved' ? <Chip tone="sage">Approved</Chip> : isBoard && !approvedBy(r).includes(snap.viewer.name) ? <Button size="sm" onClick={() => approveMinutes(r.meeting.id, { name: snap.viewer.name, role: board.find(b => b.name === snap.viewer.name)?.role ?? 'Board', date: new Date().toISOString().slice(0, 10) })}>Approve</Button> : <Chip tone="amber">Waiting</Chip>}
              </Inner>
            ))}
            {next && <Inner className="flex items-center justify-between gap-3"><Cell title={`${dayLabel(next.meeting.date)} notice`} note={next.noticeSent ? 'sent' : 'not sent yet · waiting on you'} />{next.noticeSent ? <Chip tone="sage">Sent</Chip> : isBoard ? <Button size="sm" disabled={sendingNotice} onClick={() => { void sendNotice(next.meeting); }}>{sendingNotice ? 'Sending…' : 'Send notice'}</Button> : <Chip tone="amber">Not sent</Chip>}</Inner>}
            {minutesDrafts.length === 0 && !next && <Why>Nothing waiting for approval.</Why>}
            <Why>Minutes are drafted by the Secretary from the recording and the agenda, approved at the next meeting or by board vote in between, then posted. Owners see minutes only once approved.</Why>
          </Card>
          <Card aria-label="Attendance" className="gap-2.5">
            <SectionLabel>Attendance</SectionLabel>
            {lastPast && <Inner className="flex items-center justify-between gap-3"><Cell title={`${dayLabel(lastPast.meeting.date)} ${lastPast.meeting.title.toLowerCase()}`} note={`${lastPast.rsvpBoard} of ${boardCount} board · ${lastPast.rsvpUnits} of ${snap.units.length} units · guests ${lastPast.meeting.attendees.guests.length}`} /><Button size="sm" variant="ghost" onClick={() => navigate('/building?tab=documents')}>Sign-in sheet</Button></Inner>}
            {next && <Inner className="flex items-center justify-between gap-3"><Cell title={`${dayLabel(next.meeting.date)} ${next.meeting.title.toLowerCase()}`} note={`${next.rsvpUnits} of ${snap.units.length} units replied · board quorum ${majority} of ${boardCount} · ${next.rsvpBoard} confirmed`} />{isBoard ? <Button size="sm" variant="ghost" onClick={() => navigate('/boardroom?tab=outbox')}>Remind the rest · {Math.max(0, snap.units.length - next.rsvpUnits)}</Button> : <Rsvp row={next} snap={snap} />}</Inner>}
            {!lastPast && !next && <Why>No meetings yet.</Why>}
            <Why>Attendance is taken at check-in, in the room or on the remote link, and counts toward each owner's Impact score.</Why>
          </Card>
        </div>
      </div>
    </div>
  );
}
