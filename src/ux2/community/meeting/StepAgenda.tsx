/**
 * Step 1: the agenda, with a vote on any item that needs one and the reports,
 * documents and files that go with each item. The packet and a short
 * checklist say when it's ready for the notice.
 */
import { Fragment, useState } from 'react';
import { Button, Card, Chip, Inner, SectionLabel, Cell, Why, Field, INPUT } from '../../components';
import { KIND_LABEL, THRESHOLD_LABEL, defaultVote, newItemId, readiness, type AgendaItem, type ItemKind, type ItemVote, type Threshold } from '../meetingRecord';
import { AttachPanel, AttachmentList } from './Attachments';
import type { MeetingCtx } from './useMeeting';

function VoteEditor({ item, onSave, onCancel }: { item: AgendaItem; onSave: (v: ItemVote) => void; onCancel: () => void }) {
  const [v, setV] = useState<ItemVote>(item.vote ?? defaultVote(item.kind === 'election' ? 'owners' : 'owners', item));
  const [names, setNames] = useState((v.candidates ?? []).join('\n'));
  const election = !!v.candidates;
  const rules: Threshold[] = v.who === 'owners' ? ['majority_voting', 'majority_all', 'two_thirds_voting', 'two_thirds_all'] : ['majority_board', 'majority_present'];
  return (
    <form aria-label={`Vote on ${item.title}`} onSubmit={e => { e.preventDefault(); const candidates = election ? names.split('\n').map(s => s.trim()).filter(Boolean) : undefined; onSave({ ...v, ...(election ? { candidates } : {}) }); }} className="flex flex-col gap-2 rounded-[12px] bg-ux2-plum-tint/60 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Field label="Who votes"><select value={v.who} onChange={e => { const who = e.target.value as ItemVote['who']; setV(x => ({ ...x, who, threshold: who === 'owners' ? 'majority_voting' : 'majority_board', ...(who === 'board' ? { candidates: undefined, pick: undefined, secret: undefined } : {}) })); }} className={INPUT}><option value="owners">Owners · one vote per unit</option><option value="board">Board · roll call at the meeting</option></select></Field>
        <Field label="Passes with"><select value={v.threshold} onChange={e => setV(x => ({ ...x, threshold: e.target.value as Threshold }))} disabled={election} className={INPUT}>{rules.map(r => <option key={r} value={r}>{THRESHOLD_LABEL[r]}</option>)}</select></Field>
        {v.who === 'owners' && <Field label="Kind"><select value={election ? 'election' : 'question'} onChange={e => setV(x => (e.target.value === 'election' ? { ...x, candidates: [], pick: 1, secret: true } : { ...x, candidates: undefined, pick: undefined, secret: undefined }))} className={INPUT}><option value="question">For · against · abstain</option><option value="election">Election · pick names</option></select></Field>}
      </div>
      <Field label={election ? 'What owners are electing' : 'The question on the ballot'}><input value={v.question} onChange={e => setV(x => ({ ...x, question: e.target.value }))} className={INPUT} /></Field>
      {election && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_140px]">
          <Field label="Nominees, one per line"><textarea rows={3} value={names} onChange={e => setNames(e.target.value)} className="w-full rounded-[14px] border border-ux2-line-strong bg-white px-3.5 py-2 text-sm text-ux2-ink" /></Field>
          <Field label="How many to elect"><input type="number" min={1} value={v.pick ?? 1} onChange={e => setV(x => ({ ...x, pick: Math.max(1, Number(e.target.value) || 1) }))} className={INPUT} /></Field>
        </div>
      )}
      {election && <label className="flex items-center gap-2 text-sm text-ux2-ink"><input type="checkbox" checked={!!v.secret} onChange={e => setV(x => ({ ...x, secret: e.target.checked }))} /> Secret ballot: the record shows who voted, not for whom</label>}
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={!v.question.trim()}>Save the vote</Button><Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button></div>
    </form>
  );
}

export default function StepAgenda({ ctx, onNext }: { ctx: MeetingCtx; onNext: () => void }) {
  const { m, items, isBoard, snap } = ctx;
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<ItemKind>('discussion');
  const [attaching, setAttaching] = useState<string | null>(null);
  const [voting, setVoting] = useState<string | null>(null);
  const sent = !!m.noticeSentAt || ctx.row.noticeSent;
  const ready = readiness(m, items);
  const ownerAtts = items.reduce((t, it) => t + it.attachments.length, 0);
  const boardAtts = ctx.privateAtts.length;
  const snapshots = [...items.flatMap(i => i.attachments), ...ctx.privateAtts].filter(a => a.source === 'report');

  const saveItem = () => {
    if (!title.trim()) return;
    if (editing === 'new') ctx.setItems(cur => [...cur, { id: newItemId(), title: title.trim(), kind, minutes: '', attachments: [] }]);
    else if (editing) ctx.patchItem(editing, { title: title.trim(), kind });
    setEditing(null); setTitle('');
  };
  const move = (i: number, d: -1 | 1) => ctx.setItems(cur => { const next = [...cur]; const [x] = next.splice(i, 1); next.splice(i + d, 0, x); return next; });

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,0.85fr)]">
      <Card aria-label="Agenda" className="gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>Agenda · {items.length} item{items.length === 1 ? '' : 's'}</SectionLabel>
          {isBoard && editing !== 'new' && <Button size="sm" variant="ghost" onClick={() => { setEditing('new'); setTitle(''); setKind('discussion'); }}>Add an item</Button>}
        </div>
        {sent && isBoard && <Why>The notice already went out with this agenda. Changes show here and in the app, but aren't sent again.</Why>}
        {items.length === 0 && editing !== 'new' && <Inner className="text-sm text-ux2-muted">Nothing on the agenda yet.</Inner>}
        {items.map((it, i) => (
          <Fragment key={it.id}>
            {editing === it.id ? (
              <form aria-label={`Edit item ${i + 1}`} onSubmit={e => { e.preventDefault(); saveItem(); }} className="flex flex-wrap items-end gap-2 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
                <Field label="Item" className="min-w-[220px] flex-1"><input aria-label="Agenda item" value={title} onChange={e => setTitle(e.target.value)} className={INPUT} /></Field>
                <Field label="Kind" className="w-[150px]"><select value={kind} onChange={e => setKind(e.target.value as ItemKind)} className={INPUT}>{(Object.keys(KIND_LABEL) as ItemKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></Field>
                <Button type="submit" size="sm">Save</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              </form>
            ) : (
              <Inner className={`flex flex-col gap-2.5 ${it.vote ? 'border-ux2-plum' : ''}`} data-item={it.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ux2-navy text-xs font-bold text-white">{i + 1}</span><Cell title={it.title} note={`${KIND_LABEL[it.kind]}${it.vote ? ` · ${it.vote.who === 'owners' ? (it.vote.candidates ? 'owner election' : 'owner vote') : 'board vote'}` : ''}`} /></span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {it.vote && <Chip tone="plum">{it.vote.who === 'owners' ? THRESHOLD_LABEL[it.vote.threshold] : 'Board vote'}</Chip>}
                    {isBoard && <>
                      <Button size="sm" variant="ghost" onClick={() => setAttaching(attaching === it.id ? null : it.id)}>Attach</Button>
                      {(!it.vote || it.vote.status === 'draft') && <Button size="sm" variant="ghost" onClick={() => setVoting(voting === it.id ? null : it.id)}>{it.vote ? 'Edit the vote' : 'Add a vote'}</Button>}
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(it.id); setTitle(it.title); setKind(it.kind); }}>Edit</Button>
                      <Button size="sm" variant="ghost" aria-label={`Move item ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</Button>
                      <Button size="sm" variant="ghost" aria-label={`Remove agenda item ${i + 1}`} onClick={() => ctx.setItems(cur => cur.filter(x => x.id !== it.id))}>Remove</Button>
                    </>}
                  </span>
                </div>
                {it.vote && voting !== it.id && (
                  <div className="grid grid-cols-1 gap-2 rounded-[12px] bg-ux2-plum-tint/60 px-3 py-2.5 text-[13px] sm:grid-cols-3">
                    <div><div className="text-xs text-ux2-muted">On the ballot</div><div className="font-semibold text-ux2-ink">{it.vote.question}</div></div>
                    <div><div className="text-xs text-ux2-muted">{it.vote.candidates ? `Elect ${it.vote.pick ?? 1}` : 'Passes with'}</div><div className="font-semibold text-ux2-ink">{it.vote.candidates ? (it.vote.candidates.join(', ') || 'No nominees yet') : THRESHOLD_LABEL[it.vote.threshold]}</div></div>
                    <div><div className="text-xs text-ux2-muted">When</div><div className="font-semibold text-ux2-ink">{it.vote.who === 'owners' ? 'Opens with the notice · closes at the meeting' : 'Roll call at the meeting'}</div>{isBoard && it.vote.status === 'draft' && <button type="button" onClick={() => ctx.patchItem(it.id, { vote: undefined })} className="mt-1 text-xs font-semibold text-ux2-red-ink hover:underline">Remove the vote</button>}</div>
                  </div>
                )}
                {voting === it.id && <VoteEditor item={it} onCancel={() => setVoting(null)} onSave={v => { ctx.patchItem(it.id, { vote: v }); setVoting(null); }} />}
                <AttachmentList atts={ctx.attachmentsOf(it)} onRemove={isBoard ? a => ctx.removeAttachment(it, a) : undefined} />
                {attaching === it.id && <AttachPanel itemTitle={it.title} today={snap.today} by={snap.viewer.name} onAdd={a => ctx.addAttachment(it, a)} onClose={() => setAttaching(null)} />}
              </Inner>
            )}
          </Fragment>
        ))}
        {editing === 'new' && (
          <form aria-label="Add an agenda item" onSubmit={e => { e.preventDefault(); saveItem(); }} className="flex flex-wrap items-end gap-2 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
            <Field label="Item" className="min-w-[220px] flex-1"><input aria-label="Agenda item" value={title} onChange={e => setTitle(e.target.value)} placeholder="Adopt the 2027 budget" className={INPUT} /></Field>
            <Field label="Kind" className="w-[150px]"><select value={kind} onChange={e => setKind(e.target.value as ItemKind)} className={INPUT}>{(Object.keys(KIND_LABEL) as ItemKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></Field>
            <Button type="submit" size="sm" disabled={!title.trim()}>Add</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </form>
        )}
        <Why>A vote belongs to its item. Owner votes open when the notice goes out and close at the meeting; board votes are a roll call during it. Reports from the app are kept as they were on their date.</Why>
      </Card>

      <div className="flex flex-col gap-3">
        <Card aria-label="Meeting packet" className="gap-2">
          <SectionLabel>Meeting packet · {ownerAtts + (isBoard ? boardAtts : 0)}</SectionLabel>
          <Inner className="flex flex-col gap-1.5 text-[13px]">
            <div className="flex justify-between"><span>Everyone</span><span className="font-semibold">{ownerAtts} file{ownerAtts === 1 ? '' : 's'}</span></div>
            {isBoard && <div className="flex justify-between"><span>Board only</span><span className="font-semibold">{boardAtts}</span></div>}
            <div className="flex justify-between"><span>Snapshots frozen</span><span className="font-semibold">{snapshots.filter(a => a.mode === 'frozen').length}</span></div>
            <div className="flex justify-between"><span>Still refreshing</span><span className="font-semibold">{snapshots.filter(a => a.mode === 'live').length}{snapshots.some(a => a.mode === 'live') ? ' · freeze with the notice' : ''}</span></div>
          </Inner>
          <Why>A snapshot keeps the numbers as they were, so the record shows what people saw even after Funds changes. Board-only files never go out with the notice.</Why>
        </Card>
        <Card aria-label="Votes at this meeting" className="gap-2">
          <SectionLabel>Votes at this meeting · {items.filter(i => i.vote).length}</SectionLabel>
          {items.filter(i => i.vote).map(i => (
            <Inner key={i.id} className="flex items-center justify-between gap-2"><Cell title={`${items.indexOf(i) + 1} · ${i.title}`} note={i.vote!.who === 'owners' ? (i.vote!.candidates ? `${i.vote!.candidates.length} nominees for ${i.vote!.pick ?? 1}` : 'Owner vote') : 'Board vote'} /><Chip tone={i.vote!.status === 'closed' ? 'sage' : i.vote!.status === 'open' ? 'plum' : 'ghost'}>{i.vote!.status === 'closed' ? 'Decided' : i.vote!.status === 'open' ? 'Open' : 'Ready'}</Chip></Inner>
          ))}
          {!items.some(i => i.vote) && <Why>No votes yet. Add one to any item that needs a decision.</Why>}
        </Card>
        {isBoard && !sent && (
          <Card aria-label="Ready for the notice" className="gap-2">
            <SectionLabel>Ready for the notice?</SectionLabel>
            <Inner className="flex flex-col gap-1.5 text-[13px]">{ready.map(r => <span key={r.label} className={r.ok ? 'text-ux2-ink' : 'text-ux2-amber'}>{r.ok ? '✓' : '○'} {r.label}</span>)}</Inner>
            <Button size="sm" className="self-start" onClick={onNext}>Next: notice and ballots</Button>
          </Card>
        )}
      </div>
    </div>
  );
}
