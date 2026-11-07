import { useMemo, useState } from 'react';
import { cn } from '@/lib/formatters';
import { Card, Chip, PillTabs, SectionLabel, Table, Th, Td, Cell, Why } from '../../components';
import { dayLabel } from '../../home/calendar';
import { useRunbookSwitches } from '../store';
import { runbookStatuses, runbooksSummary, type RunbookStatus, type BoardRoomSnapshot } from '../metrics';

type StepState = 'done' | 'person' | 'auto' | 'pending';

const Check = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12l5 5L20 7" /></svg>;
const Person = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
const Bolt = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M13 2L4 14h6l-1 8 9-12h-6z" /></svg>;

/** One dot on the step track. */
function Dot({ state, small }: { state: StepState; small?: boolean }) {
  const cls = {
    done: 'bg-ux2-sage-tint text-ux2-sage border-ux2-sage-tint',
    person: 'bg-ux2-navy text-white border-ux2-navy',
    auto: 'bg-ux2-teal-tint text-ux2-teal border-ux2-teal-tint',
    pending: 'bg-white text-ux2-dim border-ux2-line-strong',
  }[state];
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center rounded-full border', small ? 'h-[18px] w-[18px]' : 'h-6 w-6', cls)}>
      {state === 'done' ? <Check /> : state === 'person' ? <Person /> : state === 'auto' ? <Bolt /> : null}
    </span>
  );
}

/** The step track for a runbook with a case open: done, the person's step, the automated rest. */
function stepTrack(r: RunbookStatus): { state: StepState; label: string }[] {
  const c = r.openCases[0];
  const steps = c?.steps?.length ? c.steps.map(s => s.s) : Array.from({ length: r.def.steps }, (_, i) => `Step ${i + 1}`);
  const done = c?.steps?.filter(s => s.done).length ?? 0;
  const current = done < steps.length ? done : -1;
  const autoBudget = Math.max(0, r.def.automated - Math.min(done, r.def.automated));
  let autoLeft = autoBudget;
  return steps.slice(0, 6).map((label, i) => {
    let state: StepState = 'pending';
    if (i < done) state = 'done';
    else if (i === current) state = 'person';
    else if (autoLeft > 0) { state = 'auto'; autoLeft--; }
    return { state, label: label.length > 14 ? `${label.slice(0, 13)}…` : label };
  });
}

function RunbookCard({ r, onOpenCase }: { r: RunbookStatus; onOpenCase: (id: string) => void }) {
  const c = r.openCases[0];
  const track = stepTrack(r);
  const stepIdx = Math.max(1, (c.steps?.filter(s => s.done).length ?? 0) + 1);
  const total = c.steps?.length ?? r.def.steps;
  const unit = c.unit && !/^(common|n\/a)$/i.test(c.unit) ? c.unit : '';
  return (
    <Card role="button" tabIndex={0} aria-label={r.def.name} onClick={() => onOpenCase(c.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenCase(c.id); } }} className="cursor-pointer gap-2.5 hover:border-ux2-line-strong">
      <div className="flex items-center justify-between gap-2"><div className="text-[15px] font-semibold text-ux2-ink">{r.def.name}{unit ? ` · Unit ${unit}` : ''}</div><Chip tone="teal">{r.def.automated} of {r.def.steps} automated</Chip></div>
      <Chip tone={r.def.visibility === 'owners' ? 'sage' : 'navy'} className="self-start">{r.def.visibility === 'owners' ? 'Owners see this' : `Board only${unit ? ` · owner ${unit} sees their own view` : ''}`}</Chip>
      <div className="text-xs text-ux2-muted">Started itself {r.def.trigger.charAt(0).toLowerCase() + r.def.trigger.slice(1)} · step {stepIdx} of {total}{c.assignedTo || c.assignedRole ? ` · ${c.assignedTo || c.assignedRole}` : ''}</div>
      <div className="flex items-center">
        {track.map((s, i) => (
          <span key={i} className="flex flex-1 items-center last:flex-none">
            <Dot state={s.state} />
            {i < track.length - 1 && <span className={cn('h-[2px] flex-1', s.state === 'done' ? 'bg-ux2-sage' : 'bg-ux2-line')} />}
          </span>
        ))}
      </div>
      <div className="flex justify-between gap-1 text-[11px] text-ux2-muted">
        {track.map((s, i) => <span key={i} className={cn('min-w-0 truncate', s.state === 'person' && 'font-semibold text-ux2-ink')}>{s.label}</span>)}
      </div>
    </Card>
  );
}

export default function RunbooksTab({ snap, onOpenCase, onNewCase }: { snap: BoardRoomSnapshot; onOpenCase: (id: string) => void; onNewCase: (prefill?: { catId: string; sitId: string }) => void }) {
  const list = useMemo(() => runbookStatuses(snap), [snap]);
  const sum = runbooksSummary(list);
  const setOn = useRunbookSwitches(s => s.setOn);
  const [show, setShow] = useState<'open' | 'all'>('open');
  const shown = show === 'all' ? list : list.filter(r => r.openCases.length > 0);

  const Row = ({ r }: { r: RunbookStatus }) => (
    <tr data-runbook={r.def.id} className={r.on ? '' : 'opacity-70'}>
      <Td><Cell title={r.def.name} note={r.def.visibility === 'owners' ? 'Owners see this' : 'Board only · the unit sees its own view'} /></Td>
      <Td className="text-ux2-muted">{r.def.trigger}</Td>
      <Td num>{r.def.steps}</Td>
      <Td><Chip tone="teal">{r.def.automated} of {r.def.steps}</Chip></Td>
      <Td>
        {r.openCases.length > 0
          ? <button type="button" onClick={() => onOpenCase(r.openCases[0].id)} className="rounded-full"><Chip tone="navy">Open now · {r.openCases[0].unit && !/^(common|n\/a)$/i.test(r.openCases[0].unit) ? `Unit ${r.openCases[0].unit}` : r.openCases[0].title.slice(0, 32)}</Chip></button>
          : <span className="text-ux2-muted">{r.lastRan ? `${dayLabel(r.lastRan.date)} · ${r.lastRan.title}` : 'Never ran'}{r.def.sitId && r.def.catId && <> · <button type="button" onClick={() => onNewCase({ catId: r.def.catId!, sitId: r.def.sitId! })} className="font-semibold text-ux2-teal hover:underline">Open a case</button></>}</span>}
      </Td>
      <Td num>
        <button type="button" role="switch" aria-checked={r.on} aria-label={`${r.def.name} ${r.on ? 'on' : 'off'}`} onClick={() => setOn(r.def.id, !r.on)} className="rounded-full">
          <Chip tone={r.on ? 'navy' : 'ghost'}>{r.on ? 'On' : 'Off · manual'}</Chip>
        </button>
      </Td>
    </tr>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PillTabs size="filter" surface="white" aria-label="Show runbooks" value={show} onChange={setShow} tabs={[{ id: 'open', label: `With an open case · ${sum.withOpenCase.length}` }, { id: 'all', label: `All ${sum.total}` }]} />
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-ux2-muted" aria-label="Legend">
        <span className="inline-flex items-center gap-1.5"><Dot state="auto" small />the app does it</span>
        <span className="inline-flex items-center gap-1.5"><Dot state="person" small />a person decides, arrives as a Home card</span>
        <span className="inline-flex items-center gap-1.5"><Dot state="done" small />done</span>
      </div>

      {sum.withOpenCase.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {sum.withOpenCase.slice(0, 6).map(r => <RunbookCard key={r.def.id} r={r} onOpenCase={onOpenCase} />)}
        </div>
      )}

      <Card aria-label="All runbooks">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>All runbooks</SectionLabel>
          <span className="text-xs text-ux2-muted">{show === 'all' ? `All ${sum.total}` : `With an open case · ${sum.withOpenCase.length}`} · on by default · switching one off keeps the playbook for manual cases</span>
        </div>
        {shown.length === 0 ? <p className="m-0 text-sm text-ux2-muted">No runbook has a case open. <button type="button" onClick={() => setShow('all')} className="font-semibold text-ux2-teal hover:underline">Show all {sum.total}</button></p> : (
          <Table minWidth={820}>
            <thead><tr><Th>Runbook</Th><Th>Starts when</Th><Th num>Steps</Th><Th>Automated</Th><Th>Last ran</Th><Th num>On</Th></tr></thead>
            <tbody>{shown.map(r => <Row key={r.def.id} r={r} />)}</tbody>
          </Table>
        )}
        <Why>A runbook with a situation in the case wizard opens its case with the same steps the wizard creates. The others are automations the app runs on its own; switching one off only stops the trigger.</Why>
      </Card>
    </div>
  );
}
