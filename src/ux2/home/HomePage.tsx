/**
 * Home — the redesign's landing page (ux2.home).
 *
 * Replaces the role dashboards with one feed: what needs you now, what waits
 * on others, what is coming up, your stewardship card, the building's numbers
 * and a four-month calendar. Every card is a deep link into the production
 * page that owns the record, so completing a card uses the existing flow.
 *
 *  Board member / manager: Up next · Waiting on others · Upcoming · Stewardship ·
 *                           Reserves / Collected / Open cases · Calendar · Pulse
 *  Owner:                   Balance + Pay · Up next · Stewardship · Calendar · Pulse
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useTenantContext } from '@/components/TenantProvider';
import { fmt, cn } from '@/lib/formatters';
import { Button, Card, Chip, Inner, SectionLabel, Tile, TileRow } from '../components';
import type { ChipTone } from '../components';
import StewardshipRadar from '../components/StewardshipRadar';
import { attentionCounts, generateCards, type RunbookCard, type CardSet } from '../runbook/model';
import { contextFor, todayIso, useCardInput, useStoreSnapshot } from '../runbook/adapters';
import { useRunbookStore } from '../runbook/store';
import { stewardshipFor } from '../score/events';
import { DIMENSIONS } from '../score/stewardship';
import { dayLabel, groupByMonth } from './calendar';

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

function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
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
    <li data-card={card.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4 border-b border-ux2-line last:border-b-0">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Chip tone={STATUS_TONE[card.status]} className="mt-0.5 shrink-0">
          {late ? `${Math.abs(card.daysLeft!)}d late` : card.daysLeft !== undefined && card.status !== 'waiting' ? (card.daysLeft === 0 ? 'Today' : `${card.daysLeft}d`) : STATUS_LABEL[card.status]}
        </Chip>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-ux2-ink">{card.title}</div>
          {card.why && <div className="truncate text-xs text-ux2-muted">{card.why}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2 pl-[calc(theme(spacing.3)+56px)] sm:pl-0">
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

function Calendar({ cards, today }: { cards: RunbookCard[]; today: string }) {
  const groups = useMemo(() => groupByMonth(cards, today), [cards, today]);
  const [i, setI] = useState(0);
  const go = useGo();
  return (
    <Card aria-label="Calendar">
      <div className="flex items-center justify-between">
        <SectionLabel>Next four months</SectionLabel>
        <div className="flex gap-1">
          <button type="button" aria-label="Earlier month" disabled={i === 0} onClick={() => setI(x => Math.max(0, x - 1))} className="h-8 w-8 rounded-full border border-ux2-line bg-white disabled:opacity-40">‹</button>
          <button type="button" aria-label="Later month" disabled={i >= groups.length - 1} onClick={() => setI(x => Math.min(groups.length - 1, x + 1))} className="h-8 w-8 rounded-full border border-ux2-line bg-white disabled:opacity-40">›</button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {groups.map((g, gi) => (
          <Inner key={g.key} className={cn('min-h-[120px]', gi !== i && 'hidden md:block')} data-month={g.key}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-ux2-ink">{g.label}</span>
              <Chip tone={g.cards.length ? 'cyan' : 'ghost'}>{g.cards.length}</Chip>
            </div>
            {g.cards.length === 0 ? (
              <div className="text-xs text-ux2-dim">Nothing dated</div>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {g.cards.slice(0, 6).map(c => (
                  <li key={c.id}>
                    <button type="button" onClick={() => go(c.action.path)} className="flex w-full items-baseline gap-2 text-left hover:underline">
                      <span className={cn('w-12 shrink-0 text-[11px] font-semibold', c.status === 'overdue' ? 'text-ux2-red-ink' : 'text-ux2-muted')}>{dayLabel(c.due!)}</span>
                      <span className="truncate text-xs text-ux2-ink">{c.title}</span>
                    </button>
                  </li>
                ))}
                {g.cards.length > 6 && <li className="text-[11px] text-ux2-dim">+{g.cards.length - 6} more</li>}
              </ul>
            )}
          </Inner>
        ))}
      </div>
    </Card>
  );
}

function Pulse() {
  const go = useGo();
  const meetings = useMeetingsStore(s => s.meetings);
  const filings = useComplianceStore(s => s.filings);
  const communications = useComplianceStore(s => s.communications);
  const cases = useIssuesStore(s => s.cases);
  const items = useMemo(() => {
    const out: { icon: string; text: string; date: string; path: string }[] = [];
    meetings.filter(m => m.status === 'COMPLETED').slice(0, 2).forEach(m => out.push({ icon: '🗓', text: `${m.title} held`, date: m.date, path: '/community?tab=meetings' }));
    filings.filter(f => f.status === 'filed').slice(0, 2).forEach(f => out.push({ icon: '✅', text: `${f.name} filed`, date: f.filedDate || '', path: '/boardroom?tab=runbook' }));
    communications.filter(c => c.status === 'sent').slice(0, 2).forEach(c => out.push({ icon: '📨', text: c.subject, date: c.date, path: '/boardroom?tab=communications' }));
    cases.filter(c => c.status === 'closed' && c.completedAt).slice(0, 2).forEach(c => out.push({ icon: '📁', text: `${c.title} closed`, date: c.completedAt!.slice(0, 10), path: `/issues?view=case:${c.id}` }));
    return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  }, [meetings, filings, communications, cases]);
  if (items.length === 0) return null;
  return (
    <Card aria-label="Pulse">
      <SectionLabel>Pulse</SectionLabel>
      <ul className="m-0 list-none divide-y divide-ux2-line p-0">
        {items.map((a, i) => (
          <li key={i}>
            <button type="button" onClick={() => go(a.path)} className="flex w-full items-center gap-3 py-2 text-left hover:underline">
              <span aria-hidden>{a.icon}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-ux2-ink">{a.text}</span>
              <span className="text-xs text-ux2-dim">{a.date ? dayLabel(a.date) : ''}</span>
            </button>
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
  const youDims = score.you.dimensions.map(d => d.pct);

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

  const radar = (
    <StewardshipRadar
      you={youDims}
      total={score.you.total}
      buildingAvg={score.building.dims}
      buildingTotal={score.building.total}
    />
  );

  return (
    <div data-page="ux2-home" className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <div>
          <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ux2-ink">
            {greeting()}, {viewer.name.split(' ')[0]}
          </h1>
          <p className="text-sm text-ux2-muted">{longDate(today)} · {tenant.name}</p>
        </div>
        <AttentionChips set={set} role={viewer.role} />
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Stewardship first in DOM so phones see it at the top; desktop moves it to the right column. */}
        <aside className="flex flex-col gap-4 lg:order-2">
          {radar}
          {isOwner && (
            <Tile
              tone={myBalance > 0 ? 'navy' : 'teal'}
              label="Balance"
              meta={myUnits.length ? `Unit ${myUnits.map(u => u.number).join(', ')}` : undefined}
              value={fmt(myBalance)}
              sub={myBalance > 0 ? 'Pay by card or bank transfer' : 'Paid up · nothing due'}
              className="min-h-[180px]"
              action={<TileAction label={myBalance > 0 ? 'Pay now' : 'View statement'} button={myBalance > 0 ? 'Pay' : 'Open'} dark onClick={() => go('/my-unit/pay')} />}
            />
          )}
          <Card className="gap-1" aria-label="Stewardship by dimension">
            <SectionLabel>By dimension</SectionLabel>
            <ul className="m-0 list-none p-0">
              {score.you.dimensions.map((d, i) => (
                <li key={d.dimension} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-ux2-ink">{DIMENSIONS[i]}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-ux2-dim">avg {score.building.dims[i] ?? 0}</span>
                    <b className="w-8 text-right font-semibold text-ux2-ink">{d.pct}</b>
                  </span>
                </li>
              ))}
            </ul>
            <p className="pt-1 text-xs text-ux2-dim">Scored on the last twelve months · {score.events.length} events</p>
          </Card>

        </aside>

        <div className="flex flex-col gap-5 lg:col-span-2 lg:order-1">
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
            <Feed title="Waiting on others" cards={set.waitingOnOthers} empty="Nothing is waiting on anyone else." limit={4} />
            <Feed title="Upcoming" cards={set.upcoming} empty="Nothing dated in the next 90 days." limit={4} />
          </Card>
        </div>
      </div>

      <Calendar cards={dated} today={today} />
      <Pulse />
    </div>
  );
}
