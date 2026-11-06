/**
 * Board Room — operations for the board, manager and staff (ux2.boardroom).
 *
 *  Open      every open case with where it is, what it needs next and who drives it
 *  Inbox     what owners asked for, the 14-day clock, acknowledge, reply, convert to case
 *  Runbooks  the 32 runbooks, which have a case open, on and off
 *  Outbox    every letter and notice: drafts, sent, in transit, templates, delivery
 *  Archive   what this board has closed, read-only, with the decision trail
 *
 * The case workspace and the New Case wizard are the production Issues page,
 * mounted embedded and steered through its own URL params (`view`,
 * `caseTab`), so the 40 situations keep creating the same steps and every
 * modal keeps its code path. The case frame also mounts the spending, bid
 * and conflict panels and the decision trail that the codebase has but the
 * production page never showed.
 *
 * Deep links: `/boardroom?tab=open|inbox|runbooks|outbox|archive`,
 * `/boardroom?view=case:<id>`, `/boardroom?view=new&cat=<catId>&sit=<sitId>`.
 * `/issues?view=case:<id>` (Home's links) resolves here too.
 */
import { useSearchParams } from 'react-router-dom';
import { Button, Chip, PillTabs } from '../components';
import { useBoardRoomSnapshot } from './useBoardRoomSnapshot';
import { archiveRows, caseRows, casesSummary, inboxRows, inboxSummary, outboxSummary, runbookStatuses, runbooksSummary } from './metrics';
import OpenTab from './tabs/OpenTab';
import InboxTab from './tabs/InboxTab';
import RunbooksTab from './tabs/RunbooksTab';
import OutboxTab from './tabs/OutboxTab';
import ArchiveTab from './tabs/ArchiveTab';
import CaseFrame from './tabs/CaseFrame';

export type BoardRoomTab = 'open' | 'inbox' | 'runbooks' | 'outbox' | 'archive';
const TAB_IDS: BoardRoomTab[] = ['open', 'inbox', 'runbooks', 'outbox', 'archive'];
/** Legacy Board Room and Issues tab ids → module tab. */
export const LEGACY_TABS: Record<string, BoardRoomTab> = { dailyops: 'open', communications: 'outbox', issues: 'inbox' };

export function resolveBoardRoomTab(raw: string | null, caseTab: string | null): BoardRoomTab {
  if (raw && (TAB_IDS as string[]).includes(raw)) return raw as BoardRoomTab;
  if (raw && LEGACY_TABS[raw]) return LEGACY_TABS[raw];
  if (caseTab === 'issues') return 'inbox';
  if (caseTab === 'archive') return 'archive';
  return 'open';
}

export default function BoardRoomModule() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view');
  const tab = resolveBoardRoomTab(params.get('tab'), params.get('caseTab'));
  const snap = useBoardRoomSnapshot();

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
    archive: 'The cases, requests and letters this board has closed, read-only, with the decision trail behind each one. Nothing here needs you.',
  }[tab];

  const tabs = [
    { id: 'open' as BoardRoomTab, label: 'Open', badge: cases.open.length || undefined, badgeTone: cases.overdue.length ? 'red' as const : 'navy' as const },
    { id: 'inbox' as BoardRoomTab, label: 'Inbox', badge: inbox.open.length || undefined, badgeTone: inbox.overdue.length ? 'red' as const : 'amber' as const },
    { id: 'runbooks' as BoardRoomTab, label: 'Runbooks', badge: runbooks.withOpenCase.length ? `${runbooks.withOpenCase.length} open` : undefined, badgeTone: 'teal' as const },
    { id: 'outbox' as BoardRoomTab, label: 'Outbox', badge: outbox.drafts.length ? `${outbox.drafts.length} draft${outbox.drafts.length === 1 ? '' : 's'}` : undefined, badgeTone: 'cyan' as const },
    { id: 'archive' as BoardRoomTab, label: 'Archive', badge: archive.length || undefined, badgeTone: 'ghost' as const },
  ];

  return (
    <div data-page="ux2-boardroom" className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ux2-ink">Board Room</h1>
            <p className="max-w-[760px] text-sm text-ux2-muted">{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {cases.overdue.length > 0 && <Chip tone="red">{cases.overdue.length} overdue</Chip>}
            <Button onClick={() => newCase()}>New case</Button>
          </div>
        </div>
        <PillTabs tabs={tabs} value={tab} onChange={id => go(id)} aria-label="Board Room sections" />
      </header>

      {tab === 'open' && <OpenTab snap={snap} onOpenCase={openCase} />}
      {tab === 'inbox' && <InboxTab snap={snap} onOpenCase={openCase} />}
      {tab === 'runbooks' && <RunbooksTab snap={snap} onOpenCase={openCase} onNewCase={newCase} />}
      {tab === 'outbox' && <OutboxTab snap={snap} onOpenCase={openCase} />}
      {tab === 'archive' && <ArchiveTab snap={snap} onOpenCase={openCase} />}
    </div>
  );
}
