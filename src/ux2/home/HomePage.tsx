/**
 * Home — the redesign's landing page.
 *
 * One feed: what needs you now, what waits on others, what is coming up,
 * the building's numbers, your stewardship card (the radar, with a page per
 * dimension behind it), your account, building
 * news and the pulse. Feed | Calendar flips the feed for the month
 * carousel of everything dated (`CalendarView`). Every card is a deep link
 * into the production page that owns the record, so completing a card uses
 * the existing flow.
 *
 *  Board member / manager: Reserves / Collected / Open cases · Up next · Waiting on others ·
 *                           Upcoming · Stewardship · Your account · Building news · Pulse
 *  Owner:                   Up next · Stewardship · Your account · Building news · Pulse
 */
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useTenantContext } from '@/components/TenantProvider';
import { fmt, cn } from '@/lib/formatters';
import { Button, Card, Chip, Inner, PillTabs, SectionLabel, Tile, TileRow } from '../components';
import type { ChipTone } from '../components';
import StewardshipCard from './StewardshipCard';
import { attentionCounts, generateCards, type RunbookCard, type CardSet } from '../runbook/model';
import { contextFor, todayIso, useCardInput, useStoreSnapshot, type StoreSnapshot } from '../runbook/adapters';
import { useRunbookStore } from '../runbook/store';
import { boardEvents, stewardshipFor } from '../score/events';
import { type Dimension, type ScoreEvent } from '../score/stewardship';
import { dayLabel } from './calendar';
import CalendarView from './CalendarView';
import SetupCard from '../setup/SetupCard';

const STATUS_TONE: Record<RunbookCard['status'], ChipTone> = {
  overdue: 'red',
  due: 'navy',
  upcoming: 'cyan',
  waiting: 'ghost',
  done: 'sage',
};

const STATUS_LABEL: Record<RunbookCard['status'], string> = {
  overdue: 'Overdue',
  due: 'Due',
  upcoming: 'Upcoming',
  waiting: 'Waiting',
  done: 'Done',
};

const DIM_TONE: Record<Dimension, ChipTone> = { Oversight: 'plum', Timeliness: 'teal', Compliance: 'sage', Reach: 'amber', Impact: 'cyan' };

function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '·';
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/** Navigate to a card action. The Funds tab lives in the URL; the financial store's tab is kept in step for the embedded tab components. */
function useGo() {
  const navigate = useNavigate();
  const setActiveTab = useFinancialStore(s => s.setActiveTab);
  return (path: string) => {
    const m = path.match(/^\/(funds|financial)\?tab=([a-z]+)/);
    if (m) { setActiveTab(m[2]); navigate(`/funds?tab=${m[2]}`); return; }
    // Obligations and filings live on Building › Obligations.
    if (/^\/boardroom\?tab=runbook/.test(path)) { navigate('/building?tab=obligations&section=calendar'); return; }
    if (/^\/boardroom\?tab=duties/.test(path)) { navigate('/building?tab=obligations&section=duties'); return; }
    navigate(path);
  };
}

/** The action row inside a tile. Buttons inside dark tiles need their own colours (cn does not merge Tailwind classes). */
function TileAction({ label, button, dark, onClick }: { label: string; button: string; dark?: boolean; onClick: () => void }) {
  return (
    <>
      <span>{label}</span>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'inline-flex h-9 items-center justify-center rounded-full px-3.5 text-xs font-semibold transition-colors',
          dark ? 'border border-white/40 text-white hover:bg-white/10' : 'border border-ux2-line-strong bg-white text-ux2-ink hover:bg-ux2-surface',
        )}
      >
        {button}
      </button>
    </>
  );
}

function CardRow({ card, onHide }: { card: RunbookCard; onHide?: (id: string) => void }) {
  const go = useGo();
  const late = card.daysLeft !== undefined && card.daysLeft < 0;
  return (
    <li data-card={card.id} className="flex flex-col gap-2.5 py-3 sm:flex-row sm:items-center sm:gap-4 border-b border-ux2-line last:border-b-0">
      {/* Phone: chip, then the full title, then the actions on one line. Desktop: one row. */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
        <Chip tone={STATUS_TONE[card.status]} className="self-start sm:mt-0.5 sm:shrink-0">
          {late ? `${Math.abs(card.daysLeft!)}d late` : card.daysLeft !== undefined && card.status !== 'waiting' ? (card.daysLeft === 0 ? 'Today' : `${card.daysLeft}d`) : STATUS_LABEL[card.status]}
        </Chip>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold leading-snug text-ux2-ink sm:truncate">{card.title}</div>
          {card.why && <div className="text-xs text-ux2-muted sm:truncate">{card.why}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {card.points !== undefined && card.dimension && (
          <Chip tone="teal" title={`${card.dimension} · ${card.points} points when done`}>+{card.points}</Chip>
        )}
        <Button size="sm" onClick={() => go(card.action.path)}>{card.action.label}</Button>
        {onHide && (
          <button
            type="button"
            aria-label={`Hide ${card.title}`}
            onClick={() => onHide(card.id)}
            className="grid h-9 w-9 place-items-center rounded-full text-ux2-dim hover:bg-ux2-surface hover:text-ux2-ink"
          >
            ×
          </button>
        )}
      </div>
    </li>
  );
}

function Feed({ title, cards, empty, onHide, limit }: { title: string; cards: RunbookCard[]; empty: string; onHide?: (id: string) => void; limit?: number }) {
  const [all, setAll] = useState(false);
  const shown = limit && !all ? cards.slice(0, limit) : cards;
  return (
    <section aria-label={title}>
      <div className="mb-1 flex items-center justify-between">
        <SectionLabel>{title}</SectionLabel>
        <Chip tone={cards.length > 0 ? 'navy' : 'ghost'}>{cards.length}</Chip>
      </div>
      {cards.length === 0 ? (
        <p className="py-3 text-sm text-ux2-muted">{empty}</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {shown.map(c => <CardRow key={c.id} card={c} onHide={onHide} />)}
        </ul>
      )}
      {limit && cards.length > limit && (
        <button type="button" onClick={() => setAll(a => !a)} className="mt-2 text-xs font-semibold text-ux2-teal hover:underline">
          {all ? 'Show fewer' : `Show all ${cards.length}`}
        </button>
      )}
    </section>
  );
}

function AttentionChips({ set, role }: { set: CardSet; role: string }) {
  const go = useGo();
  const counts = attentionCounts(set);
  const chips: { label: string; count: number; tone: ChipTone; path: string }[] = [];
  if (counts.overdueFilings) chips.push({ label: 'Overdue', count: counts.overdueFilings, tone: 'red', path: '/boardroom?tab=runbook' });
  if (counts.urgentCases) chips.push({ label: 'Urgent cases', count: counts.urgentCases, tone: 'red', path: '/issues' });
  if (counts.newRequests) chips.push({ label: role === 'RESIDENT' ? 'Open requests' : 'New requests', count: counts.newRequests, tone: 'amber', path: role === 'RESIDENT' ? '/community?tab=requests' : '/issues' });
  if (counts.insuranceExpiring) chips.push({ label: 'Insurance expiring', count: counts.insuranceExpiring, tone: 'amber', path: '/building?tab=insurance' });
  if (counts.votes) chips.push({ label: 'Votes open', count: counts.votes, tone: 'plum', path: '/community?tab=votes' });
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2" aria-label="Needs attention">
      {chips.map(c => (
        <button key={c.label} type="button" onClick={() => go(c.path)} className="rounded-full">
          <Chip tone={c.tone}>{c.label} · {c.count}</Chip>
        </button>
      ))}
    </div>
  );
}

/** Your account: the balance on the units you hold, when the next dues are due, Pay and Statements. */
function YourAccount({ units, balance, dueDay }: { units: { number: string; monthlyFee: number }[]; balance: number; dueDay: number }) {
  const go = useGo();
  return (
    <Card aria-label="Your account">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>Your account</SectionLabel>
        <Chip tone={balance > 0 ? 'red' : 'sage'}>{balance > 0 ? 'Balance due' : 'Current'}</Chip>
      </div>
      <div className="font-display text-[34px] font-semibold leading-none tracking-[-0.02em] text-ux2-ink">{fmt(balance)}</div>
      <div className="text-xs text-ux2-muted">Unit {units.map(u => u.number).join(', ')} · next {fmt(units.reduce((s, u) => s + u.monthlyFee, 0))} due on the {ordinal(dueDay)}</div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => go('/my-unit/pay')}>{balance > 0 ? 'Pay' : 'Pay ahead'}</Button>
        <Button size="sm" variant="ghost" onClick={() => go('/my-unit')}>Statements</Button>
      </div>
    </Card>
  );
}

/** Building news: the latest notices from Community. */
function BuildingNews() {
  const go = useGo();
  const announcements = useComplianceStore(s => s.announcements);
  const recent = [...announcements].sort((a, b) => b.postedDate.localeCompare(a.postedDate)).slice(0, 3);
  return (
    <Card aria-label="Building news">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>Building news</SectionLabel>
        <button type="button" onClick={() => go('/community?tab=notices')} className="text-xs font-semibold text-ux2-teal hover:underline">All ›</button>
      </div>
      {recent.length === 0 ? <p className="text-sm text-ux2-muted">Nothing posted yet.</p> : (
        <ul className="m-0 list-none divide-y divide-ux2-line p-0">
          {recent.map(a => (
            <li key={a.id}>
              <button type="button" onClick={() => go('/community?tab=notices')} className="flex w-full items-center gap-3 py-2 text-left hover:underline">
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ux2-ink">{a.title}</span><span className="block truncate text-xs text-ux2-muted">{a.category}{a.pinned ? ' · pinned' : ''} · {a.postedBy}</span></span>
                <span className="shrink-0 text-xs text-ux2-dim">{dayLabel(a.postedDate.slice(0, 10))}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Pulse: the latest scored events across the board (or the owner's own), with the dimension each one moved. */
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
  const bg: Record<Dimension, string> = { Timeliness: 'bg-ux2-teal-tint text-ux2-teal', Oversight: 'bg-ux2-plum-tint text-ux2-plum', Reach: 'bg-ux2-amber-tint text-ux2-amber', Compliance: 'bg-ux2-sage-tint text-ux2-sage', Impact: 'bg-ux2-cyan text-ux2-navy' };
  return (
    <Card aria-label="Pulse">
      <SectionLabel>Pulse</SectionLabel>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items.map(({ who, event }) => (
          <li key={`${who}:${event.id}`}>
            <Inner className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] leading-[1.4] text-ux2-ink">
              <span className={cn('grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-[11px] font-bold', bg[event.dimension])}>{initials(who)}</span>
              <span className="min-w-0 flex-1 basis-[180px]"><strong>{who.split(' ')[0]}</strong> · {event.label}{event.reason ? <span className="text-ux2-muted"> · {event.reason.toLowerCase()}</span> : null}<span className="text-ux2-muted"> · {dayLabel(event.date)}</span></span>
              <Chip tone={DIM_TONE[event.dimension]}>+{event.dimension}</Chip>
            </Inner>
          </li>
        ))}
      </ul>
    </Card>
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
  const set = useMemo(() => generateCards(input, contextFor(snapshot, hidden)), [input, snapshot, hidden]);
  const hide = (id: string) => runbook.hide(viewer.id, id);

  const score = useMemo(() => stewardshipFor(snapshot), [snapshot]);

  const fin = useFinancialStore();
  const isOwner = viewer.role === 'RESIDENT';
  const boardSide = viewer.role === 'BOARD_MEMBER' || viewer.role === 'PROPERTY_MANAGER' || viewer.role === 'PLATFORM_ADMIN';

  const kpis = useMemo(() => {
    const reserveNeeded = fin.reserveItems.reduce((s, i) => s + i.estimatedCost, 0);
    const reserveFunded = fin.reserveItems.reduce((s, i) => s + i.currentFunding, 0);
    const reservePct = reserveNeeded > 0 ? Math.round((reserveFunded / reserveNeeded) * 100) : 0;
    const income = fin.getIncomeMetrics() as { collectionRate: number; monthlyCollected: number; monthlyExpected: number; delinquentUnits: number };
    const openCases = snapshot.cases.filter(c => c.status === 'open').length;
    return { reservePct, reserveFunded, income, openCases };
  }, [fin.reserveItems, fin.units, snapshot.cases]); // eslint-disable-line react-hooks/exhaustive-deps

  const myUnits = fin.units.filter(u => viewer.linkedUnits.includes(u.number));
  const myBalance = myUnits.reduce((s, u) => s + u.balance + u.lateFees.filter(f => !f.waived).reduce((t, f) => t + f.amount, 0), 0);
  const dated = useMemo(() => [...set.forYou, ...set.waitingOnOthers, ...set.upcoming].filter(c => c.due), [set]);
  const [params, setParams] = useSearchParams();
  const view: 'feed' | 'calendar' = params.get('view') === 'calendar' ? 'calendar' : 'feed';
  const setView = (v: string) => setParams(prev => { const p = new URLSearchParams(prev); if (v === 'calendar') p.set('view', 'calendar'); else p.delete('view'); return p; }, { replace: true });

  return (
    <div data-page="ux2-home" className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ux2-ink">
              {greeting()}, {viewer.name.split(' ')[0]}
            </h1>
            <p className="text-sm text-ux2-muted">{longDate(today)} · {tenant.name}</p>
          </div>
          <PillTabs size="filter" aria-label="Home views" value={view} onChange={setView} tabs={[{ id: 'feed', label: 'Feed', badge: set.forYou.length || undefined }, { id: 'calendar', label: 'Calendar' }]} />
        </div>
        <AttentionChips set={set} role={viewer.role} />
      </header>
      {/* While the building is setting up: the plum setup card (documents first). */}
      <SetupCard />

      {view === 'calendar' ? (
        <CalendarView cards={dated} today={today} forOwner={isOwner} />
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
          {/* Phones read top to bottom: the stewardship card, then the feed, then the other widgets. Desktop places the feed left and stacks the widgets on the right. */}
          <aside className="lg:col-start-3 lg:row-start-1">
            {/* The mock's stewardship card: the radar, then a page per dimension behind the arrows and dots. */}
            <StewardshipCard you={score.you} events={score.events} buildingDims={score.building.dims} buildingTotal={score.building.total} group={score.group} />
          </aside>

          <div className="flex flex-col gap-5 lg:col-span-2 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            {boardSide && (
              <TileRow>
                <Tile
                  tone={kpis.reservePct < 50 ? 'red' : 'grey'}
                  label="Reserves funded"
                  value={kpis.reservePct}
                  unit="%"
                  sub={`${fmt(kpis.reserveFunded)} set aside`}
                  className="min-h-[150px]"
                  action={<TileAction label="Reserve plan" button="Open" dark={kpis.reservePct < 50} onClick={() => go('/funds?tab=reserves')} />}
                />
                <Tile
                  tone="teal"
                  label="Collected"
                  value={Number.isFinite(kpis.income.collectionRate) ? kpis.income.collectionRate : 0}
                  unit="%"
                  sub={`${kpis.income.delinquentUnits} unit${kpis.income.delinquentUnits === 1 ? '' : 's'} behind`}
                  className="min-h-[150px]"
                  action={<TileAction label="Unit ledger" button="Open" dark onClick={() => go('/funds?tab=units')} />}
                />
                <Tile
                  tone="grey"
                  label="Open cases"
                  value={kpis.openCases}
                  sub={`${set.waitingOnOthers.length} waiting on others`}
                  className="min-h-[150px]"
                  action={<TileAction label="Board Room" button="Open" onClick={() => go('/issues')} />}
                />
              </TileRow>
            )}

            <Card aria-label="Your runbook">
              <Feed title="Up next" cards={set.forYou} empty="Nothing needs you right now." onHide={hide} limit={6} />
              {boardSide && <Feed title="Waiting on others" cards={set.waitingOnOthers} empty="Nothing is waiting on anyone else." limit={4} />}
              <Feed title="Upcoming" cards={set.upcoming} empty="Nothing dated in the next 90 days." limit={4} />
            </Card>
          </div>

          <aside className="flex flex-col gap-4 lg:col-start-3 lg:row-start-2">
            {myUnits.length > 0 && <YourAccount units={myUnits} balance={myBalance} dueDay={snapshot.hoaDueDay} />}
            <BuildingNews />
            <Pulse snapshot={snapshot} events={score.events} group={score.group} today={today} />
          </aside>
        </div>
      )}
    </div>
  );
}
