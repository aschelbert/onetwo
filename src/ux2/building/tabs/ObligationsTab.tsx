import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { caseProgress, obligationCase } from '../../runbook/obligationCases';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore, type GoverningClause } from '@/store/useBuildingStore';
import { cn } from '@/lib/formatters';
import { Button, Card, Chip, Inner, PillTabs, SectionLabel, Table, Th, Td, Cell, Why, Field, INPUT } from '../../components';
import { dayLabel } from '../../home/calendar';
import RecordsSection from './RecordsSection';
import { RHYTHM_LABEL, RHYTHM_NOTE, allObligations, dutyCounts, obligationRows, obligationsSummary, roleLoads, type ObligationRow, type ObligationState, type BuildingSnapshot, type Rhythm } from '../metrics';
import { recordKind } from '@/lib/buildingRecords';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { COMFORT_KIND, comfortFrom, comfortObligations } from '../comfort';
import { standingOf } from '@/lib/policyRead';

type View = 'month' | 'byrole' | 'bycategory' | 'byrhythm' | 'filings' | 'records' | 'ongoing' | 'duties';
const RHYTHMS: Rhythm[] = ['ongoing', 'dated', 'event', 'once'];
const RHYTHM_TONE: Record<Rhythm, 'ghost' | 'cyan' | 'amber' | 'sage'> = { ongoing: 'ghost', dated: 'cyan', event: 'amber', once: 'sage' };

const COUNT_TONES: Record<string, { name: string; box: string; ink: string; muted: string }> = {
  Met: { name: 'navy', box: 'border-ux2-navy bg-ux2-navy', ink: 'text-white', muted: 'text-white/[0.72]' },
  'In progress': { name: 'teal', box: 'border-ux2-teal bg-ux2-teal', ink: 'text-white', muted: 'text-white/[0.78]' },
  'Board checklist': { name: 'cyan', box: 'border-ux2-cyan bg-ux2-cyan', ink: 'text-ux2-navy', muted: 'text-ux2-navy/[0.72]' },
  default: { name: 'surface', box: 'border-ux2-line bg-ux2-surface', ink: 'text-ux2-ink', muted: 'text-ux2-muted' },
};
const STATE_LABEL: Record<ObligationState, string> = { overdue: 'Overdue', 'in-progress': 'In progress', upcoming: 'Upcoming', ongoing: 'Ongoing', auto: 'Auto-verified', met: 'Met' };
const STATE_TONE: Record<ObligationState, 'red' | 'navy' | 'cyan' | 'ghost' | 'teal' | 'sage'> = { overdue: 'red', 'in-progress': 'navy', upcoming: 'cyan', ongoing: 'ghost', auto: 'teal', met: 'sage' };
const ROLE_TONE: Record<string, 'teal' | 'plum' | 'navy' | 'amber' | 'sage' | 'ghost'> = { President: 'teal', 'Vice President': 'plum', Treasurer: 'navy', Secretary: 'amber', 'Member at Large': 'sage' };
const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('');

function howItGetsDone(r: ObligationRow): string {
  if (r.state === 'auto') return 'Verified by the document on file';
  if (r.state === 'met') return 'Done';
  if (r.kind === 'filing') return 'Filing runbook · mark filed with proof';
  if (r.id.startsWith('comfort-')) return 'A reading, logged under Upkeep';
  if (r.kind === 'record') return 'Recorded under Licences and certificates';
  return r.howToCount ? `${r.howToCount} step${r.howToCount === 1 ? '' : 's'} · each a Home card when due` : 'On the obligations list';
}

function FileForm({ r, onClose }: { r: ObligationRow; onClose: () => void }) {
  const mark = useComplianceStore(s => s.markFilingComplete);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [conf, setConf] = useState('');
  return (
    <form aria-label={`Mark ${r.task} filed`} onSubmit={e => { e.preventDefault(); mark(r.id, date, conf); onClose(); }} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <Field label="Filed on" className="w-[160px]"><input type="date" value={date} onChange={e => setDate(e.target.value)} className={INPUT} /></Field>
      <Field label="Confirmation #" className="min-w-[200px] flex-1"><input value={conf} onChange={e => setConf(e.target.value)} placeholder="Proof of filing" className={INPUT} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm">Mark filed</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

function ObligationTable({ rows, snap, isBoard, title, note, groupBy, onRecords }: { rows: ObligationRow[]; snap: BuildingSnapshot; isBoard: boolean; title: string; note: string; groupBy?: 'role' | 'category' | 'rhythm'; onRecords?: () => void }) {
  const setCompletion = useComplianceStore(s => s.setCompletion);
  const cases = useIssuesStore(s => s.cases);
  const navigate = useNavigate();
  const [open, setOpen] = useState<string | null>(null);
  const [filing, setFiling] = useState<string | null>(null);
  const items = useMemo(() => new Map(snap.obligations.map(o => [o.id, o])), [snap.obligations]);
  const groupOf = (r: ObligationRow) => (groupBy === 'role' ? r.role : groupBy === 'rhythm' ? RHYTHM_LABEL[r.rhythm] : r.kind === 'filing' ? 'Filings' : r.kind === 'record' ? 'Licences and certificates' : r.scope === 'governance' ? 'Governance' : 'Operations');
  const groups = groupBy === 'rhythm' ? RHYTHMS.map(x => RHYTHM_LABEL[x]).filter(g => rows.some(r => RHYTHM_LABEL[r.rhythm] === g)) : groupBy ? Array.from(new Set(rows.map(groupOf))) : [''];
  const inGroup = (g: string) => (groupBy ? rows.filter(r => groupOf(r) === g) : rows);
  const groupNote = (g: string) => (groupBy === 'rhythm' ? ` · ${RHYTHM_NOTE[RHYTHMS.find(x => RHYTHM_LABEL[x] === g)!]}` : '');
  return (
    <Card aria-label="Obligations list" className="gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>{title}</SectionLabel><span className="text-xs text-ux2-muted">{note}</span></div>
      {rows.length === 0 ? <Inner className="text-sm text-ux2-muted">Nothing here.</Inner> : (
        <Table minWidth={820}>
          <thead><tr><Th>Obligation</Th><Th>Role</Th><Th>Rhythm</Th><Th>Due</Th><Th>How it gets done</Th><Th>Status</Th><Th aria-label="Actions" /></tr></thead>
          <tbody>
            {groups.map(g => (
              <Fragment key={g || 'all'}>
                {groupBy && <tr data-group={g}><td colSpan={7} className="bg-ux2-surface px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ux2-muted">{g} · {inGroup(g).length}<span className="font-normal normal-case tracking-normal">{groupNote(g)}</span></td></tr>}
                {inGroup(g).map(r => {
                  const item = items.get(r.id);
                  const key = `${r.kind}:${r.id}`;
                  return (
                    <Fragment key={key}>
                      <tr data-obligation={r.id} data-rhythm={r.rhythm} onClick={() => setOpen(open === key ? null : key)} className={cn('cursor-pointer hover:bg-ux2-surface', r.state === 'overdue' && 'bg-ux2-red-tint/40')}>
                        <Td><Cell title={r.task} note={`${r.id.startsWith('comfort-') ? 'a check with readings' : r.kind === 'record' ? 'licence or certificate' : `${r.id} · ${r.kind === 'filing' ? 'filing' : r.scope}`}${r.critical ? ' · critical' : ''}${r.legalRef ? ` · ${r.legalRef}` : ''}`} /></Td>
                        <Td className="whitespace-nowrap">{r.role}</Td>
                        <Td className="whitespace-nowrap"><Chip tone={RHYTHM_TONE[r.rhythm]}>{RHYTHM_LABEL[r.rhythm]}</Chip>{r.freq && r.freq.toLowerCase() !== RHYTHM_LABEL[r.rhythm].toLowerCase() && <span className="block text-xs text-ux2-muted">{r.freq}</span>}</Td>
                        <Td className="whitespace-nowrap text-ux2-muted">{r.dated ? dayLabel(r.due) : r.due}</Td>
                        <Td className="text-ux2-muted">{howItGetsDone(r)}</Td>
                        <Td><Chip tone={STATE_TONE[r.state]}>{STATE_LABEL[r.state]}{r.state === 'overdue' && r.daysLeft !== undefined ? ` · ${Math.abs(r.daysLeft)}d` : ''}</Chip></Td>
                        <Td num onClick={e => e.stopPropagation()}>
                          {r.kind === 'record' && onRecords && <Button size="sm" variant="ghost" onClick={() => (r.id.startsWith('comfort-') ? navigate('/building?tab=upkeep') : onRecords())}>Open</Button>}
                          {isBoard && r.kind !== 'record' && r.state !== 'met' && r.state !== 'auto' && (() => {
                            // Start walks through the steps as a case; once one is open, Continue picks it up.
                            const c = obligationCase(cases, r.kind === 'filing' ? 'filing' : 'obligation', r.id);
                            const p = c ? caseProgress(c) : null;
                            return c && p
                              ? <Button size="sm" onClick={() => navigate(`/issues?view=case:${encodeURIComponent(c.id)}`)}>Continue · {p.done} of {p.total}</Button>
                              : <Button size="sm" onClick={() => navigate(`/obligations/start?kind=${r.kind === 'filing' ? 'filing' : 'obligation'}&id=${encodeURIComponent(r.id)}`)}>Start</Button>;
                          })()}
                          {isBoard && r.kind === 'obligation' && r.state !== 'auto' && (r.state === 'met'
                            ? <Button size="sm" variant="ghost" onClick={() => setCompletion(r.id, false)}>Reopen</Button>
                            : <Button size="sm" variant="ghost" onClick={() => setCompletion(r.id, true)}>Mark done</Button>)}
                          {isBoard && r.kind === 'filing' && r.state !== 'met' && <Button size="sm" variant="ghost" onClick={() => setFiling(filing === r.id ? null : r.id)}>Mark filed</Button>}
                        </Td>
                      </tr>
                      {(open === key || filing === r.id) && (
                        <tr><td colSpan={7} className="px-3 py-2">
                          {filing === r.id && <FileForm r={r} onClose={() => setFiling(null)} />}
                          {open === key && item && (
                            <Inner className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                              <div><div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ux2-muted">Why it matters</div><p className="m-0 mt-1 text-ux2-ink">{item.whyItMatters}</p></div>
                              <div><div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ux2-muted">If it is missed</div><p className="m-0 mt-1 text-ux2-ink">{item.consequence}</p></div>
                              <div><div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ux2-muted">How to</div><ol className="m-0 mt-1 list-decimal pl-4 text-ux2-ink">{item.howTo.map((h, i) => <li key={i}>{h}</li>)}</ol>{item.tip && <p className="m-0 mt-1 text-xs text-ux2-muted">{item.tip}</p>}</div>
                            </Inner>
                          )}
                          {open === key && r.kind === 'record' && <Inner className="text-sm text-ux2-ink">{r.id.startsWith('comfort-') ? 'A reading is logged under Building › Upkeep. One under the minimum opens a repair.' : recordKind(r.id)?.what}{recordKind(r.id)?.appliesNote ? <span className="mt-1 block text-xs text-ux2-muted">{recordKind(r.id)!.appliesNote}</span> : null}</Inner>}
                          {open === key && !item && r.kind === 'filing' && <Inner className="text-sm text-ux2-muted">{snap.filings.find(f => f.id === r.id)?.notes || 'A filing on the calendar; mark it filed with the confirmation number as proof.'}</Inner>}
                        </td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </Table>
      )}
      <Why>Start walks through an obligation as an action: its runbook's steps, or its how-to list as a checklist where each item links to where it's done, then a step to record it. Closing the action as Resolved marks it done (a filing: filed). Mark done and Mark filed are there when it's already been handled. Expanding a row shows why it matters, what happens if it is missed and the how-to steps; owners see the status only.</Why>
    </Card>
  );
}

const PROPOSED_MAL = ['Attend every board meeting and read the packet 48 hours before', 'Vote on every motion; abstain only with a disclosed conflict', 'Back up whichever officer is out: notices, minutes or payments', 'Walk the building each quarter and log what needs attention', 'Chair one committee or project a year', "Be the owners' voice: bring requests and concerns to the agenda"];

/** Clauses accepted from the bylaws or rules in setup: the section, its heading, and the words. */
function ClauseList({ list, label }: { list: GoverningClause[]; label: string }) {
  if (!list.length) return null;
  return (
    <div className="flex flex-col gap-1.5" data-clauses={label}>
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ux2-plum">{label}</div>
      {list.map(c => (
        <details key={c.id} className="rounded-[14px] border border-ux2-plum-tint bg-white px-3 py-2 text-[13px] text-ux2-ink">
          <summary className="cursor-pointer list-none font-semibold">{c.ref ? <span className="mr-1.5 font-normal text-ux2-muted">{c.ref}</span> : null}{c.heading}</summary>
          <p className="m-0 mt-1.5 leading-relaxed">{c.text}</p>
          {c.source && <p className="m-0 mt-1 text-xs text-ux2-muted">{c.source}</p>}
        </details>
      ))}
    </div>
  );
}

function Duties({ rows, snap }: { rows: ObligationRow[]; snap: BuildingSnapshot }) {
  const clauses = useBuildingStore(s => s.governingClauses);
  const clausesFor = (topic: GoverningClause['topic'], role?: string) => clauses.filter(c => c.topic === topic && (!role || (c.role ?? '').toLowerCase() === role.toLowerCase()));
  const duties = dutyCounts(rows);
  const loads = useMemo(() => roleLoads(rows, snap.board, snap.today), [rows, snap.board, snap.today]);
  const units = useFinancialStore(s => s.units);
  const current = units.filter(u => u.balance <= 0).length;
  const rulesOnFile = snap.legalDocuments.some(d => /rule/i.test(d.name) && d.attachments.length > 0);
  const unitDocs = useFinancialStore(st => st.unitDocuments);
  const insured = units.filter(u => { const d = unitDocs.filter(x => x.unitNumber === u.number && /insur|ho-?6|\bcoi\b/i.test(`${x.docType} ${x.filename}`)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]; return !!d && standingOf(d.details?.expires, snap.today) !== 'lapsed'; }).length;
  const byRole = (role: string) => rows.filter(r => r.role === role && r.state !== 'auto');
  const freq = (list: ObligationRow[]) => RHYTHMS.map(x => [x, list.filter(r => r.rhythm === x).length] as const).filter(([, n]) => n > 0).map(([x, n]) => `${RHYTHM_LABEL[x]} · ${n}`).join(' · ');
  return (
    <div className="flex flex-col gap-4">
      <div><h2 className="m-0 text-xl font-medium text-ux2-ink">Duties and roles</h2><p className="m-0 max-w-[760px] text-sm text-ux2-muted">Who is responsible for what: the three fiduciary duties every board member carries, each officer's obligations, the member at large, and what the building expects of every unit owner.</p></div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {[
          ['Duty of care', duties.care, 'Act as a reasonably prudent person would: come to meetings, read the packet before voting, ask questions, decide on the facts.', 'Scored under Oversight and Timeliness.', 'teal'],
          ['Duty of loyalty', duties.loyalty, 'Put the association first: disclose every conflict, step out of related votes, never self-deal.', 'Conflict disclosures collected each January; the action checks them before a vote.', 'plum'],
          ['Duty of compliance', duties.obedience, 'Follow the bylaws, the CC&Rs and the law in every decision. The board can only do what they allow.', 'Scored under Compliance, the dimension of the same name. Called the duty of obedience in the law · DC Code § 42-1903.08', 'amber'],
        ].map(([name, n, text, note, tone]) => (
          <Card key={String(name)} aria-label={String(name)} className="gap-1.5">
            <div className="flex items-center justify-between gap-2"><SectionLabel>{name}</SectionLabel><Chip tone={tone as 'teal' | 'plum' | 'amber'}>{n} obligations</Chip></div>
            <p className="m-0 text-sm text-ux2-ink">{text}</p>
            <p className="m-0 text-xs text-ux2-muted">{note}</p>
          </Card>
        ))}
      </div>
      <Card aria-label="Who carries what" className="gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="m-0 text-lg font-medium text-ux2-ink">Who carries what</h3><span className="text-[13px] text-ux2-muted">{rows.filter(r => r.state !== 'auto' && r.state !== 'met').length} board obligations today · each one is a Home card for its role when it comes due</span></div>
        <Table minWidth={760}>
          <thead><tr><Th>Role</Th><Th>Member</Th><Th num>Obligations</Th><Th num>Critical</Th><Th num>Ongoing</Th><Th num>With a date</Th><Th>This month</Th></tr></thead>
          <tbody>
            {loads.map(l => (
              <tr key={l.role}>
                <Td><Chip tone={ROLE_TONE[l.role] ?? 'ghost'}>{l.role}</Chip></Td>
                <Td>{l.member ?? <span className="text-ux2-dim">Vacant</span>}</Td>
                <Td num>{l.obligations}{l.role === 'Member at Large' && l.obligations === 0 ? <span className="text-xs text-ux2-muted"> · {PROPOSED_MAL.length} proposed</span> : ''}</Td>
                <Td num>{l.obligations ? l.critical : '—'}</Td><Td num>{l.obligations ? l.ongoing : '—'}</Td><Td num>{l.obligations ? l.dated : '—'}</Td>
                <Td className="text-ux2-muted">{l.thisMonth.length === 0 ? (l.role === 'Member at Large' ? 'Nothing assigned today · see below' : 'Nothing due') : l.thisMonth.slice(0, 2).map(r => `${r.task} · ${r.dated ? dayLabel(r.due) : r.due}`).join(' · ')}{l.thisMonth.length > 2 ? ` · +${l.thisMonth.length - 2}` : ''}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Why>Counts come from the obligations list. Every item has a why, a consequence and a how-to inside its Home card; the legal reference stays in grey.</Why>
      </Card>
      {clausesFor('board').length > 0 && (
        <Card aria-label="The board, from your bylaws" className="gap-2">
          <div className="text-base font-semibold text-ux2-ink">The board · what your bylaws say</div>
          <ClauseList list={clausesFor('board')} label="From your bylaws" />
        </Card>
      )}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {['President', 'Vice President', 'Treasurer', 'Secretary'].map(role => {
          const list = byRole(role);
          const member = snap.board.find(b => b.role === role);
          return (
            <Card key={role} aria-label={`${role} duties`} className="gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-full bg-ux2-teal-tint text-[11px] font-bold text-ux2-teal">{member ? initials(member.name) : '—'}</span><div><div className="text-base font-semibold text-ux2-ink">{role}</div><div className="text-xs text-ux2-muted">{member?.name ?? 'Vacant'}{list.length ? ` · ${freq(list)}` : ''}</div></div></div>
                <Chip tone="ghost">{list.length} obligations</Chip>
              </div>
              <div className="flex flex-col gap-1.5">{list.slice(0, 8).map(r => <div key={`${r.kind}:${r.id}`} className="rounded-[14px] border border-ux2-line bg-white px-3 py-2 text-[13px] text-ux2-ink">{r.task}</div>)}{list.length > 8 && <span className="text-xs text-ux2-muted">+{list.length - 8} more on the list</span>}{list.length === 0 && <span className="text-xs text-ux2-muted">Nothing assigned to this role.</span>}</div>
              <ClauseList list={clausesFor('officer', role)} label="From your bylaws" />
            </Card>
          );
        })}
        <Card aria-label="Member at Large duties" className="gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-full bg-ux2-sage-tint text-[11px] font-bold text-ux2-sage">{snap.board.find(b => b.role === 'Member at Large') ? initials(snap.board.find(b => b.role === 'Member at Large')!.name) : '—'}</span><div><div className="text-base font-semibold text-ux2-ink">Member at Large</div><div className="text-xs text-ux2-muted">{snap.board.find(b => b.role === 'Member at Large')?.name ?? 'Vacant'} · Proposed</div></div></div>
            <Chip tone="amber">Proposed · not in production today</Chip>
          </div>
          <div className="flex flex-col gap-1.5">{PROPOSED_MAL.map(t => <div key={t} className="rounded-[14px] border border-ux2-line bg-white px-3 py-2 text-[13px] text-ux2-ink">{t}</div>)}</div>
        </Card>
        <Card aria-label="Every unit owner" className="gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-base font-semibold text-ux2-ink">Every unit owner</div><div className="text-xs text-ux2-muted">{units.length} units · what the bylaws and CC&Rs expect · shown to owners under My Unit</div></div><Chip tone="ghost">Shown to each owner under Me › Units</Chip></div>
          <div className="flex flex-col gap-1.5">
            {([
              ['Pay assessments by the 1st; late fee on the 15th', 'ongoing', `${current} of ${units.length} current`, current === units.length ? 'sage' : 'amber'],
              ['Keep an HO-6 policy on file and renew it', 'dated', `${insured} of ${units.length} on file`, insured === units.length ? 'sage' : 'amber'],
              ['Follow the rules and policies; pets and rentals registered', 'ongoing', rulesOnFile ? 'Rules on file' : 'Rules missing', rulesOnFile ? 'sage' : 'red'],
              ['Give 48 hours access for inspections and repairs', 'event', 'Per request', 'ghost'],
              ['Report leaks, hazards and damage the day they happen', 'event', 'As they happen', 'ghost'],
              ['Vote, or send a proxy, when the owners are asked', 'event', 'Counted per vote', 'ghost'],
              ['Keep contact details current; tell the board before a sale or rental', 'event', 'Within 30 days', 'ghost'],
            ] as [string, Rhythm, string, 'sage' | 'amber' | 'red' | 'ghost'][]).map(([t, rhythm, v, tone]) => <div key={t} data-owner-duty={rhythm} className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-ux2-line bg-white px-3 py-2 text-[13px] text-ux2-ink"><span>{t}</span><span className="flex items-center gap-1.5"><Chip tone={RHYTHM_TONE[rhythm]}>{RHYTHM_LABEL[rhythm]}</Chip><Chip tone={tone}>{v}</Chip></span></div>)}
          </div>
          <ClauseList list={clausesFor('owners')} label="From your bylaws" />
          <Why>These feed the building score, not an individual owner score. Owners see their own status on My Unit; the board sees the building-wide counts here.</Why>
        </Card>
        {clausesFor('rules').length > 0 && (
          <Card aria-label="Rules for residents" className="gap-2">
            <div><div className="text-base font-semibold text-ux2-ink">Rules for residents</div><div className="text-xs text-ux2-muted">From your bylaws and rules · pets, leasing, noise, parking, alterations</div></div>
            <ClauseList list={clausesFor('rules')} label="From your documents" />
          </Card>
        )}
      </div>
    </div>
  );
}

export default function ObligationsTab({ snap, section, onSection, isBoard }: { snap: BuildingSnapshot; section?: string; onSection: (s: string) => void; isBoard: boolean }) {
  const navigate = useNavigate();
  // The score counts the board's obligations and filings; the tables also list the licences and certificates.
  const sum = useMemo(() => obligationsSummary(obligationRows(snap)), [snap]);
  // Heat and hot water are ongoing checks with readings behind them; they are listed with the rest and open on Upkeep.
  const comfort = useActionRecordsStore(st => st.records.find(r => r.kind === COMFORT_KIND))?.data;
  const rows = useMemo(() => { const extra = comfortObligations(comfortFrom(comfort), snap.today); const rank: Record<ObligationState, number> = { overdue: 0, 'in-progress': 1, upcoming: 2, ongoing: 3, auto: 4, met: 5 }; return [...allObligations(snap), ...extra].sort((x, y) => rank[x.state] - rank[y.state]); }, [snap, comfort]);
  const view: View = section === 'records' ? 'records' : section === 'duties' ? 'duties' : section === 'filings' ? 'filings' : section === 'ongoing' ? 'ongoing' : section === 'byrole' ? 'byrole' : section === 'byrhythm' ? 'byrhythm' : section === 'bycategory' ? 'bycategory' : 'month';
  const month = snap.today.slice(0, 7);
  const monthName = new Date(snap.today + 'T00:00').toLocaleDateString('en-US', { month: 'long' });
  const thisMonth = rows.filter(r => r.state === 'overdue' || r.state === 'in-progress' || (r.dated && r.due.startsWith(month)));
  const open = rows.filter(r => r.state !== 'met' && r.state !== 'auto');
  const rulesOnFile = snap.legalDocuments.some(d => /rule/i.test(d.name) && d.attachments.length > 0);
  const policies = snap.legalDocuments.filter(d => /polic/i.test(d.name)).length;
  const sources = `Sources: DC Code § 42-1901.01 et seq. · ${snap.legalDocuments.some(d => /bylaw/i.test(d.name)) ? 'Bylaws on file' : 'Bylaws missing'} · ${snap.legalDocuments.some(d => /cc&r|covenant/i.test(d.name)) ? 'CC&Rs on file' : 'CC&Rs missing'} · ${rulesOnFile ? 'Rules on file' : 'Rules missing'} · ${policies} policies`;

  return (
    <div className="flex flex-col gap-4">
      <PillTabs size="filter" aria-label="Obligation views" value={view} onChange={v => onSection(v === 'month' ? 'list' : v)} tabs={[{ id: 'month', label: 'This month' }, { id: 'byrole', label: 'By role' }, { id: 'bycategory', label: 'By category' }, { id: 'byrhythm', label: 'Ongoing or dated' }, { id: 'filings', label: `Filings · ${snap.filings.length}` }, { id: 'records', label: 'Licences and certificates' }, { id: 'ongoing', label: `Ongoing · ${rows.filter(r => r.state === 'ongoing').length}` }, { id: 'duties', label: 'Duties and roles' }]} />
      {view === 'records' && <RecordsSection snap={snap} isBoard={isBoard} onEditDetails={() => navigate('/building?tab=overview&section=details')} />}
      {view !== 'duties' && view !== 'records' && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Obligation counts">
            {[
              ['Met', `${sum.met}`, `of ${sum.total}`, sum.overdue.length ? `${sum.overdue.length} overdue` : 'on the record'],
              ['In progress', `${sum.inProgress.length + sum.overdue.length}`, '', 'each one is a Home card for its role'],
              ['Auto-verified by documents', `${sum.auto}`, '', 'bylaws, policies, insurance on file'],
              ['Board checklist', `${sum.pct}`, '%', 'feeds Oversight for board members'],
            ].map(([label, n, unit, sub]) => {
              // Met in brand navy, In progress in dark teal, Board checklist in aqua; the rest stay on the grey surface.
              const tone = COUNT_TONES[label] ?? COUNT_TONES.default;
              return (
                <div key={label} data-tone={tone.name} className={cn('flex min-h-[120px] flex-col gap-1.5 rounded-[22px] border px-[18px] py-4', tone.box)}>
                  <div className={cn('text-xs font-semibold', tone.muted)}>{label}</div>
                  <div className={cn('text-[30px] font-semibold leading-none tracking-[-0.03em]', tone.ink)}>{n}{unit && <small className={cn('ml-1 text-[13px] font-medium tracking-normal', tone.muted)}>{unit}</small>}</div>
                  <div className={cn('text-xs', tone.muted)}>{sub}</div>
                </div>
              );
            })}
          </div>
          {view === 'month' && <ObligationTable rows={thisMonth.length ? thisMonth : open.slice(0, 12)} snap={snap} isBoard={isBoard} title={monthName} note={sources} onRecords={() => onSection('records')} />}
          {view === 'byrole' && <ObligationTable rows={open} snap={snap} isBoard={isBoard} title="Open · by role" note={sources} groupBy="role" onRecords={() => onSection('records')} />}
          {view === 'bycategory' && <ObligationTable rows={open} snap={snap} isBoard={isBoard} title="Open · by category" note={sources} groupBy="category" onRecords={() => onSection('records')} />}
          {view === 'byrhythm' && <ObligationTable rows={rows.filter(r => r.state !== 'auto')} snap={snap} isBoard={isBoard} title="Every obligation · by how it comes round" note="Ongoing, on a date, when something happens, or one time" groupBy="rhythm" onRecords={() => onSection('records')} />}
          {view === 'filings' && <ObligationTable rows={rows.filter(r => r.kind === 'filing')} snap={snap} isBoard={isBoard} title="Filings" note="Biennial report, 1120-H, D-20 and the rest of the filing calendar · the filing runbook pre-fills each from records" />}
          {view === 'ongoing' && <ObligationTable rows={rows.filter(r => r.state === 'ongoing')} snap={snap} isBoard={isBoard} title="Ongoing" note="Per-meeting and standing duties with no single date" />}
        </>
      )}
      {view === 'duties' && <Duties rows={rows} snap={snap} />}
      {view !== 'duties' && view !== 'records' && <Why>Runbooks, current actions and the outbox are operations, so they live in <button type="button" onClick={() => navigate('/boardroom?tab=runbooks')} className="font-semibold text-ux2-teal hover:underline">Board Room</button>. Nothing here is deeper than tab › section; whatever needs someone this week is also a Home card.</Why>}
    </div>
  );
}
