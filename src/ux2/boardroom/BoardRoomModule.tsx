/**
 * Board Room — operations for the board, manager and staff (ux2.boardroom).
 *
 *  Current Actions  every open case with where it is, what it needs next and who drives it
 *  Inbox     what owners asked for, the 14-day clock, acknowledge, reply, convert to case
 *  Runbooks  every runbook; one opens to its steps and which the app does
 *  Outbox    every letter and notice: drafts, sent, in transit, templates, delivery
 *  Tasks     the team's kanban (Property Manager Seat)
 *  Intercom  the team's realtime channels (Property Manager Seat)
 *
 * The case workspace and the New Case wizard are the production Issues page,
 * mounted embedded and steered through its own URL params (`view`,
 * `caseTab`), so the 40 situations keep creating the same steps and every
 * modal keeps its code path. The case frame also mounts the spending, bid
 * and conflict panels and the decision trail that the codebase has but the
 * production page never showed.
 *
 * The Archive moved to Records (`/records?tab=archive`); old archive links
 * redirect there.
 *
 * Deep links: `/boardroom?tab=open|inbox|runbooks|outbox|tasks|intercom`,
 * `/boardroom?tab=runbooks&runbook=<id>` opens one runbook's details,
 * `/boardroom?view=case:<id>`, `/boardroom?view=new&cat=<catId>&sit=<sitId>`.
 * `/issues?view=case:<id>` (Home's links) resolves here too.
 */
import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useTenantContext } from '@/components/TenantProvider';
import { useTaskTrackingStore } from '@/store/useTaskTrackingStore';
import TaskTrackingTab from '@/features/association-team/tabs/TaskTrackingTab';
import IntercomTab from '@/features/association-team/tabs/CommunicationsTab';
import { Button, Card, Chip, Inner, PillTabs, SectionLabel, ModuleHeader, STATUS_CHIP, HeaderSlotProvider } from '../components';
import { useBoardRoomSnapshot } from './useBoardRoomSnapshot';
import { useFinancialStore } from '@/store/useFinancialStore';
import RegisterTab, { registerSummary } from './tabs/RegisterTab';
import ProjectAction from './project/ProjectAction';
import { projectIdOf } from './capitalImprovement';
import CaseTools, { toolsFor } from './tools/CaseTools';
import RecordAction from './action/RecordAction';
import StartAction from './action/StartAction';
import { recordIdOf } from './recordActions';
import { useRegisterStore } from '@/store/useRegisterStore';
import { caseRows, casesSummary, inboxRows, inboxSummary, outboxSummary, runbookStatuses, runbooksSummary } from './metrics';
import OpenTab from './tabs/OpenTab';
import InboxTab from './tabs/InboxTab';
import RunbooksTab from './tabs/RunbooksTab';
import OutboxTab from './tabs/OutboxTab';
import CaseFrame from './tabs/CaseFrame';

export type BoardRoomTab = 'open' | 'inbox' | 'register' | 'runbooks' | 'outbox' | 'tasks' | 'intercom';
const TAB_IDS: BoardRoomTab[] = ['open', 'inbox', 'register', 'runbooks', 'outbox', 'tasks', 'intercom'];
/** The Archive lives in Building now. */
export const ARCHIVE_PATH = '/records?tab=archive';
/** Tabs that exist only with the Property Manager Seat add-on. */
export const PM_SEAT_TABS: BoardRoomTab[] = ['tasks', 'intercom'];
/** Legacy Board Room, Issues and Association Team tab ids → module tab. */
export const LEGACY_TABS: Record<string, BoardRoomTab> = { dailyops: 'open', communications: 'outbox', issues: 'inbox', 'task-tracking': 'tasks' };

export function resolveBoardRoomTab(raw: string | null, caseTab: string | null, pmSeat = true): BoardRoomTab {
  let tab: BoardRoomTab = 'open';
  if (raw && (TAB_IDS as string[]).includes(raw)) tab = raw as BoardRoomTab;
  else if (raw && LEGACY_TABS[raw]) tab = LEGACY_TABS[raw];
  else if (caseTab === 'issues') tab = 'inbox';
  return !pmSeat && PM_SEAT_TABS.includes(tab) ? 'open' : tab;
}

export default function BoardRoomModule() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view');
  const pmSeat = useTenantContext().pmSeat;
  const tab = resolveBoardRoomTab(params.get('tab'), params.get('caseTab'), pmSeat);
  const snap = useBoardRoomSnapshot();
  const [composeLetter, setComposeLetter] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const starting = startOpen || !!params.get('start');
  const setStarting = (on: boolean) => { setStartOpen(on); if (!on && params.get('start')) setParams(prev => { const p = new URLSearchParams(prev); p.delete('start'); return p; }, { replace: true }); };
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const openTasks = useTaskTrackingStore(s => s.tasks).filter(t => t.status !== 'done').length;

  const cases = casesSummary(caseRows(snap));
  const inbox = inboxSummary(inboxRows(snap));
  const runbooks = runbooksSummary(runbookStatuses(snap));
  const outbox = outboxSummary(snap);
  const registerEntries = useRegisterStore(s => s.entries);
  const unitBalances = useFinancialStore(s => s.units);
  const register = registerSummary(registerEntries, snap.today, unit => unitBalances.find(u => u.number === unit)?.balance ?? 0);

  /** Change the module tab and keep the embedded Issues page on the matching list. */
  const go = (next: BoardRoomTab) => {
    setParams(prev => {
      const p = new URLSearchParams(prev);
      p.delete('view'); p.delete('cat'); p.delete('sit'); p.delete('runbook'); p.delete('record');
      if (next !== 'register') p.delete('section');
      if (next === 'open') p.delete('tab'); else p.set('tab', next);
      if (next === 'inbox') p.set('caseTab', 'issues'); else p.delete('caseTab');
      return p;
    }, { replace: true });
  };
  const openCase = (id: string) => setParams(prev => { const p = new URLSearchParams(prev); p.set('view', `case:${id}`); p.delete('record'); p.delete('start'); return p; }, { replace: true });
  const newCase = (prefill?: { catId: string; sitId: string }) => setParams(prev => {
    const p = new URLSearchParams(prev);
    p.set('view', 'new');
    if (prefill) { p.set('cat', prefill.catId); p.set('sit', prefill.sitId); } else { p.delete('cat'); p.delete('sit'); }
    return p;
  }, { replace: true });

  if (!view && (params.get('tab') === 'archive' || params.get('caseTab') === 'archive')) return <Navigate to={ARCHIVE_PATH} replace />;

  // A capital improvement's action has its own page: the ten steps, each with its work. The case record (notes, decision trail) stays one click away.
  const capitalProjectId = view?.startsWith('case:') && params.get('record') !== '1' ? projectIdOf(snap.cases.find(c => c.id === view.slice(5))) : null;
  if (view && capitalProjectId) {
    return <ProjectAction projectId={capitalProjectId} caseId={view.slice(5)} onBack={() => go('open')} onOpenRecord={() => setParams(prev => { const p = new URLSearchParams(prev); p.set('record', '1'); return p; }, { replace: true })} />;
  }

  const actionRecordId = view?.startsWith('case:') && params.get('record') !== '1' ? recordIdOf(snap.cases.find(c => c.id === view.slice(5))) : null;
  if (view && actionRecordId) {
    return <RecordAction recordId={actionRecordId} caseId={view.slice(5)} onBack={() => go('open')} onOpenRecord={() => setParams(prev => { const p = new URLSearchParams(prev); p.set('record', '1'); return p; }, { replace: true })} />;
  }

  if (view && (view === 'new' || view.startsWith('case:'))) {
    const toolCase = view.startsWith('case:') ? snap.cases.find(c => c.id === view.slice(5)) : undefined;
    if (toolCase && toolsFor(toolCase)) return <div className="flex flex-col gap-4"><CaseFrame snap={snap} view={view} onBack={() => go('open')} onOpenCase={openCase} /><CaseTools c={toolCase} /></div>;
    return <CaseFrame snap={snap} view={view} prefill={params.get('cat') && params.get('sit') ? { catId: params.get('cat')!, sitId: params.get('sit')! } : undefined} onBack={() => go('open')} onOpenCase={openCase} />;
  }

  const subtitle = {
    open: 'Operations for the board, manager and staff: current actions, owner requests, the runbooks that run them, and the outbox. An owner sees only an action about their own unit.',
    register: 'The matters with a clock of their own: rule violations, owners\' requests to alter a unit, resale certificates and liens. Each opens an action and ticks its steps as the dates are entered here.',
    inbox: 'What owners have asked the board for, and the 14-day clock on each one. Owners see the status of their own request in Community › Requests.',
    runbooks: 'Every runbook is on from day one. Month close starts itself on the building\'s day; the rest open by hand until their triggers are wired. Turn one off only if the building does not want it.',
    outbox: 'Every letter and notice the board sends, drafted from a template, delivered the way the bylaws require, and kept with proof of delivery.',
    tasks: 'The team\'s board: what the manager, staff and officers are working on, dragged from to-do to done, each linked to the action, log entry or vendor behind it.',
    intercom: 'The team\'s channels: the board, the manager and staff talking in one place, with a board-only channel. Owners never see it.',
  }[tab];

  const tabs = [
    { id: 'open' as BoardRoomTab, label: 'Current Actions', badge: cases.open.length || undefined, badgeTone: cases.overdue.length ? 'red' as const : 'navy' as const },
    { id: 'inbox' as BoardRoomTab, label: 'Inbox', badge: inbox.open.length || undefined, badgeTone: inbox.overdue.length ? 'red' as const : 'amber' as const },
    { id: 'register' as BoardRoomTab, label: 'Register', badge: register.waiting || undefined, badgeTone: register.overdue ? 'red' as const : 'amber' as const },
    { id: 'runbooks' as BoardRoomTab, label: 'Runbooks', badge: runbooks.withOpenCase.length ? `${runbooks.withOpenCase.length} open` : undefined, badgeTone: 'teal' as const },
    { id: 'outbox' as BoardRoomTab, label: 'Outbox', badge: outbox.drafts.length ? `${outbox.drafts.length} draft${outbox.drafts.length === 1 ? '' : 's'}` : undefined, badgeTone: 'cyan' as const },
    ...(pmSeat ? [
      { id: 'tasks' as BoardRoomTab, label: 'Tasks', badge: openTasks || undefined, badgeTone: 'teal' as const },
      { id: 'intercom' as BoardRoomTab, label: 'Intercom' },
    ] : []),
  ];

  return (
    <HeaderSlotProvider value={headerSlot}>
      <div data-page="ux2-boardroom" className="flex flex-col gap-5">
        <ModuleHeader
          slotRef={setHeaderSlot}
          title="Board Room"
          subtitle={subtitle}
          status={cases.overdue.length > 0 ? <Chip tone="red" className={STATUS_CHIP}>{cases.overdue.length} overdue</Chip> : undefined}
          tabs={<PillTabs tabs={tabs} value={tab} onChange={id => go(id)} aria-label="Board Room sections" />}
          actions={tab === 'outbox' ? <Button onClick={() => setComposeLetter(true)}>New letter</Button> : <><Button variant="ghost" onClick={() => setStarting(!starting)}>Guided action</Button><Button onClick={() => newCase()}>Take Action</Button></>}
        />

        {starting && <StartAction initialKind={params.get('start') ?? undefined} key={params.get('start') ?? 'pick'} onOpenCase={id => { setStartOpen(false); openCase(id); }} onClose={() => setStarting(false)} />}
        {tab === 'open' && <OpenTab snap={snap} onOpenCase={openCase} />}
        {tab === 'inbox' && <InboxTab snap={snap} onOpenCase={openCase} />}
        {tab === 'register' && <RegisterTab section={params.get('section') ?? undefined} onSection={s => setParams(prev => { const p = new URLSearchParams(prev); p.set('section', s); return p; }, { replace: true })} onOpenCase={openCase} />}
        {tab === 'runbooks' && <RunbooksTab snap={snap} onOpenCase={openCase} onNewCase={newCase} />}
        {tab === 'outbox' && <OutboxTab snap={snap} onOpenCase={openCase} compose={composeLetter} onComposeDone={() => setComposeLetter(false)} />}
        {tab === 'tasks' && pmSeat && (
          <Card aria-label="Tasks">
            <SectionLabel>Tasks · {openTasks} open</SectionLabel>
            <Inner className="text-xs text-ux2-muted">Property log findings become tasks here; a task can link to an action, a vendor or a log entry. Part of the Property Manager Seat.</Inner>
            <div className="ux2-legacy"><TaskTrackingTab /></div>
          </Card>
        )}
        {tab === 'intercom' && pmSeat && (
          <Card aria-label="Intercom">
            <SectionLabel>Intercom · the team's channels</SectionLabel>
            <Inner className="text-xs text-ux2-muted">General, Maintenance and a board-only channel to start; add up to 50. Messages arrive live, attachments go with them. Part of the Property Manager Seat.</Inner>
            <div className="ux2-legacy"><IntercomTab /></div>
          </Card>
        )}
      </div>
    </HeaderSlotProvider>
  );
}
