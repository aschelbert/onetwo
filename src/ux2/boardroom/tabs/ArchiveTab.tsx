/**
 * Archive, to the BoardRoom-Archive board: Closed in the last 60 days, the
 * year and type pills with search and export, the read-only table with the
 * decision trail and a per-row export, Export all and How long it stays.
 */
import { useMemo, useState } from 'react';
import { Button, Card, Cell, Chip, Inner, SearchInput, SectionLabel, Table, Td, Th, Why } from '../../components';
import { dayLabel } from '../../home/calendar';
import { archiveRows, type ArchiveRow, type BoardRoomSnapshot } from '../metrics';

const TYPE_TONE = (t: string): 'red' | 'amber' | 'plum' | 'teal' | 'navy' | 'ghost' | 'cyan' =>
  /collection|financial|funds/i.test(t) ? 'red' : /inbox/i.test(t) ? 'amber' : /violation|enforcement/i.test(t) ? 'plum' : /insurance|risk/i.test(t) ? 'teal' : /meeting|governance/i.test(t) ? 'navy' : /letter/i.test(t) ? 'cyan' : 'ghost';

function download(name: string, text: string, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

const csvOf = (rows: ArchiveRow[]) => ['id,type,title,detail,closed,outcome,entries', ...rows.map(r => [r.id, r.type, r.title, r.detail, r.closed, r.outcome, r.entries].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');

/** The record behind one row: thread, letters and decision trail, as an HTML file the browser can print to PDF. */
function recordOf(r: ArchiveRow, snap: BoardRoomSnapshot): string {
  const c = r.caseId ? snap.cases.find(x => x.id === r.caseId) : undefined;
  const issue = r.kind === 'request' ? snap.issues.find(i => `request:${i.id}` === r.id) : undefined;
  const letters = snap.letters.filter(l => (r.caseId && l.caseId === r.caseId) || `letter:${l.id}` === r.id);
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const parts = [`<h1>${esc(r.title)}</h1><p>${esc(r.detail)} · ${r.type} · closed ${r.closed} · ${esc(r.outcome)}</p>`];
  if (c?.steps?.length) parts.push(`<h2>Steps</h2><ol>${c.steps.map(s => `<li>${esc(s.s)}${s.done ? ' · done' : ''}</li>`).join('')}</ol>`);
  if (c?.boardVotes) parts.push(`<h2>Board vote · ${esc(c.boardVotes.motion)} · ${c.boardVotes.date}</h2><ul>${c.boardVotes.votes.map(v => `<li>${esc(v.name)} · ${esc(v.role)} · ${esc(v.vote)}</li>`).join('')}</ul>`);
  if (c?.decisionTrail?.length) parts.push(`<h2>Decision trail</h2><ul>${c.decisionTrail.map(d => `<li>${d.date} · ${esc(d.actor)} · ${esc(d.summary)}${d.details ? ` · ${esc(d.details)}` : ''}</li>`).join('')}</ul>`);
  if (issue) parts.push(`<h2>Thread</h2><p>${esc(issue.description)}</p><ul>${issue.comments.map(m => `<li>${m.date} · ${esc(m.author)} · ${esc(m.text)}</li>`).join('')}</ul>`);
  if (letters.length) parts.push(`<h2>Letters</h2><ul>${letters.map(l => `<li>${l.sentDate ?? ''} · ${esc(l.subject || l.templateName)} · ${esc(l.recipient)} · ${esc(l.sentVia || l.status)}</li>`).join('')}</ul>`);
  return `<!doctype html><meta charset="utf-8"><title>${esc(r.title)}</title><style>body{font:14px/1.5 system-ui;max-width:760px;margin:40px auto;color:#1A1F25}h1{font-size:22px}h2{font-size:15px;margin-top:24px}</style>${parts.join('')}`;
}

export default function ArchiveTab({ snap, onOpenCase }: { snap: BoardRoomSnapshot; onOpenCase: (id: string) => void }) {
  const rows = useMemo(() => archiveRows(snap), [snap]);
  const [year, setYear] = useState<string>('all');
  const [type, setType] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const years = useMemo(() => Array.from(new Set(rows.map(r => r.year).filter(Boolean))).sort().reverse(), [rows]);
  const types = useMemo(() => Array.from(new Set(rows.map(r => r.type))).sort(), [rows]);
  const list = rows.filter(r => year === 'all' || r.year === year).filter(r => type === 'all' || r.type === type).filter(r => !search || `${r.title} ${r.detail} ${r.outcome}`.toLowerCase().includes(search.toLowerCase()));
  const visible = showAll ? list : list.slice(0, 10);
  const recent = rows.filter(r => r.closed && Date.parse(snap.today) - Date.parse(r.closed) <= 60 * 86_400_000).slice(0, 3);
  const filtered = list.length !== rows.length;

  const exportRows = (which: ArchiveRow[], name: string) => {
    download(`${name}-${snap.today}.csv`, csvOf(which), 'text/csv');
    which.slice(0, 50).forEach(r => download(`${r.id.replace(/[:/]/g, '-')}.html`, recordOf(r, snap), 'text/html'));
  };

  return (
    <div className="flex flex-col gap-5">
      <Card aria-label="Closed recently">
        <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Closed in the last 60 days</SectionLabel><span className="text-xs text-ux2-muted">Each one moved here on its own when the runbook finished</span></div>
        {recent.length === 0 ? <Inner className="text-sm text-ux2-muted">Nothing closed in the last 60 days.</Inner> : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {recent.map(r => <Inner key={r.id} className="flex flex-col gap-2"><Cell title={r.title} note={`${r.detail} · closed ${dayLabel(r.closed)}`} /><span><Chip tone="sage">{r.outcome.split(' ')[0]}</Chip></span></Inner>)}
          </div>
        )}
      </Card>

      <Card aria-label="Archive">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setYear('all')} className="rounded-full"><Chip tone={year === 'all' ? 'navy' : 'ghost'}>All years · {rows.length}</Chip></button>
            {years.map(y => <button key={y} type="button" onClick={() => setYear(y)} className="rounded-full"><Chip tone={year === y ? 'navy' : 'ghost'}>{y} · {rows.filter(r => r.year === y).length}</Chip></button>)}
          </div>
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Search title, id, unit, owner, outcome, letter text" label="Search archive" />
            <Button size="sm" variant="ghost" onClick={() => exportRows(list, filtered ? 'archive-filter' : 'archive')}>Export {filtered ? 'these' : 'all'}</Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setType('all')} className="rounded-full"><Chip tone={type === 'all' ? 'teal' : 'ghost'}>All types</Chip></button>
          {types.map(t => <button key={t} type="button" onClick={() => setType(t)} className="rounded-full"><Chip tone={type === t ? 'teal' : 'ghost'}>{t} · {rows.filter(r => r.type === t).length}</Chip></button>)}
        </div>
        {list.length === 0 ? <Inner className="text-sm text-ux2-muted">Nothing closed yet{search ? ' that matches' : ''}.</Inner> : (
          <Table minWidth={880}>
            <thead><tr><Th>Item</Th><Th>Type</Th><Th>Closed</Th><Th>Outcome</Th><Th>Decision trail</Th><Th>Export</Th></tr></thead>
            <tbody>
              {visible.map(r => (
                <tr key={r.id} data-archive={r.id}>
                  <Td><Cell title={r.caseId ? <button type="button" className="text-left hover:underline" onClick={() => onOpenCase(r.caseId!)}>{r.title}</button> : r.title} note={r.detail} /></Td>
                  <Td><Chip tone={TYPE_TONE(r.type)}>{r.type}</Chip></Td>
                  <Td>{r.closed ? dayLabel(r.closed) : '—'}</Td>
                  <Td>{r.outcome}</Td>
                  <Td><Cell title={`${r.entries} entr${r.entries === 1 ? 'y' : 'ies'}`} note={r.vote ? `incl. ${r.vote}` : undefined} /></Td>
                  <Td><Button size="sm" variant="ghost" onClick={() => download(`${r.id.replace(/[:/]/g, '-')}.html`, recordOf(r, snap), 'text/html')}>PDF</Button></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Why>Showing {visible.length} of {list.length}, newest first. Open a row to read the full record: the thread, every letter and its proof of delivery, and the decision trail. Closed items cannot be edited; a mistake is corrected by opening a new action that references this one.</Why>
          {list.length > 10 && <Button size="sm" variant="ghost" onClick={() => setShowAll(v => !v)}>{showAll ? 'Show fewer' : `Show the other ${list.length - 10}`}</Button>}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card aria-label="Export all">
          <SectionLabel>Export all</SectionLabel>
          <div className="flex items-baseline gap-2"><span className="font-display text-[34px] font-semibold leading-none tracking-[-0.02em] text-ux2-ink">{rows.length}</span><span className="text-sm text-ux2-muted">items · one file per item, with its decision trail and letters, plus a CSV index</span></div>
          <Why>Use it for a change of board, an audit by the accountant, a request from counsel, or a buyer's attorney asking for a unit's history. A single unit's records can be exported from its row in Building › Directory instead.</Why>
          <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => exportRows(rows, 'archive')}>Export all · {rows.length} items</Button><Button size="sm" variant="ghost" onClick={() => exportRows(list, 'archive-filter')}>Export the current filter</Button></div>
        </Card>
        <Card aria-label="How long it stays">
          <SectionLabel>How long it stays</SectionLabel>
          <Inner className="flex flex-wrap items-center justify-between gap-3"><Cell title="7 years from the day it closed" note="Then it is deleted, unless a related action is open or counsel has placed a hold" /><Chip tone="cyan">Retention</Chip></Inner>
          <Inner className="flex flex-wrap items-center justify-between gap-3"><Cell title="Minutes and adopted budgets stay for good" note="They are the building's permanent record and also live in Building › Documents" /><Chip tone="ghost">Permanent</Chip></Inner>
          <Why>Nothing is deleted without a notice on Home 30 days before. Owners never see the archive; they see their own closed requests in Community › Requests. Records: DC Code § 29-1101 et seq. · bylaws</Why>
        </Card>
      </div>
    </div>
  );
}
