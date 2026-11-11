import { useMemo, useState } from 'react';
import { Card, PillTabs, SearchInput, Table, Th, Td, Cell, Why } from '../../components';
import { dayLabel } from '../../home/calendar';
import { caseRows, casesSummary, type CaseRow, type BoardRoomSnapshot } from '../metrics';

type Filter = 'all' | 'mine' | 'overdue' | 'funds' | 'building' | 'people' | 'board';

/** The case wizard's categories, folded into the four buckets the board thinks in. */
const BUCKET: Record<string, Exclude<Filter, 'all' | 'mine' | 'overdue'>> = {
  financial: 'funds', strategic: 'funds',
  maintenance: 'building', operations: 'building',
  admin: 'people', enforcement: 'people',
  governance: 'board', legal: 'board',
};
const PRIORITY_DOT: Record<string, string> = { urgent: 'bg-ux2-red', high: 'bg-ux2-red', medium: 'bg-ux2-amber', low: 'bg-ux2-line-strong' };

export default function OpenTab({ snap, onOpenCase }: { snap: BoardRoomSnapshot; onOpenCase: (id: string) => void }) {
  const rows = useMemo(() => caseRows(snap), [snap]);
  const sum = casesSummary(rows);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const list = rows
    .filter(r => filter === 'all' ? !r.onHold : filter === 'mine' ? r.mine : filter === 'overdue' ? r.overdue : (BUCKET[r.c.catId] ?? 'board') === filter && !r.onHold)
    .filter(r => !search || `${r.c.title} ${r.c.id} ${r.c.unit} ${r.situation} ${r.driver}`.toLowerCase().includes(search.toLowerCase()));

  const Row = ({ r }: { r: CaseRow }) => (
    <tr data-case={r.c.id} onClick={() => onOpenCase(r.c.id)} className={`cursor-pointer hover:bg-ux2-surface ${r.overdue ? 'bg-ux2-red-tint/40' : ''}`}>
      <Td><Cell title={r.c.title} note={`${r.c.id} · ${r.category} · ${r.fromRequest ? 'from a request' : `opened ${dayLabel(r.c.created.slice(0, 10))}`}${r.c.unit && !/^(common|n\/a)$/i.test(r.c.unit) ? ` · Unit ${r.c.unit}` : ''}${r.onHold ? ` · on hold${r.c.holdReason ? `: ${r.c.holdReason}` : ''}` : ''}`} /></Td>
      <Td><Cell title={<span className="font-normal">Step {r.stepIndex} of {r.stepTotal}{r.stepTitle ? ` · ${r.stepTitle}` : ''}</span>} note={r.situation} /></Td>
      <Td>{r.next}</Td>
      <Td className="whitespace-nowrap">{r.driver}</Td>
      <Td className="whitespace-nowrap">{r.due ? <span className={r.overdue ? 'font-semibold text-ux2-red-ink' : ''}>{dayLabel(r.due)}{r.overdue ? ' · overdue' : ''}</span> : <span className="text-ux2-dim">—</span>}</Td>
      <Td className="whitespace-nowrap"><span className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle ${PRIORITY_DOT[r.c.priority] ?? 'bg-ux2-line-strong'}`} />{r.c.priority[0].toUpperCase() + r.c.priority.slice(1)}</Td>
    </tr>
  );

  return (
    <Card aria-label="Open actions">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PillTabs
          size="filter"
          surface="white"
          aria-label="Filter actions"
          value={filter}
          onChange={setFilter}
          tabs={[
            { id: 'all', label: 'All open' },
            { id: 'mine', label: `My tasks · ${sum.mine.length}` },
            { id: 'overdue', label: `Overdue · ${sum.overdue.length}` },
            { id: 'funds', label: 'Funds' }, { id: 'building', label: 'Building' }, { id: 'people', label: 'People' }, { id: 'board', label: 'Board' },
          ]}
        />
        <SearchInput value={search} onChange={setSearch} placeholder="Search title, id, unit, owner, assignee" label="Search actions" className="w-[280px] max-w-full" />
      </div>
      {list.length === 0 ? <p className="m-0 text-sm text-ux2-muted">Nothing here.</p> : (
        <Table>
          <thead><tr><Th>Action</Th><Th>Where it is</Th><Th>Next</Th><Th>Driver</Th><Th>Due</Th><Th>Priority</Th></tr></thead>
          <tbody>{list.map(r => <Row key={r.c.id} r={r} />)}</tbody>
        </Table>
      )}
      <Why>Same list as Daily Operations today, with "Where it is" and "Next" added so nobody has to open an action to know what it needs. Requests keep the 14-day clock, upvotes and convert-to-action.{sum.onHold.length ? ` ${sum.onHold.length} on hold, under Archive until resumed.` : ''}</Why>
    </Card>
  );
}
