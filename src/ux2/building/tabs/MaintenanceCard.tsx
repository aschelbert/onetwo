import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuildingStore, type MaintenanceSchedule } from '@/store/useBuildingStore';
import { useAuthStore } from '@/store/useAuthStore';
import { FREQUENCIES, deferralOf, frequencyMonths, scheduleState } from '@/lib/maintenance';
import { Button, Card, Chip, Inner, SectionLabel, Table, Th, Td, Cell, RowMenu, Why, Field, INPUT } from '../../components';
import { dayLabel } from '../../home/calendar';
import { kindOf, markDone, putOff } from '../maintenanceActions';
import { costOf } from '@/lib/upkeep';
import { startScheduledInspection } from '../../boardroom/upkeep';

const SYSTEMS = ['HVAC', 'Elevator', 'Fire Safety', 'Plumbing', 'Electrical', 'Roof and envelope', 'Grounds', 'Parking', 'Common areas', 'General'];
const FORM = 'flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3';

function TaskForm({ initial, onClose }: { initial?: MaintenanceSchedule; onClose: () => void }) {
  const add = useBuildingStore(s => s.addMaintenanceSchedule);
  const update = useBuildingStore(s => s.updateMaintenanceSchedule);
  const link = useBuildingStore(s => s.linkScheduleToAsset);
  const unlink = useBuildingStore(s => s.unlinkScheduleFromAsset);
  const vendors = useBuildingStore(s => s.vendors);
  const assets = useBuildingStore(s => s.assets);
  const linked = initial ? assets.find(a => a.maintenanceScheduleIds.includes(initial.id))?.id ?? '' : '';
  const [task, setTask] = useState(initial?.task ?? '');
  const [category, setCategory] = useState(initial?.category || 'General');
  const [frequency, setFrequency] = useState(initial?.frequency || 'Annual');
  const [vendor, setVendor] = useState(initial?.vendor ?? '');
  const [nextDue, setNextDue] = useState(initial?.nextDue ?? '');
  const [cost, setCost] = useState(initial?.estimatedCost ?? '');
  const [assetId, setAssetId] = useState(linked);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const systems = SYSTEMS.includes(category) ? SYSTEMS : [category, ...SYSTEMS];
  const freqs = FREQUENCIES.some(f => f.label === frequency) ? FREQUENCIES.map(f => f.label) : [frequency, ...FREQUENCIES.map(f => f.label)];
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!task.trim() || !nextDue) return;
    const fields = { task: task.trim(), category, frequency, vendor: vendor.trim(), nextDue, estimatedCost: cost.trim(), notes: notes.trim() };
    if (initial) {
      update(initial.id, fields);
      if (assetId !== linked) { if (linked) unlink(linked, initial.id); if (assetId) link(assetId, initial.id); }
    } else {
      add({ ...fields, lastCompleted: '', status: 'on-track' });
      // The new schedule's id is assigned by the store; link the one just added.
      const created = useBuildingStore.getState().maintenanceSchedules.slice(-1)[0];
      if (assetId && created) link(assetId, created.id);
    }
    onClose();
  };
  return (
    <form aria-label={initial ? 'Edit maintenance task' : 'Add a maintenance task'} onSubmit={save} className={FORM}>
      <Field label="Task" className="min-w-[220px] flex-1"><input value={task} onChange={e => setTask(e.target.value)} placeholder="Roof inspection" className={INPUT} /></Field>
      <Field label="System" className="w-[170px]"><select value={category} onChange={e => setCategory(e.target.value)} className={INPUT}>{systems.map(c => <option key={c}>{c}</option>)}</select></Field>
      <Field label="How often" className="w-[150px]"><select value={frequency} onChange={e => setFrequency(e.target.value)} className={INPUT}>{freqs.map(f => <option key={f}>{f}</option>)}</select></Field>
      <Field label="Next due" className="w-[150px]"><input type="date" value={nextDue} onChange={e => setNextDue(e.target.value)} className={INPUT} /></Field>
      <Field label="Who does it" className="w-[190px]"><input list="maintenance-vendors" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor or building staff" className={INPUT} /><datalist id="maintenance-vendors">{vendors.filter(v => v.status === 'active').map(v => <option key={v.id} value={v.name} />)}</datalist></Field>
      <Field label="Usual cost" className="w-[120px]"><input value={cost} onChange={e => setCost(e.target.value)} placeholder="$" className={INPUT} /></Field>
      {assets.length > 0 && <Field label="Asset" className="w-[190px]"><select value={assetId} onChange={e => setAssetId(e.target.value)} className={INPUT}><option value="">None</option>{assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>}
      <Field label="What it covers" className="min-w-[220px] flex-1"><input value={notes.split('\n').filter(l => !/^Deferred from /.test(l)).join(' ')} onChange={e => setNotes([...notes.split('\n').filter(l => /^Deferred from /.test(l)), e.target.value].join('\n'))} placeholder="What to check, and any certificate it produces" className={INPUT} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={!task.trim() || !nextDue}>{initial ? 'Save' : 'Add'}</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

function DoneForm({ m, today, onClose }: { m: MaintenanceSchedule; today: string; onClose: () => void }) {
  const me = useAuthStore(s => s.currentUser.name);
  const [doneOn, setDoneOn] = useState(today);
  const [by, setBy] = useState(m.vendor || me);
  const [result, setResult] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [cost, setCost] = useState(costOf(m.estimatedCost) ? String(costOf(m.estimatedCost)) : '');
  const months = frequencyMonths(m.frequency);
  return (
    <form aria-label={`Record ${m.task} as done`} onSubmit={e => { e.preventDefault(); if (!doneOn) return; markDone(m.id, { doneOn, by: by.trim(), result, followUp, cost: costOf(cost) }); onClose(); }} className={FORM}>
      <div className="w-full text-sm font-semibold text-ux2-ink">Record “{m.task}” as done · {months ? `the next one is set ${m.frequency.toLowerCase()} from this date` : 'it does not repeat'}</div>
      <Field label="Done on" className="w-[150px]"><input type="date" value={doneOn} max={today} onChange={e => setDoneOn(e.target.value)} className={INPUT} /></Field>
      <Field label="Who did it" className="w-[200px]"><input value={by} onChange={e => setBy(e.target.value)} className={INPUT} /></Field>
      <Field label="What it cost" className="w-[120px]"><input inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} placeholder="$" className={INPUT} /></Field>
      <Field label="What was found or done" className="min-w-[240px] flex-1"><input value={result} onChange={e => setResult(e.target.value)} placeholder="Passed; certificate issued" className={INPUT} /></Field>
      <Field label="Anything still to do" className="min-w-[220px] flex-1"><input value={followUp} onChange={e => setFollowUp(e.target.value)} placeholder="Leave blank if nothing" className={INPUT} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={!doneOn}>Record</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

function DeferForm({ m, today, onClose }: { m: MaintenanceSchedule; today: string; onClose: () => void }) {
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  return (
    <form aria-label={`Put off ${m.task}`} onSubmit={e => { e.preventDefault(); if (!to || !reason.trim()) return; putOff(m.id, to, reason, today); onClose(); }} className={FORM}>
      <div className="w-full text-sm font-semibold text-ux2-ink">Put off “{m.task}” · it stays marked as deferred, with the date it was first due</div>
      <Field label="New date" className="w-[150px]"><input type="date" value={to} min={today} onChange={e => setTo(e.target.value)} className={INPUT} /></Field>
      <Field label="Why" className="min-w-[260px] flex-1"><input value={reason} onChange={e => setReason(e.target.value)} placeholder="Waiting on the spring budget" className={INPUT} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={!to || !reason.trim()}>Put off</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

type Open = { kind: 'add' } | { kind: 'edit' | 'done' | 'defer'; id: string } | null;

/** The building's recurring maintenance and inspections: add, record as done, put off. */
export default function MaintenanceCard({ today, isBoard }: { today: string; isBoard: boolean }) {
  const navigate = useNavigate();
  const schedules = useBuildingStore(s => s.maintenanceSchedules);
  const assets = useBuildingStore(s => s.assets);
  const remove = useBuildingStore(s => s.removeMaintenanceSchedule);
  const [open, setOpen] = useState<Open>(null);
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => schedules
    .map(m => ({ m, state: scheduleState(m, today), deferral: deferralOf(m), asset: assets.find(a => a.maintenanceScheduleIds.includes(m.id))?.name }))
    .sort((a, b) => (a.state === 'completed' ? 1 : 0) - (b.state === 'completed' ? 1 : 0) || (a.m.nextDue || '9999').localeCompare(b.m.nextDue || '9999')), [schedules, assets, today]);
  const overdue = rows.filter(r => r.state === 'overdue').length;
  const soon = rows.filter(r => r.state === 'due-soon').length;
  const deferredCount = rows.filter(r => r.deferral && r.state !== 'completed').length;
  const visible = showAll ? rows : rows.slice(0, 8);
  const target = open && open.kind !== 'add' ? schedules.find(m => m.id === open.id) : undefined;

  return (
    <Card aria-label="Maintenance schedule" id="maintenance" className="gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2"><SectionLabel>Maintenance schedule · {rows.length}</SectionLabel>{overdue > 0 && <Chip tone="red">{overdue} overdue</Chip>}{soon > 0 && <Chip tone="amber">{soon} due within 30 days</Chip>}{deferredCount > 0 && <Chip tone="plum">{deferredCount} deferred</Chip>}</span>
        <span className="flex items-center gap-3"><button type="button" onClick={() => navigate('/community?tab=log')} className="text-xs font-semibold text-ux2-teal hover:underline">Visit records in the log</button>{isBoard && <Button size="sm" variant="ghost" onClick={() => setOpen(o => (o?.kind === 'add' ? null : { kind: 'add' }))}>Add a task</Button>}</span>
      </div>
      {open?.kind === 'add' && <TaskForm onClose={() => setOpen(null)} />}
      {target && open?.kind === 'edit' && <TaskForm key={target.id} initial={target} onClose={() => setOpen(null)} />}
      {target && open?.kind === 'done' && <DoneForm key={target.id} m={target} today={today} onClose={() => setOpen(null)} />}
      {target && open?.kind === 'defer' && <DeferForm key={target.id} m={target} today={today} onClose={() => setOpen(null)} />}
      {rows.length === 0 ? <Inner className="text-sm text-ux2-muted">Nothing scheduled yet. Add the recurring work the building depends on: the roof and facade inspections, the elevator and fire-system tests, filter changes, gutter cleaning.</Inner> : (
        <Table minWidth={860}>
          <thead><tr><Th>Task</Th><Th>Who</Th><Th>Last done</Th><Th>Next due</Th><Th>Status</Th>{isBoard && <Th><span className="sr-only">Actions</span></Th>}</tr></thead>
          <tbody>
            {visible.map(({ m, state, deferral, asset }) => (
              <tr key={m.id}>
                <Td><Cell title={m.task} note={`${kindOf(m).toLowerCase()} · ${m.category}${m.frequency ? ` · ${m.frequency.toLowerCase()}` : ''}${asset ? ` · ${asset}` : ''}${m.estimatedCost ? ` · ${m.estimatedCost}` : ''}`} /></Td>
                <Td>{m.vendor || <span className="text-ux2-muted">Building staff</span>}</Td>
                <Td>{m.lastCompleted ? dayLabel(m.lastCompleted) : <span className="text-ux2-muted">Not yet</span>}</Td>
                <Td>{m.nextDue ? dayLabel(m.nextDue) : <span className="text-ux2-muted">—</span>}{deferral && state !== 'completed' && <span className="block text-xs text-ux2-muted">first due {dayLabel(deferral.from)} · {deferral.reason}</span>}</Td>
                <Td><Chip tone={state === 'overdue' ? 'red' : state === 'due-soon' ? 'amber' : state === 'completed' ? 'ghost' : deferral ? 'plum' : 'sage'}>{state === 'overdue' ? 'Overdue' : state === 'due-soon' ? 'Due soon' : state === 'completed' ? 'Done' : deferral ? 'Deferred' : 'On schedule'}</Chip></Td>
                {isBoard && <Td><span className="flex items-center justify-end gap-2">{state !== 'completed' && (kindOf(m) === 'Inspection' ? <Button size="sm" variant="ghost" onClick={() => { const { caseId } = startScheduledInspection(m.id, today); if (caseId) navigate(`/boardroom?view=case:${caseId}`); }}>Start the inspection</Button> : <Button size="sm" variant="ghost" onClick={() => setOpen({ kind: 'done', id: m.id })}>Mark done</Button>)}<RowMenu label={`Actions for ${m.task}`} items={[...(state !== 'completed' && kindOf(m) === 'Inspection' ? [{ label: 'Mark done without a checklist', onSelect: () => setOpen({ kind: 'done', id: m.id }) }] : []), ...(state !== 'completed' ? [{ label: 'Put off', onSelect: () => setOpen({ kind: 'defer', id: m.id }) }] : []), { label: 'Edit', onSelect: () => setOpen({ kind: 'edit', id: m.id }) }, { label: 'Remove', danger: true, onSelect: () => { if (window.confirm(`Remove “${m.task}” from the schedule? Past visits stay in the log.`)) remove(m.id); } }]} /></span></Td>}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {rows.length > 8 && <button type="button" className="self-start text-xs font-semibold text-ux2-ink underline" onClick={() => setShowAll(v => !v)}>{showAll ? 'Show fewer' : `${rows.length - 8} more · Show all`}</button>}
      <Why>An inspection is walked in its own action, with a checklist and photos. Marking any other task done sets the next one from how often it repeats and files the visit in the property log: who did it, when, and what they found. A task that is put off keeps the date it was first due, so deferred work stays visible.</Why>
    </Card>
  );
}
