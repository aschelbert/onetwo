import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FLBudget from '@/features/financial/tabs/FLBudget';
import FLReserves from '@/features/financial/tabs/FLReserves';
import { useFinancialStore } from '@/store/useFinancialStore';
import { fmt } from '@/lib/formatters';
import { Button, Card, Chip, Inner, SectionLabel, TileSwitcher, type TileSection } from '../../components';
import { budgetSummary, nextYearScenarios, reserveSummary, type FundsSnapshot } from '../metrics';

type Section = 'budget' | 'draft' | 'reserves';
const SECTIONS: Section[] = ['budget', 'draft', 'reserves'];

/** The reserve contribution lever: today, recommended, or a custom monthly amount. Same store action as the Budget editor. */
export function ReserveLever({ snap }: { snap: FundsSnapshot }) {
  const res = reserveSummary(snap);
  const setAnnual = useFinancialStore(s => s.setAnnualReserveContribution);
  const [custom, setCustom] = useState('');
  const choices = [
    { id: 'today', label: 'Today', monthly: res.monthly, note: `${fmt(snap.annualReserveContribution)} a year` },
    { id: 'recommended', label: 'Recommended', monthly: res.recommendedMonthly, note: `${fmt(snap.recommendedAnnualReserve)} a year · closes the gap on schedule` },
  ];
  const apply = (monthly: number) => setAnnual(Math.max(0, Math.round(monthly * 12)));
  return (
    <Card tone={res.pct < 50 ? 'navy' : 'surface'} aria-label="Reserve contribution">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel className={res.pct < 50 ? 'text-white/[0.66]' : undefined}>Monthly reserve contribution</SectionLabel>
        <Chip tone={res.onSchedule ? 'teal' : 'amber'}>{res.onSchedule ? 'On schedule' : `Short by ${fmt(Math.max(0, res.recommendedMonthly - res.monthly))} a month`}</Chip>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {choices.map(c => (
          <button
            key={c.id}
            type="button"
            onClick={() => apply(c.monthly)}
            aria-pressed={c.monthly === res.monthly}
            className={`rounded-[14px] border px-3.5 py-3 text-left ${c.monthly === res.monthly ? 'border-ux2-cyan bg-ux2-cyan text-ux2-navy' : 'border-ux2-line bg-white text-ux2-ink hover:bg-ux2-surface'}`}
          >
            <div className="text-xs font-semibold uppercase tracking-[0.06em] opacity-70">{c.label}</div>
            <div className="text-2xl font-semibold tracking-[-0.03em]">{fmt(c.monthly)}<small className="ml-1 text-xs font-medium opacity-70">/ month</small></div>
            <div className="text-xs opacity-80">{c.note}</div>
          </button>
        ))}
        <form
          onSubmit={e => { e.preventDefault(); const n = Number(custom); if (Number.isFinite(n) && n >= 0) { apply(n); setCustom(''); } }}
          className="flex flex-col gap-2 rounded-[14px] border border-ux2-line bg-white px-3.5 py-3 text-ux2-ink"
        >
          <label htmlFor="reserve-custom" className="text-xs font-semibold uppercase tracking-[0.06em] text-ux2-muted">Custom</label>
          <input id="reserve-custom" inputMode="numeric" placeholder="a month" value={custom} onChange={e => setCustom(e.target.value)} className="h-9 rounded-lg border border-ux2-line px-2 text-sm" />
          <Button size="sm" type="submit" disabled={!custom}>Set</Button>
        </form>
      </div>
      <Inner className="text-xs text-ux2-muted">
        {res.next ? `${res.next.name} is due ${res.next.year} at ${fmt(res.next.cost)}; ${fmt(res.funded)} of ${fmt(res.needed)} is set aside across every item. ` : ''}
        The contribution moves from operating to reserves each month and is the line "Set aside for reserves" on the budget.
      </Inner>
    </Card>
  );
}

function NextYearDraft({ snap }: { snap: FundsSnapshot }) {
  const draft = nextYearScenarios(snap);
  const [pick, setPick] = useState<'keep' | 'recommended' | 'minimum'>('recommended');
  const chosen = draft.scenarios.find(s => s.id === pick)!;
  const navigate = useNavigate();
  const units = Math.max(1, snap.units.length);
  return (
    <Card aria-label="Next year draft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <SectionLabel>Next year · {draft.year} draft</SectionLabel>
          <p className="text-sm text-ux2-muted">Drafted from this year's lines, +3% · <Chip tone="ghost">Computed</Chip> nothing is saved until the board adopts it</p>
        </div>
        <Button size="sm" onClick={() => navigate('/issues?view=new')}>Start the budget runbook</Button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {draft.scenarios.map(s => (
          <button key={s.id} type="button" onClick={() => setPick(s.id)} aria-pressed={pick === s.id} className={`rounded-[14px] border px-3.5 py-3 text-left ${pick === s.id ? 'border-ux2-navy bg-ux2-navy text-white' : 'border-ux2-line bg-white text-ux2-ink hover:bg-ux2-surface'}`}>
            <div className="text-xs font-semibold uppercase tracking-[0.06em] opacity-70">{s.label}</div>
            <div className="text-2xl font-semibold tracking-[-0.03em]">{fmt(s.dues)}<small className="ml-1 text-xs font-medium opacity-70">average dues a month</small></div>
            <div className="text-xs opacity-80">{s.change === 0 ? 'No change' : `${s.change > 0 ? '+' : ''}${Math.round(s.change * 100)}% against ${fmt(draft.current)} today`}</div>
          </button>
        ))}
      </div>
      <Inner>
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <div><div className="text-xs text-ux2-muted">Dues, {units} units</div><b className="font-semibold text-ux2-ink">{fmt(chosen.dues * 12 * units)}</b></div>
          <div><div className="text-xs text-ux2-muted">Reserves</div><b className="font-semibold text-ux2-ink">{fmt(chosen.reserveAnnual)}</b></div>
          <div><div className="text-xs text-ux2-muted">The {snap.budget.length} lines</div><b className="font-semibold text-ux2-ink">{fmt(chosen.linesAnnual)}</b></div>
        </div>
        <p className="pt-2 text-xs text-ux2-muted">{chosen.note}</p>
      </Inner>
    </Card>
  );
}

export default function PlanningTab({ snap, section, onSection }: { snap: FundsSnapshot; section?: string; onSection: (s: string) => void }) {
  const bud = budgetSummary(snap);
  const res = reserveSummary(snap);
  const draft = nextYearScenarios(snap);
  const current: Section = (SECTIONS as string[]).includes(section ?? '') ? (section as Section) : 'budget';
  const year = snap.today.slice(0, 4);

  const sections: TileSection<Section>[] = [
    {
      id: 'budget',
      tile: {
        tone: bud.over.length > 0 ? 'red' : 'grey',
        label: `This year · ${year} budget`,
        value: bud.pct,
        unit: `% used · ${bud.expectedPct}% expected by now`,
        children: (
          <ul className="m-0 list-none p-0 text-xs">
            <li className="flex justify-between py-0.5"><span>Spent</span><b className="font-semibold">{fmt(bud.spent)} of {fmt(bud.total)}</b></li>
            <li className="flex justify-between py-0.5"><span>On track</span><b className="font-semibold">{bud.onTrack} of {bud.lines} lines</b></li>
            {bud.over.slice(0, 2).map(o => <li key={o.name} className="flex justify-between py-0.5"><span>{o.name}</span><b className="font-semibold">over by {fmt(o.overBy)}</b></li>)}
          </ul>
        ),
        sub: bud.over.length > 0 ? `Cover ${bud.over[0].name} from contingency, then the lines` : 'Every line inside its budget',
      },
      detail: <div className="ux2-legacy"><FLBudget /></div>,
    },
    {
      id: 'draft',
      tile: {
        tone: 'teal',
        label: `${draft.year} budget · decide`,
        meta: 'Computed',
        value: fmt(draft.scenarios[1].dues),
        unit: 'dues a month, recommended',
        children: (
          <ul className="m-0 list-none p-0 text-xs text-white/[0.8]">
            <li className="flex justify-between py-0.5"><span>Dues stay</span><b className="font-semibold text-white">{fmt(draft.scenarios[0].dues)}</b></li>
            <li className="flex justify-between py-0.5"><span>Fund reserves</span><b className="font-semibold text-white">{fmt(draft.scenarios[1].dues)}</b></li>
            <li className="flex justify-between py-0.5"><span>Minimum</span><b className="font-semibold text-white">{fmt(draft.scenarios[2].dues)}</b></li>
          </ul>
        ),
        sub: 'Pick the dues number · the three options, below',
      },
      detail: <NextYearDraft snap={snap} />,
    },
    {
      id: 'reserves',
      tile: {
        tone: res.pct < 50 ? 'red' : 'grey',
        label: res.next ? `Reserves · ${res.next.name.toLowerCase()} gap` : 'Reserves',
        value: res.pct,
        unit: '% funded',
        children: (
          <ul className="m-0 list-none p-0 text-xs">
            <li className="flex justify-between py-0.5"><span>Set aside</span><b className="font-semibold">{fmt(res.funded)} of {fmt(res.needed)}</b></li>
            {res.next && <li className="flex justify-between py-0.5"><span>{res.next.name}</span><b className="font-semibold">{res.next.year} · {fmt(res.next.cost)}</b></li>}
            <li className="flex justify-between py-0.5"><span>Contribution</span><b className="font-semibold">{fmt(res.monthly)} a month</b></li>
          </ul>
        ),
        sub: res.onSchedule ? 'On schedule' : `Set the monthly contribution · ${fmt(res.recommendedMonthly)} recommended`,
      },
      detail: (
        <div className="flex flex-col gap-5">
          <ReserveLever snap={snap} />
          <div className="ux2-legacy"><FLReserves /></div>
        </div>
      ),
    },
  ];

  return <TileSwitcher sections={sections} value={current} onChange={onSection} hint="Tap a tile to open its detail below. The other two stay one tap away." />;
}
