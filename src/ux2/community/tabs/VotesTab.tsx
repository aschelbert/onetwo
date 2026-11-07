import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useSpendingStore } from '@/store/useSpendingStore';
import { useElectionStore, type Election, type VoteChoice } from '@/store/useElectionStore';
import { Button, Card, Chip, Inner, SectionLabel, Table, Th, Td, Cell, KV, Why, Field, INPUT, HeaderActions } from '../../components';
import { dayLabel } from '../../home/calendar';
import { boardDecisions, voteRows, votesSummary, type VoteRow, type CommunitySnapshot } from '../metrics';

const closesLabel = (r: VoteRow) => (r.closes ? `Closes ${dayLabel(r.closes)}` : 'No close date');

/** Cast the viewer's unit ballot on the open vote: one choice per yes/no item. */
function Ballot({ r, snap, onDone }: { r: VoteRow; snap: CommunitySnapshot; onDone: () => void }) {
  const record = useElectionStore(s => s.recordBallot);
  const unit = snap.units.find(u => snap.viewer.linkedUnits.includes(u.number));
  const [choices, setChoices] = useState<Record<string, VoteChoice>>({});
  const items = r.election.ballotItems;
  const ready = items.every(i => choices[i.id]);
  return (
    <form aria-label="Ballot" onSubmit={e => { e.preventDefault(); if (!unit || !ready) return; record(r.election.id, { unitNumber: unit.number, owner: unit.owner, votingPct: unit.votingPct, method: 'virtual', recordedBy: snap.viewer.name, isProxy: false, votes: choices }, snap.viewer.name); onDone(); }} className="flex flex-col gap-3">
      {items.map(item => (
        <div key={item.id} className="flex flex-col gap-1.5">
          <div className="text-base font-semibold text-ux2-ink">{item.title}</div>
          {item.description && <p className="m-0 text-xs text-ux2-muted">{item.description}{unit ? ` Your vote is for Unit ${unit.number}.` : ''}</p>}
          {(['approve', 'deny', 'abstain'] as VoteChoice[]).map(c => (
            <label key={c} className={`flex cursor-pointer items-center gap-2 rounded-[14px] border bg-white px-3.5 py-2.5 text-sm ${choices[item.id] === c ? 'border-ux2-navy' : 'border-ux2-line'}`}>
              <input type="radio" name={`ballot-${item.id}`} checked={choices[item.id] === c} onChange={() => setChoices(ch => ({ ...ch, [item.id]: c }))} />
              {c === 'approve' ? `Yes, ${item.title.toLowerCase().replace(/\?$/, '')}` : c === 'deny' ? 'No' : 'Abstain'}
            </label>
          ))}
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-ux2-muted">{closesLabel(r)} · one vote per unit · you can change it until then</span><Button type="submit" size="sm" disabled={!unit || !ready}>{unit ? 'Submit vote' : 'No unit on this sign-in'}</Button></div>
    </form>
  );
}

/** Board: record a paper proxy ballot for a unit. */
function ProxyForm({ r, snap, onClose }: { r: VoteRow; snap: CommunitySnapshot; onClose: () => void }) {
  const record = useElectionStore(s => s.recordBallot);
  const [unit, setUnit] = useState(snap.units[0]?.number ?? '');
  const [holder, setHolder] = useState('');
  const [choice, setChoice] = useState<VoteChoice>('approve');
  const u = snap.units.find(x => x.number === unit);
  return (
    <form aria-label="Record a proxy" onSubmit={e => { e.preventDefault(); if (!u) return; const votes: Record<string, VoteChoice> = {}; for (const i of r.election.ballotItems) votes[i.id] = choice; record(r.election.id, { unitNumber: u.number, owner: u.owner, votingPct: u.votingPct, method: 'paper', recordedBy: snap.viewer.name, isProxy: true, proxyVoterName: holder, proxyAuthorizedBy: u.owner, votes }, snap.viewer.name); onClose(); }} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <div className="w-full text-sm font-semibold text-ux2-ink">Record a proxy · {r.election.title}</div>
      <Field label="Unit" className="w-[160px]"><select value={unit} onChange={e => setUnit(e.target.value)} className={INPUT}>{snap.units.map(x => <option key={x.number} value={x.number}>{x.number} · {x.owner}</option>)}</select></Field>
      <Field label="Proxy holder" className="min-w-[180px] flex-1"><input value={holder} onChange={e => setHolder(e.target.value)} placeholder="Who casts it" className={INPUT} /></Field>
      <Field label="Vote" className="w-[140px]"><select value={choice} onChange={e => setChoice(e.target.value as VoteChoice)} className={INPUT}><option value="approve">Yes</option><option value="deny">No</option><option value="abstain">Abstain</option></select></Field>
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={!u || !holder}>Record</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

function OpenVoteForm({ snap, onClose }: { snap: CommunitySnapshot; onClose: () => void }) {
  const add = useElectionStore(s => s.addElection);
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [closes, setCloses] = useState('');
  return (
    <form aria-label="Open a vote" onSubmit={e => { e.preventDefault(); if (!title) return; add({ title, type: 'other', status: 'open', description: question, createdBy: snap.viewer.name, openedAt: new Date().toISOString(), closedAt: null, certifiedAt: null, certifiedBy: null, scheduledCloseDate: closes || null, noticeDate: null, quorumRequired: 51, ballotItems: [{ id: `bi_${Date.now()}`, title: question || title, description: '', rationale: '', type: 'yes_no', requiredThreshold: 50, legalRef: '', attachments: [] }], legalRef: '', notes: '', complianceChecks: [], linkedMeetingId: null } as unknown as Omit<Election, 'id' | 'createdAt' | 'ballots' | 'timeline' | 'comments' | 'resolution' | 'linkedCaseId'>); onClose(); }} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-ux2-navy bg-white px-3.5 py-3">
      <div className="w-full text-sm font-semibold text-ux2-ink">Open an owner vote · one vote per unit, online or by paper ballot</div>
      <Field label="Title" className="min-w-[200px] flex-1"><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Adopt the 2027 budget" className={INPUT} /></Field>
      <Field label="Question on the ballot" className="min-w-[260px] flex-1"><input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Adopt the 2027 budget as presented by the board?" className={INPUT} /></Field>
      <Field label="Closes" className="w-[160px]"><input type="date" value={closes} onChange={e => setCloses(e.target.value)} className={INPUT} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm" disabled={!title}>Open the vote</Button><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button></div>
    </form>
  );
}

export default function VotesTab({ snap, selectedId, onSelect }: { snap: CommunitySnapshot; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const navigate = useNavigate();
  const rows = voteRows(snap);
  const sum = votesSummary(rows);
  const isBoard = snap.viewer.isBoard;
  const cases = useIssuesStore(s => s.cases);
  const approvals = useSpendingStore(s => s.approvals);
  const board = useBuildingStore(s => s.board);
  const getResults = useElectionStore(s => s.getResults);
  const certify = useElectionStore(s => s.certifyElection);
  const closeElection = useElectionStore(s => s.closeElection);
  const openElection = useElectionStore(s => s.openElection);
  const updateBallotItem = useElectionStore(s => s.updateBallotItem);
  const [proxyFor, setProxyFor] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [nominating, setNominating] = useState<string | null>(null);
  const [nominee, setNominee] = useState('');
  const decisions = useMemo(() => boardDecisions({ cases: cases.map(c => ({ id: c.id, title: c.title, boardVotes: c.boardVotes })), meetings: snap.meetings, approvals, boardSize: board.length }), [cases, snap.meetings, approvals, board.length]);
  const open = (selectedId && sum.open.find(r => r.election.id === selectedId)) || sum.open[0];
  const election = rows.find(r => r.election.type === 'board_election' && r.state !== 'certified');
  const closed = [...sum.toCertify, ...sum.certified];
  const proxiesOpen = sum.open.reduce((t, r) => t + r.proxies, 0);
  const quorumPct = open?.election.quorumRequired ?? rows[0]?.election.quorumRequired ?? 51;
  const quorumUnits = Math.ceil((quorumPct / 100) * Math.max(1, snap.units.length));
  const unitLabel = (n: number) => `${n} unit${n === 1 ? '' : 's'}`;
  const secretary = board.find(b => /secretary/i.test(b.role))?.name ?? snap.viewer.name;
  const nominees = (e: Election) => e.ballotItems.flatMap(i => i.candidates ?? []);

  return (
    <div className="flex flex-col gap-4">
      {isBoard && <HeaderActions><Button variant="ghost" disabled={!open} onClick={() => setProxyFor(open && proxyFor === open.election.id ? null : open?.election.id ?? null)}>Add proxy</Button><Button onClick={() => setOpening(v => !v)}>Open a vote</Button></HeaderActions>}
      {opening && <OpenVoteForm snap={snap} onClose={() => setOpening(false)} />}
      {proxyFor && open && <ProxyForm r={open} snap={snap} onClose={() => setProxyFor(null)} />}

      {open ? (
        <Card tone={!open.voted ? 'outline' : 'surface'} aria-label="Open owner vote" className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2"><SectionLabel>Open owner vote</SectionLabel><Chip tone="amber">{closesLabel(open)}</Chip></div>
              <div className="font-display text-2xl font-semibold text-ux2-ink">{open.election.title}</div>
              <div className="text-sm text-ux2-muted">One vote per unit · online or by paper ballot · results shown after close</div>
            </div>
            <div className="flex gap-1.5">
              {isBoard && <Button size="sm" variant="ghost" onClick={() => navigate('/boardroom?tab=outbox')}>Remind the {open.eligibleUnits - open.votedUnits} who have not</Button>}
              {open.voted ? <Chip tone="teal">✓ Your unit voted</Chip> : <Button size="sm" onClick={() => document.getElementById('ballot-preview')?.scrollIntoView({ behavior: 'smooth' })}>Vote</Button>}
              {isBoard && <Button size="sm" variant="ghost" onClick={() => closeElection(open.election.id, snap.viewer.name)}>Close</Button>}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
            <Inner className="flex flex-col gap-1"><span className="text-xs text-ux2-muted">Voted</span><span className="text-[15px] font-semibold text-ux2-ink">{open.votedUnits} of {open.eligibleUnits} units</span><div className="h-2 overflow-hidden rounded-full bg-ux2-line"><div className="h-full rounded-full bg-ux2-teal" style={{ width: `${open.eligibleUnits ? Math.round((open.votedUnits / open.eligibleUnits) * 100) : 0}%` }} /></div><span className="text-xs text-ux2-muted">Quorum is {open.quorumUnits} of {open.eligibleUnits}{open.quorumMet ? ', reached' : ', not yet reached'}</span></Inner>
            <Inner className="flex flex-col gap-1"><span className="text-xs text-ux2-muted">Not yet voted</span><span className="text-[15px] font-semibold text-ux2-ink">{unitLabel(open.eligibleUnits - open.votedUnits)}</span><span className="text-xs text-ux2-muted">{open.proxies ? `${open.proxies} by proxy so far. ` : ''}Vote shows for owners who have not voted{open.voted && snap.viewer.linkedUnits[0] ? `; Unit ${snap.viewer.linkedUnits[0]} voted.` : '.'}</span></Inner>
            <Inner className="flex flex-col gap-1"><span className="text-xs text-ux2-muted">Linked case</span>{open.election.linkedCaseId ? <button type="button" onClick={() => navigate(`/issues?view=case:${open.election.linkedCaseId}`)} className="text-left text-[15px] font-semibold text-ux2-teal hover:underline">{open.election.linkedCaseId}</button> : <span className="text-[15px] font-semibold text-ux2-ink">None</span>}<span className="text-xs text-ux2-muted">Result is certified by the Secretary and posted with the next minutes.</span></Inner>
          </div>
        </Card>
      ) : <Inner className="text-sm text-ux2-muted">No owner vote is open.{sum.nominations.length ? ` ${sum.nominations.length} in preparation.` : ''}</Inner>}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card aria-label="Board decisions" className="gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Board decisions</SectionLabel><span className="text-xs text-ux2-muted">Cast on the case · recorded here for everyone · {Math.max(1, Math.ceil(board.length / 2))} of {board.length} to pass</span></div>
          {decisions.length === 0 ? <Why>No board votes recorded yet.</Why> : decisions.slice(0, 6).map(d => (
            <Inner key={d.id} data-decision={d.id} className="flex items-center justify-between gap-3">
              <Cell title={d.title} note={<>{d.date ? `${d.open ? 'Opened' : 'Decided'} ${dayLabel(d.date)}` : 'Open'}{d.caseId ? <> · <button type="button" className="font-semibold text-ux2-teal hover:underline" onClick={() => navigate(`/issues?view=case:${d.caseId}`)}>{d.caseId}</button></> : null}{d.source === 'meeting' ? ' · in the minutes' : d.source === 'spending' ? ' · spending decision' : ''}</>} />
              <Chip tone={d.open ? 'plum' : d.passed ? 'sage' : 'red'}>{d.open ? `Open · ${d.yes + d.no + d.abstain} of ${board.length} cast` : `${d.passed ? 'Passed' : 'Failed'} ${d.yes} to ${d.no}`}</Chip>
            </Inner>
          ))}
          <Why>Nobody votes here. A board vote is a step on its case, so a board member casts it from the case or from the step's card on Home. When the President closes the item the result, the tally and the minutes reference post here for every owner.</Why>
        </Card>
        <Card aria-label="Election" className="gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Election</SectionLabel><Chip tone={election ? (election.state === 'open' ? 'navy' : 'sage') : 'ghost'}>{election ? (election.state === 'open' ? 'Voting open' : election.state === 'nominations' ? 'Nominations open' : 'Closed') : 'No election in preparation'}</Chip></div>
          {election ? (
            <>
              <div className="text-base font-semibold text-ux2-ink">{election.election.title}</div>
              <Inner className="py-1">
                <KV label="Seats up">{election.election.ballotItems.reduce((t, i) => t + (i.maxSelections ?? 1), 0)} of {board.length} · two-year terms</KV>
                <KV label="Nominees">{nominees(election.election).length ? nominees(election.election).map(c => `${c.name}${c.unit ? `, Unit ${c.unit}` : ''}`).join(' · ') : 'None yet'}</KV>
                <KV label="Nominations close">{election.election.scheduledCloseDate ? dayLabel(election.election.scheduledCloseDate) : 'With the notice'}</KV>
                <KV label="Ballot">{election.state === 'open' ? 'Open now' : 'Opens with the meeting notice'}</KV>
              </Inner>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setNominating(nominating ? null : election.election.id)}>Nominate someone</Button>
                {isBoard && election.state === 'nominations' && <Button size="sm" variant="ghost" onClick={() => openElection(election.election.id, snap.viewer.name)}>Open voting</Button>}
              </div>
              {nominating && (
                <form aria-label="Nominate" onSubmit={e => { e.preventDefault(); const item = election.election.ballotItems[0]; if (!item || !nominee.trim()) return; updateBallotItem(election.election.id, item.id, { type: 'multi_candidate', candidates: [...(item.candidates ?? []), { id: `cand_${Date.now()}`, name: nominee.trim(), unit: snap.viewer.linkedUnits[0] ?? '', bio: '' }] }); setNominee(''); setNominating(null); }} className="flex gap-2">
                  <input aria-label="Nominee" value={nominee} onChange={e => setNominee(e.target.value)} placeholder="Name · any owner in good standing, including you" className={INPUT} /><Button type="submit" size="sm">Add</Button>
                </form>
              )}
            </>
          ) : isBoard ? <Why>Elections are created from the annual-meeting runbook; nominations open with the notice.</Why> : <Why>No election in preparation.</Why>}
          <Why>Any owner in good standing can be nominated or self-nominate. Delinquent units can be nominated once current. Candidate statements show on the ballot.</Why>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card aria-label="Proxies and quorum" className="gap-2.5">
          <SectionLabel>Proxies and quorum</SectionLabel>
          <Inner className="py-1">
            <KV label="Quorum for owner votes and meetings">{quorumUnits} of {snap.units.length} units</KV>
            <KV label="Quorum for board votes">{Math.max(1, Math.ceil(board.length / 2))} of {board.length}</KV>
            <KV label={open ? `Proxies on file for ${open.election.title}` : 'Proxies on file for open votes'}>{proxiesOpen}</KV>
            {sum.toCertify.length > 0 && <KV label="Closed, awaiting certification">{sum.toCertify.length}</KV>}
          </Inner>
          <div className="flex flex-wrap gap-2">{isBoard && open && <Button size="sm" variant="ghost" onClick={() => setProxyFor(proxyFor ? null : open.election.id)}>Record a proxy</Button>}<Button size="sm" variant="ghost" onClick={() => navigate('/building?tab=documents')}>Proxy form</Button></div>
          <Why>A proxy counts toward quorum and lets another owner vote for a unit at one meeting. Owners add their own on this page; the board records paper proxies. Majority of units per the bylaws; DC Code § 29-1101 et seq.</Why>
        </Card>
        <Card id="ballot-preview" aria-label="Ballot" className="gap-2.5">
          <SectionLabel>{open && !open.voted ? 'Your ballot' : 'Ballot preview · what an owner sees'}</SectionLabel>
          {open ? (open.voted ? <Inner className="text-sm text-ux2-muted">Your unit has voted on {open.election.title}. Results show after {open.closes ? dayLabel(open.closes) : 'close'}.</Inner> : <Ballot r={open} snap={snap} onDone={() => onSelect(null)} />) : <Why>When an owner vote opens, the ballot shows here with one question per item.</Why>}
        </Card>
      </div>

      <Card aria-label="Results and certification" className="gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Results and certification · closed votes</SectionLabel><span className="text-xs text-ux2-muted">Results are visible to owners only after certification</span></div>
        {closed.length === 0 ? <Why>No closed votes yet.</Why> : (
          <Table minWidth={760}>
            <thead><tr><Th>Vote</Th><Th>Who</Th><Th>Closed</Th><Th>Result</Th><Th>Certified</Th><Th>Record</Th></tr></thead>
            <tbody>
              {closed.map(r => {
                const res = getResults(r.election.id, snap.units.map(u => ({ number: u.number, votingPct: u.votingPct, status: u.status })));
                const item = res?.itemResults[0];
                return (
                  <tr key={r.election.id} data-vote={r.election.id}>
                    <Td><Cell title={r.election.title} note={r.election.description || r.election.type.replace('_', ' ')} /></Td>
                    <Td className="text-ux2-muted">Owners · {r.votedUnits} of {r.eligibleUnits} voted</Td>
                    <Td className="whitespace-nowrap text-ux2-muted">{r.election.closedAt ? dayLabel(r.election.closedAt.slice(0, 10)) : r.closes ? dayLabel(r.closes) : '—'}</Td>
                    <Td>{item ? (r.state === 'certified' || isBoard ? <Chip tone={item.passed ? 'sage' : 'red'}>{item.passed ? 'Passed' : 'Failed'} · {item.approveCount ?? 0} yes{item.denyCount ? `, ${item.denyCount} no` : ''}</Chip> : <Chip tone="ghost">After certification</Chip>) : <span className="text-ux2-muted">—</span>}</Td>
                    <Td className="text-ux2-muted">{r.election.certifiedAt ? `${r.election.certifiedBy} · ${dayLabel(r.election.certifiedAt.slice(0, 10))}` : isBoard ? <Button size="sm" onClick={() => certify(r.election.id, secretary)}>Certify</Button> : 'Not yet'}</Td>
                    <Td>{r.election.linkedCaseId ? <button type="button" onClick={() => navigate(`/issues?view=case:${r.election.linkedCaseId}`)} className="font-semibold text-ux2-teal hover:underline">{r.election.linkedCaseId}</button> : r.election.linkedMeetingId ? <button type="button" onClick={() => navigate(`/community?tab=meetings&meeting=${r.election.linkedMeetingId}`)} className="font-semibold text-ux2-teal hover:underline">Minutes</button> : <span className="text-ux2-muted">—</span>}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Why>Certification is the Secretary confirming the count and quorum; the tally, the ballots and the certificate are kept with the minutes for 5 years.</Why>
      </Card>
    </div>
  );
}
