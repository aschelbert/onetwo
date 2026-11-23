import { Fragment, useRef, useState } from 'react';
import { useBuildingRecordsStore } from '@/store/useBuildingRecordsStore';
import { canStoreFiles, downloadDocumentFile, uploadDocumentFile } from '@/lib/services/documentFiles';
import { generateLocalId } from '@/lib/generateId';
import { recordStatus, type BuildingRecord, type RecordKind, type RecordStatus } from '@/lib/buildingRecords';
import { Button, Card, Chip, Inner, SectionLabel, Field, INPUT, Why } from '../../components';
import { toStateCode } from '@/lib/usStates';
import { recordRows, recordsSummary, type BuildingSnapshot, type RecordRow } from '../metrics';

const GROUPS: RecordKind['group'][] = ['Occupancy and licences', 'Equipment certificates', 'Fire and life safety', 'Heating', 'Energy'];
const fullDay = (iso: string) => { const d = new Date(iso + 'T00:00'); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };

function statusChip(kind: RecordKind, st: RecordStatus, applies: RecordRow['applies']): { tone: 'red' | 'amber' | 'sage' | 'ghost'; label: string } {
  const verb = kind.cycle.type === 'expires' ? ['Expired', 'Expires'] : ['Was due', 'Due'];
  if (applies === 'check' && !st.current) return { tone: 'ghost', label: 'Check if it applies' };
  if (st.state === 'missing') return { tone: 'amber', label: 'Not on file' };
  if (st.state === 'lapsed') return { tone: 'red', label: `${verb[0]} ${st.due ? fullDay(st.due) : ''}` };
  if (st.state === 'due-soon') return { tone: 'amber', label: `${verb[1]} ${st.due ? fullDay(st.due) : ''}` };
  return { tone: 'sage', label: st.due ? `${kind.cycle.type === 'expires' ? 'Current to' : 'Next due'} ${fullDay(st.due)}` : 'On file' };
}

function RecordForm({ kind, custom, onClose }: { kind?: RecordKind; custom?: boolean; onClose: () => void }) {
  const add = useBuildingRecordsStore(s => s.addRecord);
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [doneOn, setDoneOn] = useState(today);
  const [expiresOn, setExpiresOn] = useState('');
  const [posted, setPosted] = useState(false);
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const hasExpiry = custom || kind?.cycle.type === 'expires';
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (custom && !name.trim()) return;
    setBusy(true);
    let stored: BuildingRecord['file'];
    if (file && canStoreFiles()) { const path = await uploadDocumentFile(generateLocalId('rec'), file); if (path) stored = { name: file.name, path }; }
    add({ kind: kind?.id ?? 'custom', name: custom ? name.trim() : kind!.label, number: number.trim(), doneOn, expiresOn: hasExpiry ? expiresOn : '', posted, notes: notes.trim(), file: stored });
    setBusy(false);
    onClose();
  };
  return (
    <form aria-label={custom ? 'Add another record' : `Record ${kind!.label}`} onSubmit={save} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      {custom && <Field label="What it is" className="min-w-[220px] flex-1"><input value={name} onChange={e => setName(e.target.value)} placeholder="Backflow preventer test" className={INPUT} /></Field>}
      <Field label={kind?.numberLabel ?? 'Number or reference'} className="w-[200px]"><input value={number} onChange={e => setNumber(e.target.value)} className={INPUT} /></Field>
      <Field label={kind?.dateLabel ?? 'Date'} className="w-[160px]"><input type="date" value={doneOn} max={today} onChange={e => setDoneOn(e.target.value)} className={INPUT} /></Field>
      {hasExpiry && <Field label="Expires" className="w-[160px]"><input type="date" value={expiresOn} onChange={e => setExpiresOn(e.target.value)} className={INPUT} /></Field>}
      <Field label="The document" className="w-[220px]"><input ref={picker} type="file" accept=".pdf,image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} className="text-xs" /></Field>
      <Field label="Notes" className="min-w-[200px] flex-1"><input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Who did it, anything to follow up" className={INPUT} /></Field>
      {kind?.postedWhere && <label className="flex items-center gap-2 pb-2 text-xs font-semibold text-ux2-ink"><input type="checkbox" checked={posted} onChange={e => setPosted(e.target.checked)} />Posted · {kind.postedWhere.toLowerCase()}</label>}
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={busy || !doneOn || (custom && !name.trim())}>{busy ? 'Saving…' : 'Save'}</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

function History({ entries, isBoard }: { entries: BuildingRecord[]; isBoard: boolean }) {
  const remove = useBuildingRecordsStore(s => s.removeRecord);
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {entries.map((r, i) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-ux2-line bg-white px-3 py-1.5 text-xs text-ux2-ink">
          <span>{i === 0 ? <b className="font-semibold">Current</b> : 'Earlier'} · {r.doneOn ? fullDay(r.doneOn) : 'no date'}{r.number ? ` · ${r.number}` : ''}{r.expiresOn ? ` · expires ${fullDay(r.expiresOn)}` : ''}{r.notes ? ` · ${r.notes}` : ''}</span>
          <span className="flex items-center gap-3">
            {r.file && <button type="button" onClick={() => { void downloadDocumentFile(r.file!.path, r.file!.name); }} className="font-semibold text-ux2-teal hover:underline">Open</button>}
            {isBoard && <button type="button" aria-label={`Remove the ${r.doneOn || ''} entry`} onClick={() => { if (window.confirm('Remove this entry?')) remove(r.id); }} className="font-semibold text-ux2-red-ink hover:underline">Remove</button>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Building › Obligations › Licences and certificates. */
export default function RecordsSection({ snap, isBoard, onEditDetails }: { snap: BuildingSnapshot; isBoard: boolean; onEditDetails: () => void }) {
  const rows = recordRows(snap);
  const sum = recordsSummary(rows);
  const update = useBuildingRecordsStore(s => s.updateRecord);
  const saveError = useBuildingRecordsStore(s => s.saveError);
  const custom = (snap.records ?? []).filter(r => r.kind === 'custom');
  const customNames = Array.from(new Set(custom.map(r => r.name)));
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const sqft = snap.facts?.grossSqft;

  return (
    <div className="flex flex-col gap-3">
      <Card aria-label="Licences and certificates" className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex flex-wrap items-center gap-2"><SectionLabel>Licences, certificates and safety records</SectionLabel><Chip tone={sum.gaps.length ? 'amber' : 'sage'}>{sum.inOrder} of {sum.expected} in order</Chip>{sum.toCheck.length > 0 && <Chip tone="ghost">{sum.toCheck.length} to check</Chip>}</span>
          {isBoard && <Button size="sm" variant="ghost" onClick={() => setAdding(adding === 'custom' ? null : 'custom')}>Add another record</Button>}
        </div>
        <p className="m-0 text-[13px] text-ux2-muted">What the building has to hold, renew or post. Which ones apply follows the building's state ({snap.address.state || 'not set'}), its gross floor area ({sqft ? `${sqft.toLocaleString()} sq ft` : <button type="button" onClick={onEditDetails} className="font-semibold text-ux2-teal hover:underline">not entered · add it</button>}) and the equipment listed under Overview.</p>
        {saveError && <div role="alert" className="rounded-[10px] bg-ux2-red-tint px-3 py-2 text-xs text-ux2-ink">{saveError}</div>}
        {adding === 'custom' && <RecordForm custom onClose={() => setAdding(null)} />}
        {GROUPS.map(group => {
          const list = rows.filter(r => r.kind.group === group);
          if (!list.length) return null;
          return (
            <div key={group} className="flex flex-col gap-1.5">
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ux2-muted">{group}</div>
              {list.map(r => {
                const chip = statusChip(r.kind, r.status, r.applies);
                const cur = r.status.current;
                const expanded = open === r.kind.id;
                return (
                  <Fragment key={r.kind.id}>
                    <Inner data-record={r.kind.id} className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : r.kind.id)} className="min-w-0 flex-1 text-left">
                          <span className="block text-sm font-semibold text-ux2-ink">{r.kind.label}</span>
                          <span className="block text-xs text-ux2-muted">{cur ? `${r.kind.dateLabel} ${cur.doneOn ? fullDay(cur.doneOn) : '—'}${cur.number ? ` · ${cur.number}` : ''}` : r.applies === 'check' ? r.kind.appliesNote : 'Nothing recorded yet'}{r.kind.cite ? ` · ${r.kind.cite}` : ''}</span>
                        </button>
                        <span className="flex flex-wrap items-center gap-2">
                          {r.kind.postedWhere && cur && (isBoard
                            ? <button type="button" role="switch" aria-checked={cur.posted} aria-label={`${r.kind.label} posted`} onClick={() => update(cur.id, { posted: !cur.posted })} className="rounded-full"><Chip tone={cur.posted ? 'sage' : 'amber'}>{cur.posted ? 'Posted' : 'Not posted'}</Chip></button>
                            : <Chip tone={cur.posted ? 'sage' : 'amber'}>{cur.posted ? 'Posted' : 'Not posted'}</Chip>)}
                          <Chip tone={chip.tone}>{chip.label}</Chip>
                          {isBoard && <Button size="sm" variant="ghost" onClick={() => { setAdding(adding === r.kind.id ? null : r.kind.id); setOpen(r.kind.id); }}>{cur ? (r.kind.cycle.type === 'once' ? 'Replace' : 'Record the next one') : 'Record it'}</Button>}
                        </span>
                      </div>
                      {expanded && (
                        <div className="flex flex-col gap-2 border-t border-ux2-line pt-2 text-[13px] text-ux2-ink">
                          <p className="m-0">{r.kind.what}</p>
                          {r.kind.postedWhere && <p className="m-0 text-xs text-ux2-muted">Where it is posted: {r.kind.postedWhere.toLowerCase()}.</p>}
                          {r.kind.appliesNote && <p className="m-0 text-xs text-ux2-muted">{r.kind.appliesNote}</p>}
                          {r.status.history.length > 0 && <History entries={r.status.history} isBoard={isBoard} />}
                        </div>
                      )}
                    </Inner>
                    {adding === r.kind.id && <RecordForm kind={r.kind} onClose={() => setAdding(null)} />}
                  </Fragment>
                );
              })}
            </div>
          );
        })}
        {customNames.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ux2-muted">Other records</div>
            {customNames.map(name => {
              const entries = custom.filter(r => r.name === name);
              const st = recordStatus({ cycle: { type: 'expires' } }, entries, snap.today);
              return (
                <Inner key={name} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold text-ux2-ink">{name}</span><Chip tone={st.state === 'lapsed' ? 'red' : st.state === 'due-soon' ? 'amber' : 'sage'}>{st.due ? `${st.state === 'lapsed' ? 'Expired' : 'Expires'} ${fullDay(st.due)}` : 'On file'}</Chip></div>
                  <History entries={st.history} isBoard={isBoard} />
                </Inner>
              );
            })}
          </div>
        )}
        <Why>Anything missing, expiring within 60 days, overdue or not posted shows under Needs you on Building › Overview. Recording the next one keeps the earlier entries as history. These are reminders of what to keep on file, drawn from the District's property-management curriculum; confirm each requirement with the agency that issues it.</Why>
      </Card>
      {toStateCode(snap.address.state) === 'DC' && <Card aria-label="Seasonal duties" className="gap-2">
        <SectionLabel>Dates the housing code sets</SectionLabel>
        <Inner className="flex flex-col gap-1.5 text-[13px] text-ux2-ink">
          {[
            ['Oct 15 to May 15', 'Heat is on. Equipment must be able to hold 70°F; where residents cannot set their own temperature, at least 68°F from 6:30 am to 11 pm and 65°F overnight.', '14 DCMR §§ 501.2, 501.4'],
            ['Mar 1 to Sep 1', 'The window for the yearly inspection of every furnace, boiler and central heating system.', '14 DCMR § 501.10'],
            ['All year', 'Hot water at the fixtures at no less than 120°F, continuously where residents do not control the heater.', '14 DCMR §§ 606.1, 606.2'],
            ['By Apr 1', 'Energy and water benchmarking for the previous calendar year, for buildings it covers.', 'Clean and Affordable Energy Act of 2008'],
          ].map(([when, what, cite]) => <div key={when} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5"><b className="w-[120px] shrink-0 font-semibold">{when}</b><span className="min-w-0 flex-1">{what}</span><span className="text-xs text-ux2-muted">{cite}</span></div>)}
        </Inner>
        <Why>These apply to a building that supplies heat and hot water to its residents, and to rented units in particular. They are shown for a District of Columbia building.</Why>
      </Card>}
    </div>
  );
}
