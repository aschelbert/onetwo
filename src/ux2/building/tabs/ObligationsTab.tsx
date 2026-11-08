import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore, type GoverningClause } from '@/store/useBuildingStore';
import { cn } from '@/lib/formatters';
import { Button, Card, Chip, Inner, PillTabs, SectionLabel, Table, Th, Td, Cell, Why, Field, INPUT } from '../../components';
import { dayLabel } from '../../home/calendar';
import { dutyCounts, obligationRows, obligationsSummary, roleLoads, type ObligationRow, type ObligationState, type BuildingSnapshot } from '../metrics';

type View = 'month' | 'byrole' | 'bycategory' | 'filings' | 'ongoing' | 'duties';

const STATE_LABEL: Record<ObligationState, string> = { overdue: 'Overdue', 'in-progress': 'In progress', upcoming: 'Upcoming', ongoing: 'Ongoing', auto: 'Auto-verified', met: 'Met' };
const STATE_TONE: Record<ObligationState, 'red' | 'navy' | 'cyan' | 'ghost' | 'teal' | 'sage'> = { overdue: 'red', 'in-progress': 'navy', upcoming: 'cyan', ongoing: 'ghost', auto: 'teal', met: 'sage' };
const ROLE_TONE: Record<string, 'teal' | 'plum' | 'navy' | 'amber' | 'sage' | 'ghost'> = { President: 'teal', 'Vice President': 'plum', Treasurer: 'navy', Secretary: 'amber', 'Member at Large': 'sage' };
const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('');

function howItGetsDone(r: ObligationRow): string {
  if (r.state === 'auto') return 'Verified by the document on file';
  if (r.state === 'met') return 'Done';
  if (r.kind === 'filing') return 'Filing runbook · mark filed with proof';
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

function ObligationTable({ rows, snap, isBoard, title, note, groupBy }: { rows: ObligationRow[]; snap: BuildingSnapshot; isBoard: boolean; title: string; note: string; groupBy?: 'role' | 'category' }) {
  const setCompletion = useComplianceStore(s => s.setCompletion);
  const [open, setOpen] = useState<string | null>(null);
  const [filing, setFiling] = useState<string | null>(null);
  const items = useMemo(() => new Map(snap.obligations.map(o => [o.id, o])), [snap.obligations]);
  const groups = groupBy ? Array.from(new Set(rows.map(r => groupBy === 'role' ? r.role : r.kind === 'filing' ? 'Filings' : r.scope === 'governance' ? 'Governance' : 'Operations'))) : [''];
  const inGroup = (g: string) => groupBy ? rows.filter(r => (groupBy === 'role' ? r.role : r.kind === 'filing' ? 'Filings' : r.scope === 'governance' ? 'Governance' : 'Operations') === g) : rows;
  return (
    <Card aria-label="Obligations list" className="gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>{title}</SectionLabel><span className="text-xs text-ux2-muted">{note}</span></div>
      {rows.length === 0 ? <Inner className="text-sm text-ux2-muted">Nothing here.</Inner> : (
        <Table minWidth={820}>
          <thead><tr><Th>Obligation</Th><Th>Role</Th><Th>Due</Th><Th>How it gets done</Th><Th>Status</Th><Th aria-label="Actions" /></tr></thead>
          <tbody>
            {groups.map(g => (
              <Fragment key={g || 'all'}>
                {groupBy && <tr><td colSpan={6} className="bg-ux2-surface px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ux2-muted">{g} · {inGroup(g).length}</td></tr>}
                {inGroup(g).map(r => {
                  const item = items.get(r.id);
                  const key = `${r.kind}:${r.id}`;
                  return (
                    <Fragment key={key}>
                      <tr data-obligation={r.id} onClick={() => setOpen(open === key ? null : key)} className={cn('cursor-pointer hover:bg-ux2-surface', r.state === 'overdue' && 'bg-ux2-red-tint/40')}>
                        <Td><Cell title={r.task} note={`${r.id} · ${r.kind === 'filing' ? 'filing' : r.scope}${r.critical ? ' · critical' : ''}${r.legalRef ? ` · ${r.legalRef}` : ''}`} /></Td>
                        <Td className="whitespace-nowrap">{r.role}</Td>
                        <Td className="whitespace-nowrap text-ux2-muted">{r.dated ? dayLabel(r.due) : r.due}</Td>
                        <Td className="text-ux2-muted">{howItGetsDone(r)}</Td>
                        <Td><Chip tone={STATE_TONE[r.state]}>{STATE_LABEL[r.state]}{r.state === 'overdue' && r.daysLeft !== undefined ? ` · ${Math.abs(r.daysLeft)}d` : ''}</Chip></Td>
                        <Td num onClick={e => e.stopPropagation()}>
                          {isBoard && r.kind === 'obligation' && r.state !== 'auto' && (r.state === 'met'
                            ? <Button size="sm" variant="ghost" onClick={() => setCompletion(r.id, false)}>Reopen</Button>
                            : <Button size="sm" variant="ghost" onClick={() => setCompletion(r.id, true)}>Mark done</Button>)}
                          {isBoard && r.kind === 'filing' && r.state !== 'met' && <Button size="sm" onClick={() => setFiling(filing === r.id ? null : r.id)}>Mark filed</Button>}
                        </Td>
                      </tr>
                      {(open === key || filing === r.id) && (
                        <tr><td colSpan={6} className="px-3 py-2">
                          {filing === r.id && <FileForm r={r} onClose={() => setFiling(null)} />}
                          {open === key && item && (
                            <Inner className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                              <div><div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ux2-muted">Why it matters</div><p className="m-0 mt-1 text-ux2-ink">{item.whyItMatters}</p></div>
                              <div><div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ux2-muted">If it is missed</div><p className="m-0 mt-1 text-ux2-ink">{item.consequence}</p></div>
                              <div><div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ux2-muted">How to</div><ol className="m-0 mt-1 list-decimal pl-4 text-ux2-ink">{item.howTo.map((h, i) => <li key={i}>{h}</li>)}</ol>{item.tip && <p className="m-0 mt-1 text-xs text-ux2-muted">{item.tip}</p>}</div>
                            </Inner>
                          )}
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
      <Why>Expanding a row shows why it matters, what happens if it is missed and the how-to steps; "Mark filed" asks for proof. "How it gets done" is the runbook in Board Room for the board; owners see the status only.</Why>
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
  const byRole = (role: string) => rows.filter(r => r.role === role && r.state !== 'auto');
  const freq = (list: ObligationRow[]) => { const m: Record<string, number> = {}; for (const r of list) { const k = r.kind === 'filing' ? 'Filing' : r.dated ? 'Annual' : 'Ongoing'; m[k] = (m[k] ?? 0) + 1; } return Object.entries(m).map(([k, v]) => `${k} · ${v}`).join(' · '); };
  return (
    <div className="flex flex-col gap-4">
      <div><h2 className="m-0 text-xl font-medium text-ux2-ink">Duties and roles</h2><p className="m-0 max-w-[760px] text-sm text-ux2-muted">Who is responsible for what: the three fiduciary duties every board member carries, each officer's obligations, the member at large, and what the building expects of every unit owner.</p></div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {[
          ['Duty of care', duties.care, 'Act as a reasonably prudent person would: come to meetings, read the packet before voting, ask questions, decide on the facts.', 'Scored under Oversight and Timeliness.', 'teal'],
          ['Duty of loyalty', duties.loyalty, 'Put the association first: disclose every conflict, step out of related votes, never self-deal.', 'Conflict disclosures collected each January; the case workspace checks them before a vote.', 'plum'],
          ['Duty of compliance', duties.obedience, 'Follow the bylaws, the CC&Rs and the law in every decision. The board can only do what they allow.', 'Scored under Compliance, the dimension of the same name. Called the duty of obedience in the law · DC Code § 29-1101 et seq.', 'amber'],
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
          <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-base font-semibold text-ux2-ink">Every unit owner</div><div className="text-xs text-ux2-muted">{units.length} units · what the bylaws and CC&Rs expect · shown to owners under My Unit</div></div><Chip tone="amber">Proposed · not in production today</Chip></div>
          <div className="flex flex-col gap-1.5">
            {[
              ['Pay assessments by the 1st; late fee on the 15th', `${current} of ${units.length} current`, current === units.length ? 'sage' : 'amber'],
              ['Keep an HO-6 policy on file and renew it', 'Not tracked yet', 'ghost'],
              ['Follow the rules and policies; pets and rentals registered', rulesOnFile ? 'Rules on file' : 'Rules missing', rulesOnFile ? 'sage' : 'red'],
              ['Give 48 hours access for inspections and repairs', 'Per request', 'ghost'],
              ['Report leaks, hazards and damage the day they happen', 'Ongoing', 'ghost'],
              ['Vote, or send a proxy, when the owners are asked', 'Counted per vote', 'ghost'],
              ['Keep contact details current; tell the board before a sale or rental', 'Within 30 days', 'ghost'],
            ].map(([t, v, tone]) => <div key={String(t)} className="flex items-center justify-between gap-2 rounded-[14px] border border-ux2-line bg-white px-3 py-2 text-[13px] text-ux2-ink"><span>{t}</span><Chip tone={tone as 'sage' | 'amber' | 'red' | 'ghost'}>{v}</Chip></div>)}
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
  const rows = useMemo(() => obligationRows(snap), [snap]);
  const sum = obligationsSummary(rows);
  const view: View = section === 'duties' ? 'duties' : section === 'filings' ? 'filings' : section === 'ongoing' ? 'ongoing' : section === 'byrole' ? 'byrole' : section === 'bycategory' ? 'bycategory' : 'month';
  const month = snap.today.slice(0, 7);
  const monthName = new Date(snap.today + 'T00:00').toLocaleDateString('en-US', { month: 'long' });
  const thisMonth = rows.filter(r => r.state === 'overdue' || r.state === 'in-progress' || (r.dated && r.due.startsWith(month)));
  const open = rows.filter(r => r.state !== 'met' && r.state !== 'auto');
  const rulesOnFile = snap.legalDocuments.some(d => /rule/i.test(d.name) && d.attachments.length > 0);
  const policies = snap.legalDocuments.filter(d => /polic/i.test(d.name)).length;
  const sources = `Sources: DC Code § 29-1101 et seq. · ${snap.legalDocuments.some(d => /bylaw/i.test(d.name)) ? 'Bylaws on file' : 'Bylaws missing'} · ${snap.legalDocuments.some(d => /cc&r|covenant/i.test(d.name)) ? 'CC&Rs on file' : 'CC&Rs missing'} · ${rulesOnFile ? 'Rules on file' : 'Rules missing'} · ${policies} policies`;

  return (
    <div className="flex flex-col gap-4">
      <PillTabs size="filter" aria-label="Obligation views" value={view} onChange={v => onSection(v === 'month' ? 'list' : v)} tabs={[{ id: 'month', label: 'This month' }, { id: 'byrole', label: 'By role' }, { id: 'bycategory', label: 'By category' }, { id: 'filings', label: `Filings · ${snap.filings.length}` }, { id: 'ongoing', label: `Ongoing · ${sum.ongoing}` }, { id: 'duties', label: 'Duties and roles' }]} />
      {view !== 'duties' && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Obligation counts">
            {[
              ['Met', `${sum.met}`, `of ${sum.total}`, sum.overdue.length ? `${sum.overdue.length} overdue` : 'on the record'],
              ['In progress', `${sum.inProgress.length + sum.overdue.length}`, '', 'each one is a Home card for its role'],
              ['Auto-verified by documents', `${sum.auto}`, '', 'bylaws, policies, insurance on file'],
              ['Board checklist', `${sum.pct}`, '%', 'feeds Oversight for board members'],
            ].map(([label, n, unit, sub]) => (
              <div key={label} className="flex min-h-[120px] flex-col gap-1.5 rounded-[22px] border border-ux2-line bg-ux2-surface px-[18px] py-4">
                <div className="text-xs font-semibold text-ux2-muted">{label}</div>
                <div className="text-[30px] font-semibold leading-none tracking-[-0.03em] text-ux2-ink">{n}{unit && <small className="ml-1 text-[13px] font-medium tracking-normal text-ux2-muted">{unit}</small>}</div>
                <div className="text-xs text-ux2-muted">{sub}</div>
              </div>
            ))}
          </div>
          {view === 'month' && <ObligationTable rows={thisMonth.length ? thisMonth : open.slice(0, 12)} snap={snap} isBoard={isBoard} title={monthName} note={sources} />}
          {view === 'byrole' && <ObligationTable rows={open} snap={snap} isBoard={isBoard} title="Open · by role" note={sources} groupBy="role" />}
          {view === 'bycategory' && <ObligationTable rows={open} snap={snap} isBoard={isBoard} title="Open · by category" note={sources} groupBy="category" />}
          {view === 'filings' && <ObligationTable rows={rows.filter(r => r.kind === 'filing')} snap={snap} isBoard={isBoard} title="Filings" note="Biennial report, 1120-H, D-20 and the rest of the filing calendar · the filing runbook pre-fills each from records" />}
          {view === 'ongoing' && <ObligationTable rows={rows.filter(r => r.state === 'ongoing')} snap={snap} isBoard={isBoard} title="Ongoing" note="Per-meeting and standing duties with no single date" />}
        </>
      )}
      {view === 'duties' && <Duties rows={rows} snap={snap} />}
      {view !== 'duties' && <Why>Runbooks, open cases and the outbox are operations, so they live in <button type="button" onClick={() => navigate('/boardroom?tab=runbooks')} className="font-semibold text-ux2-teal hover:underline">Board Room</button>. Nothing here is deeper than tab › section; whatever needs someone this week is also a Home card.</Why>}
    </div>
  );
}
