import { Fragment, useMemo, useState } from 'react';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { cn } from '@/lib/formatters';
import { Button, Card, Chip, Inner, PillTabs, SearchInput, SectionLabel, Table, Th, Td, Cell, Why } from '../../components';
import { dayLabel } from '../../home/calendar';
import { inboxRows, inboxSummary, type InboxRow, type BoardRoomSnapshot } from '../metrics';

type Filter = 'all' | 'mine' | 'overdue' | 'closed';

function stepLabel(r: InboxRow): { step: string; note: string } {
  if (r.state === 'closed') return { step: 'Step 5 of 5 · Close', note: 'thread in Archive' };
  if (r.state === 'new') return { step: 'Step 2 of 5 · Acknowledge', note: `within 48 hours · by ${dayLabel(r.ackDue)}` };
  if (r.linkedCase) return { step: 'Step 4 of 5 · Resolve', note: r.linkedCase.title };
  return { step: 'Step 3 of 5 · Assign', note: 'pick a board member, the porter or a vendor' };
}

const STEPS = [
  ['1 · Intake', 'The owner writes it in Community; it lands here with the unit attached.', 'done'],
  ['2 · Acknowledge', 'Within 48 hours. A receipt goes back to the owner and the 14-day clock starts.', 'done'],
  ['3 · Assign', 'Pick a board member, the porter or a vendor. Becomes a case if it needs money or a vote.', 'now'],
  ['4 · Resolve', 'Do the work, then reply with the outcome before the clock runs out.', ''],
  ['5 · Close', 'The owner confirms or 7 days pass. The thread goes to Archive.', ''],
] as const;

function ReplyForm({ r, viewer, onClose }: { r: InboxRow; viewer: string; onClose: () => void }) {
  const addComment = useIssuesStore(s => s.addIssueComment);
  const setStatus = useIssuesStore(s => s.updateIssueStatus);
  const [text, setText] = useState('');
  const [close, setClose] = useState(false);
  return (
    <form
      aria-label={`Reply to ${r.issue.title}`}
      onSubmit={e => { e.preventDefault(); if (!text.trim()) return; addComment(r.issue.id, viewer, text.trim()); if (r.state === 'new') setStatus(r.issue.id, 'IN_PROGRESS'); if (close) setStatus(r.issue.id, 'RESOLVED'); onClose(); }}
      className="flex flex-col gap-2 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3"
    >
      <div className="text-sm font-semibold text-ux2-ink">Reply to {r.issue.reporterName || 'the owner'}{r.issue.unitNumber ? ` · Unit ${r.issue.unitNumber}` : ''}</div>
      {r.issue.comments.length > 0 && <div className="text-xs text-ux2-muted">Last: {r.issue.comments[r.issue.comments.length - 1].author} · {r.issue.comments[r.issue.comments.length - 1].text.slice(0, 120)}</div>}
      <textarea aria-label="Reply" value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="What was found, what happens next, and when" className="w-full rounded-[10px] border border-ux2-line-strong px-3 py-2 text-sm" />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={!text.trim()}>Send reply</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-ux2-muted"><input type="checkbox" checked={close} onChange={e => setClose(e.target.checked)} /> This reply resolves it</label>
      </div>
    </form>
  );
}

/** Assign: pick a board member; the request becomes a case on the resident-request runbook, driven by them. */
function AssignForm({ r, onDone }: { r: InboxRow; onDone: (caseId: string) => void }) {
  const board = useBuildingStore(s => s.board);
  const createCase = useIssuesStore(s => s.createCase);
  const setStatus = useIssuesStore(s => s.updateIssueStatus);
  const [who, setWho] = useState(board[0]?.name ?? '');
  return (
    <form
      aria-label={`Assign ${r.issue.title}`}
      onSubmit={e => { e.preventDefault(); const id = createCase({ catId: 'governance', sitId: 'board-action-item', approach: 'self', title: r.issue.title, unit: r.issue.unitNumber ?? '', owner: r.issue.reporterName, priority: 'medium', notes: r.issue.description, assignedTo: who || undefined, dueDate: r.replyDue, source: 'issue', sourceId: r.issue.id }); if (r.state === 'new') setStatus(r.issue.id, 'IN_PROGRESS'); onDone(id); }}
      className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3"
    >
      <div className="w-full text-sm font-semibold text-ux2-ink">Assign · becomes a case on the resident-request runbook, due {dayLabel(r.replyDue)}</div>
      <label className="flex min-w-[220px] flex-col gap-1 text-xs font-semibold text-ux2-muted">Driver
        <select value={who} onChange={e => setWho(e.target.value)} className="h-10 rounded-full border border-ux2-line-strong bg-white px-3.5 text-sm font-normal text-ux2-ink">
          {board.map(b => <option key={b.name} value={b.name}>{b.name} · {b.role}</option>)}
          <option value="Porter">Porter</option><option value="Vendor">A vendor</option>
        </select>
      </label>
      <Button type="submit" size="sm">Assign and open the case</Button>
    </form>
  );
}

export default function InboxTab({ snap, onOpenCase }: { snap: BoardRoomSnapshot; onOpenCase: (id: string) => void }) {
  const rows = useMemo(() => inboxRows(snap), [snap]);
  const sum = inboxSummary(rows);
  const updateIssueStatus = useIssuesStore(s => s.updateIssueStatus);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [replying, setReplying] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const list = rows
    .filter(r => filter === 'all' ? r.state !== 'closed' : filter === 'mine' ? r.mine && r.state !== 'closed' : filter === 'overdue' ? r.overdue : r.state === 'closed')
    .filter(r => !search || `${r.issue.title} ${r.issue.id} ${r.issue.unitNumber ?? ''} ${r.issue.reporterName}`.toLowerCase().includes(search.toLowerCase()));
  const needs = [...sum.overdue.filter(r => r.state !== 'new'), ...sum.unacknowledged, ...sum.open.filter(r => r.state === 'in_progress' && !r.overdue && r.daysLeft <= 7)].filter((r, i, a) => a.indexOf(r) === i).slice(0, 3);
  const assign = (r: InboxRow) => { setAssigning(assigning === r.issue.id ? null : r.issue.id); setReplying(null); };

  return (
    <div className="flex flex-col gap-5">
      {needs.length > 0 && (
        <Card aria-label="Needs you" className="gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Needs you</SectionLabel><span className="text-xs text-ux2-muted">Replies count toward Timeliness for whoever sends them</span></div>
          {needs.map((r, i) => (
            <Fragment key={r.issue.id}>
              <Inner className={cn('flex flex-wrap items-center justify-between gap-3', i === 0 && 'border-ux2-navy')}>
                <div className="min-w-0 text-sm">
                  <b className="font-semibold text-ux2-ink">{r.state === 'new' ? `Acknowledge ${r.issue.title.toLowerCase().startsWith('the') ? '' : 'the '}${r.issue.title}` : `Reply to ${r.issue.unitNumber ? `Unit ${r.issue.unitNumber}` : r.issue.reporterName || 'the owner'} about ${r.issue.title.toLowerCase()}`}</b>
                  <Chip tone={r.overdue ? 'red' : r.state === 'new' ? (r.ackDue < snap.today ? 'red' : 'amber') : 'sage'} className="ml-1.5">{r.state === 'new' ? `48-hour window ${r.ackDue < snap.today ? 'passed' : `ends ${dayLabel(r.ackDue)}`}` : r.overdue ? `Overdue · was due ${dayLabel(r.replyDue)}` : `Reply due ${dayLabel(r.replyDue)} · ${r.daysLeft} days`}</Chip>
                  <div className="mt-1 text-xs text-ux2-muted">{r.issue.reporterName || 'An owner'} asked on {dayLabel(r.issue.submittedDate.slice(0, 10))}. {r.linkedCase ? `${r.assignee} is driving ${r.linkedCase.id}. ` : 'Nobody is assigned yet. '}{r.state === 'new' ? `Acknowledging sends the owner a receipt and starts the 14-day reply clock, due ${dayLabel(r.replyDue)}.` : 'Reply with what was found; the clock stops the moment the reply goes out.'}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {r.state === 'new' ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => assign(r)}>Assign</Button>
                      <Button size="sm" onClick={() => updateIssueStatus(r.issue.id, 'IN_PROGRESS')}>Acknowledge</Button>
                    </>
                  ) : (
                    <>
                      {r.linkedCase ? <Button size="sm" variant="ghost" onClick={() => onOpenCase(r.linkedCase!.id)}>Open the case</Button> : <Button size="sm" variant="ghost" onClick={() => assign(r)}>Assign</Button>}
                      <Button size="sm" onClick={() => setReplying(replying === r.issue.id ? null : r.issue.id)}>Reply</Button>
                    </>
                  )}
                </div>
              </Inner>
              {replying === r.issue.id && <ReplyForm r={r} viewer={snap.viewer.name} onClose={() => setReplying(null)} />}
              {assigning === r.issue.id && <AssignForm r={r} onDone={id => { setAssigning(null); onOpenCase(id); }} />}
            </Fragment>
          ))}
        </Card>
      )}

      <Card aria-label="Requests">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PillTabs size="filter" surface="white" aria-label="Filter requests" value={filter} onChange={setFilter} tabs={[{ id: 'all', label: `All · ${sum.open.length}` }, { id: 'mine', label: `Mine · ${sum.mine.length}` }, { id: 'overdue', label: `Overdue · ${sum.overdue.length}` }, { id: 'closed', label: 'Closed' }]} />
          <SearchInput value={search} onChange={setSearch} placeholder="Search unit, owner, subject, id" label="Search requests" className="w-[260px] max-w-full" />
        </div>
        {list.length === 0 ? <p className="m-0 text-sm text-ux2-muted">Nothing here.</p> : (
          <Table>
            <thead><tr><Th>Request</Th><Th>Status</Th><Th>Reply due</Th><Th>Assignee</Th><Th>Runbook step</Th><Th aria-label="Reply" /></tr></thead>
            <tbody>
              {list.map(r => {
                const st = stepLabel(r);
                return (
                  <Fragment key={r.issue.id}>
                    <tr data-request={r.issue.id}>
                      <Td><Cell title={r.issue.title} note={<>{r.issue.id}{r.issue.unitNumber ? ` · Unit ${r.issue.unitNumber}` : ''} · {r.issue.reporterName || 'owner'} · received {dayLabel(r.issue.submittedDate.slice(0, 10))} · {r.upvotes} upvote{r.upvotes === 1 ? '' : 's'}{r.linkedCase ? <> · <button type="button" className="font-semibold text-ux2-teal hover:underline" onClick={() => onOpenCase(r.linkedCase!.id)}>{r.linkedCase.id}</button></> : null}</>} /></Td>
                      <Td><Chip tone={r.state === 'closed' ? 'sage' : r.overdue ? 'red' : r.state === 'in_progress' ? 'teal' : 'amber'}>{r.state === 'closed' ? 'Closed' : r.overdue ? 'Reply overdue' : r.state === 'in_progress' ? 'In progress' : 'New'}</Chip></Td>
                      <Td className="whitespace-nowrap">{r.state === 'closed' ? '—' : <Cell title={<span className="font-normal">{dayLabel(r.replyDue)}</span>} note={r.state === 'new' ? 'starts on acknowledgement' : r.overdue ? `${Math.abs(r.daysLeft)} days over` : `${r.daysLeft} days left`} />}</Td>
                      <Td>{r.assignee}</Td>
                      <Td><Cell title={<span className="font-normal">{st.step}</span>} note={st.note} /></Td>
                      <Td num>{r.state !== 'closed' && <Button size="sm" variant="ghost" onClick={() => { setReplying(replying === r.issue.id ? null : r.issue.id); setAssigning(null); }}>Reply</Button>}</Td>
                    </tr>
                    {replying === r.issue.id && <tr><td colSpan={6} className="px-3 py-2"><ReplyForm r={r} viewer={snap.viewer.name} onClose={() => setReplying(null)} /></td></tr>}
                  </Fragment>
                );
              })}
            </tbody>
          </Table>
        )}
        <Why>Open a row to see the owner's message, attachments, the reply thread, upvotes from other owners, and "convert to case" when the request needs a vendor or a vote. Closed requests move to Archive after their last reply.</Why>
      </Card>

      <Card aria-label="Request runbook" className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="m-0 text-lg font-medium text-ux2-ink">Every request runs the same runbook</h2><span className="text-xs font-semibold text-ux2-teal underline">Owner request runbook · 3 of 5 steps automatic</span></div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map(([n, text, state]) => (
            <div key={n} className={cn('flex flex-col gap-1 rounded-[14px] border px-3 py-2.5 text-xs', state === 'done' ? 'border-ux2-sage-tint bg-ux2-sage-tint text-ux2-ink' : state === 'now' ? 'border-ux2-navy bg-ux2-navy text-white' : 'border-ux2-line bg-white text-ux2-ink')}>
              <span className={cn('text-[11px] font-semibold uppercase tracking-[0.06em]', state === 'now' ? 'text-white/[0.7]' : 'text-ux2-muted')}>{n}</span>
              <span>{text}</span>
            </div>
          ))}
        </div>
        <Why>The owner sees only their own request and its status (received, acknowledged, in progress, replied, closed) in Community › Requests, never the board's notes. Timeliness counts the acknowledgement and the reply; a missed clock shows here as Overdue and on Home.</Why>
      </Card>
    </div>
  );
}
