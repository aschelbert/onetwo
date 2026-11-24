import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { MEASURES, blankPlan, met, showMeasure, type YearPlan } from '@/lib/caseTools';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Chip, Inner, SectionLabel, Why } from '../../components';
import { nextFiscalYearStart, startGoals } from '../../boardroom/goals';
import { measuredNow } from '../../boardroom/tools/planNumbers';

/** Building › Goals: what the board set out to do each year, where it stands, and how past years turned out. */
export default function PlanTab({ isBoard }: { isBoard: boolean }) {
  const records = useActionRecordsStore(s => s.records);
  const navigate = useNavigate();
  // Owners see goals once the board has adopted them; the board also sees a draft. Goals set before adoption existed (they have an outcome, or were set with the budget) still show.
  const plans = records.filter(r => r.kind === 'objectives').map(r => ({ ...blankPlan(''), ...(r.data as object) }) as YearPlan)
    .filter(p => p.objectives.length && (isBoard || p.adoptedOn || p.outcomeOn)).sort((a, b) => b.year.localeCompare(a.year));
  const openGoals = () => { const { caseId } = startGoals(nextFiscalYearStart()); if (caseId) navigate(`/boardroom?view=case:${caseId}`); };
  if (!plans.length) {
    return <Card className="gap-3"><Inner className="text-sm text-ux2-muted">No goals have been set yet. {isBoard ? 'They are set once a year in their own action, which opens with the annual budget, and reported on at the year-end close.' : 'The board sets them once a year with the budget.'}</Inner>{isBoard && <div><Button size="sm" onClick={openGoals}>Set next year's goals</Button></div>}</Card>;
  }
  return (
    <div className="flex flex-col gap-4">
      {plans.map(p => {
        const now = p.outcomeOn ? {} : measuredNow(p.year);
        const metCount = p.objectives.filter(o => met(o)).length;
        return (
          <Card key={p.year} aria-label={'Year starting ' + p.year} className="gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Year starting {p.year}</SectionLabel>{p.outcomeOn ? <Chip tone={metCount === p.objectives.length ? 'sage' : 'amber'}>{metCount} of {p.objectives.length} met · reported {p.outcomeOn}</Chip> : p.adoptedOn ? <Chip tone="navy">Adopted {p.adoptedOn}</Chip> : <Chip tone="amber">Draft · owners do not see it yet</Chip>}</div>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {p.objectives.map(o => {
                const m = p.outcomeOn ? met(o) : null;
                const current = now[o.measure];
                return (
                  <li key={o.id}><Inner className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-ux2-ink"><b className="font-semibold">{o.text}</b><span className="block text-xs text-ux2-muted">Target {MEASURES[o.measure].direction === 'at-most' ? 'at most' : 'at least'} {showMeasure(o.measure, o.target)}{o.longTarget != null && o.longBy ? ` · ${showMeasure(o.measure, o.longTarget)} by ${o.longBy}` : ''} · {MEASURES[o.measure].from}{o.note ? ' · ' + o.note : ''}</span></span>
                    <span className="flex items-center gap-2">{p.outcomeOn && o.result != null && <span className="text-sm font-semibold text-ux2-ink">{showMeasure(o.measure, o.result)}</span>}{!p.outcomeOn && current != null && <span className="text-sm text-ux2-ink">Today {showMeasure(o.measure, current)}</span>}{m != null && <Chip tone={m ? 'sage' : 'red'}>{m ? 'Met' : 'Missed'}</Chip>}</span>
                  </Inner></li>
                );
              })}
            </ul>
          </Card>
        );
      })}
      {isBoard && <div><Button size="sm" variant="ghost" onClick={openGoals}>Open next year's goals action</Button></div>}
      <Why>Goals are set with the budget and reported at year end, from numbers the app already keeps wherever it can. Every owner can read this page.</Why>
    </div>
  );
}
