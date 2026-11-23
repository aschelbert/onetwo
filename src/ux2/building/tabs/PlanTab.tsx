import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { MEASURES, blankPlan, met, showMeasure, type YearPlan } from '@/lib/caseTools';
import { Card, Chip, Inner, SectionLabel, Why } from '../../components';
import { measuredNow } from '../../boardroom/tools/planNumbers';

/** Building › Plan: what the board set out to do each year, where it stands, and how past years turned out. */
export default function PlanTab({ isBoard }: { isBoard: boolean }) {
  const records = useActionRecordsStore(s => s.records);
  const plans = records.filter(r => r.kind === 'objectives').map(r => ({ ...blankPlan(''), ...(r.data as object) }) as YearPlan).filter(p => p.objectives.length).sort((a, b) => b.year.localeCompare(a.year));
  if (!plans.length) {
    return <Card><Inner className="text-sm text-ux2-muted">No objectives have been set yet. {isBoard ? 'They are set once a year in the annual budget action, in the Board Room, and reported on at the year-end close.' : 'The board sets them once a year with the budget.'}</Inner></Card>;
  }
  return (
    <div className="flex flex-col gap-4">
      {plans.map(p => {
        const now = p.outcomeOn ? {} : measuredNow(p.year);
        const metCount = p.objectives.filter(o => met(o)).length;
        return (
          <Card key={p.year} aria-label={'Year starting ' + p.year} className="gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Year starting {p.year}</SectionLabel>{p.outcomeOn ? <Chip tone={metCount === p.objectives.length ? 'sage' : 'amber'}>{metCount} of {p.objectives.length} met · reported {p.outcomeOn}</Chip> : <Chip tone="navy">In progress</Chip>}</div>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {p.objectives.map(o => {
                const m = p.outcomeOn ? met(o) : null;
                const current = now[o.measure];
                return (
                  <li key={o.id}><Inner className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-ux2-ink"><b className="font-semibold">{o.text}</b><span className="block text-xs text-ux2-muted">Target {MEASURES[o.measure].direction === 'at-most' ? 'at most' : 'at least'} {showMeasure(o.measure, o.target)} · {MEASURES[o.measure].from}{o.note ? ' · ' + o.note : ''}</span></span>
                    <span className="flex items-center gap-2">{p.outcomeOn && o.result != null && <span className="text-sm font-semibold text-ux2-ink">{showMeasure(o.measure, o.result)}</span>}{!p.outcomeOn && current != null && <span className="text-sm text-ux2-ink">Today {showMeasure(o.measure, current)}</span>}{m != null && <Chip tone={m ? 'sage' : 'red'}>{m ? 'Met' : 'Missed'}</Chip>}</span>
                  </Inner></li>
                );
              })}
            </ul>
          </Card>
        );
      })}
      <Why>Objectives are set with the budget and reported at year end, from numbers the app already keeps wherever it can. Every owner can read this page.</Why>
    </div>
  );
}
