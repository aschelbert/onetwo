/**
 * An owner's view of one meeting. Before the notice: only that it's scheduled.
 * After the notice: the agenda, its documents and the ballot right on the
 * items that need a vote. During the meeting: what's on now and the vote
 * that's open. After: what was decided, the unit's own votes and, once
 * approved, the minutes.
 */
import { useState } from 'react';
import { Button, Card, Chip, Inner, SectionLabel, Cell, Why } from '../../components';
import { dayLabel } from '../../home/calendar';
import { resultLine, type AgendaItem, type VoteChoice } from '../meetingRecord';
import { MEETING_BG, MEETING_TILE, ON_DARK_GHOST, ON_DARK_PRIMARY, Rsvp, typeLabel } from '../meetingUi';
import { AttachmentList } from './Attachments';
import type { MeetingCtx } from './useMeeting';

const CHOICES: VoteChoice[] = ['for', 'against', 'abstain'];
const label = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);

function OwnerBallot({ ctx, item, unit, live }: { ctx: MeetingCtx; item: AgendaItem; unit: string; live: boolean }) {
  const v = item.vote!;
  const mine = ctx.ballotsFor(item.id).find(b => b.unit === unit);
  const [pick, setPick] = useState<VoteChoice | string[] | null>(mine?.choice ?? null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (v.status === 'closed' && v.result) {
    return <div className="rounded-[12px] bg-ux2-plum-tint/60 px-3 py-2.5 text-sm"><div className="font-semibold text-ux2-ink">{resultLine(v)}</div>{mine && <div className="text-[13px] text-ux2-muted">Unit {unit} voted{Array.isArray(mine.choice) ? (v.secret ? '' : `: ${mine.choice.join(', ')}`) : ` ${mine.choice}`}.</div>}</div>;
  }
  if (v.status !== 'open') return <div className="rounded-[12px] bg-ux2-plum-tint/60 px-3 py-2.5 text-[13px] text-ux2-muted">Voting opens with the notice.</div>;
  const cast = async () => {
    if (!pick || (Array.isArray(pick) && !pick.length)) return;
    setSaving(true); setNote(null);
    const err = await ctx.castBallot({ meetingId: ctx.m.id, itemId: item.id, unit, choice: pick, method: live ? 'remote' : 'online' });
    setSaving(false);
    setNote(err ?? 'Your vote is in. You can change it until the vote closes.');
  };
  const sel = Array.isArray(pick) ? pick : [];
  return (
    <fieldset className="flex flex-col gap-2 rounded-[12px] border-2 border-ux2-plum bg-white px-3 py-2.5">
      <legend className="px-1 text-[13px] font-semibold text-ux2-plum">{v.question}{v.candidates ? ` · pick up to ${v.pick ?? 1}` : ''}</legend>
      {mine && <div className="text-[13px] text-ux2-ink">Unit {unit} voted {Array.isArray(mine.choice) ? mine.choice.join(', ') : mine.choice} on {dayLabel(mine.castAt.slice(0, 10))}. You can change it until the vote closes.</div>}
      {v.candidates ? (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {v.candidates.map(n => <label key={n} className={`flex min-h-[44px] items-center gap-2 rounded-[12px] border px-3 text-sm font-semibold ${sel.includes(n) ? 'border-ux2-plum bg-ux2-plum-tint' : 'border-ux2-line-strong'}`}><input type="checkbox" checked={sel.includes(n)} onChange={e => setPick(e.target.checked ? [...sel, n].slice(-(v.pick ?? 1)) : sel.filter(x => x !== n))} />{n}</label>)}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {CHOICES.map(c => <label key={c} className={`flex min-h-[44px] items-center gap-2 rounded-[12px] border px-3 text-sm font-semibold ${pick === c ? 'border-ux2-plum bg-ux2-plum-tint' : 'border-ux2-line-strong'}`}><input type="radio" name={`vote-${item.id}`} checked={pick === c} onChange={() => setPick(c)} />{label(c)}</label>)}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2"><Button size="sm" disabled={saving || !pick || (Array.isArray(pick) && !pick.length)} onClick={() => { void cast(); }}>{mine ? 'Change my vote' : 'Cast my vote'}</Button>{note && <span role="status" className="text-[13px] text-ux2-ink">{note}</span>}</div>
      <div className="text-xs text-ux2-muted">{v.secret ? 'Secret ballot: the record shows your unit voted, not for whom. ' : ''}Results show when the vote closes.</div>
    </fieldset>
  );
}

export default function OwnerMeeting({ ctx }: { ctx: MeetingCtx }) {
  const { m, row, items, snap } = ctx;
  const myUnits = snap.viewer.linkedUnits;
  const [unit, setUnit] = useState(myUnits[0] ?? '');
  const noticed = !!m.noticeSentAt || row.noticeSent;
  const live = !!m.startedAt && !m.endedAt;
  const held = !!m.endedAt || row.state === 'past';
  const current = items.find(i => i.id === m.session?.currentItemId);
  const voteItems = items.filter(i => i.vote?.who === 'owners');

  if (!noticed && !held) {
    return (
      <Card aria-label="Meeting" className="gap-2">
        <div className="flex flex-wrap items-center gap-2"><SectionLabel>{typeLabel(m.type)}</SectionLabel><Chip tone="ghost">Scheduled · date only</Chip></div>
        <div className="text-2xl font-semibold text-ux2-ink">{m.title} · {dayLabel(m.date)}{m.time ? `, ${m.time}` : ''}</div>
        <Why>The agenda, the documents and your ballot come with the notice, by {dayLabel(row.noticeDue)}.</Why>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Meeting" style={{ backgroundImage: MEETING_BG }} className="flex flex-col gap-3 rounded-[22px] px-[22px] py-5 text-white">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {live ? <Chip tone="red">● Live</Chip> : <span className="text-xs font-semibold uppercase tracking-[0.08em] text-white/[0.72]">{typeLabel(m.type)} · {held ? `held ${dayLabel(m.date)}` : `notice came ${m.session?.notice ? dayLabel(m.session.notice.at.slice(0, 10)) : 'out'}`}</span>}
              {!held && voteItems.length > 0 && <Chip tone="plum">{voteItems.filter(i => ctx.ballotsFor(i.id).some(b => b.unit === unit)).length} of {voteItems.length} votes cast</Chip>}
            </div>
            <h2 className="m-0 font-display text-2xl font-semibold text-white">{live && current ? `Now: ${current.title}` : held && m.session?.summary ? `What the ${m.title} decided` : `${m.title} · ${dayLabel(m.date)}${m.time ? `, ${m.time}` : ''}`}</h2>
            <div className="text-sm text-white/[0.78]">{m.location || 'Room to set'}{m.virtualLink ? ' or remote' : ''}{unit ? ` · voting for Unit ${unit}` : ''}</div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {live && m.virtualLink && <a href={m.virtualLink} target="_blank" rel="noreferrer" className={`inline-flex min-h-[36px] items-center rounded-full px-4 text-sm font-semibold ${ON_DARK_PRIMARY}`}>Join remotely</a>}
            {!held && !live && <Rsvp row={row} snap={snap} onDark />}
            {myUnits.length > 1 && <select aria-label="Voting for unit" value={unit} onChange={e => setUnit(e.target.value)} className={`min-h-[36px] rounded-full px-3 text-sm ${ON_DARK_GHOST}`}>{myUnits.map(u => <option key={u} value={u} className="text-ux2-ink">Unit {u}</option>)}</select>}
          </div>
        </div>
        {held && (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {items.filter(i => i.vote?.result).slice(0, 2).map(i => <div key={i.id} className={MEETING_TILE}><span className="text-xs text-ux2-muted">{i.title}</span><span className="text-[15px] font-semibold text-ux2-ink">{i.vote!.result!.candidates ? i.vote!.result!.candidates.filter(c => c.elected).map(c => c.name).join(', ') || 'No one elected' : i.vote!.result!.passed ? 'Passed' : 'Failed'}</span><span className="text-xs text-ux2-muted">{i.vote!.result!.candidates ? 'elected' : `${i.vote!.result!.for} for · ${i.vote!.result!.against} against`}</span></div>)}
            <div className={MEETING_TILE}><span className="text-xs text-ux2-muted">Minutes</span><span className="text-[15px] font-semibold text-ux2-ink">{m.minutesApprovedAt ? 'Approved' : 'Awaiting approval'}</span><span className="text-xs text-ux2-muted">{m.minutesApprovedAt ? 'Below, item by item' : 'Posted once the board approves them'}</span></div>
          </div>
        )}
      </section>

      {!unit && voteItems.length > 0 && !held && <Inner className="text-sm text-ux2-muted">Your account isn't linked to a unit yet, so there's no ballot to show. Ask the board to link your unit.</Inner>}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,0.85fr)]">
        <Card aria-label="Agenda" className="gap-2.5">
          <SectionLabel>{held && m.minutesApprovedAt ? 'Minutes · approved' : live ? 'Agenda · live' : 'Agenda'}</SectionLabel>
          {items.map((it, i) => (
            <Inner key={it.id} className={`flex flex-col gap-2 ${live && it.id === current?.id ? 'border-2 border-ux2-navy' : it.vote?.who === 'owners' ? 'border-ux2-plum' : ''}`}>
              <div className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-3"><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${it.endedAt ? 'bg-ux2-sage' : 'bg-ux2-navy'}`}>{i + 1}</span><Cell title={it.title} note={it.vote ? (it.vote.who === 'owners' ? 'Your vote' : 'Board vote') : live && it.id === current?.id ? 'On now' : undefined} /></span>{live && it.id === current?.id && <Chip tone="red">Now</Chip>}</div>
              <AttachmentList atts={it.attachments} />
              {held && m.minutesApprovedAt && it.minutes && <div className="whitespace-pre-wrap text-sm leading-[1.55] text-ux2-ink">{it.minutes}</div>}
              {it.vote?.who === 'owners' && unit && <OwnerBallot ctx={ctx} item={it} unit={unit} live={live} />}
              {it.vote?.who === 'board' && it.vote.result && <div className="rounded-[12px] bg-ux2-surface px-3 py-2 text-[13px] text-ux2-ink">Board: {resultLine(it.vote)}</div>}
            </Inner>
          ))}
          {!items.length && <Why>The agenda isn't posted yet.</Why>}
          {held && !m.startedAt && m.minutes && (m.minutesApprovals?.length ?? 0) > 0 && <Inner className="whitespace-pre-wrap text-sm leading-[1.55] text-ux2-ink">{m.minutes}</Inner>}
        </Card>
        <div className="flex flex-col gap-3">
          {held && m.session?.summary && (
            <Card aria-label="What happens next" className="gap-2"><SectionLabel>What was decided</SectionLabel><Inner className="whitespace-pre-wrap text-sm leading-[1.55] text-ux2-ink">{m.session.summary.decided}{m.session.summary.next ? `\n\nWhat happens next:\n${m.session.summary.next}` : ''}</Inner></Card>
          )}
          {unit && voteItems.length > 0 && (
            <Card aria-label="Your unit" className="gap-2">
              <SectionLabel>Your votes · Unit {unit}</SectionLabel>
              <Inner className="flex flex-col gap-1.5 text-sm">{voteItems.map(i => { const b = ctx.ballotsFor(i.id).find(x => x.unit === unit); return <div key={i.id} className="flex justify-between gap-2"><span>{items.indexOf(i) + 1} · {i.title}</span><span className="font-semibold">{b ? (Array.isArray(b.choice) ? (i.vote?.secret ? 'Voted · secret' : b.choice.join(', ')) : label(b.choice)) : held ? 'Didn\'t vote' : 'Not yet'}</span></div>; })}</Inner>
              <Why>Only you and the board see how your unit voted. Can't come? Give a proxy form to the board before the meeting.</Why>
            </Card>
          )}
          {!held && <Card aria-label="Before the meeting" className="gap-2"><SectionLabel>{live ? 'In the meeting' : 'Before the meeting'}</SectionLabel><Why>{live ? 'Votes on the item that is on now can be cast here until the chair closes them. The board checks units in at the door and on the remote link.' : `Quorum is ${ctx.quorum} units, and a ballot sent ahead counts toward it. Questions for the board can go in a request.`}</Why></Card>}
        </div>
      </div>
    </div>
  );
}
