/**
 * Board Room › Runbooks: every workflow in one list: the catalogue, every
 * other situation Take Action offers, and each action made with its own
 * steps; filtered by whether it starts itself and whether it is used. Clicking one opens its
 * details: what starts it, who sees its cases, whether it is on, what is
 * running now, and every step it includes, marked as the app's (with how it
 * does it) or a person's. `?runbook=<id>` opens a runbook's details directly.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/formatters';
import { Button, Card, Chip, Inner, SectionLabel, Table, Th, Td, Cell, Why } from '../../components';
import { dayLabel } from '../../home/calendar';
import { useRunbookSwitches } from '../store';
import { runbookStatuses, runbooksSummary, type RunbookStatus, type BoardRoomSnapshot } from '../metrics';
import { MONTH_CLOSE_ID, nextMonthCloseStart } from '../monthClose';
import { automationLine, runbookPlan } from '../runbookPlans';
import { handOnly } from '../runbooks';
import type { CaseTrackerCase } from '@/types/issues';

/** Where this case came from, truthfully: the runbook itself, a request, an obligation, or a person. */
function startedHow(c: CaseTrackerCase, trigger: string): string {
  const t = trigger.charAt(0).toLowerCase() + trigger.slice(1);
  if (c.source === 'runbook' || /^Opened by the .+ runbook on /.test(c.notes)) return `Started itself · ${t}`;
  if (c.source === 'issue') return 'Opened from an owner request';
  if (c.source === 'obligation' || c.source === 'filing') return 'Opened from an obligation';
  return `Opened by hand · meant to start ${t}`;
}

const SETTINGS_RULES = '/funds?tab=settings&section=rules';
/** Where a wired runbook's own setting lives. */
const SETTING_OF: Record<string, { label: string; path: string }> = {
  'month-close': { label: 'Change the day', path: SETTINGS_RULES },
  'board-meeting': { label: 'Change the cadence', path: '/building' },
  'reserve-study': { label: 'Change the dates', path: '/funds?tab=planning&section=reserves' },
};

const Person = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
const Bolt = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M13 2L4 14h6l-1 8 9-12h-6z" /></svg>;
const Check = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12l5 5L20 7" /></svg>;

function Mark({ kind }: { kind: 'auto' | 'person' | 'planned' | 'done' }) {
  const cls = { auto: 'bg-ux2-teal-tint text-ux2-teal border-ux2-teal-tint', person: 'bg-ux2-navy text-white border-ux2-navy', planned: 'bg-white text-ux2-teal border-ux2-teal border-dashed', done: 'bg-ux2-sage-tint text-ux2-sage border-ux2-sage-tint' }[kind];
  return <span className={cn('inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border', cls)}>{kind === 'person' ? <Person /> : kind === 'done' ? <Check /> : <Bolt />}</span>;
}

type FilterId = 'all' | 'auto' | 'hand' | 'used' | 'never';
const FILTERS: { id: FilterId; label: string; test: (r: RunbookStatus) => boolean }[] = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'auto', label: 'Start themselves', test: r => !!r.def.wired },
  { id: 'hand', label: 'By hand', test: r => !r.def.wired },
  { id: 'used', label: 'Used', test: r => r.used > 0 },
  { id: 'never', label: 'Never used', test: r => r.used === 0 },
];

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function RunbookDetail({ r, snap, onBack, onOpenCase, onNewCase }: { r: RunbookStatus; snap: BoardRoomSnapshot; onBack: () => void; onOpenCase: (id: string) => void; onNewCase: (prefill?: { catId: string; sitId: string }) => void }) {
  const navigate = useNavigate();
  const setOn = useRunbookSwitches(s => s.setOn);
  const plan = runbookPlan(r.def);
  const line = automationLine(r.def, plan);
  const open = r.openCases[0];
  const doneSteps = open?.steps?.filter(s => s.done).length ?? 0;
  const setting = SETTING_OF[r.def.id];
  return (
    <div className="flex flex-col gap-4" data-runbook-detail={r.def.id}>
      <div><button type="button" onClick={onBack} className="text-sm font-semibold text-ux2-teal hover:underline">← All runbooks</button></div>
      <Card tone="navy" aria-label={r.def.name} className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={plan.live ? 'cyan' : 'ghost'}>{plan.live ? 'Starts itself' : r.def.kind === 'custom' ? 'Custom · its own steps' : handOnly(r.def) ? 'By hand · nothing automated' : 'Opens by hand today'}</Chip>
              <Chip tone="ghost">{r.def.visibility === 'owners' ? 'Owners see its actions' : 'Board only · the unit sees its own view'}</Chip>
            </div>
            <h2 className="m-0 mt-1.5 text-2xl font-semibold text-white">{r.def.name}</h2>
            {r.def.desc && <div className="text-sm text-white/[0.78]">{r.def.desc}</div>}
            <div className="text-sm text-white/[0.78]">{plan.live || handOnly(r.def) ? (r.def.kind === 'custom' ? r.trigger : `Starts ${lower(r.trigger)}`) : `Meant to start ${lower(r.trigger)}`}{r.def.id === MONTH_CLOSE_ID && r.on ? ` · next on ${dayLabel(nextMonthCloseStart(snap.today, snap.monthCloseStartDay ?? 1))}` : ''}</div>
          </div>
          {!handOnly(r.def) && (
            <button type="button" role="switch" aria-checked={r.on} aria-label={`${r.def.name} ${r.on ? 'on' : 'off'}`} onClick={() => setOn(r.def.id, !r.on)} className="rounded-full">
              <Chip tone={r.on ? 'cyan' : 'ghost'}>{r.on ? 'On' : 'Off · opens by hand only'}</Chip>
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div className="flex flex-col gap-1 rounded-[14px] bg-white px-3.5 py-3"><span className="text-xs text-ux2-muted">Steps</span><span className="text-[15px] font-semibold text-ux2-ink">{plan.steps.length}</span><span className="text-xs text-ux2-muted">{line.planned ? `${line.auto} planned to be automated` : `${line.auto} done by the app`}</span></div>
          <div className="flex flex-col gap-1 rounded-[14px] bg-white px-3.5 py-3"><span className="text-xs text-ux2-muted">Now</span><span className="text-[15px] font-semibold text-ux2-ink">{open ? `Open · step ${Math.min(doneSteps + 1, open.steps?.length ?? doneSteps + 1)} of ${open.steps?.length ?? plan.steps.length}` : 'Nothing running'}</span><span className="truncate text-xs text-ux2-muted">{open ? `${open.title}${r.openCases.length > 1 ? ` · ${r.openCases.length - 1} more open` : ''}` : r.lastRan ? `Last ran ${dayLabel(r.lastRan.date)} · ${r.lastRan.title}` : 'Never ran'}{` · used ${r.used} time${r.used === 1 ? '' : 's'}`}</span></div>
          <div className="flex flex-col gap-1 rounded-[14px] bg-white px-3.5 py-3"><span className="text-xs text-ux2-muted">By a person</span><span className="text-[15px] font-semibold text-ux2-ink">{plan.steps.filter(s => !s.auto).length} step{plan.steps.filter(s => !s.auto).length === 1 ? '' : 's'}</span><span className="text-xs text-ux2-muted">{open?.assignedTo || open?.assignedRole ? `Each arrives as a Home card for ${open.assignedTo || open.assignedRole}` : 'Each arrives as a Home card for whoever is assigned'}</span></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {open && <Button size="sm" className="!bg-ux2-cyan !text-ux2-navy" onClick={() => onOpenCase(open.id)}>Open the action</Button>}
          {!open && r.def.kind !== 'custom' && r.def.sitId && r.def.catId && <Button size="sm" className="!bg-ux2-cyan !text-ux2-navy" onClick={() => onNewCase({ catId: r.def.catId!, sitId: r.def.sitId! })}>Take Action</Button>}
          {setting && <Button size="sm" variant="ghost" className="!border-white/30 !bg-white/10 !text-white" onClick={() => navigate(setting.path)}>{setting.label}</Button>}
        </div>
      </Card>

      <Card aria-label="Steps" className="gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>Steps · {plan.steps.length}</SectionLabel>
          <Chip tone="teal">{line.auto} of {line.total} {line.planned ? 'planned to be automated' : 'automated'}</Chip>
        </div>
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {plan.steps.map((s, i) => {
            const done = !!open?.steps?.[i]?.done;
            const kind = done ? 'done' : s.auto ? 'auto' : s.planned ? 'planned' : 'person';
            return (
              <li key={i} data-step={i} data-auto={s.auto ? '1' : '0'} className="flex items-start gap-3 rounded-[14px] border border-ux2-line bg-white px-3.5 py-3">
                <span className="w-5 shrink-0 pt-1 text-right text-xs font-semibold text-ux2-muted">{i + 1}</span>
                <Mark kind={kind} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ux2-ink">{s.title}</div>
                  <div className="text-xs text-ux2-muted">{s.auto ? `The app does this · ${s.how ?? 'it ticks itself'}` : s.planned ? 'A person does this today · planned to be automated' : 'A person does this · it arrives as a Home card for whoever is assigned'}</div>
                </div>
                <span className="flex shrink-0 flex-wrap items-center gap-1.5">{done && <Chip tone="sage">Done on the open action</Chip>}<Chip tone={s.auto ? 'teal' : s.planned ? 'ghost' : 'navy'}>{s.auto ? 'Automated' : s.planned ? 'Planned' : 'Person'}</Chip></span>
              </li>
            );
          })}
        </ol>
        <Why>{plan.live
          ? 'Automated steps tick themselves when the app sees the work done in the place it happens (Funds, Contracts, Meetings...). A person can still tick any of them on the action.'
          : r.def.kind === 'custom' ? 'Someone wrote these steps for one action. A person does each of them.'
          : handOnly(r.def) ? 'Nothing starts this one and no step is automated: a person does each of them. Take Action opens it with these steps.'
          : `This runbook doesn't start itself yet: take action by hand${r.def.sitId ? ' and these are its steps' : ''}. Its automated count is the plan for it.`}</Why>
      </Card>

      {r.openCases.length > 0 && (
        <Card aria-label="Open actions" className="gap-2">
          <SectionLabel>Open actions · {r.openCases.length}</SectionLabel>
          {r.openCases.map(c => (
            <button key={c.id} type="button" onClick={() => onOpenCase(c.id)} className="flex items-center justify-between gap-3 rounded-[14px] border border-ux2-line bg-white px-3.5 py-3 text-left hover:border-ux2-line-strong">
              <Cell title={c.title} note={`${startedHow(c, r.trigger)} · step ${Math.min((c.steps?.filter(s => s.done).length ?? 0) + 1, c.steps?.length ?? 1)} of ${c.steps?.length ?? plan.steps.length}${c.assignedTo || c.assignedRole ? ` · ${c.assignedTo || c.assignedRole}` : ''}`} />
              <Chip tone="navy">Open</Chip>
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}

export default function RunbooksTab({ snap, onOpenCase, onNewCase }: { snap: BoardRoomSnapshot; onOpenCase: (id: string) => void; onNewCase: (prefill?: { catId: string; sitId: string }) => void }) {
  const list = useMemo(() => runbookStatuses(snap), [snap]);
  const sum = runbooksSummary(list);
  const setOn = useRunbookSwitches(s => s.setOn);
  const [filter, setFilter] = useState<FilterId>('all');
  const [params, setParams] = useSearchParams();
  const selected = list.find(r => r.def.id === params.get('runbook'));
  const open = (id: string | null) => {
    setParams(prev => { const p = new URLSearchParams(prev); p.set('tab', 'runbooks'); if (id) p.set('runbook', id); else p.delete('runbook'); return p; });
    window.scrollTo?.({ top: 0 });
  };

  if (selected) return <RunbookDetail r={selected} snap={snap} onBack={() => open(null)} onOpenCase={onOpenCase} onNewCase={onNewCase} />;

  const plans = new Map(list.map(r => [r.def.id, automationLine(r.def)]));
  const autoSteps = list.reduce((t, r) => t + (plans.get(r.def.id)!.planned ? 0 : plans.get(r.def.id)!.auto), 0);
  const shown = list.filter(FILTERS.find(f => f.id === filter)!.test);
  return (
    <Card aria-label="All runbooks" className="gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel>All runbooks · {sum.total}</SectionLabel>
        <span className="text-xs text-ux2-muted">{sum.wired} start themselves · {autoSteps} steps done by the app · {sum.used} used · {sum.neverUsed} never used · {sum.withOpenCase.length} with an action open</span>
      </div>
      <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
        {FILTERS.map(f => {
          const n = list.filter(f.test).length;
          return (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className="rounded-full">
              <Chip tone={filter === f.id ? 'navy' : 'ghost'}>{f.label} · {n}</Chip>
            </button>
          );
        })}
      </div>
      <Table minWidth={960}>
        <thead><tr><Th>Runbook</Th><Th>Starts when</Th><Th num>Steps</Th><Th>Automated</Th><Th>Used</Th><Th>Now</Th><Th num>On</Th></tr></thead>
        <tbody>
          {shown.length === 0 && <tr><Td colSpan={7} className="text-ux2-muted">None here.</Td></tr>}
          {shown.map(r => {
            const line = plans.get(r.def.id)!;
            return (
              <tr key={r.def.id} data-runbook={r.def.id} onClick={() => open(r.def.id)} className={cn('cursor-pointer hover:bg-ux2-surface', r.on ? '' : 'opacity-70')}>
                <Td><Cell title={<button type="button" onClick={e => { e.stopPropagation(); open(r.def.id); }} className="text-left font-semibold text-ux2-ink hover:underline">{r.def.name}</button>} note={`${r.def.kind === 'custom' ? 'Custom · ' : ''}${r.def.visibility === 'owners' ? 'Owners see its actions' : 'Board only'}`} /></Td>
                <Td className="text-ux2-muted">{r.trigger}{!r.def.wired && !handOnly(r.def) && <span className="block text-[11px]">Opens by hand today</span>}</Td>
                <Td num>{line.total}</Td>
                <Td><Chip tone={line.planned || line.auto === 0 ? 'ghost' : 'teal'}>{line.auto === 0 && !line.planned ? 'None' : `${line.auto} of ${line.total}${line.planned ? ' planned' : ''}`}</Chip></Td>
                <Td data-used={r.used}>{r.used > 0 ? <Cell title={`${r.used} time${r.used === 1 ? '' : 's'}`} note={r.lastStarted ? `last ${dayLabel(r.lastStarted)}` : undefined} /> : <span className="text-ux2-muted">Never used</span>}</Td>
                <Td>{r.openCases.length > 0 ? <Chip tone="navy">{r.openCases.length} open</Chip> : <span className="text-ux2-muted">{r.lastRan ? `Last done ${dayLabel(r.lastRan.date)}` : 'Nothing open'}</span>}</Td>
                <Td num>
                  {handOnly(r.def) ? <span className="text-xs text-ux2-muted">By hand</span> : <button type="button" role="switch" aria-checked={r.on} aria-label={`${r.def.name} ${r.on ? 'on' : 'off'}`} onClick={e => { e.stopPropagation(); setOn(r.def.id, !r.on); }} className="rounded-full">
                    <Chip tone={r.on ? 'navy' : 'ghost'}>{r.on ? 'On' : 'Off · manual'}</Chip>
                  </button>}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <Why>Every workflow is here: the runbooks, every other situation Take Action offers (a person does each step), and any action made with its own steps. Click one to see its steps and which ones the app does itself. Used counts every action it has run, open or closed. Switching one off only stops its trigger; its steps stay for any action opened by hand.</Why>
    </Card>
  );
}
