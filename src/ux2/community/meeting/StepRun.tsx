/**
 * Step 3: running the meeting, in one view. Each agenda item holds its
 * minutes, its attachments and its vote: the owner tally by how ballots came
 * in (plus the room's hand count) or the board's roll call, recorded under
 * the item. Attendance by unit sits alongside and counts toward quorum.
 * Adjourning closes any open vote, writes the minutes and sends them to the
 * board to approve; the same view is then the record.
 */
import { useEffect, useState } from 'react';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { Button, Card, Chip, Inner, SectionLabel, Cell, Why, Field, INPUT } from '../../components';
import { METHOD_LABEL, MODE_LABEL, attendanceCounts, boardVotesNeeded, composeMinutes, defaultVote, resultLine, tallyBoardVote, tallyOwnerVote, type AgendaItem, type AttendanceMode, type BallotMethod, type RollCallChoice, type UnitAttendance } from '../meetingRecord';
import { AttachmentList } from './Attachments';
import type { MeetingCtx } from './useMeeting';

const nowIso = () => new Date().toISOString();
const hhmm = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '');
const RC: RollCallChoice[] = ['for', 'against', 'abstain', 'recused', 'absent'];
const RC_LABEL: Record<RollCallChoice, string> = { for: 'For', against: 'Against', abstain: 'Abstain', recused: 'Recused', absent: 'Absent' };

/** Minutes for one item, saved when the field loses focus (and every few seconds while typing). */
function MinutesField({ item, disabled, onSave }: { item: AgendaItem; disabled: boolean; onSave: (text: string) => void }) {
  const [text, setText] = useState(item.minutes);
  useEffect(() => setText(item.minutes), [item.minutes]);
  useEffect(() => {
    if (text === item.minutes) return;
    const t = setTimeout(() => onSave(text), 1500);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  return <textarea aria-label={`Minutes for ${item.title}`} rows={3} disabled={disabled} value={text} onChange={e => setText(e.target.value)} onBlur={() => { if (text !== item.minutes) onSave(text); }} placeholder="What was said and decided" className="w-full rounded-[12px] border border-ux2-line bg-white px-3 py-2.5 text-sm leading-[1.55] text-ux2-ink disabled:bg-ux2-surface" />;
}

function OwnerVotePanel({ ctx, item, locked }: { ctx: MeetingCtx; item: AgendaItem; locked: boolean }) {
  const v = item.vote!;
  const ballots = ctx.ballotsFor(item.id);
  const live = tallyOwnerVote(v, ballots, ctx.units, ctx.snap.viewer.name, nowIso());
  const room = v.roomCount ?? { for: 0, against: 0, abstain: 0 };
  const setRoom = (k: keyof typeof room, n: number) => ctx.patchItem(item.id, x => ({ vote: { ...x.vote!, roomCount: { ...(x.vote!.roomCount ?? { for: 0, against: 0, abstain: 0 }), [k]: Math.max(0, n) } } }));
  const close = () => ctx.patchItem(item.id, x => ({ vote: { ...x.vote!, status: 'closed', result: tallyOwnerVote(x.vote!, ballots, ctx.units, ctx.snap.viewer.name, nowIso()) } }));
  const sources = (['online', 'paper', 'proxy', 'remote'] as BallotMethod[]).filter(s => live.bySource?.[s]);
  if (v.status === 'closed' && v.result) {
    const r = v.result;
    return (
      <div className="flex flex-col gap-2 rounded-[12px] bg-ux2-plum-tint/60 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]"><span className="font-semibold text-ux2-ink">Recorded {hhmm(r.closedAt)} · {v.question}</span><Chip tone={r.passed ? 'sage' : 'red'}>{r.candidates ? 'Elected' : r.passed ? 'Passed' : 'Failed'}</Chip></div>
        <div className="text-sm text-ux2-ink">{resultLine(v)}{r.forPct != null && !r.candidates ? ` · ${r.forPct}% for by share` : ''}</div>
        {!locked && <Button size="sm" variant="ghost" className="self-start" onClick={() => ctx.patchItem(item.id, x => ({ vote: { ...x.vote!, status: 'open', result: undefined } }))}>Reopen the vote</Button>}
      </div>
    );
  }
  if (v.status === 'draft') return <div className="flex items-center justify-between gap-2 rounded-[12px] bg-ux2-plum-tint/60 px-3 py-2.5 text-[13px]"><span className="text-ux2-ink">Owner vote · not opened yet</span>{!locked && <Button size="sm" onClick={() => ctx.patchItem(item.id, x => ({ vote: { ...x.vote!, status: 'open', openedAt: nowIso() } }))}>Open the vote</Button>}</div>;
  return (
    <div className="flex flex-col gap-1 rounded-[12px] bg-ux2-plum-tint/60 px-3 py-2.5">
      <div className="flex flex-wrap justify-between gap-2 text-[13px]"><span className="font-semibold text-ux2-ink">The vote · {v.question}</span><Chip tone="plum">Open</Chip></div>
      {v.candidates ? (
        <div className="flex flex-col gap-1 pt-1 text-sm">{live.candidates?.map(c => <div key={c.name} className="flex justify-between border-t border-white/70 py-1"><span>{c.name}</span><span className="font-semibold">{c.count}</span></div>)}<div className="text-xs text-ux2-muted">{ballots.length} ballots · {v.secret ? 'secret ballot' : 'open ballot'} · room hand counts don't apply to elections</div></div>
      ) : (
        <>
          <div className="grid grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,0.55fr))] gap-2 pt-1 text-xs font-semibold text-ux2-muted"><span>Ballots</span><span className="text-center">For</span><span className="text-center">Against</span><span className="text-center">Abstain</span></div>
          {sources.map(s => { const b = live.bySource![s]!; return <div key={s} className="grid grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,0.55fr))] gap-2 border-t border-white/70 py-1.5 text-[13px]"><span>{METHOD_LABEL[s]} · {b.units} unit{b.units === 1 ? '' : 's'}</span><span className="text-center">{b.for}</span><span className="text-center">{b.against}</span><span className="text-center">{b.abstain}</span></div>; })}
          {!sources.length && <div className="border-t border-white/70 py-1.5 text-[13px] text-ux2-muted">No ballots yet.</div>}
          <div className="grid grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,0.55fr))] items-center gap-2 border-t border-white/70 py-1.5 text-[13px]">
            <span className="font-semibold">{METHOD_LABEL.room}</span>
            {(['for', 'against', 'abstain'] as const).map(k => <input key={k} type="number" min={0} aria-label={`In the room, ${k}`} disabled={locked} value={room[k]} onChange={e => setRoom(k, Number(e.target.value) || 0)} className={`${INPUT} text-center`} />)}
          </div>
        </>
      )}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-white px-3 py-2">
        <span className="text-sm font-semibold text-ux2-ink">{v.candidates ? `${ballots.length} ballots so far` : `${live.for} for · ${live.against} against · ${live.abstain} abstain · ${live.notVoted} didn't vote · ${live.passed ? 'passing' : 'not passing'}`}</span>
        {!locked && <Button size="sm" onClick={close}>Close and record in the minutes</Button>}
      </div>
    </div>
  );
}

function BoardVotePanel({ ctx, item, locked }: { ctx: MeetingCtx; item: AgendaItem; locked: boolean }) {
  const v = item.vote!;
  const rc = v.rollCall ?? {};
  const set = (patch: Partial<typeof v>) => ctx.patchItem(item.id, x => ({ vote: { ...x.vote!, ...patch } }));
  const live = tallyBoardVote(v, ctx.boardNames, ctx.snap.viewer.name, nowIso());
  if (v.status === 'closed' && v.result) {
    return (
      <div className="flex flex-col gap-1.5 rounded-[12px] bg-ux2-plum-tint/60 px-3 py-2.5 text-[13px]">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-ux2-ink">Board vote recorded {hhmm(v.result.closedAt)}{v.movedBy ? ` · moved by ${v.movedBy}, seconded by ${v.secondedBy || '—'}` : ''}</span><Chip tone={v.result.passed ? 'sage' : 'red'}>{v.result.passed ? 'Passed' : 'Failed'}</Chip></div>
        <div className="text-ux2-ink">{ctx.boardNames.map(n => `${n}: ${RC_LABEL[rc[n] ?? 'absent'].toLowerCase()}`).join(' · ')}</div>
        {!locked && <Button size="sm" variant="ghost" className="self-start" onClick={() => set({ status: 'open', result: undefined })}>Reopen the vote</Button>}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-[12px] bg-ux2-plum-tint/60 px-3 py-2.5">
      <div className="text-[13px] font-semibold text-ux2-ink">Board vote · {v.question}</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="Moved by"><select value={v.movedBy ?? ''} disabled={locked} onChange={e => set({ movedBy: e.target.value })} className={INPUT}><option value="">—</option>{ctx.boardNames.map(n => <option key={n}>{n}</option>)}</select></Field>
        <Field label="Seconded by"><select value={v.secondedBy ?? ''} disabled={locked} onChange={e => set({ secondedBy: e.target.value })} className={INPUT}><option value="">—</option>{ctx.boardNames.filter(n => n !== v.movedBy).map(n => <option key={n}>{n}</option>)}</select></Field>
      </div>
      {ctx.boardNames.map(n => (
        <div key={n} className="flex flex-wrap items-center justify-between gap-2 border-t border-white/70 py-1.5">
          <span className="text-sm font-semibold text-ux2-ink">{n}</span>
          <div role="group" aria-label={`${n}'s vote`} className="flex flex-wrap gap-1 rounded-full bg-white p-1">
            {RC.map(c => <button key={c} type="button" disabled={locked} aria-pressed={rc[n] === c} onClick={() => ctx.patchItem(item.id, x => ({ vote: { ...x.vote!, status: 'open', rollCall: { ...(x.vote!.rollCall ?? {}), [n]: c } } }))} className={`min-h-[32px] rounded-full px-2.5 text-xs font-semibold ${rc[n] === c ? (c === 'for' ? 'bg-ux2-sage text-white' : c === 'against' ? 'bg-ux2-red-ink text-white' : 'bg-ux2-navy text-white') : 'text-ux2-muted hover:text-ux2-ink'}`}>{RC_LABEL[c]}</button>)}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-white px-3 py-2">
        <span className="text-sm font-semibold text-ux2-ink">{live.for} for · {live.against} against · {live.abstain} abstain · {boardVotesNeeded(v, ctx.boardNames)} needed · {live.passed ? 'passing' : 'not passing'}</span>
        {!locked && <Button size="sm" onClick={() => ctx.patchItem(item.id, x => ({ vote: { ...x.vote!, status: 'closed', result: tallyBoardVote(x.vote!, ctx.boardNames, ctx.snap.viewer.name, nowIso()) } }))}>Record the result</Button>}
      </div>
    </div>
  );
}

function Attendance({ ctx, locked }: { ctx: MeetingCtx; locked: boolean }) {
  const [unit, setUnit] = useState('');
  const [mode, setMode] = useState<AttendanceMode>('in_person');
  const [proxyTo, setProxyTo] = useState('');
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const attendees = ctx.m.attendees;
  const updateAttendees = useMeetingsStore(s => s.updateAttendees);
  const c = attendanceCounts(ctx.present);
  const checkIn = (u: string, md: AttendanceMode, to?: string) => {
    const owner = ctx.units.find(x => x.number === u)?.owner ?? '';
    const next: UnitAttendance[] = [...ctx.freshPrivate().attendance.filter(a => a.unit !== u), { unit: u, owner, mode: md, proxyTo: to || undefined, at: nowIso() }];
    ctx.setAttendance(next);
  };
  const toggleBoard = (n: string) => updateAttendees(ctx.m.id, { ...attendees, board: attendees.board.includes(n) ? attendees.board.filter(x => x !== n) : [...attendees.board, n] });
  const rows = ctx.units.filter(u => !q || `${u.number} ${u.owner}`.toLowerCase().includes(q.toLowerCase()));
  const voteItems = ctx.items.filter(i => i.vote?.who === 'owners');
  return (
    <div className="flex flex-col gap-3">
      <Card aria-label="Attendance" className="gap-2">
        <SectionLabel>Attendance</SectionLabel>
        <Inner className="flex flex-col gap-1 text-[13px]">
          {(Object.keys(MODE_LABEL) as AttendanceMode[]).filter(k => c[k]).map(k => <div key={k} className="flex justify-between"><span>{MODE_LABEL[k]}</span><span className="font-semibold">{c[k]}</span></div>)}
          <div className="flex justify-between border-t border-ux2-line pt-1.5"><span className="font-semibold">Present</span><span className="font-semibold">{c.present} of {ctx.units.length} · quorum {ctx.quorum}{c.present >= ctx.quorum ? ' · met' : ''}</span></div>
        </Inner>
        <div className="text-xs font-semibold text-ux2-muted">Board present</div>
        <div className="flex flex-wrap gap-1.5">{ctx.boardNames.map(n => <button key={n} type="button" disabled={locked} aria-pressed={attendees.board.includes(n)} onClick={() => toggleBoard(n)} className="rounded-full"><Chip tone={attendees.board.includes(n) ? 'sage' : 'ghost'}>{n}</Chip></button>)}</div>
        {!locked && (
          <form aria-label="Check in a unit" onSubmit={e => { e.preventDefault(); if (unit) { checkIn(unit, mode, proxyTo); setUnit(''); setProxyTo(''); } }} className="flex flex-col gap-2 rounded-[12px] bg-white p-2.5">
            <div className="grid grid-cols-2 gap-2">
              <select aria-label="Unit" value={unit} onChange={e => setUnit(e.target.value)} className={INPUT}><option value="">Unit…</option>{ctx.units.map(u => <option key={u.number} value={u.number}>{u.number}</option>)}</select>
              <select aria-label="How" value={mode} onChange={e => setMode(e.target.value as AttendanceMode)} className={INPUT}><option value="in_person">In person</option><option value="remote">Remote</option><option value="proxy">By proxy</option></select>
            </div>
            {mode === 'proxy' && <input aria-label="Proxy holder" placeholder="Who holds the proxy" value={proxyTo} onChange={e => setProxyTo(e.target.value)} className={INPUT} />}
            <Button type="submit" size="sm" disabled={!unit}>Check in</Button>
          </form>
        )}
      </Card>
      <Card aria-label="By unit" className="gap-2">
        <div className="flex items-center justify-between gap-2"><SectionLabel>By unit · {ctx.units.length}</SectionLabel></div>
        <input aria-label="Find a unit" placeholder="Find a unit or owner" value={q} onChange={e => setQ(e.target.value)} className={INPUT} />
        <Inner className="flex flex-col py-1">
          {(all || q ? rows : rows.slice(0, 12)).map(u => {
            const a = ctx.present.find(x => x.unit === u.number);
            const votes = voteItems.map(i => { const b = ctx.ballotsFor(i.id).find(x => x.unit === u.number); return b ? `${ctx.items.indexOf(i) + 1}: ${Array.isArray(b.choice) ? (i.vote?.secret ? 'voted' : b.choice.join(', ')) : b.choice}` : ''; }).filter(Boolean).join(' · ');
            return (
              <div key={u.number} className="flex items-center justify-between gap-2 border-t border-ux2-line/60 py-1.5 first:border-t-0">
                <span className="min-w-0 text-[13px]"><span className="font-semibold text-ux2-ink">{u.number}</span> <span className="text-ux2-ink">{u.owner || '—'}</span><span className="block text-[11px] text-ux2-muted">{a ? `${MODE_LABEL[a.mode]}${a.proxyTo ? ` to ${a.proxyTo}` : ''}` : 'Not here'}{votes ? ` · ${votes}` : ''}</span></span>
                {a ? <Chip tone={a.mode === 'remote' ? 'teal' : a.mode === 'proxy' ? 'plum' : a.mode === 'mail' || a.mode === 'ballot' ? 'amber' : 'sage'}>{MODE_LABEL[a.mode]}</Chip> : !locked && <Button size="sm" variant="ghost" onClick={() => checkIn(u.number, 'in_person')}>Check in</Button>}
              </div>
            );
          })}
        </Inner>
        {!q && rows.length > 12 && <Button size="sm" variant="ghost" className="self-start" onClick={() => setAll(v => !v)}>{all ? 'Show fewer' : `Show all ${rows.length}`}</Button>}
        <Why>Each unit's line fills in as it checks in and as ballots are recorded. A ballot sent ahead counts toward quorum. This list is the attendance record in the minutes.</Why>
      </Card>
    </div>
  );
}

export default function StepRun({ ctx }: { ctx: MeetingCtx }) {
  const { m, items, snap } = ctx;
  const update = useMeetingsStore(s => s.updateMeeting);
  const approve = useMeetingsStore(s => s.approveMinutes);
  const revoke = useMeetingsStore(s => s.revokeMinutesApproval);
  const boardRoles = useBuildingStore(s => s.board);
  // Meetings held before the record existed have no times and one block of minutes.
  const legacy = ctx.row.state === 'past' && !m.startedAt;
  const started = !!m.startedAt || legacy;
  const ended = !!m.endedAt || legacy;
  const approvals = m.minutesApprovals ?? [];
  const majority = Math.floor(ctx.boardNames.length / 2) + 1;
  const sealed = !!m.minutesApprovedAt || (legacy && approvals.length > 0);
  const current = m.session?.currentItemId ?? items.find(i => !i.endedAt)?.id;

  const start = () => {
    const at = nowIso();
    ctx.update({ startedAt: at, status: 'IN_PROGRESS' });
    if (items[0]) ctx.setItems(cur => cur.map((it, i) => (i === 0 ? { ...it, startedAt: at } : it)));
    ctx.updateSession({ currentItemId: items[0]?.id, secretary: m.session?.secretary || boardRoles.find(b => /secretary/i.test(b.role))?.name || snap.viewer.name });
  };
  const goTo = (id: string) => {
    const at = nowIso();
    ctx.setItems(cur => cur.map(it => (it.id === current && !it.endedAt ? { ...it, endedAt: at } : it.id === id && !it.startedAt ? { ...it, startedAt: at } : it)));
    ctx.updateSession({ currentItemId: id });
  };
  const adjourn = () => {
    const at = nowIso();
    const closed = ctx.fresh().map(it => {
      let vote = it.vote;
      if (vote && vote.status !== 'closed') vote = { ...vote, status: 'closed', result: vote.who === 'owners' ? tallyOwnerVote(vote, ctx.ballotsFor(it.id), ctx.units, snap.viewer.name, at) : tallyBoardVote(vote, ctx.boardNames, snap.viewer.name, at) };
      return { ...it, endedAt: it.endedAt ?? (it.startedAt ? at : undefined), vote };
    });
    ctx.setItems(closed);
    update(m.id, { endedAt: at, status: 'COMPLETED', minutes: composeMinutes(closed, `${m.title} · ${m.date}`), attendees: { ...m.attendees, owners: ctx.present.map(a => a.owner || `Unit ${a.unit}`) } });
    ctx.updateSession({ currentItemId: undefined });
  };
  const doApprove = () => {
    approve(m.id, { name: snap.viewer.name, role: boardRoles.find(b => b.name === snap.viewer.name)?.role ?? 'Board', date: snap.today });
    if (approvals.filter(a => a.name !== snap.viewer.name).length + 1 >= majority) update(m.id, { minutesApprovedAt: nowIso(), ...(m.session?.summary ? { session: { ...m.session, sealedAt: nowIso() } } : {}) });
  };

  if (!started) {
    return (
      <Card tone="white" aria-label="Start the meeting" className="gap-2 border-ux2-navy">
        <SectionLabel className="!text-ux2-navy">Call the meeting to order</SectionLabel>
        <div className="text-sm text-ux2-ink">Starting opens this view for taking minutes, counting votes and checking in units. Owners following in the app see the meeting live.</div>
        <div className="flex flex-wrap gap-2"><Button onClick={start}>Start the meeting</Button></div>
      </Card>
    );
  }

  const locked = sealed;
  return (
    <div className="flex flex-col gap-3">
      {ended && (
        <Card aria-label="Approve the minutes" tone={sealed ? 'surface' : 'outline'} className="gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Minutes · {sealed ? `approved ${m.minutesApprovedAt?.slice(0, 10)}` : `${approvals.length} of ${majority} approvals`}</SectionLabel><Chip tone={sealed ? 'sage' : 'amber'}>{sealed ? 'Approved' : 'Waiting on the board'}</Chip></div>
          <Inner className="flex flex-wrap items-center justify-between gap-2">
            <Cell title={approvals.length ? `Approved by ${approvals.map(a => a.name).join(', ')}` : 'No approvals yet'} note={`Adjourned ${hhmm(m.endedAt ?? undefined)}. A majority of the board (${majority} of ${ctx.boardNames.length}) approves the minutes; then they post to owners and the record goes to Building › Archive.`} />
            {ctx.isBoard && !sealed && (approvals.some(a => a.name === snap.viewer.name) ? <Button size="sm" variant="ghost" onClick={() => revoke(m.id, snap.viewer.name)}>Withdraw my approval</Button> : <Button size="sm" onClick={doApprove}>Approve</Button>)}
          </Inner>
        </Card>
      )}
      {legacy && m.minutes && <Card aria-label="Minutes as recorded" className="gap-2"><SectionLabel>Minutes as recorded</SectionLabel><Inner className="whitespace-pre-wrap text-sm leading-[1.55] text-ux2-ink">{m.minutes}</Inner><Why>Recorded before minutes were kept item by item.</Why></Card>}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,0.62fr)_minmax(0,1.75fr)_minmax(0,0.9fr)]">
        <nav aria-label="Agenda" className="flex flex-col gap-1 self-start rounded-[22px] border border-ux2-line bg-ux2-surface p-3">
          <SectionLabel className="px-1.5 pb-1">Agenda</SectionLabel>
          {items.map((it, i) => {
            const done = !!it.endedAt || it.vote?.status === 'closed';
            const on = !ended && it.id === current;
            return (
              <button key={it.id} type="button" onClick={() => { if (!ended) goTo(it.id); document.getElementById(`run-${it.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className={`flex items-start gap-2.5 rounded-[12px] px-2.5 py-2 text-left text-[13px] ${on ? 'bg-ux2-navy text-white' : done ? 'text-ux2-muted' : 'text-ux2-ink hover:bg-white'}`}>
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${on ? 'bg-ux2-cyan text-ux2-navy' : done ? 'bg-ux2-sage-tint text-ux2-sage' : 'bg-ux2-line text-ux2-ink'}`}>{done && !on ? '✓' : i + 1}</span>
                <span className={on ? 'font-semibold' : ''}>{it.title}{on && it.vote?.status === 'open' ? ' · voting' : ''}</span>
              </button>
            );
          })}
        </nav>
        <section aria-label="Minutes and votes, item by item" className="flex flex-col gap-3 rounded-[22px] border border-ux2-line bg-ux2-surface p-4">
          <div className="flex items-center justify-between gap-2"><SectionLabel>Minutes and votes · item by item</SectionLabel><span className="text-xs text-ux2-muted">{locked ? 'Approved · read only' : 'Saved as you type'}</span></div>
          {items.map((it, i) => {
            const on = !ended && it.id === current;
            const atts = ctx.attachmentsOf(it);
            return (
              <article key={it.id} id={`run-${it.id}`} aria-label={`Item ${i + 1}: ${it.title}`} className={`flex gap-3 rounded-[14px] border bg-white px-3.5 py-3 ${on ? 'border-2 border-ux2-plum' : 'border-ux2-line'}`}>
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${it.endedAt || it.vote?.status === 'closed' ? 'bg-ux2-sage' : on ? 'bg-ux2-plum' : 'bg-ux2-navy'}`}>{i + 1}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap justify-between gap-2"><span className="font-semibold text-ux2-ink">{it.title}</span><span className="text-xs text-ux2-muted">{it.startedAt ? `${hhmm(it.startedAt)}${it.endedAt ? ` – ${hhmm(it.endedAt)}` : ' –'}` : 'Not reached'}</span></div>
                  <AttachmentList atts={atts} />
                  <MinutesField item={it} disabled={locked} onSave={text => ctx.patchItem(it.id, { minutes: text })} />
                  {it.vote?.who === 'owners' && <OwnerVotePanel ctx={ctx} item={it} locked={locked} />}
                  {it.vote?.who === 'board' && <BoardVotePanel ctx={ctx} item={it} locked={locked} />}
                  {!it.vote && !locked && !ended && <Button size="sm" variant="ghost" className="self-start" onClick={() => ctx.patchItem(it.id, { vote: { ...defaultVote('board', it), status: 'open', openedAt: nowIso() } })}>Add a board vote from the floor</Button>}
                  {on && i < items.length - 1 && <Button size="sm" className="self-start" onClick={() => goTo(items[i + 1].id)}>Next item</Button>}
                </div>
              </article>
            );
          })}
          {!ended && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] bg-white px-3.5 py-3">
              <span className="text-[13px] text-ux2-muted">Adjourning records the end time, closes any open vote, writes these minutes with every result and the attendance, and sends them to the board to approve.</span>
              <Button onClick={adjourn}>Adjourn</Button>
            </div>
          )}
        </section>
        <Attendance ctx={ctx} locked={locked} />
      </div>
    </div>
  );
}
