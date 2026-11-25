import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { fmt } from '@/lib/formatters';
import { stageOf } from '@/lib/actions';
import { CHECKLISTS, findings, watched, type InspectionData } from '@/lib/actions/inspection';
import type { RepairData } from '@/lib/actions/repair';
import { INSPECTION_OPENS_DAYS, assetStory, upkeepFrom, yearGrid, yearSummary, type Fix, type MarkState, type Task } from '@/lib/upkeep';
import { Button, Card, Chip, Inner, KV, Table, Th, Td, Tile, TileRow, Why, Field, INPUT } from '../../components';
import { dayLabel } from '../../home/calendar';
import { recordCase, startAction, startInspection } from '../../boardroom/recordActions';
import { ensureReview } from '../../boardroom/reserves';
import { nextStudy } from '../../boardroom/reserveStudy';
import { startConditionSurvey, startStormCheck } from '../../boardroom/upkeep';
import { UPKEEP_KIND } from '../maintenanceActions';
import MaintenanceCard from './MaintenanceCard';
import ComfortCard from './ComfortCard';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MARK: Record<MarkState, string> = {
  done: 'bg-ux2-teal text-white',
  late: 'bg-ux2-amber text-white',
  overdue: 'bg-ux2-red text-white',
  'put-off': 'bg-ux2-plum text-white',
  'to-come': 'border border-ux2-line-strong bg-white text-ux2-ink',
};
const MARK_WORD: Record<MarkState, string> = { done: 'Done', late: 'Done late', overdue: 'Overdue', 'put-off': 'Put off', 'to-come': 'To come' };

/** What the repairs on record cost, and which asset each was for. */
function useFixes(): Fix[] {
  const records = useActionRecordsStore(s => s.records);
  const workOrders = useFinancialStore(s => s.workOrders);
  return useMemo(() => records.filter(r => r.kind === 'repair').map(r => {
    const d = r.data as unknown as RepairData;
    const wo = workOrders.find(w => w.id === d.workOrderId);
    return { id: r.id, what: d.what || r.title, assetId: d.assetId, on: d.doneOn || r.openedOn, cost: wo?.amount ?? d.estimate ?? 0, open: !r.closedOn };
  }), [records, workOrders]);
}

/**
 * Building › Upkeep: the maintenance schedule drawn across the year, how much
 * of the work was planned against how much was fixing, the inspections on
 * record, and one asset's story. Inspections are walked in their own action;
 * this is where the schedule is kept and the record is read.
 */
export default function UpkeepTab({ today, isBoard }: { today: string; isBoard: boolean }) {
  const navigate = useNavigate();
  const schedules = useBuildingStore(s => s.maintenanceSchedules);
  const assets = useBuildingStore(s => s.assets);
  const records = useActionRecordsStore(s => s.records);
  const cases = useIssuesStore(s => s.cases);
  const reserveItems = useFinancialStore(s => s.reserveItems);
  const fixes = useFixes();
  const year = Number(today.slice(0, 4));
  const visits = upkeepFrom(records.find(r => r.kind === UPKEEP_KIND)?.data).visits;
  const tasks: Task[] = schedules;
  const sum = yearSummary(tasks, visits, fixes, year, today);
  const grid = yearGrid(tasks, visits, year, today);
  const inspections = records.filter(r => r.kind === 'inspection').sort((a, b) => (b.closedOn || '9999').localeCompare(a.closedOn || '9999') || b.openedOn.localeCompare(a.openedOn));
  const data = (r: (typeof inspections)[number]) => r.data as unknown as InspectionData;
  const undecided = inspections.reduce((t, r) => t + findings(data(r)).filter(p => !p.handling).length, 0);
  const putOffFindings = inspections.reduce((t, r) => t + findings(data(r)).filter(p => p.handling === 'defer').length, 0);
  const openRepairs = fixes.filter(f => f.open).length;
  const open = (id: string | null) => { if (id) navigate(`/boardroom?view=case:${id}`); };

  const [assetId, setAssetId] = useState('');
  const asset = assets.find(a => a.id === assetId) ?? assets[0];
  const story = asset ? assetStory({ id: asset.id, scheduleIds: asset.maintenanceScheduleIds }, visits, fixes, today) : null;
  const reserve = asset ? reserveItems.find(r => r.id === asset.reserveItemId) : undefined;
  const [storm, setStorm] = useState('');
  const study = nextStudy(today);

  return (
    <div className="flex flex-col gap-5">
      <TileRow className="sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4">
        <Tile label="Planned against fixing" meta={String(year)} value={sum.plannedPct == null ? '—' : `${sum.plannedPct} : ${100 - sum.plannedPct}`} sub={sum.plannedPct == null ? 'No upkeep or repair costs recorded this year yet' : `${fmt(sum.planned)} on scheduled work · ${fmt(sum.fixing)} on repairs`} data-upkeep-planned={sum.plannedPct ?? ''} />
        <Tile tone={sum.overdue ? 'red' : 'grey'} label="Done on time" meta={String(year)} value={`${sum.doneOnTime} of ${sum.asked}`} sub={sum.overdue ? `${sum.overdue} overdue now${sum.done - sum.doneOnTime ? ` · ${sum.done - sum.doneOnTime} done late` : ''}` : sum.asked ? 'Nothing overdue' : 'Nothing has fallen due yet'} />
        <Tile label="Put off" value={String(sum.putOff)} sub={sum.oldestPutOff ? `Oldest: ${sum.oldestPutOff.task}, first due ${dayLabel(sum.oldestPutOff.from)}` : 'No task is put off'} />
        <Tile tone={undecided ? 'navy' : 'grey'} label="Open findings" value={String(undecided + putOffFindings)} sub={`${undecided} to decide · ${putOffFindings} put off · ${openRepairs} repair${openRepairs === 1 ? '' : 's'} open`} />
      </TileRow>

      <Card aria-label="The year at a glance" className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[17px] font-semibold text-ux2-ink">{year} at a glance</span><span className="flex flex-wrap items-center gap-1.5 text-xs text-ux2-muted">{(Object.keys(MARK) as MarkState[]).map(s => <span key={s} className="flex items-center gap-1"><span className={`inline-block h-3 w-3 rounded-[4px] ${MARK[s]}`} />{MARK_WORD[s]}</span>)}</span></div>
        {grid.length === 0 ? <Inner className="text-sm text-ux2-muted">Nothing is scheduled yet. Add the recurring work below and it is drawn here across the year.</Inner> : (
          <Table minWidth={900}>
            <thead><tr><Th>System</Th>{MONTHS.map(m => <Th key={m}>{m}</Th>)}<Th num>Cost this year</Th></tr></thead>
            <tbody>
              {grid.map(r => (
                <tr key={r.system} data-system={r.system} className={r.tasks > 0 && r.marks.length === 0 ? 'bg-ux2-red-tint/40' : ''}>
                  <Td className="font-semibold">{r.system}{r.tasks > 0 && r.marks.length === 0 && <span className="block text-xs font-normal text-ux2-red-ink">Nothing done or due this year</span>}</Td>
                  {MONTHS.map((_, m) => <Td key={m}><span className="flex flex-wrap gap-1">{r.marks.filter(x => x.month === m).map((x, i) => <span key={i} title={x.title} aria-label={x.title} className={`rounded-[6px] px-1.5 py-0.5 text-[11px] font-semibold ${MARK[x.state]}`}>{x.label}</span>)}</span></Td>)}
                  <Td num>{r.cost ? fmt(r.cost) : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Why>Each mark is one visit made or one date still to come, in its month; hold the pointer over a mark for the task and the date. A system with a task but no mark all year is one nobody is looking at. Cost is what was entered when each task was marked done. Visits recorded before this page existed are in the property log, not here.</Why>
      </Card>

      <ComfortCard today={today} isBoard={isBoard} />

      <MaintenanceCard today={today} isBoard={isBoard} />

      {isBoard && (
        <Card aria-label="Inspections on record" className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[17px] font-semibold text-ux2-ink">Inspections · walked in an action, read here</span><Button size="sm" variant="ghost" onClick={() => open(startInspection('Walk-through', { template: 'walkthrough' }, today).caseId)}>Start a walk-through</Button></div>
          {inspections.length === 0 ? <Inner className="text-sm text-ux2-muted">No inspection has been walked yet. A scheduled inspection opens its own action {INSPECTION_OPENS_DAYS} days before it is due.</Inner> : (
            <Table minWidth={820}>
              <thead><tr><Th>Inspection</Th><Th>When</Th><Th>By</Th><Th>Found</Th><Th>Standing</Th></tr></thead>
              <tbody>{inspections.slice(0, 12).map(r => {
                const d = data(r), work = findings(d), watch = watched(d), c = recordCase(cases, r);
                const photos = d.points.reduce((t, p) => t + p.photos.length, 0);
                return (
                  <tr key={r.id} data-inspection={r.id}>
                    <Td><button type="button" disabled={!c} onClick={() => open(c?.id ?? null)} className="text-left font-semibold text-ux2-ink hover:underline">{r.title}</button><span className="block text-xs text-ux2-muted">{CHECKLISTS[d.template]?.label ?? d.template}{d.thirdParty ? ' · certified third party' : ''}</span></Td>
                    <Td>{d.bookedFor ? dayLabel(d.bookedFor) : <span className="text-ux2-muted">Not booked</span>}</Td>
                    <Td>{d.by || <span className="text-ux2-muted">Not named</span>}</Td>
                    <Td className="text-xs">{d.points.every(p => !p.result) ? 'Not walked yet' : [work.length && `${work.length} need${work.length === 1 ? 's' : ''} work`, watch.length && `${watch.length} to watch`, !work.length && !watch.length && 'All fine', photos && `${photos} photo${photos === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</Td>
                    <Td>{r.closedOn ? <Chip tone="ghost">Filed {dayLabel(d.filedOn || r.closedOn)}</Chip> : <Chip tone="navy">{stageOf(r)}</Chip>}</Td>
                  </tr>
                );
              })}</tbody>
            </Table>
          )}
          <Why>An inspection records who inspected, when, what was looked at, the results and what was recommended, with photos. Something marked to watch shows again on the next inspection of the same kind. Each thing that needs work is repaired, put off with a reason, or folded into a project.</Why>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {isBoard && asset && story && (
          <Card aria-label="One asset's story" className="gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[17px] font-semibold text-ux2-ink">One asset's story</span><select aria-label="Asset" value={asset.id} onChange={e => setAssetId(e.target.value)} className="h-9 rounded-full border border-ux2-line-strong bg-white px-3 text-sm text-ux2-ink">{assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            <Inner data-asset-story={asset.id}>
              <KV label={`Installed ${asset.installedDate ? asset.installedDate.slice(0, 4) : 'date not on file'} · life ${asset.usefulLifeYears} years`}><Chip tone={asset.condition === 'Poor' || asset.condition === 'Critical' ? 'red' : asset.condition === 'Fair' ? 'amber' : 'sage'}>{asset.condition}{asset.remainingLifeYears != null ? ` · replace ${year + Math.max(0, Math.round(asset.remainingLifeYears))}` : ''}</Chip></KV>
              <KV label="Planned work, 3 years">{story.visits} visit{story.visits === 1 ? '' : 's'} · {fmt(story.planned)}</KV>
              <KV label="Repairs, 3 years">{story.breakdowns} · {fmt(story.repairs)}</KV>
              <KV label="Warranties">{asset.warranties.length ? asset.warranties.map(w => `${w.description} to ${w.expires}`).join(' · ') : 'None on file'}</KV>
            </Inner>
            {story.bringForward ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] bg-ux2-red-tint px-3.5 py-3 text-sm text-ux2-ink"><span><b className="font-semibold text-ux2-red-ink">Repairs cost more than twice the upkeep.</b> That is a case for bringing the replacement forward{reserve ? `: ${reserve.name} is in the reserve plan` : ''}.</span><Button size="sm" onClick={() => open(ensureReview(`${asset.name}: repairs (${fmt(story.repairs)}) are more than twice its upkeep (${fmt(story.planned)}) over three years`, today).caseId)}>Take it to a reserve funding review</Button></div>
            ) : <span className="text-xs text-ux2-muted">When repairs over three years cost more than twice the upkeep, and there were at least two, the app flags it as a case to replace sooner.</span>}
            <span className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={() => open(startAction('repair', asset.name, { where: asset.location || asset.name, assetId: asset.id, from: 'Building › Upkeep' }, {}, today).caseId)}>Start a repair on it</Button>
              <Button size="sm" variant="ghost" onClick={() => navigate('/building?tab=overview&section=assets')}>Open the asset list</Button>
            </span>
            <Why>Planned work is the visits on the tasks linked to this asset; repairs are the repair actions that name it. Link a task to an asset when adding or editing the task.</Why>
          </Card>
        )}

        <Card aria-label="What opens an inspection" className="gap-3">
          <span className="text-[17px] font-semibold text-ux2-ink">What opens an inspection</span>
          <Inner>
            <KV label="A scheduled inspection comes within 30 days">Opens its action, with last time's watch points carried over</KV>
            <KV label="A unit's move-out day arrives">A walk of the elevator, halls and loading area</KV>
            <KV label="A reserve study is coming">Every asset is rated first, and the ratings are saved to the assets</KV>
            <KV label="The task needs a certificate">Marked for a licensed third party, not staff</KV>
            <KV label="The elevator, the boiler, the fire systems">Their own runbooks, on the same schedule</KV>
          </Inner>
          {isBoard && (
            <>
              <form aria-label="Before a storm or a freeze" onSubmit={e => { e.preventDefault(); open(startStormCheck(storm, today).caseId); setStorm(''); }} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-line bg-white px-3.5 py-3">
                <Field label="A storm or a freeze is forecast" className="min-w-[220px] flex-1"><input value={storm} onChange={e => setStorm(e.target.value)} placeholder="freeze on Friday" className={INPUT} /></Field>
                <Button type="submit" size="sm">Start the check</Button>
              </form>
              {assets.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ux2-ink"><span>Next reserve study due {study.last ? dayLabel(study.due) : 'now: none is on record'}</span><Button size="sm" variant="ghost" onClick={() => open(startConditionSurvey(study.key, today).caseId)}>Rate every asset now</Button></div>}
            </>
          )}
          <Why>The app has no weather feed, so the storm check is started by a person. Switch the Inspection runbook off under Board Room › Runbooks to stop inspections opening on their own.</Why>
        </Card>
      </div>
    </div>
  );
}
