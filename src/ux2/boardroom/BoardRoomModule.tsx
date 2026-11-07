/**
 * Board Room — operations for the board, manager and staff (ux2.boardroom).
 *
 *  Open      every open case with where it is, what it needs next and who drives it
 *  Inbox     what owners asked for, the 14-day clock, acknowledge, reply, convert to case
 *  Runbooks  the 32 runbooks, which have a case open, on and off
 *  Outbox    every letter and notice: drafts, sent, in transit, templates, delivery
 *  Tasks     the team's kanban (Property Manager Seat)
 *  Intercom  the team's realtime channels (Property Manager Seat)
 *  Archive   what this board has closed, read-only, with the decision trail
 *
 * The case workspace and the New Case wizard are the production Issues page,
 * mounted embedded and steered through its own URL params (`view`,
 * `caseTab`), so the 40 situations keep creating the same steps and every
 * modal keeps its code path. The case frame also mounts the spending, bid
 * and conflict panels and the decision trail that the codebase has but the
 * production page never showed.
 *
 * Deep links: `/boardroom?tab=open|inbox|runbooks|outbox|tasks|intercom|archive`,
 * `/boardroom?view=case:<id>`, `/boardroom?view=new&cat=<catId>&sit=<sitId>`.
 * `/issues?view=case:<id>` (Home's links) resolves here too.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTenantContext } from '@/components/TenantProvider';
import { useTaskTrackingStore } from '@/store/useTaskTrackingStore';
import TaskTrackingTab from '@/features/association-team/tabs/TaskTrackingTab';
import IntercomTab from '@/features/association-team/tabs/CommunicationsTab';
import { Button, Card, Chip, Inner, PillTabs, SectionLabel, ModuleHeader, STATUS_CHIP } from '../components';
import { useBoardRoomSnapshot } from './useBoardRoomSnapshot';
import { archiveRows, caseRows, casesSummary, inboxRows, inboxSummary, outboxSummary, runbookStatuses, runbooksSummary } from './metrics';
import OpenTab from './tabs/OpenTab';
import InboxTab from './tabs/InboxTab';
import RunbooksTab from './tabs/RunbooksTab';
import OutboxTab from './tabs/OutboxTab';
import ArchiveTab from './tabs/ArchiveTab';
import CaseFrame from './tabs/CaseFrame';

export type BoardRoomTab = 'open' | 'inbox' | 'runbooks' | 'outbox' | 'tasks' | 'intercom' | 'archive';
const TAB_IDS: BoardRoomTab[] = ['open', 'inbox', 'runbooks', 'outbox', 'tasks', 'intercom', 'archive'];
/** Tabs that exist only with the Property Manager Seat add-on. */
export const PM_SEAT_TABS: BoardRoomTab[] = ['tasks', 'intercom'];
/** Legacy Board Room, Issues and Association Team tab ids → module tab. */
export const LEGACY_TABS: Record<string, BoardRoomTab> = { dailyops: 'open', communications: 'outbox', issues: 'inbox', 'task-tracking': 'tasks' };

export function resolveBoardRoomTab(raw: string | null, caseTab: string | null, pmSeat = true): BoardRoomTab {
  let tab: BoardRoomTab = 'open';
  if (raw && (TAB_IDS as string[]).includes(raw)) tab = raw as BoardRoomTab;
  else if (raw && LEGACY_TABS[raw]) tab = LEGACY_TABS[raw];
  else if (caseTab === 'issues') tab = 'inbox';
  else if (caseTab === 'archive') tab = 'archive';
  return !pmSeat && PM_SEAT_TABS.includes(tab) ? 'open' : tab;
}

export default function BoardRoomModule() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view');
  const pmSeat = useTenantContext().pmSeat;
  const tab = resolveBoardRoomTab(params.get('tab'), params.get('caseTab'), pmSeat);
  const snap = useBoardRoomSnapshot();
  const [composeLetter, setComposeLetter] = useState(false);
  const openTasks = useTaskTrackingStore(s => s.tasks).filter(t => t.status !== 'done').length;

  const cases = casesSummary(caseRows(snap));
  const inbox = inboxSummary(inboxRows(snap));
  const runbooks = runbooksSummary(runbookStatuses(snap));
  const outbox = outboxSummary(snap);
  const archive = archiveRows(snap);

  /** Change the module tab and keep the embedded Issues page on the matching list. */
  const go = (next: BoardRoomTab) => {
    setParams(prev => {
      const p = new URLSearchParams(prev);
      p.delete('view'); p.delete('cat'); p.delete('sit');
      if (next === 'open') p.delete('tab'); else p.set('tab', next);
      if (next === 'inbox') p.set('caseTab', 'issues'); else if (next === 'archive') p.set('caseTab', 'archive'); else p.delete('caseTab');
      return p;
    }, { replace: true });
  };
  const openCase = (id: string) => setParams(prev => { const p = new URLSearchParams(prev); p.set('view', `case:${id}`); return p; }, { replace: true });
  const newCase = (prefill?: { catId: string; sitId: string }) => setParams(prev => {
    const p = new URLSearchParams(prev);
    p.set('view', 'new');
    if (prefill) { p.set('cat', prefill.catId); p.set('sit', prefill.sitId); } else { p.delete('cat'); p.delete('sit'); }
    return p;
  }, { replace: true });

  if (view && (view === 'new' || view.startsWith('case:'))) {
    return <CaseFrame snap={snap} view={view} prefill={params.get('cat') && params.get('sit') ? { catId: params.get('cat')!, sitId: params.get('sit')! } : undefined} onBack={() => go('open')} onOpenCase={openCase} />;
  }

  const subtitle = {
    open: 'Operations for the board, manager and staff: open cases, owner requests, the runbooks that run them, and the outbox. An owner sees only a case about their own unit.',
    inbox: 'What owners have asked the board for, and the 14-day clock on each one. Owners see the status of their own request in Community › Requests.',
    runbooks: 'All 32 are on from day one, each waiting for its trigger. Turn one off only if the building does not want it.',
    outbox: 'Every letter and notice the board sends, drafted from a template, delivered the way the bylaws require, and kept with proof of delivery.',
    tasks: 'The team\'s board: what the manager, staff and officers are working on, dragged from to-do to done, each linked to the case, log entry or vendor behind it.',
    intercom: 'The team\'s channels: the board, the manager and staff talking in one place, with a board-only channel. Owners never see it.',
    archive: 'The cases, requests and letters this board has closed, read-only, with the decision trail behind each one. Nothing here needs you.',
  }[tab];

  const tabs = [
    { id: 'open' as BoardRoomTab, label: 'Open', badge: cases.open.length || undefined, badgeTone: cases.overdue.length ? 'red' as const : 'navy' as const },
    { id: 'inbox' as BoardRoomTab, label: 'Inbox', badge: inbox.open.length || undefined, badgeTone: inbox.overdue.length ? 'red' as const : 'amber' as const },
    { id: 'runbooks' as BoardRoomTab, label: 'Runbooks', badge: runbooks.withOpenCase.length ? `${runbooks.withOpenCase.length} open` : undefined, badgeTone: 'teal' as const },
    { id: 'outbox' as BoardRoomTab, label: 'Outbox', badge: outbox.drafts.length ? `${outbox.drafts.length} draft${outbox.drafts.length === 1 ? '' : 's'}` : undefined, badgeTone: 'cyan' as const },
    ...(pmSeat ? [
      { id: 'tasks' as BoardRoomTab, label: 'Tasks', badge: openTasks || undefined, badgeTone: 'teal' as const },
      { id: 'intercom' as BoardRoomTab, label: 'Intercom' },
    ] : []),
    { id: 'archive' as BoardRoomTab, label: 'Archive', badge: archive.length || undefined, badgeTone: 'ghost' as const },
  ];

  return (
    <div data-page="ux2-boardroom" className="flex flex-col gap-5">
      <ModuleHeader
        title="Board Room"
        subtitle={subtitle}
        status={cases.overdue.length > 0 ? <Chip tone="red" className={STATUS_CHIP}>{cases.overdue.length} overdue</Chip> : undefined}
        tabs={<PillTabs tabs={tabs} value={tab} onChange={id => go(id)} aria-label="Board Room sections" />}
        actions={tab === 'outbox' ? <Button onClick={() => setComposeLetter(true)}>New letter</Button> : <Button onClick={() => newCase()}>New case</Button>}
      />

      {tab === 'open' && <OpenTab snap={snap} onOpenCase={openCase} />}
      {tab === 'inbox' && <InboxTab snap={snap} onOpenCase={openCase} />}
      {tab === 'runbooks' && <RunbooksTab snap={snap} onOpenCase={openCase} onNewCase={newCase} />}
      {tab === 'outbox' && <OutboxTab snap={snap} onOpenCase={openCase} compose={composeLetter} onComposeDone={() => setComposeLetter(false)} />}
      {tab === 'tasks' && pmSeat && (
        <Card aria-label="Tasks">
          <SectionLabel>Tasks · {openTasks} open</SectionLabel>
          <Inner className="text-xs text-ux2-muted">Property log findings become tasks here; a task can link to a case, a vendor or a log entry. Part of the Property Manager Seat.</Inner>
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
      {tab === 'archive' && <ArchiveTab snap={snap} onOpenCase={openCase} />}
    </div>
  );
}
