/**
 * Step 2: send the notice and the ballots by app, email and mail, then follow
 * the ballots as they come in. The board enters paper ballots and proxies
 * here; owners vote from the meeting page.
 */
import { useMemo, useState } from 'react';
import { useMailStore } from '@/store/useMailStore';
import { calculateMailingCost } from '@/types/mail';
import { Button, Card, Chip, Inner, SectionLabel, Cell, Why, Field, INPUT, PillTabs } from '../../components';
import { dayLabel } from '../../home/calendar';
import { channelReach, noticeText, type Channel, type VoteChoice } from '../meetingRecord';
import { channelLine, sendNotice } from '../meetingSend';
import { freezeLive, useReportSource } from './Attachments';
import type { MeetingCtx } from './useMeeting';

function PaperBallotForm({ ctx }: { ctx: MeetingCtx }) {
  const ownerItems = ctx.items.filter(i => i.vote?.who === 'owners' && i.vote.status === 'open');
  const [unit, setUnit] = useState('');
  const [method, setMethod] = useState<'paper' | 'proxy'>('paper');
  const [holder, setHolder] = useState('');
  const [choices, setChoices] = useState<Record<string, VoteChoice | string[]>>({});
  const [note, setNote] = useState<string | null>(null);
  if (!ownerItems.length) return null;
  const save = async () => {
    setNote(null);
    for (const it of ownerItems) {
      const c = choices[it.id];
      if (!c || (Array.isArray(c) && !c.length)) continue;
      const err = await ctx.castBallot({ meetingId: ctx.m.id, itemId: it.id, unit, choice: c, method, proxyHolder: method === 'proxy' ? holder : undefined });
      if (err) { setNote(err); return; }
    }
    setNote(`Recorded for Unit ${unit}.`); setUnit(''); setChoices({}); setHolder('');
  };
  return (
    <form aria-label="Enter a paper ballot or proxy" onSubmit={e => { e.preventDefault(); void save(); }} className="flex flex-col gap-2 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Field label="Unit"><select value={unit} onChange={e => setUnit(e.target.value)} className={INPUT}><option value="">Choose…</option>{ctx.units.map(u => <option key={u.number} value={u.number}>{u.number}{u.owner ? ` · ${u.owner}` : ''}</option>)}</select></Field>
        <Field label="Came in as"><select value={method} onChange={e => setMethod(e.target.value as 'paper' | 'proxy')} className={INPUT}><option value="paper">Paper ballot by mail</option><option value="proxy">Proxy</option></select></Field>
        {method === 'proxy' && <Field label="Proxy holder"><input value={holder} onChange={e => setHolder(e.target.value)} className={INPUT} /></Field>}
      </div>
      {ownerItems.map(it => (
        <div key={it.id} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="min-w-[200px] flex-1 font-semibold text-ux2-ink">{it.title}</span>
          {it.vote!.candidates ? it.vote!.candidates.map(n => {
            const sel = (choices[it.id] as string[] | undefined) ?? [];
            return <label key={n} className="flex items-center gap-1.5"><input type="checkbox" checked={sel.includes(n)} onChange={e => setChoices(c => ({ ...c, [it.id]: e.target.checked ? [...sel, n].slice(0, it.vote!.pick ?? 1) : sel.filter(x => x !== n) }))} />{n}</label>;
          }) : (['for', 'against', 'abstain'] as VoteChoice[]).map(c => <label key={c} className="flex items-center gap-1.5 capitalize"><input type="radio" name={`pb-${it.id}`} checked={choices[it.id] === c} onChange={() => setChoices(x => ({ ...x, [it.id]: c }))} />{c}</label>)}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2"><Button type="submit" size="sm" disabled={!unit || (method === 'proxy' && !holder.trim())}>Record</Button>{note && <span role="status" className="text-[13px] text-ux2-ink">{note}</span>}</div>
    </form>
  );
}

export default function StepNotice({ ctx, onNext }: { ctx: MeetingCtx; onNext: () => void }) {
  const { m, items, units, snap } = ctx;
  const mailSettings = useMailStore(s => s.mailingSettings);
  const src = useReportSource();
  const reach = useMemo(() => channelReach(units), [units]);
  const [channels, setChannels] = useState<Record<Channel, boolean>>({ app: true, email: true, mail: reach.mail > 0 && mailSettings.mailConnected });
  const [preview, setPreview] = useState<'email' | 'letter' | 'app'>('email');
  const [sending, setSending] = useState(false);
  const [entering, setEntering] = useState(false);
  const sent = m.session?.notice;
  const body = noticeText(m, items, ctx.quorum, ctx.building);
  const ownerVotes = items.filter(i => i.vote?.who === 'owners');
  const packet = items.reduce((t, i) => t + i.attachments.length, 0);
  const mailCost = calculateMailingCost('first-class', Math.max(1, Math.ceil(body.length / 2500)), false, mailSettings.mailProvider).totalCents * reach.mail / 100;
  const noticeDue = ctx.row.noticeDue;

  const send = async () => {
    setSending(true);
    // Live reports freeze as the notice goes out; the votes open with it.
    const frozen = ctx.fresh().map(i => ({ ...i, attachments: freezeLive(i.attachments, src, snap.today), vote: i.vote && i.vote.who === 'owners' && i.vote.status === 'draft' ? { ...i.vote, status: 'open' as const, openedAt: new Date().toISOString() } : i.vote }));
    ctx.setItems(frozen);
    ctx.setPrivateAttachments(freezeLive(ctx.freshPrivate().attachments, src, snap.today));
    const report = await sendNotice({ meeting: { ...m, items: frozen }, channels, units, mailUnits: reach.mailUnits, by: snap.viewer.name, today: snap.today, body });
    const at = new Date().toISOString();
    ctx.update({ noticeSentAt: at });
    ctx.updateSession({ notice: { at, by: snap.viewer.name, channels: report } });
    setSending(false);
  };

  if (!sent) {
    return (
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card tone="white" aria-label="Send the notice and ballots" className="gap-3 border-ux2-navy">
          <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel className="!text-ux2-navy">Send the notice and ballots</SectionLabel><Chip tone={ctx.row.noticeOverdue ? 'red' : 'amber'}>Due {dayLabel(noticeDue)} · 10 days ahead</Chip></div>
          <div className="text-[13px] font-semibold text-ux2-ink">How it reaches {units.length} units</div>
          {([
            ['app', 'In the app', `${reach.app} units`, 'Pinned on Community and on each owner’s Home, with the ballot to vote online'],
            ['email', 'Email', `${reach.email} units`, 'The notice and agenda, with a link to read and vote'],
            ['mail', 'Mail', `${reach.mail} unit${reach.mail === 1 ? '' : 's'}${reach.mail ? ` · about $${mailCost.toFixed(2)}` : ''}`, mailSettings.mailConnected ? `The units without an email${reach.mail ? ` (${reach.mailUnits.slice(0, 6).join(', ')}${reach.mailUnits.length > 6 ? '…' : ''})` : ''}, printed and mailed through the building’s mail account` : 'The building’s mail account isn’t connected; connect it under Building › Settings › Mailing to mail the units without an email'],
          ] as [Channel, string, string, string][]).map(([k, label, count, note]) => (
            <label key={k} className={`flex cursor-pointer items-start gap-3 rounded-[14px] border bg-white px-3.5 py-3 ${channels[k] ? 'border-ux2-navy' : 'border-ux2-line'}`}>
              <input type="checkbox" checked={channels[k]} disabled={k === 'mail' && reach.mail === 0} onChange={e => setChannels(c => ({ ...c, [k]: e.target.checked }))} className="mt-1" />
              <span className="flex-1"><span className="flex justify-between gap-2"><span className="font-semibold text-ux2-ink">{label}</span><span className="text-[13px] text-ux2-muted">{count}</span></span><span className="block text-[13px] text-ux2-muted">{note}</span></span>
            </label>
          ))}
          <div className="text-[13px] font-semibold text-ux2-ink">What goes out</div>
          <Inner className="flex flex-col gap-1 text-sm">
            <span>Notice of meeting · date, place, remote link, quorum ({ctx.quorum} units)</span>
            <span>Agenda · {items.length} item{items.length === 1 ? '' : 's'}</span>
            {ownerVotes.length > 0 && <span>Ballot for {ownerVotes.map(i => `item ${items.indexOf(i) + 1}`).join(' and ')} · online in the app; paper ballots come back to the board</span>}
            <span>Meeting packet · {packet} attachment{packet === 1 ? '' : 's'}{ctx.privateAtts.length ? ' · the board-only ones stay out' : ''}</span>
          </Inner>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ux2-line pt-3">
            <span className="text-[13px] text-ux2-muted">Each send is logged as proof of notice. Owner votes open as it goes out.</span>
            <Button disabled={sending || !Object.values(channels).some(Boolean)} onClick={() => { void send(); }}>{sending ? 'Sending…' : `Send to ${units.length} units`}</Button>
          </div>
        </Card>
        <Card aria-label="Preview" className="gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Preview</SectionLabel><PillTabs size="filter" aria-label="Preview channel" value={preview} onChange={setPreview} tabs={[{ id: 'email', label: 'Email' }, { id: 'letter', label: 'Letter' }, { id: 'app', label: 'App' }]} /></div>
          <Inner className="flex flex-col gap-2 text-sm leading-[1.55]">
            <div className="text-xs text-ux2-muted">{preview === 'email' ? `Subject: ${m.title}, ${dayLabel(m.date)} · ${ownerVotes.length ? 'your ballot is ready' : 'notice'}` : preview === 'letter' ? `${ctx.building} · printed letter` : 'Pinned notice on Community and Home'}</div>
            <div className="font-semibold text-ux2-ink">Notice of the {m.title}</div>
            <div className="whitespace-pre-wrap text-ux2-ink">{body}</div>
          </Inner>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <Card aria-label="Ballots so far" className="gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Ballots so far</SectionLabel>{ctx.isBoard && ownerVotes.some(i => i.vote?.status === 'open') && <Button size="sm" variant="ghost" onClick={() => setEntering(v => !v)}>Enter a paper ballot or proxy</Button>}</div>
        {entering && <PaperBallotForm ctx={ctx} />}
        {ownerVotes.length === 0 && <Why>No owner votes on this agenda.</Why>}
        {ownerVotes.map(it => {
          const n = ctx.votedCount(it.id);
          return (
            <Inner key={it.id} className="flex flex-col gap-1.5">
              <div className="flex justify-between gap-2 text-sm"><span className="font-semibold text-ux2-ink">{items.indexOf(it) + 1} · {it.title}</span><span className="text-ux2-muted">{n} of {units.length} units · quorum {ctx.quorum}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-ux2-line"><div className="h-full rounded-full bg-ux2-plum" style={{ width: `${units.length ? Math.min(100, (n / units.length) * 100) : 0}%` }} /></div>
            </Inner>
          );
        })}
        <Why>Online ballots, paper ballots and proxies count here as they come in, and toward quorum.</Why>
      </Card>
      <div className="flex flex-col gap-3">
        <Card aria-label="Notice" className="gap-2">
          <div className="flex items-center justify-between gap-2"><SectionLabel>Notice</SectionLabel><Chip tone="sage">Sent {dayLabel(sent.at.slice(0, 10))}</Chip></div>
          <Inner className="text-sm"><Cell title={`Sent by ${sent.by}`} note={channelLine(sent.channels)} /></Inner>
          <Why>Logged in Board Room › Outbox as proof of notice. Agenda changes from here aren’t re-sent.</Why>
        </Card>
        {ctx.isBoard && (
          <Card aria-label="The meeting" className="gap-2">
            <SectionLabel>The meeting</SectionLabel>
            <Inner className="text-sm text-ux2-ink">{dayLabel(m.date)}{m.time ? `, ${m.time}` : ''} · {m.location || 'room to set'}</Inner>
            <Button size="sm" className="self-start" onClick={onNext}>Start the meeting</Button>
          </Card>
        )}
      </div>
    </div>
  );
}
