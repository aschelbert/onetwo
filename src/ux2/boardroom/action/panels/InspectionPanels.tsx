import { recordVisit } from '../../../building/maintenanceActions';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuildingStore } from '@/store/useBuildingStore';
import { usePropertyLogStore } from '@/store/usePropertyLogStore';
import { useAuthStore } from '@/store/useAuthStore';
import { uploadPhotos } from '@/lib/services/photos';
import { CHECKLISTS, findings, pointsFor, watched, type InspectionData, type InspectionPoint, type PointResult } from '@/lib/actions/inspection';
import { Button, Chip, Inner, Why, Field, INPUT, PhotoPicker, PhotoStrip } from '../../../components';
import { todayIso } from '../../../runbook/adapters';
import { AREA, FORM } from '../ActionShell';
import type { PanelProps } from '../RecordAction';
import { startAction } from '../../recordActions';

function Who({ r, patch }: PanelProps<InspectionData>) {
  const vendors = useBuildingStore(s => s.vendors).filter(v => v.status === 'active');
  const [by, setBy] = useState(r.data.by);
  const [third, setThird] = useState(r.data.thirdParty);
  const [template, setTemplate] = useState(r.data.template);
  const untouched = r.data.points.every(p => !p.result);
  return (
    <>
      <div className={FORM}>
        <Field label="Checklist" className="w-[230px]"><select value={template} disabled={!untouched} onChange={e => setTemplate(e.target.value)} className={INPUT}>{Object.entries(CHECKLISTS).map(([id, c]) => <option key={id} value={id}>{c.label}</option>)}</select></Field>
        <Field label="Who inspects" className="min-w-[220px] flex-1"><input list="inspection-by" value={by} onChange={e => setBy(e.target.value)} placeholder="Staff, a board member, or a vendor" className={INPUT} /><datalist id="inspection-by">{vendors.map(v => <option key={v.id} value={v.name} />)}</datalist></Field>
        <label className="flex items-center gap-2 pb-2.5 text-xs font-semibold text-ux2-ink"><input type="checkbox" checked={third} onChange={e => setThird(e.target.checked)} />Needs a licensed third party to certify it</label>
        <Button size="sm" disabled={!by.trim()} onClick={() => patch({ by: by.trim(), thirdParty: third, ...(template !== r.data.template && untouched ? { template, points: pointsFor(template) } : {}) })}>Save</Button>
      </div>
      <Why>Decide first whether in-house staff can do it, whether it needs special equipment or training, and whether a third party has to certify it (a fire alarm test, an elevator, an extinguisher tag).</Why>
    </>
  );
}

function Book({ r, patch }: PanelProps<InspectionData>) {
  const navigate = useNavigate();
  const [on, setOn] = useState(r.data.bookedFor || todayIso());
  return (
    <>
      <div className={FORM}>
        <Field label="Inspection date" className="w-[180px]"><input type="date" value={on} onChange={e => setOn(e.target.value)} className={INPUT} /></Field>
        <Button size="sm" disabled={!on} onClick={() => patch({ bookedFor: on })}>Set the date</Button>
        <Button size="sm" variant="ghost" onClick={() => patch({ residentsToldOn: todayIso(), residentsNotAffected: false })}>Residents were told today</Button>
        <Button size="sm" variant="ghost" onClick={() => patch({ residentsNotAffected: true, residentsToldOn: '' })}>Residents are not affected</Button>
        <Button size="sm" variant="ghost" onClick={() => navigate('/community?tab=notices')}>Write a notice</Button>
      </div>
      <Why>Tell residents when the inspection closes something, needs access to units, or sounds an alarm.</Why>
    </>
  );
}

const RESULT: [PointResult, string, 'sage' | 'amber' | 'red'][] = [['fine', 'Fine', 'sage'], ['watch', 'Watch', 'amber'], ['work', 'Needs work', 'red']];

function Walk({ r, patch }: PanelProps<InspectionData>) {
  const me = useAuthStore(s => s.currentUser.name);
  const [extra, setExtra] = useState('');
  const set = (id: string, c: Partial<InspectionPoint>) => patch({ points: r.data.points.map(p => (p.id === id ? { ...p, ...c } : p)) });
  const ordered = [...r.data.points].sort((a, b) => Number(!!b.watchedBefore) - Number(!!a.watchedBefore));
  return (
    <>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {ordered.map(p => (
          <li key={p.id} data-point={p.id} className="flex flex-col gap-2 rounded-[14px] border border-ux2-line bg-white px-3.5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ux2-ink">{p.label}{p.watchedBefore && <span className="block text-xs font-normal text-ux2-amber">Watched since last time: {p.watchedBefore}</span>}</span>
              <span className="flex flex-wrap gap-1.5" role="group" aria-label={`Result for ${p.label}`}>{RESULT.map(([v, label, tone]) => <button key={v} type="button" aria-pressed={p.result === v} onClick={() => set(p.id, { result: p.result === v ? '' : v })} className="rounded-full"><Chip tone={p.result === v ? tone : 'ghost'}>{label}</Chip></button>)}</span>
            </div>
            {p.result && p.result !== 'fine' && (
              <div className="flex flex-wrap items-center gap-2">
                <input aria-label={`Note for ${p.label}`} defaultValue={p.note} onBlur={e => { if (e.target.value !== p.note) set(p.id, { note: e.target.value }); }} placeholder="What was seen, and where" className={`${INPUT} min-w-[220px] flex-1`} />
                <PhotoPicker onPick={files => { void uploadPhotos(`inspections/${r.id}`, files, me).then(up => { if (up.photos.length) set(p.id, { photos: [...p.photos, ...up.photos] }); }); }} />
              </div>
            )}
            <PhotoStrip photos={p.photos} />
          </li>
        ))}
      </ul>
      <form className={FORM} aria-label="Add a point" onSubmit={e => { e.preventDefault(); if (!extra.trim()) return; patch({ points: [...r.data.points, { id: `x${r.data.points.length}`, label: extra.trim(), result: '', note: '', photos: [], handling: '', handlingNote: '' }] }); setExtra(''); }}>
        <Field label="Anything else seen" className="min-w-[240px] flex-1"><input value={extra} onChange={e => setExtra(e.target.value)} className={INPUT} /></Field>
        <Button type="submit" size="sm" variant="ghost" disabled={!extra.trim()}>Add a point</Button>
      </form>
      <Why>Mark every point. "Watch" carries the point to the next inspection of this kind, with its note, so the same spot is looked at again. Works on a phone, on the roof.</Why>
    </>
  );
}

function Findings({ r, patch }: PanelProps<InspectionData>) {
  const navigate = useNavigate();
  const work = findings(r.data);
  const set = (id: string, c: Partial<InspectionPoint>) => patch({ points: r.data.points.map(p => (p.id === id ? { ...p, ...c } : p)) });
  const openRepair = (p: InspectionPoint) => {
    const { caseId } = startAction('repair', p.label, { what: p.note || p.label, where: '', from: `${r.title}, ${r.data.bookedFor || r.openedOn}`, photos: p.photos, foundBy: r.data.by });
    set(p.id, { handling: 'repair', handlingNote: 'Repair opened' });
    if (caseId) navigate(`/boardroom?view=case:${caseId}`);
  };
  if (work.length === 0) return <Inner className="text-sm text-ux2-muted">Nothing on the checklist needs work.{watched(r.data).length ? ` ${watched(r.data).length} point${watched(r.data).length === 1 ? ' is' : 's are'} being watched and will show first next time.` : ''}</Inner>;
  return (
    <>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {work.map(p => (
          <li key={p.id} className="flex flex-col gap-2 rounded-[14px] border border-ux2-line bg-white px-3.5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm text-ux2-ink"><b className="font-semibold">{p.label}</b>{p.note ? ` · ${p.note}` : ''}</span>{p.handling ? <Chip tone={p.handling === 'defer' ? 'plum' : 'sage'}>{p.handling === 'repair' ? 'Repair opened' : p.handling === 'defer' ? 'Put off' : 'In a capital project'}</Chip> : <Chip tone="red">To decide</Chip>}</div>
            {!p.handling && (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => openRepair(p)}>Open a repair</Button>
                <Button size="sm" variant="ghost" onClick={() => { const why = window.prompt('Why is it being put off? This shows as deferred maintenance.'); if (why?.trim()) set(p.id, { handling: 'defer', handlingNote: why.trim() }); }}>Put it off, with a reason</Button>
                <Button size="sm" variant="ghost" onClick={() => set(p.id, { handling: 'project', handlingNote: 'To be done in a capital project' })}>Fold into a capital project</Button>
              </div>
            )}
            {p.handling === 'defer' && <span className="text-xs text-ux2-muted">Reason: {p.handlingNote}</span>}
          </li>
        ))}
      </ul>
      <Why>Nothing found is left as a note. Each one is repaired, deliberately put off, or done as part of a larger project.</Why>
    </>
  );
}

function File({ r, patch, close, step }: PanelProps<InspectionData>) {
  const [rec, setRec] = useState(r.data.recommendations);
  const d = r.data;
  if (d.filedOn) return <Inner className="text-sm text-ux2-ink">Filed {d.filedOn} in the property log{d.scheduleId ? '; the schedule has its next date' : ''}.</Inner>;
  const file = () => {
    const today = todayIso();
    usePropertyLogStore.getState().addLog({
      type: 'inspection', title: r.title, date: d.bookedFor || today, conductedBy: d.by, location: CHECKLISTS[d.template]?.label ?? '',
      status: findings(d).length ? 'open' : watched(d).length ? 'monitoring' : 'resolved',
      findings: d.points.filter(p => p.result).map(p => ({ area: p.label, condition: p.result === 'fine' ? 'good' : p.result === 'watch' ? 'fair' : 'poor', notes: p.note, severity: p.result === 'work' ? 'high' : p.result === 'watch' ? 'low' : 'none' })),
      actionItems: findings(d).map(p => ({ description: `${p.label}${p.note ? `: ${p.note}` : ''}`, assignedTo: '', dueDate: '', status: p.handling === 'repair' ? 'in_progress' : 'open' })),
      notes: [rec.trim(), ...findings(d).filter(p => p.handling === 'defer').map(p => `Put off: ${p.label} (${p.handlingNote})`)].filter(Boolean).join('\n'),
      attachments: d.points.flatMap(p => p.photos),
    });
    if (d.scheduleId) recordVisit(d.scheduleId, { doneOn: d.bookedFor || today, by: d.by, inspection: true });
    patch({ recommendations: rec.trim(), filedOn: today });
    close(today);
  };
  return (
    <>
      <Field label="Recommendations"><textarea aria-label="Recommendations" rows={3} value={rec} onChange={e => setRec(e.target.value)} placeholder="What the inspector recommends, beyond the findings" className={AREA} /></Field>
      <div><Button size="sm" disabled={!!step.waitsOn} onClick={file}>File the report</Button></div>
      <Why>The report records who inspected, when, what was looked at, the results and the recommendations, with every photo. It goes into the property log{d.scheduleId ? ', and the maintenance schedule rolls to the next date' : ''}.</Why>
    </>
  );
}

export const INSPECTION_PANELS = { who: Who, book: Book, walk: Walk, findings: Findings, file: File };
