import { useState } from 'react';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useAuthStore } from '@/store/useAuthStore';
import { uploadPhotos } from '@/lib/services/photos';
import { answered, noticeText, type FireNoticeData } from '@/lib/actions/fireNotice';
import { Button, Chip, Inner, Why, Field, INPUT, PhotoPicker, PhotoStrip } from '../../../components';
import { todayIso } from '../../../runbook/adapters';
import { AREA, FORM, NOTE } from '../ActionShell';
import type { PanelProps } from '../RecordAction';

const YESNO = ({ label, value, onChange }: { label: string; value: '' | 'yes' | 'no'; onChange: (v: 'yes' | 'no') => void }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ux2-ink"><span>{label}</span><span className="flex gap-2">{(['yes', 'no'] as const).map(v => <Button key={v} size="sm" variant={value === v ? 'primary' : 'ghost'} aria-pressed={value === v} onClick={() => onChange(v)}>{v === 'yes' ? 'Yes' : 'No'}</Button>)}</span></div>
);

function useBuilding() {
  const name = useBuildingStore(s => s.name);
  const a = useBuildingStore(s => s.address);
  return { name, address: [a.street, a.city, a.state, a.zip].filter(Boolean).join(', ') };
}

function Questions({ r, patch }: PanelProps<FireNoticeData>) {
  const [d, setD] = useState(r.data);
  const set = (c: Partial<FireNoticeData>) => setD(x => ({ ...x, ...c }));
  return (
    <>
      <Field label="1 · Where are the pull stations?"><input value={d.pullStations} onChange={e => set({ pullStations: e.target.value })} placeholder="There is one by each stairwell door and one in the lobby." className={INPUT} /></Field>
      <Inner className="flex flex-col gap-2">
        <YESNO label="2 · Is the building alarm connected to the smoke detectors inside units?" value={d.linkedToUnits} onChange={v => set({ linkedToUnits: v })} />
        <YESNO label="3 · Is the alarm monitored, so it alerts the Fire and EMS Department by itself?" value={d.monitored} onChange={v => set({ monitored: v })} />
      </Inner>
      <Field label="4 · What should residents do when it sounds?"><input value={d.evacuation} onChange={e => set({ evacuation: e.target.value })} className={INPUT} /></Field>
      <div className={FORM}>
        <Field label="Who to call with questions" className="min-w-[240px] flex-1"><input value={d.contact} onChange={e => set({ contact: e.target.value })} placeholder="Name and phone" className={INPUT} /></Field>
        <Button size="sm" disabled={!answered(d)} onClick={() => patch({ pullStations: d.pullStations.trim(), linkedToUnits: d.linkedToUnits, monitored: d.monitored, evacuation: d.evacuation.trim(), contact: d.contact.trim(), reviewedOn: '', reviewedBy: '' })}>Save the answers</Button>
      </div>
      <Why>The alarm vendor's last test report answers questions 2 and 3. Changing an answer later asks for the wording to be confirmed again.</Why>
    </>
  );
}

function printNotice(lines: string[]) {
  const w = window.open('', '_blank', 'width=720,height=900');
  if (!w) return;
  const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
  w.document.write(`<title>Fire alarm instructions</title><body style="font:16px/1.5 system-ui;max-width:640px;margin:40px auto;padding:0 20px"><p style="font-size:13px">${esc(lines[0])}</p><h1 style="font-size:28px">${esc(lines[1])}</h1>${lines.slice(2).map(l => `<p>${esc(l)}</p>`).join('')}</body>`);
  w.document.close(); w.focus(); w.print();
}

function Review({ r, patch, step }: PanelProps<FireNoticeData>) {
  const b = useBuilding();
  const me = useAuthStore(s => s.currentUser.name);
  const [extra, setExtra] = useState(r.data.extra);
  if (!answered(r.data)) return <Inner className="text-sm text-ux2-muted">The notice is written from the four answers in step 1.</Inner>;
  const lines = noticeText({ ...r.data, extra }, b);
  return (
    <>
      <Inner className="flex flex-col gap-2 bg-white" aria-label="The notice"><span className="text-xs text-ux2-muted">{lines[0]}</span><b className="text-lg font-semibold text-ux2-ink">{lines[1]}</b>{lines.slice(2).map((l, i) => <p key={i} className="m-0 text-sm text-ux2-ink">{l}</p>)}</Inner>
      <Field label="Anything to add (the required points above stay as they are)"><textarea aria-label="Anything to add" rows={2} value={extra} onChange={e => setExtra(e.target.value)} className={AREA} /></Field>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!!step.waitsOn} onClick={() => patch({ extra: extra.trim(), reviewedOn: todayIso(), reviewedBy: me })}>{r.data.reviewedOn ? 'Confirm the wording again' : 'Looks right'}</Button>
        <Button size="sm" variant="ghost" onClick={() => printNotice(lines)}>Print the notice</Button>
      </div>
      <Why>Written from step 1's answers: how to sound the alarm, whether it is connected to unit detectors, whether it calls the fire department, and to call 911.</Why>
    </>
  );
}

function Deliver({ r, patch, step }: PanelProps<FireNoticeData>) {
  const b = useBuilding();
  const all = useFinancialStore(s => s.units);
  const units = r.data.scope === 'unit' && r.unit ? all.filter(u => u.number === r.unit) : all;
  const [method, setMethod] = useState<FireNoticeData['method']>(r.data.method || 'mail');
  const [on, setOn] = useState(r.data.deliveredOn || todayIso());
  const got = new Set(r.data.delivered);
  const toggle = (n: string) => patch({ delivered: got.has(n) ? r.data.delivered.filter(x => x !== n) : [...r.data.delivered, n] });
  const everyone = units.length > 0 && units.every(u => got.has(u.number));
  if (r.data.deliveredOn) return <Inner className="text-sm text-ux2-ink">Given to {r.data.delivered.length} unit{r.data.delivered.length === 1 ? '' : 's'} {r.data.method === 'mail' ? 'by first-class mail' : 'by hand'} on {r.data.deliveredOn}.</Inner>;
  return (
    <>
      <div className={FORM}>
        <Field label="How" className="w-[200px]"><select value={method} onChange={e => setMethod(e.target.value as FireNoticeData['method'])} className={INPUT}><option value="mail">First-class mail</option><option value="hand">By hand</option></select></Field>
        <Button size="sm" variant="ghost" onClick={() => printNotice(noticeText(r.data, b))}>Print {units.length} cop{units.length === 1 ? 'y' : 'ies'}</Button>
        <Button size="sm" variant="ghost" onClick={() => patch({ delivered: units.map(u => u.number) })}>Mark every unit</Button>
      </div>
      <div className="flex flex-wrap gap-1.5" aria-label="Units delivered">{units.map(u => <button key={u.number} type="button" aria-pressed={got.has(u.number)} onClick={() => toggle(u.number)} className={`min-h-[32px] rounded-full border px-3 text-xs font-semibold ${got.has(u.number) ? 'border-ux2-navy bg-ux2-navy text-white' : 'border-ux2-line-strong bg-white text-ux2-ink'}`}>{u.number}</button>)}</div>
      <div className={FORM}>
        <Field label={method === 'mail' ? 'Mailed on' : 'Handed over by'} className="w-[180px]"><input type="date" value={on} max={todayIso()} onChange={e => setOn(e.target.value)} className={INPUT} /></Field>
        <Button size="sm" disabled={!!step.waitsOn || !everyone || !on} onClick={() => patch({ method, deliveredOn: on })}>{everyone ? 'Record the delivery' : `${units.length - units.filter(u => got.has(u.number)).length} units left`}</Button>
      </div>
      <p className={NOTE}>Email alone does not count: the law asks for delivery by hand or first-class mail. Where a unit is rented, the tenant gets a copy too.</p>
    </>
  );
}

function Post({ r, patch, step }: PanelProps<FireNoticeData>) {
  const me = useAuthStore(s => s.currentUser.name);
  const [where, setWhere] = useState('');
  if (r.data.scope === 'unit') return <Inner className="text-sm text-ux2-muted">This copy is for one unit. The notice already posted in the common areas stands.</Inner>;
  const add = () => { if (where.trim()) { patch({ places: [...r.data.places, { where: where.trim(), photos: [] }] }); setWhere(''); } };
  return (
    <>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {r.data.places.map((pl, i) => (
          <li key={i}><Inner className="flex flex-col gap-2"><div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm font-semibold text-ux2-ink">{pl.where}</b><span className="flex items-center gap-2"><Chip tone={pl.photos.length ? 'sage' : 'ghost'}>{pl.photos.length ? `${pl.photos.length} photo${pl.photos.length === 1 ? '' : 's'}` : 'No photo yet'}</Chip>{!r.data.postedOn && <Button size="sm" variant="ghost" onClick={() => patch({ places: r.data.places.filter((_, j) => j !== i) })}>Remove</Button>}</span></div><PhotoStrip photos={pl.photos} />{!r.data.postedOn && <div><PhotoPicker label="Add a photo of it posted" onPick={files => { void uploadPhotos(`fire-notice/${r.id}`, files, me).then(up => { if (up.photos.length) patch({ places: r.data.places.map((x, j) => (j === i ? { ...x, photos: [...x.photos, ...up.photos] } : x)) }); }); }} /></div>}</Inner></li>
        ))}
      </ul>
      {!r.data.postedOn && (
        <div className={FORM}>
          <Field label="Where it is posted" className="min-w-[240px] flex-1"><input value={where} onChange={e => setWhere(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="Lobby, by the mailboxes" className={INPUT} /></Field>
          <Button size="sm" variant="ghost" disabled={!where.trim()} onClick={add}>Add the place</Button>
          <Button size="sm" disabled={!!step.waitsOn || !r.data.places.length} onClick={() => patch({ postedOn: todayIso() })}>It is posted: finish</Button>
        </div>
      )}
      <Why>Post it in conspicuous places in the common areas. Finishing fills in "Fire alarm instructions to residents" under Building › Obligations, with the delivery record, and closes this action.</Why>
    </>
  );
}

export const FIRE_NOTICE_PANELS = { questions: Questions, review: Review, deliver: Deliver, post: Post };
