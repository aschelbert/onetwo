import { useMemo, useState } from 'react';
import BoardRoomPage from '@/features/boardroom/BoardRoomPage';
import { useComplianceStore } from '@/store/useComplianceStore';
import { Button, Card, Chip, Inner, PillTabs, SectionLabel, Tile, TileRow } from '../../components';
import { dayLabel } from '../../home/calendar';
import { dutyCounts, obligationRows, obligationsSummary, roleLoads, type ObligationRow, type ObligationState, type BuildingSnapshot } from '../metrics';

type Section = 'list' | 'calendar' | 'duties';
const SECTIONS: Section[] = ['list', 'calendar', 'duties'];
type Filter = 'month' | 'open' | 'filings' | 'ongoing' | 'all';

const STATE_LABEL: Record<ObligationState, string> = { overdue: 'Overdue', 'in-progress': 'In progress', upcoming: 'Upcoming', ongoing: 'Ongoing', auto: 'Auto-verified', met: 'Met' };
const STATE_TONE: Record<ObligationState, 'red' | 'navy' | 'cyan' | 'ghost' | 'teal' | 'sage'> = { overdue: 'red', 'in-progress': 'navy', upcoming: 'cyan', ongoing: 'ghost', auto: 'teal', met: 'sage' };

function ObligationList({ rows, snap, isBoard, onCalendar }: { rows: ObligationRow[]; snap: BuildingSnapshot; isBoard: boolean; onCalendar: () => void }) {
  const [filter, setFilter] = useState<Filter>('open');
  const [role, setRole] = useState<string>('all');
  const setCompletion = useComplianceStore(s => s.setCompletion);
  const month = snap.today.slice(0, 7);
  const roles = useMemo(() => Array.from(new Set(rows.map(r => r.role))).sort(), [rows]);
  const list = rows
    .filter(r => role === 'all' || r.role === role)
    .filter(r => {
      if (filter === 'all') return true;
      if (filter === 'filings') return r.kind === 'filing';
      if (filter === 'ongoing') return r.state === 'ongoing';
      if (filter === 'month') return r.state === 'overdue' || (r.dated && r.due.startsWith(month));
      return r.state !== 'met' && r.state !== 'auto';
    });
  const counts = {
    month: rows.filter(r => r.state === 'overdue' || (r.dated && r.due.startsWith(month))).length,
    open: rows.filter(r => r.state !== 'met' && r.state !== 'auto').length,
    filings: rows.filter(r => r.kind === 'filing').length,
    ongoing: rows.filter(r => r.state === 'ongoing').length,
    all: rows.length,
  };
  return (
    <Card aria-label="Obligations list">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {([['month', 'This month'], ['open', 'Open'], ['filings', 'Filings'], ['ongoing', 'Ongoing'], ['all', 'All']] as [Filter, string][]).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setFilter(id)} className="rounded-full"><Chip tone={filter === id ? 'navy' : 'ghost'}>{label} · {counts[id]}</Chip></button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-ux2-muted">
          By role
          <select value={role} onChange={e => setRole(e.target.value)} className="h-8 rounded-lg border border-ux2-line bg-white px-2 text-xs text-ux2-ink">
            <option value="all">Everyone</option>
            {roles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
      </div>
      {list.length === 0 ? <p className="text-sm text-ux2-muted">Nothing here.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.06em] text-ux2-muted">
                <th className="py-2 pr-3 font-semibold">Obligation</th><th className="py-2 pr-3 font-semibold">Role</th><th className="py-2 pr-3 font-semibold">Due</th><th className="hidden py-2 pr-3 font-semibold md:table-cell">How it gets done</th><th className="py-2 pr-3 font-semibold">Status</th><th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {list.slice(0, 80).map(r => (
                <tr key={`${r.kind}:${r.id}`} data-obligation={r.id} className="border-t border-ux2-line align-top">
                  <td className="py-2 pr-3">
                    <div className="font-semibold text-ux2-ink">{r.task}</div>
                    <div className="text-xs text-ux2-dim">{r.id} · {r.kind === 'filing' ? 'filing' : r.scope}{r.critical ? ' · critical' : ''}{r.legalRef ? ` · ${r.legalRef}` : ''}</div>
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap text-ux2-ink">{r.role}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-ux2-muted">{r.dated ? dayLabel(r.due) : r.due}</td>
                  <td className="hidden py-2 pr-3 text-xs text-ux2-muted md:table-cell">{r.kind === 'filing' ? 'Filing runbook · mark filed with proof' : r.howToCount ? `${r.howToCount} step${r.howToCount === 1 ? '' : 's'} in the Governance Calendar` : 'On the Governance Calendar'}</td>
                  <td className="py-2 pr-3"><Chip tone={STATE_TONE[r.state]}>{STATE_LABEL[r.state]}{r.state === 'overdue' && r.daysLeft !== undefined ? ` · ${Math.abs(r.daysLeft)}d` : ''}</Chip></td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {isBoard && r.kind === 'obligation' && r.state !== 'auto' && (
                      r.state === 'met'
                        ? <Button size="sm" variant="ghost" onClick={() => setCompletion(r.id, false)}>Reopen</Button>
                        : <Button size="sm" variant="ghost" onClick={() => setCompletion(r.id, true)}>Mark done</Button>
                    )}
                    {isBoard && r.kind === 'filing' && r.state !== 'met' && <Button size="sm" onClick={onCalendar}>Mark filed</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length > 80 && <div className="pt-2 text-xs text-ux2-dim">{list.length - 80} more</div>}
        </div>
      )}
      <Inner className="text-xs text-ux2-muted">Every owner can see this list; it is the building's compliance record. The Governance Calendar holds the why, the consequence, the how-to steps, attachments and "mark filed" with proof; the board edits there.</Inner>
    </Card>
  );
}

export default function ObligationsTab({ snap, section, onSection, isBoard }: { snap: BuildingSnapshot; section?: string; onSection: (s: string) => void; isBoard: boolean }) {
  const rows = useMemo(() => obligationRows(snap), [snap]);
  const sum = obligationsSummary(rows);
  const duties = dutyCounts(rows);
  const loads = useMemo(() => roleLoads(rows, snap.board, snap.today), [rows, snap.board, snap.today]);
  const current: Section = (SECTIONS as string[]).includes(section ?? '') ? (section as Section) : 'list';

  return (
    <div className="flex flex-col gap-5">
      <TileRow>
        <Tile tone={sum.overdue.length > 0 ? 'red' : sum.open > 0 ? 'navy' : 'teal'} label="Met" value={sum.met} unit={`of ${sum.total}`} sub={`${sum.overdue.length} overdue · ${sum.inProgress.length} in progress · ${sum.upcoming.length} upcoming · each open one is a Home card for its role`} className="min-h-[150px]" />
        <Tile tone="grey" label="Auto-verified by documents" value={sum.auto} sub="Bylaws, policies and insurance on file satisfy these without a step" className="min-h-[150px]" />
        <Tile tone="grey" label="Board checklist" value={sum.pct} unit="%" sub={`${sum.ongoing} ongoing or per-meeting duties · feeds Oversight for board members`} className="min-h-[150px]" />
      </TileRow>
      <PillTabs
        size="filter"
        aria-label="Obligation views"
        value={current}
        onChange={onSection}
        tabs={[
          { id: 'list', label: 'The list' },
          { id: 'calendar', label: 'Governance Calendar' },
          { id: 'duties', label: 'Duties and roles' },
        ]}
      />
      {current === 'list' && <ObligationList rows={rows} snap={snap} isBoard={isBoard} onCalendar={() => onSection('calendar')} />}
      {current === 'calendar' && <div className="ux2-legacy"><BoardRoomPage embedded tab="runbook" /></div>}
      {current === 'duties' && (
        <div className="flex flex-col gap-5">
          <div className="grid gap-3 md:grid-cols-3">
            <Card tone="teal" className="gap-1" aria-label="Duty of care">
              <SectionLabel className="text-white/[0.66]">Duty of care</SectionLabel>
              <div className="text-2xl font-semibold">{duties.care} obligations</div>
              <p className="text-sm text-white/[0.85]">Act as a reasonably prudent person would: come to meetings, read the packet before voting, ask questions, decide on the facts. Scored under Oversight and Timeliness.</p>
            </Card>
            <Card className="gap-1" aria-label="Duty of loyalty">
              <SectionLabel>Duty of loyalty</SectionLabel>
              <div className="text-2xl font-semibold text-ux2-ink">{duties.loyalty} obligations</div>
              <p className="text-sm text-ux2-muted">Put the association first: disclose every conflict, step out of related votes, never self-deal. The case workspace checks disclosures before a vote.</p>
            </Card>
            <Card className="gap-1" aria-label="Duty of compliance">
              <SectionLabel>Duty of compliance</SectionLabel>
              <div className="text-2xl font-semibold text-ux2-ink">{duties.obedience} obligations</div>
              <p className="text-sm text-ux2-muted">Follow the bylaws, the CC&Rs and the law in every decision. Scored under Compliance. Called the duty of obedience in the law.</p>
            </Card>
          </div>
          <Card aria-label="Who carries what">
            <SectionLabel>Who carries what</SectionLabel>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.06em] text-ux2-muted">
                    <th className="py-2 pr-3 font-semibold">Role</th><th className="py-2 pr-3 font-semibold">Member</th><th className="py-2 pr-3 text-right font-semibold">Open</th><th className="py-2 pr-3 text-right font-semibold">Critical</th><th className="py-2 pr-3 text-right font-semibold">Ongoing</th><th className="py-2 pr-3 text-right font-semibold">Dated</th><th className="py-2 font-semibold">This month</th>
                  </tr>
                </thead>
                <tbody>
                  {loads.map(l => (
                    <tr key={l.role} className="border-t border-ux2-line">
                      <td className="py-2 pr-3 font-semibold text-ux2-ink">{l.role}</td>
                      <td className="py-2 pr-3 text-ux2-ink">{l.member ?? <span className="text-ux2-dim">Vacant</span>}</td>
                      <td className="py-2 pr-3 text-right">{l.obligations}</td>
                      <td className="py-2 pr-3 text-right">{l.critical}</td>
                      <td className="py-2 pr-3 text-right">{l.ongoing}</td>
                      <td className="py-2 pr-3 text-right">{l.dated}</td>
                      <td className="py-2 text-xs text-ux2-muted">{l.thisMonth.length === 0 ? 'Nothing due' : l.thisMonth.slice(0, 2).map(r => `${r.task} · ${r.dated ? dayLabel(r.due) : r.due}`).join(' · ')}{l.thisMonth.length > 2 ? ` · +${l.thisMonth.length - 2}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Inner className="text-xs text-ux2-muted">Counts come from the obligations list. Member at Large carries no officer obligations; every unit owner is expected to pay on time, follow the rules and vote.</Inner>
          </Card>
          <div className="ux2-legacy"><BoardRoomPage embedded tab="duties" /></div>
        </div>
      )}
    </div>
  );
}
