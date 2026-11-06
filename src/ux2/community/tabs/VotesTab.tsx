import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import VotingPage from '@/features/elections/ElectionsPage';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useSpendingStore } from '@/store/useSpendingStore';
import { Button, Card, Chip, Inner, SectionLabel } from '../../components';
import { dayLabel } from '../../home/calendar';
import { boardDecisions, voteRows, votesSummary, type CommunitySnapshot } from '../metrics';

export default function VotesTab({ snap, selectedId, onSelect }: { snap: CommunitySnapshot; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const navigate = useNavigate();
  const rows = voteRows(snap);
  const sum = votesSummary(rows);
  const isBoard = snap.viewer.isBoard;
  const cases = useIssuesStore(s => s.cases);
  const approvals = useSpendingStore(s => s.approvals);
  const board = useBuildingStore(s => s.board);
  const decisions = useMemo(() => boardDecisions({
    cases: cases.map(c => ({ id: c.id, title: c.title, boardVotes: c.boardVotes })),
    meetings: snap.meetings,
    approvals,
    boardSize: board.length,
  }), [cases, snap.meetings, approvals, board.length]);
  const proxies = sum.open.reduce((t, r) => t + r.proxies, 0);
  const quorumPct = sum.open[0]?.election.quorumRequired ?? rows[0]?.election.quorumRequired ?? 51;
  const quorumUnits = Math.ceil((quorumPct / 100) * Math.max(1, snap.units.length));

  return (
    <div className="flex flex-col gap-5">
      {sum.open.length === 0 ? (
        <Inner className="text-sm text-ux2-muted">No owner vote is open.{sum.nominations.length ? ` ${sum.nominations.length} in preparation.` : ''}</Inner>
      ) : sum.open.map(r => (
        <Card key={r.election.id} tone={!r.voted && !isBoard ? 'navy' : 'surface'} aria-label="Open owner vote">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <SectionLabel className={!r.voted && !isBoard ? 'text-white/[0.66]' : undefined}>Open owner vote{r.closes ? ` · closes ${dayLabel(r.closes)}` : ''}</SectionLabel>
              <div className="text-xl font-semibold">{r.election.title}</div>
              <div className={`text-sm ${!r.voted && !isBoard ? 'text-white/[0.8]' : 'text-ux2-muted'}`}>One vote per unit · {r.election.ballotItems.length} item{r.election.ballotItems.length === 1 ? '' : 's'} · results shown after close{r.election.linkedCaseId ? ` · linked case ${r.election.linkedCaseId}` : ''}</div>
            </div>
            <div className="flex items-center gap-2">
              <Chip tone={r.quorumMet ? 'sage' : 'amber'}>{r.votedUnits} of {r.eligibleUnits} voted · quorum {r.quorumUnits}{r.quorumMet ? ' reached' : ''}</Chip>
              {r.voted ? <Chip tone="teal">✓ Your unit voted</Chip> : <Button size="sm" variant={!isBoard ? 'ghost' : 'primary'} className={!isBoard ? 'border-white/40 bg-transparent text-white hover:bg-white/10' : undefined} onClick={() => onSelect(r.election.id)}>Vote</Button>}
            </div>
          </div>
          {isBoard && r.eligibleUnits - r.votedUnits > 0 && (
            <Inner className="text-xs text-ux2-muted">{r.eligibleUnits - r.votedUnits} units have not voted · {r.proxies} by proxy so far. Record paper ballots and proxies below; remind the rest with a notice.</Inner>
          )}
        </Card>
      ))}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Card aria-label="Board decisions">
          <SectionLabel>Board decisions · recorded here for everyone</SectionLabel>
          {decisions.length === 0 ? <p className="text-sm text-ux2-muted">No board votes recorded yet.</p> : (
            <ul className="m-0 list-none divide-y divide-ux2-line p-0">
              {decisions.slice(0, 8).map(d => (
                <li key={d.id} data-decision={d.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold text-ux2-ink">{d.title}</div>
                    <div className="text-xs text-ux2-muted">{d.date ? `${d.open ? 'Opened' : 'Decided'} ${dayLabel(d.date)}` : 'Open'}{d.caseId ? <> · <button type="button" className="text-ux2-teal hover:underline" onClick={() => navigate(`/issues?view=case:${d.caseId}`)}>case</button></> : null}{d.source === 'meeting' ? ' · in the minutes' : d.source === 'spending' ? ' · spending decision' : ''}</div>
                  </div>
                  <Chip tone={d.open ? 'plum' : d.passed ? 'sage' : 'red'}>{d.open ? `Open · ${d.yes + d.no + d.abstain} of ${board.length} cast` : `${d.passed ? 'Passed' : 'Failed'} ${d.yes} to ${d.no}`}</Chip>
                </li>
              ))}
            </ul>
          )}
          <Inner className="text-xs text-ux2-muted">Nobody votes here. A board vote is a step on its case; a board member casts it from the case or its Home card. The result and the minutes reference post here for every owner.</Inner>
        </Card>
        <Card aria-label="Election, proxies and quorum">
          <SectionLabel>Election, proxies and quorum</SectionLabel>
          {sum.nominations.length > 0 ? sum.nominations.map(r => (
            <Inner key={r.election.id}>
              <div className="text-sm font-semibold text-ux2-ink">{r.election.title}</div>
              <div className="text-xs text-ux2-muted">{r.election.ballotItems.length} item{r.election.ballotItems.length === 1 ? '' : 's'} on the ballot · opens when the board opens voting{r.election.linkedMeetingId ? ' · tied to a meeting' : ''}</div>
            </Inner>
          )) : <p className="text-xs text-ux2-muted">No election in preparation.</p>}
          <ul className="m-0 list-none p-0 text-sm text-ux2-ink">
            <li className="flex justify-between py-1"><span>Quorum for owner votes</span><b className="font-semibold">{quorumUnits} of {snap.units.length} units · {quorumPct}%</b></li>
            <li className="flex justify-between py-1"><span>Quorum for board votes</span><b className="font-semibold">{Math.max(1, Math.ceil(board.length / 2))} of {board.length}</b></li>
            <li className="flex justify-between py-1"><span>Proxies on file for open votes</span><b className="font-semibold">{proxies}</b></li>
            {sum.toCertify.length > 0 && <li className="flex justify-between py-1"><span>Closed, awaiting certification</span><b className="font-semibold">{sum.toCertify.length}</b></li>}
          </ul>
          <Inner className="text-xs text-ux2-muted">A proxy counts toward quorum and lets another owner vote for a unit. {isBoard ? 'Record ballots and proxies on the vote below.' : 'Ask the board to record your proxy, or vote online.'}</Inner>
        </Card>
      </div>

      <Card aria-label="Votes and ballots">
        <div className="flex items-center justify-between">
          <SectionLabel>{selectedId ? 'This vote' : 'Every vote'}</SectionLabel>
          {selectedId && <Button size="sm" variant="ghost" onClick={() => onSelect(null)}>All votes</Button>}
        </div>
        <div className="ux2-legacy"><VotingPage key={selectedId ?? 'list'} embedded initialSelectedId={selectedId} /></div>
      </Card>
    </div>
  );
}
