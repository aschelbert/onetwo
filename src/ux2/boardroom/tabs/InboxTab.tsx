import { useMemo, useState } from 'react';
import IssuesPage from '@/features/issues/IssuesPage';
import { useIssuesStore } from '@/store/useIssuesStore';
import { Button, Card, Chip, Inner, SectionLabel } from '../../components';
import { dayLabel } from '../../home/calendar';
import { inboxRows, inboxSummary, type InboxRow, type BoardRoomSnapshot } from '../metrics';

type Filter = 'all' | 'mine' | 'overdue' | 'closed';

function stepLabel(r: InboxRow): string {
  if (r.state === 'closed') return 'Step 5 of 5 · Closed';
  if (r.state === 'new') return 'Step 2 of 5 · Acknowledge';
  if (r.linkedCase) return 'Step 4 of 5 · Resolve';
  return 'Step 3 of 5 · Assign';
}

export default function InboxTab({ snap, onOpenCase }: { snap: BoardRoomSnapshot; onOpenCase: (id: string) => void }) {
  const rows = useMemo(() => inboxRows(snap), [snap]);
  const sum = inboxSummary(rows);
  const updateIssueStatus = useIssuesStore(s => s.updateIssueStatus);
  const [filter, setFilter] = useState<Filter>('all');
  const list = rows.filter(r => filter === 'all' ? r.state !== 'closed' : filter === 'mine' ? r.mine && r.state !== 'closed' : filter === 'overdue' ? r.overdue : r.state === 'closed');
  const needs = [...sum.unacknowledged, ...sum.overdue.filter(r => r.state !== 'new')].slice(0, 4);

  return (
    <div className="flex flex-col gap-5">
      {needs.length > 0 && (
        <Card aria-label="Needs you">
          <div className="flex items-center justify-between"><SectionLabel>Needs you</SectionLabel><span className="text-xs text-ux2-dim">Replies count toward Timeliness for whoever sends them</span></div>
          <ul className="m-0 list-none divide-y divide-ux2-line p-0">
            {needs.map(r => (
              <li key={r.issue.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold text-ux2-ink">{r.state === 'new' ? `Acknowledge ${r.issue.title}` : `Reply to ${r.issue.title}`}{r.issue.unitNumber ? ` · Unit ${r.issue.unitNumber}` : ''}</div>
                  <div className="text-xs text-ux2-muted">{r.issue.reporterName || 'An owner'} asked on {dayLabel(r.issue.submittedDate.slice(0, 10))} · {r.state === 'new' ? `48-hour window ${r.ackDue < snap.today ? 'passed' : `ends ${dayLabel(r.ackDue)}`} · acknowledging starts the 14-day clock` : `reply ${r.overdue ? `was due ${dayLabel(r.replyDue)}` : `due ${dayLabel(r.replyDue)} · ${r.daysLeft} days`}`}{r.linkedCase ? ` · ${r.assignee} is driving ${r.linkedCase.id}` : ' · nobody is assigned yet'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Chip tone={r.overdue ? 'red' : 'amber'}>{r.overdue ? 'Overdue' : r.state === 'new' ? 'New' : `${r.daysLeft} days`}</Chip>
                  {r.state === 'new' && <Button size="sm" onClick={() => updateIssueStatus(r.issue.id, 'IN_PROGRESS')}>Acknowledge</Button>}
                  {r.linkedCase && <Button size="sm" variant="ghost" onClick={() => onOpenCase(r.linkedCase!.id)}>Open the case</Button>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card aria-label="Requests">
        <div className="flex flex-wrap gap-1.5">
          {([['all', `All · ${sum.open.length}`], ['mine', `Mine · ${sum.mine.length}`], ['overdue', `Overdue · ${sum.overdue.length}`], ['closed', `Closed · ${sum.closed.length}`]] as [Filter, string][]).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setFilter(id)} className="rounded-full"><Chip tone={filter === id ? 'navy' : id === 'overdue' && sum.overdue.length ? 'red' : 'ghost'}>{label}</Chip></button>
          ))}
        </div>
        {list.length === 0 ? <p className="text-sm text-ux2-muted">Nothing here.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.06em] text-ux2-muted">
                  <th className="py-2 pr-3 font-semibold">Request</th><th className="py-2 pr-3 font-semibold">Status</th><th className="py-2 pr-3 font-semibold">Reply due</th><th className="hidden py-2 pr-3 font-semibold md:table-cell">Assignee</th><th className="hidden py-2 font-semibold md:table-cell">Runbook step</th>
                </tr>
              </thead>
              <tbody>
                {list.map(r => (
                  <tr key={r.issue.id} data-request={r.issue.id} className="border-t border-ux2-line align-top">
                    <td className="py-2.5 pr-3">
                      <div className="font-semibold text-ux2-ink">{r.issue.title}</div>
                      <div className="text-xs text-ux2-dim">{r.issue.id}{r.issue.unitNumber ? ` · Unit ${r.issue.unitNumber}` : ''} · {r.issue.reporterName || 'owner'} · received {dayLabel(r.issue.submittedDate.slice(0, 10))} · {r.upvotes} upvote{r.upvotes === 1 ? '' : 's'}{r.linkedCase ? <> · <button type="button" className="text-ux2-teal hover:underline" onClick={() => onOpenCase(r.linkedCase!.id)}>{r.linkedCase.id}</button></> : null}</div>
                    </td>
                    <td className="py-2.5 pr-3"><Chip tone={r.state === 'closed' ? 'sage' : r.overdue ? 'red' : r.state === 'in_progress' ? 'navy' : 'amber'}>{r.state === 'closed' ? 'Closed' : r.overdue ? 'Reply overdue' : r.state === 'in_progress' ? 'In progress' : 'New'}</Chip></td>
                    <td className="py-2.5 pr-3 whitespace-nowrap text-ux2-ink">{r.state === 'closed' ? '—' : <>{dayLabel(r.replyDue)}<div className="text-xs text-ux2-muted">{r.overdue ? `${Math.abs(r.daysLeft)} days over` : `${r.daysLeft} days left`}</div></>}</td>
                    <td className="hidden py-2.5 pr-3 text-ux2-ink md:table-cell">{r.assignee}</td>
                    <td className="hidden py-2.5 text-xs text-ux2-muted md:table-cell">{stepLabel(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Inner className="text-xs text-ux2-muted">Every request runs the same runbook: 1 Intake · 2 Acknowledge within 48 hours · 3 Assign · 4 Resolve and reply before the clock runs out · 5 Close. Reply, change status and convert to a case below.</Inner>
      </Card>

      <Card aria-label="Reply and convert">
        <SectionLabel>Reply, status and convert to case</SectionLabel>
        <div className="ux2-legacy"><IssuesPage embedded /></div>
      </Card>
    </div>
  );
}
