import { useMemo, useState } from 'react';
import { Card, Chip, Inner, SectionLabel } from '../../components';
import { dayLabel } from '../../home/calendar';
import { caseRows, casesSummary, type CaseRow, type BoardRoomSnapshot } from '../metrics';

type Filter = 'all' | 'mine' | 'overdue' | 'hold';
const PRIORITY_TONE: Record<string, 'red' | 'amber' | 'ghost' | 'navy'> = { urgent: 'red', high: 'amber', medium: 'ghost', low: 'ghost' };

export default function OpenTab({ snap, onOpenCase }: { snap: BoardRoomSnapshot; onOpenCase: (id: string) => void }) {
  const rows = useMemo(() => caseRows(snap), [snap]);
  const sum = casesSummary(rows);
  const [filter, setFilter] = useState<Filter>('all');
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const list = rows
    .filter(r => filter === 'all' ? !r.onHold : filter === 'mine' ? r.mine : filter === 'overdue' ? r.overdue : r.onHold)
    .filter(r => category === 'all' || r.category === category)
    .filter(r => !search || `${r.c.title} ${r.c.id} ${r.c.unit} ${r.situation}`.toLowerCase().includes(search.toLowerCase()));

  const Row = ({ r }: { r: CaseRow }) => (
    <tr data-case={r.c.id} onClick={() => onOpenCase(r.c.id)} className={`cursor-pointer border-t border-ux2-line align-top hover:bg-ux2-surface ${r.overdue ? 'bg-ux2-red-tint/40' : ''}`}>
      <td className="py-2.5 pr-3">
        <div className="font-semibold text-ux2-ink">{r.c.title}</div>
        <div className="text-xs text-ux2-dim">{r.c.id} · {r.category}{r.c.unit ? ` · Unit ${r.c.unit}` : ''} · opened {dayLabel(r.c.created.slice(0, 10))}{r.fromRequest ? ' · from a request' : ''}{r.onHold ? ` · on hold${r.c.holdReason ? `: ${r.c.holdReason}` : ''}` : ''}</div>
      </td>
      <td className="hidden py-2.5 pr-3 text-sm md:table-cell">
        <div className="text-ux2-ink">Step {r.stepIndex} of {r.stepTotal}{r.stepTitle ? ` · ${r.stepTitle}` : ''}</div>
        <div className="text-xs text-ux2-muted">{r.situation}</div>
      </td>
      <td className="hidden py-2.5 pr-3 text-sm text-ux2-ink md:table-cell">{r.next}</td>
      <td className="py-2.5 pr-3 whitespace-nowrap text-sm text-ux2-ink">{r.driver}</td>
      <td className="py-2.5 pr-3 whitespace-nowrap text-sm">{r.due ? <span className={r.overdue ? 'font-semibold text-ux2-red-ink' : 'text-ux2-ink'}>{dayLabel(r.due)}{r.overdue ? ' · overdue' : ''}</span> : <span className="text-ux2-dim">—</span>}</td>
      <td className="py-2.5"><Chip tone={PRIORITY_TONE[r.c.priority] ?? 'ghost'}>{r.c.priority[0].toUpperCase() + r.c.priority.slice(1)}</Chip></td>
    </tr>
  );

  return (
    <div className="flex flex-col gap-5">
      <Card aria-label="Open cases">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {([['all', `All open · ${sum.open.length}`], ['mine', `My tasks · ${sum.mine.length}`], ['overdue', `Overdue · ${sum.overdue.length}`], ['hold', `On hold · ${sum.onHold.length}`]] as [Filter, string][]).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setFilter(id)} className="rounded-full"><Chip tone={filter === id ? 'navy' : id === 'overdue' && sum.overdue.length ? 'red' : 'ghost'}>{label}</Chip></button>
            ))}
          </div>
          <input aria-label="Search cases" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search cases" className="h-9 w-48 rounded-lg border border-ux2-line px-3 text-sm" />
        </div>
        {Object.keys(sum.byCategory).length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setCategory('all')} className="rounded-full"><Chip tone={category === 'all' ? 'teal' : 'ghost'}>Every category</Chip></button>
            {Object.entries(sum.byCategory).map(([c, n]) => <button key={c} type="button" onClick={() => setCategory(c)} className="rounded-full"><Chip tone={category === c ? 'teal' : 'ghost'}>{c} · {n}</Chip></button>)}
          </div>
        )}
        {list.length === 0 ? <p className="text-sm text-ux2-muted">Nothing here.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.06em] text-ux2-muted">
                  <th className="py-2 pr-3 font-semibold">Case</th><th className="hidden py-2 pr-3 font-semibold md:table-cell">Where it is</th><th className="hidden py-2 pr-3 font-semibold md:table-cell">Next</th><th className="py-2 pr-3 font-semibold">Driver</th><th className="py-2 pr-3 font-semibold">Due</th><th className="py-2 font-semibold">Priority</th>
                </tr>
              </thead>
              <tbody>{list.map(r => <Row key={r.c.id} r={r} />)}</tbody>
            </table>
          </div>
        )}
        <Inner className="text-xs text-ux2-muted">Same list as Daily Operations today, with "Where it is" and "Next" added so nobody has to open a case to know what it needs. Open a row for the steps, the checklist, the vote and the documents.</Inner>
      </Card>
    </div>
  );
}
