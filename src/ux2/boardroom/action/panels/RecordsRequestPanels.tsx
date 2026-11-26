import { useState } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { plusDays } from '@/lib/actions/types';
import { SHARE_LABEL, USUALLY_WITHHELD, withheld, type RecordsRequestData, type RequestedItem } from '@/lib/actions/recordsRequest';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { Button, Inner, KV, Why, Field, INPUT } from '../../../components';
import { todayIso } from '../../../runbook/adapters';
import { AREA, FORM, NOTE } from '../ActionShell';
import type { PanelProps } from '../RecordAction';

function Log({ r, patch }: PanelProps<RecordsRequestData>) {
  const units = useFinancialStore(s => s.units);
  const setRecord = useActionRecordsStore(s => s.patch);
  const [unit, setUnit] = useState(r.unit);
  const [who, setWho] = useState(r.data.requester);
  const [on, setOn] = useState(r.data.askedOn || todayIso());
  const [writing, setWriting] = useState(r.data.inWriting);
  const [days, setDays] = useState('10');
  const u = units.find(x => x.number === unit);
  const [owner, setOwner] = useState(r.data.ownerOfRecord);
  return (
    <>
      <div className={FORM}>
        <Field label="Unit" className="w-[130px]"><select value={unit} onChange={e => { setUnit(e.target.value); const x = units.find(y => y.number === e.target.value); if (x && !who.trim()) setWho(x.owner); }} className={INPUT}><option value="">—</option>{units.map(x => <option key={x.number} value={x.number}>{x.number}</option>)}</select></Field>
        <Field label="Who asked" className="min-w-[200px] flex-1"><input value={who} onChange={e => setWho(e.target.value)} className={INPUT} /></Field>
        <Field label="Asked on" className="w-[170px]"><input type="date" value={on} max={todayIso()} onChange={e => setOn(e.target.value)} className={INPUT} /></Field>
        <Field label="Reply within, days" className="w-[150px]"><input inputMode="numeric" value={days} onChange={e => setDays(e.target.value)} className={INPUT} /></Field>
      </div>
      {u && <Inner><KV label="Owner on file">{u.owner}</KV><KV label="Balance">{u.balance > 0 ? `$${u.balance.toLocaleString('en-US')} owed` : 'Current'}</KV></Inner>}
      <div className={FORM}>
        <label className="flex items-center gap-2 pb-2.5 text-xs font-semibold text-ux2-ink"><input type="checkbox" checked={writing} onChange={e => setWriting(e.target.checked)} />Asked in writing</label>
        <Field label="An owner in good standing (or their agent), asking for a purpose tied to their membership?" className="w-[420px]"><select value={owner} onChange={e => setOwner(e.target.value as RecordsRequestData['ownerOfRecord'])} className={INPUT}><option value="">Choose</option><option value="yes">Yes</option><option value="no">No</option></select></Field>
        <Button size="sm" disabled={!who.trim() || !on || !owner} onClick={() => { patch({ requester: who.trim(), askedOn: on, inWriting: writing, ownerOfRecord: owner }); setRecord(r.id, { unit, dueOn: plusDays(on, Math.max(1, Number(days) || 10)) }); }}>Log it</Button>
      </div>
      {owner === 'no' && <p className={NOTE}>The right belongs to owners in good standing and their authorised agents, for a proper purpose related to their membership. A request outside that can be declined in step 2, with that as the reason.</p>}
      <Why>An owner in good standing, or their agent, may examine and copy the association's books and records for a proper purpose related to their membership, during reasonable hours on business days (DC Code § 42-1903.14). The statute sets no number of days to reply, so the deadline here is the board's own, or the bylaws' if they set one; ten is the starting figure. Whether an owner who owes dues is in good standing is for the bylaws. The association may charge the actual cost of copies.</Why>
    </>
  );
}

const SHARES: RequestedItem['share'][] = ['full', 'redacted', 'later', 'no'];

function Choose({ r, patch }: PanelProps<RecordsRequestData>) {
  const [what, setWhat] = useState('');
  const set = (id: string, c: Partial<RequestedItem>) => patch({ items: r.data.items.map(i => (i.id === id ? { ...i, ...c } : i)) });
  const add = () => { if (what.trim()) { patch({ items: [...r.data.items, { id: `i${Date.now().toString(36)}`, what: what.trim(), share: '', reason: '' }] }); setWhat(''); } };
  return (
    <>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {r.data.items.map(i => (
          <li key={i.id}><Inner className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm font-semibold text-ux2-ink">{i.what}</b>{!r.data.sentOn && <Button size="sm" variant="ghost" onClick={() => patch({ items: r.data.items.filter(x => x.id !== i.id) })}>Remove</Button>}</div>
            <div className={FORM}>
              <Field label="Share" className="w-[280px]"><select aria-label={`Share ${i.what}`} value={i.share} disabled={!!r.data.sentOn} onChange={e => set(i.id, { share: e.target.value as RequestedItem['share'] })} className={INPUT}><option value="">Choose</option>{SHARES.map(s => <option key={s} value={s}>{SHARE_LABEL[s]}</option>)}</select></Field>
              {i.share && i.share !== 'full' && <Field label={i.share === 'later' ? 'When, and why not now' : 'Reason, as the owner will read it'} className="min-w-[240px] flex-1"><input key={i.share} defaultValue={i.reason} disabled={!!r.data.sentOn} onBlur={e => set(i.id, { reason: e.target.value.trim() })} className={INPUT} /></Field>}
            </div>
          </Inner></li>
        ))}
      </ul>
      {!r.data.sentOn && <div className={FORM}><Field label="What was asked for" className="min-w-[260px] flex-1"><input value={what} onChange={e => setWhat(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="2026 general ledger" className={INPUT} /></Field><Button size="sm" variant="ghost" disabled={!what.trim()} onClick={add}>Add the item</Button></div>}
      <Inner><b className="text-xs font-semibold text-ux2-ink">May be withheld · DC Code § 42-1903.14(c)</b><ul className="m-0 mt-1 list-disc pl-5 text-xs text-ux2-muted">{USUALLY_WITHHELD.map(w => <li key={w}>{w}</li>)}</ul></Inner>
      <Why>The secretary decides item by item. Anything not shared in full goes out with its reason. A ledger export names units: share it with other owners' details removed unless the bylaws say otherwise.</Why>
    </>
  );
}

function Send({ r, patch, step }: PanelProps<RecordsRequestData>) {
  const [how, setHow] = useState<RecordsRequestData['how']>(r.data.how || 'copies');
  const [on, setOn] = useState(r.data.sentOn || todayIso());
  const held = withheld(r.data);
  const [note, setNote] = useState(r.data.withheldNote || held.map(i => `${i.what}: ${SHARE_LABEL[i.share].toLowerCase()}${i.reason ? ` (${i.reason})` : ''}.`).join(' '));
  if (r.data.sentOn) return <Inner><KV label={r.data.how === 'inspect' ? 'Inspection offered' : 'Copies sent'}>{r.data.sentOn}</KV>{r.data.withheldNote && <KV label="Told about what was held back">{r.data.withheldNote}</KV>}</Inner>;
  return (
    <>
      <Inner>{r.data.items.map(i => <KV key={i.id} label={i.what}>{SHARE_LABEL[i.share]}</KV>)}</Inner>
      {held.length > 0 && <Field label="What the owner is told about anything held back"><textarea aria-label="What the owner is told" rows={3} value={note} onChange={e => setNote(e.target.value)} className={AREA} /></Field>}
      <div className={FORM}>
        <Field label="How" className="w-[240px]"><select value={how} onChange={e => setHow(e.target.value as RecordsRequestData['how'])} className={INPUT}><option value="copies">Copies sent</option><option value="inspect">A time to inspect was offered</option></select></Field>
        <Field label="On" className="w-[170px]"><input type="date" value={on} max={todayIso()} onChange={e => setOn(e.target.value)} className={INPUT} /></Field>
        <Button size="sm" disabled={!!step.waitsOn || !on} onClick={() => patch({ how, sentOn: on, withheldNote: held.length ? note.trim() : '' })}>Record the reply</Button>
      </div>
      {r.dueOn && <p className={NOTE}>Reply due {r.dueOn}.</p>}
      <Why>The documents themselves are sent from Records › Documents or by email; this records what went, when, and what the owner was told.</Why>
    </>
  );
}

function FileIt({ r, patch, close, step }: PanelProps<RecordsRequestData>) {
  if (r.data.filedOn) return <Inner className="text-sm text-ux2-ink">Filed {r.data.filedOn}. The request, what was sent and what was held back stay on this record.</Inner>;
  return (
    <>
      <Inner><KV label="Asked">{r.data.askedOn || '—'}</KV><KV label="Replied">{r.data.sentOn || '—'}</KV><KV label="Shared in full">{r.data.items.filter(i => i.share === 'full').length} of {r.data.items.length}</KV></Inner>
      <div><Button size="sm" disabled={!!step.waitsOn} onClick={() => { const t = todayIso(); patch({ filedOn: t }); close(t); }}>File it and close</Button></div>
      <Why>A filed request is the proof of what an owner asked for and what they were given, if it is ever questioned.</Why>
    </>
  );
}

export const RECORDS_REQUEST_PANELS = { log: Log, choose: Choose, send: Send, file: FileIt };
