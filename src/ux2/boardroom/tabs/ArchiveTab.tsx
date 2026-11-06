import { useMemo, useState } from 'react';
import { Button, Card, Chip, Inner, SectionLabel } from '../../components';
import { dayLabel } from '../../home/calendar';
import { archiveRows, type BoardRoomSnapshot } from '../metrics';

const KIND_LABEL = { case: 'Case', request: 'Inbox', letter: 'Letter' } as const;

export default function ArchiveTab({ snap, onOpenCase }: { snap: BoardRoomSnapshot; onOpenCase: (id: string) => void }) {
  const rows = useMemo(() => archiveRows(snap), [snap]);
  const [year, setYear] = useState<string>('all');
  const [kind, setKind] = useState<string>('all');
  const [search, setSearch] = useState('');
  const years = useMemo(() => Array.from(new Set(rows.map(r => r.year).filter(Boolean))).sort().reverse(), [rows]);
  const list = rows.filter(r => year === 'all' || r.year === year).filter(r => kind === 'all' || r.kind === kind).filter(r => !search || `${r.title} ${r.detail}`.toLowerCase().includes(search.toLowerCase()));
  const recent = rows.filter(r => r.closed >= snap.today.slice(0, 4) && r.closed && Date.parse(snap.today) - Date.parse(r.closed) <= 60 * 86_400_000).slice(0, 3);

  const exportAll = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), items: list }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `board-room-archive-${snap.today}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex flex-col gap-5">
      {recent.length > 0 && (
        <Card aria-label="Closed recently">
          <SectionLabel>Closed in the last 60 days</SectionLabel>
          <ul className="m-0 list-none divide-y divide-ux2-line p-0">
            {recent.map(r => (
              <li key={r.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold text-ux2-ink">{r.title}</span><span className="block text-xs text-ux2-muted">{r.detail} · closed {dayLabel(r.closed)} · {r.outcome}</span></span>
                <Chip tone="sage">{r.outcome.split(' ')[0]}</Chip>
              </li>
            ))}
          </ul>
          <Inner className="text-xs text-ux2-muted">Each one moved here on its own when its runbook finished.</Inner>
        </Card>
      )}

      <Card aria-label="Archive">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setYear('all')} className="rounded-full"><Chip tone={year === 'all' ? 'navy' : 'ghost'}>All years · {rows.length}</Chip></button>
            {years.map(y => <button key={y} type="button" onClick={() => setYear(y)} className="rounded-full"><Chip tone={year === y ? 'navy' : 'ghost'}>{y} · {rows.filter(r => r.year === y).length}</Chip></button>)}
          </div>
          <div className="flex items-center gap-2">
            <input aria-label="Search archive" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search" className="h-9 w-40 rounded-lg border border-ux2-line px-3 text-sm" />
            <Button size="sm" variant="ghost" onClick={exportAll}>Export {list.length === rows.length ? 'all' : 'these'}</Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'case', 'request', 'letter'] as const).map(k => <button key={k} type="button" onClick={() => setKind(k)} className="rounded-full"><Chip tone={kind === k ? 'teal' : 'ghost'}>{k === 'all' ? 'All types' : `${KIND_LABEL[k]}s`} · {k === 'all' ? rows.length : rows.filter(r => r.kind === k).length}</Chip></button>)}
        </div>
        {list.length === 0 ? <p className="text-sm text-ux2-muted">Nothing closed yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.06em] text-ux2-muted">
                  <th className="py-2 pr-3 font-semibold">Item</th><th className="py-2 pr-3 font-semibold">Type</th><th className="py-2 pr-3 font-semibold">Closed</th><th className="hidden py-2 pr-3 font-semibold md:table-cell">Outcome</th><th className="hidden py-2 font-semibold md:table-cell">Decision trail</th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, 100).map(r => (
                  <tr key={r.id} data-archive={r.id} className="border-t border-ux2-line align-top">
                    <td className="py-2.5 pr-3">
                      <div className="font-semibold text-ux2-ink">{r.caseId ? <button type="button" className="hover:underline" onClick={() => onOpenCase(r.caseId!)}>{r.title}</button> : r.title}</div>
                      <div className="text-xs text-ux2-dim">{r.detail}</div>
                    </td>
                    <td className="py-2.5 pr-3"><Chip tone="ghost">{KIND_LABEL[r.kind]}</Chip></td>
                    <td className="py-2.5 pr-3 whitespace-nowrap text-ux2-ink">{r.closed ? dayLabel(r.closed) : '—'}</td>
                    <td className="hidden py-2.5 pr-3 text-ux2-ink md:table-cell">{r.outcome}</td>
                    <td className="hidden py-2.5 text-xs text-ux2-muted md:table-cell">{r.entries} entr{r.entries === 1 ? 'y' : 'ies'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.length > 100 && <div className="pt-2 text-xs text-ux2-dim">{list.length - 100} more · narrow the search</div>}
          </div>
        )}
        <Inner className="text-xs text-ux2-muted">Read-only. A closed case opens in its workspace with every step, vote and document; export writes the list as a file.</Inner>
      </Card>
    </div>
  );
}
