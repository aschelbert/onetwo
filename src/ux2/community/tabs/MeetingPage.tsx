/**
 * One meeting, start to finish. The header says what it is and where it
 * stands; below it, in the order the work happens: the notice, the agenda,
 * who's coming (or who came), and the minutes and their approvals. Everything
 * on this page is about this one meeting; the list of all meetings is one
 * click back.
 */
import { Fragment, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { Button, Card, Chip, Inner, SectionLabel, Cell, Why, Field, INPUT } from '../../components';
import { dayLabel } from '../../home/calendar';
import type { CommunitySnapshot, MeetingRow } from '../metrics';
import { sendMeetingNotice } from '../meetingNotice';
import { MEETING_BG, MEETING_TILE, ON_DARK_GHOST, ON_DARK_PRIMARY, Rsvp, itemKind, stateLabel, typeLabel } from '../meetingUi';

const daysLate = (today: string, due: string) => Math.abs(Math.round((Date.parse(today) - Date.parse(due)) / 86400000));

function DetailsForm({ row, onClose }: { row: MeetingRow; onClose: () => void }) {
  const update = useMeetingsStore(s => s.updateMeeting);
  const m = row.meeting;
  const [f, setF] = useState({ title: m.title, type: m.type, date: m.date, time: m.time, location: m.location, virtualLink: m.virtualLink });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(v => ({ ...v, [k]: e.target.value }));
  const moved = f.date !== m.date || f.time !== m.time || f.location !== m.location;
  return (
    <form aria-label="Edit the meeting details" onSubmit={e => { e.preventDefault(); if (!f.title.trim() || !f.date) return; update(m.id, { ...f, title: f.title.trim(), status: moved && m.status === 'SCHEDULED' && row.noticeSent ? 'RESCHEDULED' : m.status }); onClose(); }} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <Field label="Title" className="min-w-[200px] flex-1"><input value={f.title} onChange={set('title')} className={INPUT} /></Field>
      <Field label="Type" className="w-[150px]"><select value={f.type} onChange={set('type')} className={INPUT}><option value="BOARD">Board</option><option value="ANNUAL">Annual</option><option value="SPECIAL">Special</option><option value="QUARTERLY">Quarterly</option></select></Field>
      <Field label="Date" className="w-[160px]"><input type="date" value={f.date} onChange={set('date')} className={INPUT} /></Field>
      <Field label="Time" className="w-[120px]"><input type="time" value={f.time} onChange={set('time')} className={INPUT} /></Field>
      <Field label="Room" className="w-[180px]"><input value={f.location} onChange={set('location')} className={INPUT} /></Field>
      <Field label="Remote link" className="min-w-[200px] flex-1"><input value={f.virtualLink} onChange={set('virtualLink')} placeholder="https://" className={INPUT} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={!f.title.trim() || !f.date}>Save</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
      {moved && row.noticeSent && <p className="m-0 w-full text-xs text-ux2-muted">The notice already went out. Moving the date, time or room means sending it again from this page.</p>}
    </form>
  );
}

export default function MeetingPage({ row, snap, onBack }: { row: MeetingRow; snap: CommunitySnapshot; onBack: () => void }) {
  const navigate = useNavigate();
  const m = row.meeting;
  const isBoard = snap.viewer.isBoard;
  const board = useBuildingStore(s => s.board);
  const cases = useIssuesStore(s => s.cases);
  const updateMeeting = useMeetingsStore(s => s.updateMeeting);
  const updateMinutes = useMeetingsStore(s => s.updateMinutes);
  const approveMinutes = useMeetingsStore(s => s.approveMinutes);
  const revokeApproval = useMeetingsStore(s => s.revokeMinutesApproval);
  const [editingDetails, setEditingDetails] = useState(false);
  const [editingAgenda, setEditingAgenda] = useState<number | 'new' | null>(null);
  const [agendaText, setAgendaText] = useState('');
  const [noticeNote, setNoticeNote] = useState<string | null>(null);
  const [sendingNotice, setSendingNotice] = useState(false);
  const [minutesDraft, setMinutesDraft] = useState<string | null>(null);

  const upcoming = row.state === 'upcoming';
  const held = row.state === 'past';
  const canMinute = held || row.datePassed;
  const boardNames = board.length ? board.map(b => b.name) : [...new Set(snap.meetings.flatMap(x => x.attendees.board))];
  const boardCount = boardNames.length;
  const quorum = Math.max(1, Math.ceil(boardCount / 2));
  const approvals = m.minutesApprovals ?? [];
  const iApproved = approvals.some(a => a.name === snap.viewer.name);
  const minutesLabel = row.minutes === 'approved' ? `Approved by ${approvals.length}` : row.minutes === 'draft' ? 'Drafted · awaiting approval' : canMinute ? 'Not drafted yet' : 'After the meeting';
  const agendaMinutes = Math.max(15, row.agendaCount * 15);
  // Only cases actually linked to this meeting; no guessing from agenda wording.
  const linkedCases = (m.linkedCaseIds ?? []).map(id => cases.find(c => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c);

  const sendNotice = async () => {
    setSendingNotice(true); setNoticeNote(null);
    try { setNoticeNote((await sendMeetingNotice(m, snap.viewer.name, snap.today)).note); } finally { setSendingNotice(false); }
  };
  const saveAgenda = () => {
    const agenda = [...m.agenda];
    if (editingAgenda === 'new') { if (agendaText.trim()) agenda.push(agendaText.trim()); }
    else if (typeof editingAgenda === 'number') agenda[editingAgenda] = agendaText.trim() || agenda[editingAgenda];
    updateMeeting(m.id, { agenda });
    setEditingAgenda(null); setAgendaText('');
  };
  const removeAgendaItem = (i: number) => updateMeeting(m.id, { agenda: m.agenda.filter((_, j) => j !== i) });
  const startMinutes = () => setMinutesDraft(m.minutes || [`Called to order at ${m.time || '—'}${m.location ? `, ${m.location}` : ''}.`, `Present: ${m.attendees.board.join(', ') || '—'}.`, '', ...m.agenda.map((a, i) => `${i + 1}. ${a}: `), '', 'Adjourned at —.'].join('\n'));
  const saveMinutes = () => { if (minutesDraft !== null) updateMinutes(m.id, minutesDraft.trim()); setMinutesDraft(null); };
  const approve = () => approveMinutes(m.id, { name: snap.viewer.name, role: board.find(b => b.name === snap.viewer.name)?.role ?? 'Board', date: snap.today });

  const noticeStatus = row.noticeSent ? 'Sent' : row.noticeOverdue ? `Not sent · ${daysLate(snap.today, row.noticeDue)} day${daysLate(snap.today, row.noticeDue) === 1 ? '' : 's'} late` : `Due ${dayLabel(row.noticeDue)}`;

  return (
    <div className="flex flex-col gap-4" data-meeting-page={m.id}>
      <div><button type="button" onClick={onBack} className="text-sm font-semibold text-ux2-teal hover:underline">← All meetings</button></div>

      <Card tone="navy" aria-label="Meeting" style={{ backgroundImage: MEETING_BG }} className="border-transparent">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><SectionLabel className="!text-white/[0.72]">{typeLabel(m.type)} · {stateLabel(row)}</SectionLabel>{isBoard && upcoming && <Chip tone={row.noticeSent ? 'sage' : row.noticeOverdue ? 'red' : 'amber'}>{row.noticeSent ? 'Notice sent' : row.noticeOverdue ? `Notice overdue · due ${dayLabel(row.noticeDue)}` : `Notice due ${dayLabel(row.noticeDue)}`}</Chip>}</div>
            <h2 className="m-0 font-display text-2xl font-semibold text-white">{m.title} · {dayLabel(m.date)}{m.time ? `, ${m.time}` : ''}</h2>
            <div className="text-sm text-white/[0.78]">{m.location || 'Room to set'}{m.virtualLink ? ' and remote' : ''} · open to all owners</div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {isBoard ? <>
              {!editingDetails && row.state !== 'cancelled' && <Button size="sm" variant="ghost" className={ON_DARK_GHOST} onClick={() => setEditingDetails(true)}>Edit details</Button>}
              {upcoming && row.datePassed && <Button size="sm" variant="ghost" className={ON_DARK_GHOST} onClick={() => updateMeeting(m.id, { status: 'COMPLETED' })}>Mark as held</Button>}
              {upcoming && !row.noticeSent && <Button size="sm" className={ON_DARK_PRIMARY} disabled={sendingNotice} onClick={() => { void sendNotice(); }}>{sendingNotice ? 'Sending…' : 'Send notice'}</Button>}
            </> : upcoming && <Rsvp row={row} snap={snap} onDark />}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {upcoming ? <>
            <div className={MEETING_TILE}><span className="text-xs text-ux2-muted">Notice</span><span className={`text-[15px] font-semibold ${row.noticeOverdue ? 'text-ux2-red-ink' : 'text-ux2-ink'}`}>{noticeStatus}</span><span className="text-xs text-ux2-muted">Ten days ahead, per the bylaws</span></div>
            <div className={MEETING_TILE}><span className="text-xs text-ux2-muted">Agenda</span><span className="text-[15px] font-semibold text-ux2-ink">{row.agendaCount} item{row.agendaCount === 1 ? '' : 's'}</span><span className="text-xs text-ux2-muted">About {agendaMinutes} minutes</span></div>
            <div className={MEETING_TILE}><span className="text-xs text-ux2-muted">Coming</span><span className="text-[15px] font-semibold text-ux2-ink">{row.rsvpUnits} of {snap.units.length} units</span><span className="text-xs text-ux2-muted">Board {row.rsvpBoard} of {boardCount} · quorum {quorum}</span></div>
            <div className={MEETING_TILE}><span className="text-xs text-ux2-muted">Where</span><span className="text-[15px] font-semibold text-ux2-ink">{m.location || 'To set'}</span><span className="truncate text-xs text-ux2-muted">{m.virtualLink ? 'Remote link in the notice' : 'In person only'}</span></div>
          </> : <>
            <div className={MEETING_TILE}><span className="text-xs text-ux2-muted">{row.state === 'cancelled' ? 'Was set for' : 'Held'}</span><span className="text-[15px] font-semibold text-ux2-ink">{dayLabel(m.date)}</span><span className="text-xs text-ux2-muted">{m.location || '—'}</span></div>
            <div className={MEETING_TILE}><span className="text-xs text-ux2-muted">Attendance</span><span className="text-[15px] font-semibold text-ux2-ink">Board {row.rsvpBoard} of {boardCount}</span><span className="text-xs text-ux2-muted">{row.rsvpUnits} unit{row.rsvpUnits === 1 ? '' : 's'} · {m.attendees.guests.length} guest{m.attendees.guests.length === 1 ? '' : 's'}</span></div>
            <div className={MEETING_TILE}><span className="text-xs text-ux2-muted">Minutes</span><span className={`text-[15px] font-semibold ${row.minutes === 'draft' ? 'text-ux2-amber' : 'text-ux2-ink'}`}>{minutesLabel}</span><span className="text-xs text-ux2-muted">{row.minutes === 'approved' ? 'Posted to owners' : 'Owners see them once approved'}</span></div>
            <div className={MEETING_TILE}><span className="text-xs text-ux2-muted">Motions</span><span className="text-[15px] font-semibold text-ux2-ink">{m.votes.length}</span><span className="text-xs text-ux2-muted">{m.votes.length ? `${m.votes.filter(v => v.status === 'passed').length} passed` : 'None recorded'}</span></div>
          </>}
        </div>
        {noticeNote && <div role="status" className="text-[13px] text-white">{noticeNote}</div>}
      </Card>
      {editingDetails && <DetailsForm row={row} onClose={() => setEditingDetails(false)} />}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
        <div className="flex flex-col gap-3">
          <Card aria-label="Agenda" className="gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Agenda · {row.agendaCount} item{row.agendaCount === 1 ? '' : 's'}, about {agendaMinutes} minutes</SectionLabel>{isBoard && upcoming && editingAgenda !== 'new' && <Button size="sm" variant="ghost" onClick={() => { setEditingAgenda('new'); setAgendaText(''); }}>Add an item</Button>}</div>
            {m.agenda.length === 0 && editingAgenda === null ? <Inner className="text-sm text-ux2-muted">Nothing on the agenda yet.</Inner> : (
              <div className="flex flex-col gap-2">
                {m.agenda.map((item, i) => {
                  return (
                    <Fragment key={i}>
                      {editingAgenda === i ? (
                        <form aria-label={`Edit agenda item ${i + 1}`} onSubmit={e => { e.preventDefault(); saveAgenda(); }} className="flex gap-2"><input aria-label="Agenda item" value={agendaText} onChange={e => setAgendaText(e.target.value)} className={INPUT} /><Button type="submit" size="sm">Save</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditingAgenda(null)}>Cancel</Button></form>
                      ) : (
                        <Inner className="flex items-center justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ux2-navy text-xs font-bold text-white">{i + 1}</span><Cell title={item} note={`${itemKind(item)} · 15 min`} /></span>
                          <span className="flex shrink-0 items-center gap-1.5"><Chip tone={itemKind(item) === 'Vote' ? 'plum' : 'ghost'}>{itemKind(item)}</Chip>{isBoard && upcoming && <><Button size="sm" variant="ghost" onClick={() => { setEditingAgenda(i); setAgendaText(item); }}>Edit</Button><Button size="sm" variant="ghost" aria-label={`Remove agenda item ${i + 1}`} onClick={() => removeAgendaItem(i)}>Remove</Button></>}</span>
                        </Inner>
                      )}
                    </Fragment>
                  );
                })}
                {editingAgenda === 'new' && <form aria-label="Add an agenda item" onSubmit={e => { e.preventDefault(); saveAgenda(); }} className="flex gap-2"><input aria-label="Agenda item" value={agendaText} onChange={e => setAgendaText(e.target.value)} placeholder="Insurance renewal 2026 · board vote" className={INPUT} /><Button type="submit" size="sm">Add</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditingAgenda(null)}>Cancel</Button></form>}
              </div>
            )}
            {linkedCases.length > 0 && <div className="flex flex-wrap items-center gap-1.5 text-xs text-ux2-muted">Linked cases:{linkedCases.map(c => <button key={c.id} type="button" onClick={() => navigate(`/issues?view=case:${c.id}`)} className="rounded-full border border-ux2-line bg-white px-2.5 py-1 font-semibold text-ux2-teal hover:border-ux2-line-strong">{c.title}</button>)}</div>}
            <Why>{upcoming ? 'The agenda goes out with the notice. Vote items open on the Votes tab when the meeting starts; owners can propose an item up to 7 days before.' : 'The agenda as it stood at the meeting.'}</Why>
          </Card>

          {(canMinute || row.minutes !== 'none') && (
            <Card aria-label="Minutes" className="gap-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionLabel>Minutes</SectionLabel>
                <span className="flex items-center gap-1.5">
                  <Chip tone={row.minutes === 'approved' ? 'sage' : row.minutes === 'draft' ? 'amber' : 'ghost'}>{minutesLabel}</Chip>
                  {isBoard && minutesDraft === null && <Button size="sm" variant="ghost" onClick={startMinutes}>{m.minutes ? 'Edit' : 'Draft the minutes'}</Button>}
                </span>
              </div>
              {minutesDraft !== null ? (
                <form aria-label="Draft the minutes" onSubmit={e => { e.preventDefault(); saveMinutes(); }} className="flex flex-col gap-2">
                  <textarea aria-label="Minutes" value={minutesDraft} onChange={e => setMinutesDraft(e.target.value)} rows={10} className="w-full rounded-[14px] border border-ux2-line-strong bg-white px-3.5 py-3 text-sm text-ux2-ink" />
                  <div className="flex flex-wrap items-center gap-2"><Button type="submit" size="sm" disabled={!minutesDraft.trim()}>Save the draft</Button><Button type="button" size="sm" variant="ghost" onClick={() => setMinutesDraft(null)}>Cancel</Button>{approvals.length > 0 && <span className="text-xs text-ux2-muted">Saving a change clears the {approvals.length} approval{approvals.length === 1 ? '' : 's'} so far.</span>}</div>
                </form>
              ) : !m.minutes ? (
                <Inner className="text-sm text-ux2-muted">{isBoard ? 'Not drafted yet. The Secretary drafts them from the agenda and the recording; the board approves them here.' : 'Not posted yet.'}</Inner>
              ) : row.minutes !== 'approved' && !isBoard ? (
                <Inner className="text-sm text-ux2-muted">Drafted, waiting for the board to approve them. They're posted here once approved.</Inner>
              ) : (
                <Inner className="whitespace-pre-wrap text-sm leading-[1.55] text-ux2-ink">{m.minutes}</Inner>
              )}
              {m.minutes && isBoard && minutesDraft === null && (
                <Inner className="flex flex-wrap items-center justify-between gap-3">
                  <Cell title={approvals.length ? `Approved by ${approvals.map(a => a.name).join(', ')}` : 'No approvals yet'} note={approvals.length ? approvals.map(a => `${a.name.split(' ')[0]} ${dayLabel(a.date.slice(0, 10))}`).join(' · ') : `A majority of the board (${quorum} of ${boardCount}) approves them, at the next meeting or by vote in between.`} />
                  {iApproved ? <Button size="sm" variant="ghost" onClick={() => revokeApproval(m.id, snap.viewer.name)}>Withdraw my approval</Button> : <Button size="sm" onClick={approve}>Approve</Button>}
                </Inner>
              )}
              {m.votes.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <SectionLabel>Motions</SectionLabel>
                  {m.votes.map(v => <Inner key={v.id} className="flex items-center justify-between gap-3"><Cell title={v.motion} note={`${v.type === 'owner' ? 'Owner vote' : 'Board vote'} · ${v.tally.approve} for, ${v.tally.deny} against, ${v.tally.abstain} abstaining`} /><Chip tone={v.status === 'passed' ? 'sage' : 'red'}>{v.status === 'passed' ? 'Passed' : 'Failed'}</Chip></Inner>)}
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {upcoming && (
            <Card aria-label="Notice" className="gap-2.5">
              <div className="flex items-center justify-between gap-2"><SectionLabel>Notice</SectionLabel><Chip tone={row.noticeSent ? 'sage' : row.noticeOverdue ? 'red' : 'amber'}>{noticeStatus}</Chip></div>
              <Inner className="flex items-center justify-between gap-3">
                <Cell title={row.noticeSent ? 'Posted in-app and logged' : `Due ${dayLabel(row.noticeDue)}, ten days before`} note={row.noticeSent ? 'Every member sees it in Community › Notices; it is logged in Board Room › Outbox.' : 'Posted in-app for every member and emailed to everyone with an address on file, with the agenda.'} />
                {isBoard && !row.noticeSent && <Button size="sm" className="shrink-0 whitespace-nowrap" disabled={sendingNotice} onClick={() => { void sendNotice(); }}>{sendingNotice ? 'Sending…' : 'Send notice'}</Button>}
              </Inner>
              <Why>Ten days' notice per the bylaws; DC Code § 29-1101 et seq. sets a 48-hour minimum. Rescheduling means sending it again.</Why>
            </Card>
          )}

          <Card aria-label="Attendance" className="gap-2.5">
            <div className="flex items-center justify-between gap-2"><SectionLabel>{upcoming ? 'Who is coming' : 'Who came'}</SectionLabel>{upcoming && row.mine && <Chip tone="sage">You're going</Chip>}</div>
            <Inner className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 text-sm"><span className="font-semibold text-ux2-ink">Board · {row.rsvpBoard} of {boardCount}</span><span className="text-xs text-ux2-muted">quorum {quorum}{row.rsvpBoard >= quorum ? ' · met' : ''}</span></div>
              <div className="flex flex-wrap gap-1.5">{boardNames.map(n => <Chip key={n} tone={m.attendees.board.includes(n) ? 'sage' : 'ghost'}>{n}{m.attendees.board.includes(n) ? '' : upcoming ? ' · not yet' : ' · absent'}</Chip>)}{boardNames.length === 0 && <span className="text-xs text-ux2-muted">No board on file.</span>}</div>
            </Inner>
            <Inner className="flex items-center justify-between gap-3">
              <Cell title={`Owners · ${row.rsvpUnits} of ${snap.units.length} units`} note={upcoming ? `${Math.max(0, snap.units.length - row.rsvpUnits)} haven't replied` : `${m.attendees.guests.length} guest${m.attendees.guests.length === 1 ? '' : 's'}`} />
              {isBoard && upcoming && <Button size="sm" variant="ghost" onClick={() => navigate('/boardroom?tab=outbox')}>Remind the rest</Button>}
              {held && <Button size="sm" variant="ghost" onClick={() => navigate('/building?tab=documents')}>Sign-in sheet</Button>}
            </Inner>
            <Why>Attendance is taken at check-in, in the room or on the remote link, and counts toward each owner's Impact score.</Why>
          </Card>
        </div>
      </div>
    </div>
  );
}
