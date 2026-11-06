/**
 * Home — the redesign's landing page, laid out as the Home › Feed and
 * Home › Calendar mocks.
 *
 *  Header   "Welcome in, {name}", the day and what it holds; the scores and
 *           the money as labelled chips; Feed | Calendar; the three numbers.
 *  Feed     Up next (task cards), Waiting on others (nudge rows), Upcoming
 *           obligations (dated rows) · the stewardship card with its
 *           dimension pages · Pulse. Owners: Up next, Building news, Quick
 *           actions · stewardship · Your account · Pulse.
 *  Calendar the month carousel, full width (`CalendarView`).
 *
 * Every card is a deep link into the production page that owns the record,
 * so completing a card uses the existing flow.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useTenantContext } from '@/components/TenantProvider';
import { fmt, cn } from '@/lib/formatters';
import { Chip, PillTabs } from '../components';
import type { ChipTone } from '../components';
import { attentionCounts, generateCards, type RunbookCard, type CardSet } from '../runbook/model';
import { contextFor, todayIso, useCardInput, useStoreSnapshot, type StoreSnapshot } from '../runbook/adapters';
import { useRunbookStore } from '../runbook/store';
import { boardEvents, stewardshipFor } from '../score/events';
import { bandFor, type Dimension, type ScoreEvent } from '../score/stewardship';
import { dayLabel } from './calendar';
import CalendarView from './CalendarView';
import StewardshipCard from './StewardshipCard';

const KIND_LABEL: Record<RunbookCard['kind'], string> = {
  filing: 'Filing', obligation: 'Obligation', 'case-step': 'Runbook', vote: 'Vote', meeting: 'Meeting', request: 'Request',
  delinquency: 'Collections', budget: 'Budget', insurance: 'Insurance', maintenance: 'Maintenance', setup: 'Setup', payment: 'Dues',
};
const DIM_TONE: Record<Dimension, ChipTone> = { Oversight: 'plum', Timeliness: 'teal', Compliance: 'sage', Reach: 'amber', Impact: 'cyan' };
const AVATAR: ChipTone[] = ['teal', 'plum', 'amber', 'sage', 'cyan'];

function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Welcome in';
}

function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '·';
}

/** Navigate to a card action. The Funds tab lives in the URL; the financial store's tab is kept in step for the embedded tab components. */
function useGo() {
  const navigate = useNavigate();
  const setActiveTab = useFinancialStore(s => s.setActiveTab);
  return (path: string) => {
    const m = path.match(/^\/(funds|financial)\?tab=([a-z]+)/);
    if (m) { setActiveTab(m[2]); navigate(`/funds?tab=${m[2]}`); return; }
    if (/^\/boardroom\?tab=runbook/.test(path)) { navigate('/building?tab=obligations&section=calendar'); return; }
    if (/^\/boardroom\?tab=duties/.test(path)) { navigate('/building?tab=obligations&section=duties'); return; }
    navigate(path);
  };
}

/** A mock `.card`: 22px radius, surface background, an 18px title. */
function Panel({ title, aside, children, label }: { title: string; aside?: React.ReactNode; children: React.ReactNode; label?: string }) {
  return (
    <section aria-label={label ?? title} className="flex flex-col gap-2.5 rounded-[22px] border border-ux2-line bg-ux2-surface px-[22px] py-5">
      <div className="flex flex-wrap items-center justify-between gap-2.5"><h2 className="m-0 text-lg font-medium text-ux2-ink">{title}</h2>{aside}</div>
      {children}
    </section>
  );
}

function dueChip(card: RunbookCard): { text: string; tone: ChipTone } {
  if (card.daysLeft !== undefined && card.daysLeft < 0) return { text: `${Math.abs(card.daysLeft)}d late`, tone: 'pink' };
  if (card.daysLeft === 0) return { text: 'Due today', tone: 'pink' };
  if (card.daysLeft === 1) return { text: 'Due tomorrow', tone: 'pink' };
  return { text: `${KIND_LABEL[card.kind]}${card.due ? ` · ${dayLabel(card.due)}` : ''}`, tone: 'ghost' };
}

/** A mock `.task`: chips, title, a line, the dark action pill. */
function TaskCard({ card, onHide }: { card: RunbookCard; onHide?: (id: string) => void }) {
  const go = useGo();
  const due = dueChip(card);
  return (
    <div data-card={card.id} className="flex min-h-[44px] flex-col gap-2 rounded-[14px] border border-ux2-line bg-white px-3.5 py-3 hover:border-ux2-navy">
      <div className="flex flex-wrap justify-between gap-2">
        <Chip tone={due.tone}>{due.text}</Chip>
        {card.dimension && <Chip tone={DIM_TONE[card.dimension]}>Scores · {card.dimension}</Chip>}
      </div>
      <div className="text-[17px] font-semibold leading-[1.3] text-ux2-ink">{card.title}</div>
      {card.why && <div className="text-[13px] text-ux2-muted">{card.why}</div>}
      <div className="mt-1 flex items-center gap-2">
        <button type="button" onClick={() => go(card.action.path)} className="inline-flex h-11 items-center justify-center rounded-full bg-ux2-navy px-[18px] text-[13px] font-semibold text-white hover:bg-ux2-navy/90">{card.action.label}</button>
        {onHide && <button type="button" aria-label={`Hide ${card.title}`} onClick={() => onHide(card.id)} className="grid h-9 w-9 place-items-center rounded-full text-ux2-dim hover:bg-ux2-surface hover:text-ux2-ink">×</button>}
      </div>
    </div>
  );
}

function UpNext({ cards, onHide, limit = 6 }: { cards: RunbookCard[]; onHide?: (id: string) => void; limit?: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? cards : cards.slice(0, limit);
  return (
    <Panel title="Up next" aside={<Chip tone={cards.length ? 'navy' : 'ghost'}>{cards.length} for you</Chip>}>
      {cards.length === 0 ? <p className="m-0 py-2 text-sm text-ux2-muted">Nothing needs you right now.</p> : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))]">
          {shown.map(c => <TaskCard key={c.id} card={c} onHide={onHide} />)}
        </div>
      )}
      {cards.length > limit && <button type="button" onClick={() => setAll(a => !a)} className="self-start text-xs font-semibold text-ux2-teal hover:underline">{all ? 'Show fewer' : `Show all ${cards.length}`}</button>}
    </Panel>
  );
}

/** A mock `.pulse` row: avatar, text, a chip on the right. */
function PulseRow({ avatar, tone, children, right }: { avatar: string; tone: ChipTone; children: React.ReactNode; right?: React.ReactNode }) {
  const bg = { teal: 'bg-ux2-teal-tint text-ux2-teal', plum: 'bg-ux2-plum-tint text-ux2-plum', amber: 'bg-ux2-amber-tint text-ux2-amber', sage: 'bg-ux2-sage-tint text-ux2-sage', cyan: 'bg-ux2-cyan text-ux2-navy' }[tone as 'teal' | 'plum' | 'amber' | 'sage' | 'cyan'] ?? 'bg-ux2-surface text-ux2-ink';
  return (
    <div className="flex items-center gap-2.5 rounded-[14px] border border-ux2-line bg-white px-3.5 py-3 text-[13px] leading-[1.4] text-ux2-ink">
      <span className={cn('grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-[11px] font-bold', bg)}>{avatar}</span>
      <span className="min-w-0 flex-1">{children}</span>
      {right}
    </div>
  );
}

function WaitingOnOthers({ cards }: { cards: RunbookCard[] }) {
  const go = useGo();
  return (
    <Panel title="Waiting on others">
      {cards.length === 0 ? <p className="m-0 py-2 text-sm text-ux2-muted">Nothing is waiting on anyone else.</p> : (
        <div className="flex flex-col gap-2">
          {cards.slice(0, 5).map((c, i) => {
            const who = c.title.split(' to ')[0];
            return (
              <div key={c.id} data-card={c.id}>
                <PulseRow avatar={initials(who)} tone={AVATAR[i % AVATAR.length]} right={<button type="button" onClick={() => go(c.action.path)} className="rounded-full"><Chip tone="ghost">{c.action.label}</Chip></button>}>
                  {c.title}{c.why ? <span className="text-ux2-muted"> · {c.why}</span> : null}
                </PulseRow>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function UpcomingObligations({ cards, total }: { cards: RunbookCard[]; total: number }) {
  const go = useGo();
  return (
    <Panel title="Upcoming obligations" label="Upcoming" aside={<button type="button" onClick={() => go('/building?tab=obligations')} className="rounded-full"><Chip tone="ghost" className="h-9 px-3.5">All {total} · Building ›</Chip></button>}>
      {cards.length === 0 ? <p className="m-0 py-2 text-sm text-ux2-muted">Nothing dated in the next 90 days.</p> : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))]">
          {cards.slice(0, 6).map(c => {
            const soon = c.daysLeft !== undefined && c.daysLeft <= 30;
            return (
              <button key={c.id} type="button" data-card={c.id} onClick={() => go(c.action.path)} className="flex min-h-[44px] items-center justify-between gap-2.5 rounded-[14px] border border-ux2-line bg-white px-3.5 py-3 text-left text-sm text-ux2-ink hover:border-ux2-navy">
                <span className="min-w-0"><span className={cn('mr-2 inline-block h-2 w-2 rounded-full', soon ? 'bg-ux2-red' : c.daysLeft !== undefined && c.daysLeft <= 60 ? 'bg-ux2-cyan' : 'bg-ux2-line-strong')} />{c.title}{c.why ? <span className="text-xs text-ux2-muted"> · {c.why}</span> : null}</span>
                <Chip tone={soon ? 'pink' : 'ghost'}>{c.due ? dayLabel(c.due) : ''}{c.daysLeft !== undefined ? ` · ${c.daysLeft} d` : ''}</Chip>
              </button>
            );
          })}
        </div>
      )}
      <div className="text-xs text-ux2-muted">Each deadline has a Runbook behind it; the steps show up in Up next as they come due</div>
    </Panel>
  );
}

function BuildingNews() {
  const go = useGo();
  const announcements = useComplianceStore(s => s.announcements);
  const recent = [...announcements].sort((a, b) => b.postedDate.localeCompare(a.postedDate)).slice(0, 3);
  return (
    <Panel title="Building news" aside={<button type="button" onClick={() => go('/community?tab=notices')} className="rounded-full"><Chip tone="ghost" className="h-9 px-3.5">All · Community ›</Chip></button>}>
      {recent.length === 0 ? <p className="m-0 py-2 text-sm text-ux2-muted">Nothing posted yet.</p> : (
        <div className="flex flex-col gap-2">
          {recent.map(a => (
            <button key={a.id} type="button" onClick={() => go('/community?tab=notices')} className="flex min-h-[44px] items-center justify-between gap-2.5 rounded-[14px] border border-ux2-line bg-white px-3.5 py-3 text-left text-sm text-ux2-ink hover:border-ux2-navy">
              <span className="min-w-0 truncate">{a.title}<span className="text-xs text-ux2-muted"> · {a.category}{a.pinned ? ' · pinned' : ''} · {a.postedBy}</span></span>
              <Chip tone="ghost">{dayLabel(a.postedDate.slice(0, 10))}</Chip>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

/** Pulse: the latest scored events across the board (or the owner's own), with the dimension they moved. */
function Pulse({ snapshot, events, group, today }: { snapshot: StoreSnapshot; events: ScoreEvent[]; group: 'board' | 'owners'; today: string }) {
  const items = useMemo(() => {
    const rows: { who: string; event: ScoreEvent }[] = group === 'board'
      ? snapshot.board.flatMap(b => boardEvents(snapshot, { name: b.name, officerTitle: b.role }).map(event => ({ who: b.name, event })))
      : events.map(event => ({ who: snapshot.viewer.name, event }));
    const seen = new Set<string>();
    return rows
      .filter(r => r.event.date <= today && r.event.earned > 0)
      .sort((a, b) => b.event.date.localeCompare(a.event.date))
      .filter(r => { const k = `${r.who}:${r.event.id}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 4);
  }, [snapshot, events, group, today]);
  if (items.length === 0) return null;
  return (
    <Panel title="Pulse">
      <div className="flex flex-col gap-2">
        {items.map(({ who, event }) => (
          <PulseRow key={`${who}:${event.id}`} avatar={initials(who)} tone={DIM_TONE[event.dimension]} right={<Chip tone={DIM_TONE[event.dimension]}>+{event.dimension}</Chip>}>
            <strong>{who.split(' ')[0]}</strong> {event.label.toLowerCase().startsWith(who.split(' ')[0].toLowerCase()) ? event.label : `· ${event.label}`}{event.reason ? <span className="text-ux2-muted"> · {event.reason.toLowerCase()}</span> : null}<span className="text-ux2-muted"> · {dayLabel(event.date)}</span>
          </PulseRow>
        ))}
      </div>
    </Panel>
  );
}

/** A labelled 44px chip from the mock's header. */
function Stat({ label, tone, className, children }: { label: string; tone: ChipTone; className?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start">
      <div className="mb-2 h-4 whitespace-nowrap text-[13px] leading-4 text-ux2-muted">{label}</div>
      <Chip tone={tone} className={cn('h-11 px-5 !text-sm', className)}>{children}</Chip>
    </div>
  );
}

export default function HomePage() {
  const today = todayIso();
  const snapshot = useStoreSnapshot(today);
  const input = useCardInput(snapshot);
  const viewer = snapshot.viewer;
  const tenant = useTenantContext();
  const go = useGo();

  const runbook = useRunbookStore();
  const hidden = useMemo(() => runbook.hiddenFor(viewer.id, today), [runbook.cards, viewer.id, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const set: CardSet = useMemo(() => generateCards(input, contextFor(snapshot, hidden)), [input, snapshot, hidden]);
  const hide = (id: string) => runbook.hide(viewer.id, id);
  const counts = attentionCounts(set);

  const score = useMemo(() => stewardshipFor(snapshot), [snapshot]);
  const fin = useFinancialStore();
  const isOwner = viewer.role === 'RESIDENT';
  const boardSide = !isOwner;

  const kpis = useMemo(() => {
    const reserveNeeded = fin.reserveItems.reduce((s, i) => s + i.estimatedCost, 0);
    const reserveFunded = fin.reserveItems.reduce((s, i) => s + i.currentFunding, 0);
    const reservePct = reserveNeeded > 0 ? Math.round((reserveFunded / reserveNeeded) * 100) : 0;
    const income = fin.getIncomeMetrics() as { collectionRate: number; delinquentUnits: number };
    const collected = Number.isFinite(income.collectionRate) ? Math.round(income.collectionRate) : 0;
    const scored = snapshot.obligations.filter(o => !o.autoPass);
    const checklist = scored.length ? Math.round((scored.filter(o => snapshot.completions[o.id]).length / scored.length) * 100) : 0;
    return { reservePct, collected, checklist, obligationsTotal: scored.length };
  }, [fin.reserveItems, fin.units, snapshot.obligations, snapshot.completions]); // eslint-disable-line react-hooks/exhaustive-deps

  const myUnits = fin.units.filter(u => viewer.linkedUnits.includes(u.number));
  const myBalance = myUnits.reduce((s, u) => s + u.balance + u.lateFees.filter(f => !f.waived).reduce((t, f) => t + f.amount, 0), 0);
  const dated = useMemo(() => [...set.forYou, ...set.waitingOnOthers, ...set.upcoming].filter(c => c.due), [set]);
  const dueSoon = useMemo(() => dated.filter(c => (c.kind === 'filing' || c.kind === 'obligation') && c.daysLeft !== undefined && c.daysLeft >= 0 && c.daysLeft <= 60).length, [dated]);
  const [params, setParams] = useSearchParams();
  const view: 'feed' | 'calendar' = params.get('view') === 'calendar' ? 'calendar' : 'feed';
  const setView = (v: string) => setParams(prev => { const p = new URLSearchParams(prev); if (v === 'calendar') p.set('view', 'calendar'); else p.delete('view'); return p; }, { replace: true });

  const overdue = set.forYou.filter(c => c.status === 'overdue').length;
  const subline = [shortDate(today), `${set.forYou.length} thing${set.forYou.length === 1 ? '' : 's'} for you`, overdue ? `${overdue} overdue` : 'nothing overdue'].join(' · ');
  const nextDues = myUnits[0] ? `next ${fmt(myUnits[0].monthlyFee)} due on the ${snapshot.hoaDueDay}${snapshot.hoaDueDay === 1 ? 'st' : snapshot.hoaDueDay === 2 ? 'nd' : snapshot.hoaDueDay === 3 ? 'rd' : 'th'}` : '';

  const numbers: [number, string][] = boardSide
    ? [[set.forYou.length, 'things for you'], [dueSoon, 'obligations due in 60 days'], [kpis.checklist, 'board checklist']]
    : [[set.forYou.length, 'things for you'], [counts.votes, 'votes open'], [counts.newRequests, 'requests open']];

  const stewardship = (
    <StewardshipCard you={score.you} events={score.events} buildingDims={score.building.dims} buildingTotal={score.building.total} group={score.group} />
  );

  return (
    <div data-page="ux2-home" className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-[18px]">
          <div>
            <h1 className="m-0 font-display text-[36px] font-medium leading-tight tracking-[-0.01em] text-ux2-ink">{greeting()}, <span className="text-ux2-teal">{viewer.name.split(' ')[0]}</span></h1>
            <div className="mt-1.5 text-sm text-ux2-muted">{subline} · {tenant.name}</div>
          </div>
          <div className="flex flex-wrap items-start gap-2.5" aria-label="At a glance">
            <Stat label="Your stewardship" tone="pink">{score.you.total} · {bandFor(score.you.total)}</Stat>
            <Stat label="Building stewardship" tone="navy">{score.building.total} · {bandFor(score.building.total)}</Stat>
            {boardSide && <Stat label="Reserves" tone="ghost" className={kpis.reservePct < 50 ? '!text-ux2-red' : '!text-ux2-teal'}>{kpis.reservePct}%</Stat>}
            {boardSide && <Stat label="Collected" tone="ghost" className={kpis.collected < 90 ? '!text-ux2-red' : '!text-ux2-teal'}>{kpis.collected}%</Stat>}
            {isOwner && <Stat label="Your account" tone="ghost" className={myBalance > 0 ? '!text-ux2-red' : '!text-ux2-teal'}>{fmt(myBalance)} · {myBalance > 0 ? 'Due' : 'Current'}</Stat>}
          </div>
        </div>
        <div className="flex flex-col items-start gap-[18px] lg:items-end">
          <PillTabs size="filter" aria-label="Home views" value={view} onChange={setView} tabs={[{ id: 'feed', label: 'Feed' }, { id: 'calendar', label: 'Calendar' }]} />
          <div className="flex flex-wrap gap-7">
            {numbers.map(([n, label]) => (
              <div key={label}><div className="font-display text-[44px] font-medium leading-none tracking-[-0.03em] text-ux2-ink">{n}</div><div className="text-[13px] text-ux2-muted">{label}</div></div>
            ))}
          </div>
        </div>
      </header>

      {view === 'calendar' ? (
        <CalendarView cards={dated} today={today} forOwner={isOwner} />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <UpNext cards={set.forYou} onHide={hide} />
            {boardSide ? (
              <>
                <WaitingOnOthers cards={set.waitingOnOthers} />
                <UpcomingObligations cards={set.upcoming} total={kpis.obligationsTotal} />
              </>
            ) : (
              <>
                <BuildingNews />
                <Panel title="Quick">
                  <div className="flex flex-wrap gap-2">
                    {[['Submit a request', '/community?tab=requests'], ['Reserve an amenity', '/community?tab=amenities'], ['My documents', '/my-unit'], ['Pay', '/my-unit/pay']].map(([label, path]) => (
                      <button key={label} type="button" onClick={() => go(path)} className="rounded-full"><Chip tone="ghost" className="h-11 px-5 !text-sm">{label}</Chip></button>
                    ))}
                  </div>
                </Panel>
              </>
            )}
          </div>
          <aside className="flex min-w-0 flex-col gap-4">
            {stewardship}
            {isOwner && (
              <Panel title="Your account" aside={<Chip tone={myBalance > 0 ? 'pink' : 'sage'}>{myBalance > 0 ? 'Balance due' : 'Current'}</Chip>}>
                <div className="font-display text-[44px] font-medium leading-none tracking-[-0.03em] text-ux2-ink">{fmt(myBalance)}</div>
                <div className="text-[13px] text-ux2-muted">{myUnits.length ? `Unit ${myUnits.map(u => u.number).join(', ')}` : 'No unit linked'}{nextDues ? ` · ${nextDues}` : ''}</div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => go('/my-unit/pay')} className="inline-flex h-11 items-center justify-center rounded-full bg-ux2-navy px-[18px] text-[13px] font-semibold text-white">{myBalance > 0 ? 'Pay' : 'Pay ahead'}</button>
                  <button type="button" onClick={() => go('/my-unit')} className="rounded-full"><Chip tone="ghost" className="h-11 px-5 !text-sm">Statements</Chip></button>
                </div>
              </Panel>
            )}
            <Pulse snapshot={snapshot} events={score.events} group={score.group} today={today} />
          </aside>
        </div>
      )}
    </div>
  );
}
