import { useState } from 'react';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useAuthStore } from '@/store/useAuthStore';
import { tally, type RollVote } from '@/lib/caseTools';
import { Button, Chip, Inner, Field, INPUT } from '../../components';
import { todayIso } from '../../runbook/adapters';

const CHOICES: [RollVote, string][] = [['approve', 'For'], ['deny', 'Against'], ['abstain', 'Abstain']];

/**
 * A board vote taken in the app: every board member is listed and votes by
 * name. Votes are saved on the action as they are cast, so members can vote
 * from their own sign-in; whoever closes the vote fixes the result. The vote
 * carries when more vote for than against and a majority of the board voted.
 */
export default function BoardVoteRoll({ caseId, motion, onClose }: { caseId: string; motion: string; onClose: (result: { on: string; inFavor: number; against: number; passed: boolean }) => void }) {
  const board = useBuildingStore(s => s.board);
  const me = useAuthStore(s => s.currentUser.name);
  const saved = useIssuesStore(s => s.cases.find(c => c.id === caseId)?.boardVotes);
  const save = useIssuesStore(s => s.saveBoardVote);
  const [on, setOn] = useState(saved?.date || todayIso());
  const votes = saved?.motion === motion ? saved.votes : [];
  const voteOf = (name: string) => votes.find(v => v.name === name)?.vote as RollVote | undefined;
  const cast = (name: string, role: string, vote: RollVote) => save(caseId, motion, on, [...votes.filter(v => v.name !== name), { name, role, vote }]);
  const t = tally(votes.map(v => v.vote as RollVote), board.length);
  return (
    <Inner className="flex flex-col gap-2" aria-label="Board vote">
      <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm font-semibold text-ux2-ink">Board vote · {t.inFavor} for, {t.against} against{t.abstained ? `, ${t.abstained} abstaining` : ''}</b><Chip tone={t.quorum ? (t.passed ? 'sage' : 'red') : 'amber'}>{t.quorum ? (t.passed ? 'Carries' : 'Fails') : `${t.needed - t.cast} more to vote`}</Chip></div>
      {board.length === 0 && <span className="text-sm text-ux2-muted">No board members are listed under Building › Directory, so there is nobody to vote.</span>}
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {board.map(m => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-ux2-ink"><span>{m.name}<span className="text-xs text-ux2-muted"> · {m.role}{m.name === me ? ' · you' : ''}</span></span>
            <span className="flex gap-1.5">{CHOICES.map(([v, label]) => <Button key={v} size="sm" variant={voteOf(m.name) === v ? 'primary' : 'ghost'} aria-pressed={voteOf(m.name) === v} aria-label={`${m.name}: ${label}`} onClick={() => cast(m.name, m.role, v)}>{label}</Button>)}</span></li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Voted on" className="w-[170px]"><input type="date" value={on} max={todayIso()} onChange={e => setOn(e.target.value)} className={INPUT} /></Field>
        <Button size="sm" disabled={!t.quorum || !on} onClick={() => { save(caseId, motion, on, votes); onClose({ on, inFavor: t.inFavor, against: t.against, passed: t.passed }); }}>Close the vote</Button>
      </div>
      <span className="text-xs text-ux2-muted">Each member can vote from their own sign-in, or the secretary can enter the roll call from the meeting. The vote, by name, is kept in this action's decision trail. A vote taken outside a meeting needs whatever the bylaws ask for that (often every member's written consent).</span>
    </Inner>
  );
}
