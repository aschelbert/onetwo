import { useState } from 'react';
import { useElectionStore, type Election, type BallotItem, type VoteMethod, type VoteChoice, type ElectionType, type Candidate } from '@/store/useElectionStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import Modal from '@/components/ui/Modal';

const TYPE_LABELS: Record<ElectionType, string> = { board_election: 'Board Election', budget_approval: 'Budget Approval', special_assessment: 'Special Assessment', bylaw_amendment: 'Bylaw Amendment', rule_change: 'Rule Change', other: 'Other' };
const STATUS_STYLE: Record<string, string> = { draft: 'bg-ink-100 text-ink-600', open: 'bg-green-100 text-green-700', closed: 'bg-yellow-100 text-yellow-700', certified: 'bg-sage-100 text-sage-700' };
const METHOD_ICON: Record<VoteMethod, string> = { paper: '📄', oral: '🗣', virtual: '💻' };

type ModalType = null | 'createElection' | 'addBallotItem' | 'addCandidate' | 'recordBallot' | 'castVote' | 'designateProxy';

export default function VotingPage() {
  const store = useElectionStore();
  const fin = useFinancialStore();
  const { currentUser, currentRole } = useAuthStore();
  const building = useBuildingStore();
  const isBoard = currentRole === 'BOARD_MEMBER' || currentRole === 'PROPERTY_MANAGER';
  const isResident = currentRole === 'RESIDENT';

  const units = fin.units;
  const occupiedUnits = units.filter(u => u.status === 'OCCUPIED');

  // Resident's linked units
  const myLinkedUnits = currentUser?.linkedUnits || [];
  const myUnits = units.filter(u => myLinkedUnits.includes(u.number));

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalType>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [ballotItemForm, setBallotItemForm] = useState<{ title: string; description: string; type: 'yes_no' | 'multi_candidate' | 'multi_select'; threshold: string; maxSelections: string; legalRef: string; candidates: Candidate[] }>({ title: '', description: '', type: 'yes_no', threshold: '50.1', maxSelections: '1', legalRef: '', candidates: [] });
  const [candidateForm, setCandidateForm] = useState({ name: '', unit: '', bio: '' });
  const [ballotForm, setBallotForm] = useState<{ unitNumber: string; method: VoteMethod; proxyFor: string; votes: Record<string, VoteChoice | string[]> }>({ unitNumber: '', method: 'virtual', proxyFor: '', votes: {} });
  // Resident self-vote
  const [selfVoteUnit, setSelfVoteUnit] = useState('');
  const [selfVotes, setSelfVotes] = useState<Record<string, VoteChoice | string[]>>({});
  // Proxy designation
  const [proxyForm, setProxyForm] = useState({ unitNumber: '', proxyName: '', proxyEmail: '' });

  const f = (k: string) => form[k] || '';
  const sf = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const selected = store.elections.find(e => e.id === selectedId);
  const results = selected ? store.getResults(selected.id, units.map(u => ({ number: u.number, votingPct: u.votingPct, status: u.status }))) : null;

  // Elections visible to residents: only open, closed, certified
  const visibleElections = isBoard ? store.elections : store.elections.filter(e => e.status !== 'draft');

  // Check if resident already voted for a unit
  const hasVoted = (electionId: string, unitNum: string) => {
    const el = store.elections.find(e => e.id === electionId);
    return el ? el.ballots.some(b => b.unitNumber === unitNum) : false;
  };

  // ─── Create Election ───
  const handleCreate = () => {
    if (!f('title')) { alert('Title required'); return; }
    store.addElection({
      title: f('title'),
      type: (f('type') || 'board_election') as ElectionType,
      status: 'draft',
      description: f('description'),
      createdBy: currentUser?.name || 'Board',
      openedAt: null, closedAt: null, certifiedAt: null, certifiedBy: null,
      quorumRequired: parseFloat(f('quorum')) || 25,
      ballotItems: [],
      legalRef: f('legalRef'),
      notes: '',
    });
    setModal(null); setForm({});
  };

  // ─── Add Ballot Item ───
  const handleAddBallotItem = () => {
    if (!selected || !ballotItemForm.title) return;
    store.addBallotItem(selected.id, {
      title: ballotItemForm.title, description: ballotItemForm.description, type: ballotItemForm.type,
      candidates: ballotItemForm.type !== 'yes_no' ? ballotItemForm.candidates : undefined,
      maxSelections: ballotItemForm.type === 'multi_select' ? parseInt(ballotItemForm.maxSelections) || 1 : undefined,
      requiredThreshold: parseFloat(ballotItemForm.threshold) || 50.1, legalRef: ballotItemForm.legalRef,
    });
    setModal(null);
    setBallotItemForm({ title: '', description: '', type: 'yes_no', threshold: '50.1', maxSelections: '1', legalRef: '', candidates: [] });
  };

  // ─── Record Ballot (board recording for any unit) ───
  const handleRecordBallot = () => {
    if (!selected || !ballotForm.unitNumber) { alert('Select a unit'); return; }
    const unit = units.find(u => u.number === ballotForm.unitNumber);
    if (!unit) return;
    store.recordBallot(selected.id, {
      unitNumber: unit.number, owner: unit.owner, votingPct: unit.votingPct,
      method: ballotForm.method, recordedBy: currentUser?.name || 'Board',
      proxyFor: ballotForm.proxyFor || undefined, votes: ballotForm.votes,
    });
    setModal(null);
    setBallotForm({ unitNumber: '', method: 'virtual', proxyFor: '', votes: {} });
  };

  // ─── Resident Self-Vote ───
  const handleSelfVote = () => {
    if (!selected || !selfVoteUnit) return;
    const unit = units.find(u => u.number === selfVoteUnit);
    if (!unit) return;
    store.recordBallot(selected.id, {
      unitNumber: unit.number, owner: unit.owner, votingPct: unit.votingPct,
      method: 'virtual', recordedBy: currentUser?.name || unit.owner,
      votes: selfVotes,
    });
    setModal(null); setSelfVotes({}); setSelfVoteUnit('');
  };

  // ─── Election List ───
  if (!selected) {
    // Count open elections for resident badge
    const openCount = visibleElections.filter(e => e.status === 'open').length;

    return (
      <div className="space-y-0">
        <div className="bg-gradient-to-r from-ink-900 via-ink-800 to-accent-800 rounded-t-xl p-8 text-white shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold">🗳 Votes & Resolutions</h2>
              <p className="text-accent-200 text-sm mt-1">
                {visibleElections.length} vote{visibleElections.length !== 1 ? 's' : ''}
                {openCount > 0 && <span className="ml-2 px-2 py-0.5 bg-green-500 bg-opacity-30 rounded text-[10px] font-bold">{openCount} open for voting</span>}
                {isBoard && ' · Advanced Governance'}
              </p>
            </div>
            {isBoard && (
              <button onClick={() => { setForm({ type: 'board_election', quorum: '25' }); setModal('createElection'); }} className="px-5 py-2.5 bg-white bg-opacity-15 hover:bg-opacity-25 text-white rounded-lg text-sm font-semibold border border-white border-opacity-25 transition-colors">
                + New Vote
              </button>
            )}
          </div>
        </div>
        <div className="bg-white rounded-b-xl border-x border-b border-ink-100 p-6">
          {visibleElections.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-5xl mb-4">🗳</p>
              <h3 className="text-lg font-bold text-ink-900 mb-2">{isBoard ? 'No votes yet' : 'No open votes'}</h3>
              <p className="text-sm text-ink-500 max-w-md mx-auto">
                {isBoard ? 'Create a vote to orchestrate board elections, budget approvals, bylaw amendments, or any motion requiring unit owner participation. Results are tallied against each unit\'s ownership percentage.'
                  : 'When your board opens a vote or election, it will appear here for you to cast your ballot.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleElections.map(e => {
                const r = store.getResults(e.id, units.map(u => ({ number: u.number, votingPct: u.votingPct, status: u.status })));
                const myVoteStatus = isResident && myUnits.length > 0 ? myUnits.map(u => ({ unit: u.number, voted: hasVoted(e.id, u.number) })) : [];
                const allMyVoted = myVoteStatus.length > 0 && myVoteStatus.every(v => v.voted);
                const someMyVoted = myVoteStatus.some(v => v.voted);

                return (
                  <div key={e.id} onClick={() => setSelectedId(e.id)} className={`border rounded-xl p-5 cursor-pointer hover:shadow-sm transition-all ${e.status === 'open' && isResident && !allMyVoted ? 'border-green-300 bg-green-50 bg-opacity-30 hover:border-green-400' : 'border-ink-100 hover:border-accent-200'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-11 h-11 rounded-lg flex items-center justify-center text-xl ${e.status === 'open' ? 'bg-green-100' : 'bg-accent-50'}`}>🗳</div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-ink-900">{e.title}</h3>
                            <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${STATUS_STYLE[e.status]}`}>{e.status.toUpperCase()}</span>
                          </div>
                          <p className="text-xs text-ink-500">{TYPE_LABELS[e.type]} · {e.ballotItems.length} item{e.ballotItems.length !== 1 ? 's' : ''} · {new Date(e.createdAt).toLocaleDateString()}</p>
                          {isResident && e.status === 'open' && myVoteStatus.length > 0 && (
                            <p className={`text-xs mt-1 font-medium ${allMyVoted ? 'text-sage-600' : 'text-green-700'}`}>
                              {allMyVoted ? '✓ You have voted' : someMyVoted ? '⚡ Vote pending for some units' : '⚡ Your vote is needed'}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-right">
                        {r && <div><p className="text-sm font-bold text-ink-900">{r.unitsBalloted}/{r.unitsEligible}</p><p className={`text-xs ${r.quorumMet ? 'text-sage-600' : 'text-red-600'}`}>{r.quorumMet ? '✓ Quorum' : '⚠ Pending'}</p></div>}
                        <span className="text-accent-400 text-lg">→</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {modal === 'createElection' && (
          <Modal title="Create New Vote" onClose={() => setModal(null)} onSave={handleCreate} saveLabel="Create">
            <div className="space-y-4">
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Title *</label><input value={f('title')} onChange={e => sf('title', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="e.g., FY 2026 Budget Approval" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-ink-700 mb-1">Type</label><select value={f('type')} onChange={e => sf('type', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">{Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-xs font-medium text-ink-700 mb-1">Quorum Required (%)</label><input value={f('quorum')} onChange={e => sf('quorum', e.target.value)} type="number" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="25" /><p className="text-[10px] text-ink-400 mt-1">% of ownership needed to participate</p></div>
              </div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Description</label><textarea value={f('description')} onChange={e => sf('description', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={3} placeholder="Purpose and scope..." /></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Legal Reference</label><input value={f('legalRef')} onChange={e => sf('legalRef', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Bylaws Art. IV, Sec. 2" /></div>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  // ─── Election Detail ───
  const votedUnits = new Set(selected.ballots.map(b => b.unitNumber));
  const unvotedUnits = occupiedUnits.filter(u => !votedUnits.has(u.number));
  // My units that haven't voted yet
  const myUnvotedUnits = myUnits.filter(u => !votedUnits.has(u.number));
  const myVotedUnits = myUnits.filter(u => votedUnits.has(u.number));

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="bg-gradient-to-r from-ink-900 via-ink-800 to-accent-800 rounded-t-xl p-8 text-white shadow-sm">
        <button onClick={() => setSelectedId(null)} className="text-accent-200 hover:text-white text-sm mb-2 inline-flex items-center gap-1">← Back to Votes & Resolutions</button>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3"><h2 className="font-display text-2xl font-bold">{selected.title}</h2><span className={`text-[10px] px-2.5 py-1 rounded font-bold ${STATUS_STYLE[selected.status]}`}>{selected.status.toUpperCase()}</span></div>
            <p className="text-accent-200 text-sm mt-1">{TYPE_LABELS[selected.type]} · {selected.ballotItems.length} item{selected.ballotItems.length !== 1 ? 's' : ''} · {selected.ballots.length} ballot{selected.ballots.length !== 1 ? 's' : ''}</p>
          </div>
          {isBoard && (
            <div className="flex gap-2">
              {selected.status === 'draft' && <button onClick={() => { if (selected.ballotItems.length === 0) { alert('Add at least one ballot item first'); return; } if (confirm('Open voting? Unit owners will be able to cast ballots.')) store.openElection(selected.id); }} className="px-4 py-2 bg-green-500 bg-opacity-30 text-white rounded-lg text-sm font-semibold border border-green-300 border-opacity-40 hover:bg-opacity-50">▶ Open Voting</button>}
              {selected.status === 'open' && <button onClick={() => { if (confirm('Close voting? No more ballots can be recorded.')) store.closeElection(selected.id); }} className="px-4 py-2 bg-yellow-500 bg-opacity-30 text-white rounded-lg text-sm font-semibold border border-yellow-300 border-opacity-40 hover:bg-opacity-50">⏹ Close Voting</button>}
              {selected.status === 'closed' && <button onClick={() => { if (confirm('Certify results? This finalizes the vote.')) store.certifyElection(selected.id, currentUser?.name || 'Board'); }} className="px-4 py-2 bg-sage-500 bg-opacity-30 text-white rounded-lg text-sm font-semibold border border-sage-300 border-opacity-40 hover:bg-opacity-50">✓ Certify</button>}
              {selected.status === 'draft' && <button onClick={() => { if (confirm('Delete?')) { store.deleteElection(selected.id); setSelectedId(null); } }} className="px-4 py-2 bg-red-500 bg-opacity-20 text-white rounded-lg text-sm font-semibold border border-red-300 border-opacity-30 hover:bg-opacity-40">Delete</button>}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-b-xl border-x border-b border-ink-100 p-6 space-y-6">
        {/* ─── RESIDENT: Cast Your Vote Banner ─── */}
        {isResident && selected.status === 'open' && myUnvotedUnits.length > 0 && (
          <div className="bg-green-50 border-2 border-green-300 rounded-xl p-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 className="text-base font-bold text-green-900">🗳 Cast Your Vote</h3>
                <p className="text-sm text-green-700 mt-1">
                  {myUnvotedUnits.length === 1 ? `Unit ${myUnvotedUnits[0].number} — ${myUnvotedUnits[0].votingPct}% ownership` : `${myUnvotedUnits.length} units eligible to vote`}
                </p>
                {myVotedUnits.length > 0 && <p className="text-xs text-green-600 mt-0.5">✓ Already voted: {myVotedUnits.map(u => `Unit ${u.number}`).join(', ')}</p>}
              </div>
              <div className="flex gap-2">
                {myUnvotedUnits.map(u => (
                  <button key={u.number} onClick={() => {
                    setSelfVoteUnit(u.number);
                    const initVotes: Record<string, VoteChoice | string[]> = {};
                    selected.ballotItems.forEach(bi => { initVotes[bi.id] = bi.type === 'yes_no' ? '' as any : []; });
                    setSelfVotes(initVotes);
                    setModal('castVote');
                  }} className="px-5 py-2.5 bg-green-700 text-white rounded-lg text-sm font-bold hover:bg-green-800 transition-colors">
                    Vote as Unit {u.number}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Resident: Already voted confirmation */}
        {isResident && selected.status === 'open' && myUnvotedUnits.length === 0 && myVotedUnits.length > 0 && (
          <div className="bg-sage-50 border border-sage-200 rounded-xl p-4">
            <p className="text-sm font-medium text-sage-800">✓ You have cast your vote{myVotedUnits.length > 1 ? 's' : ''} for {myVotedUnits.map(u => `Unit ${u.number}`).join(', ')}. Thank you for participating!</p>
          </div>
        )}

        {/* Quorum / Participation Stats */}
        {results && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <StatCard label="Units Voted" val={`${results.unitsBalloted}/${results.unitsEligible}`} sub={`${results.unitsEligible > 0 ? ((results.unitsBalloted / results.unitsEligible) * 100).toFixed(0) : 0}% turnout`} />
            <StatCard label="Ownership Voted" val={`${results.totalVotedPct.toFixed(1)}%`} sub={`of ${results.totalEligiblePct.toFixed(1)}% eligible`} />
            <StatCard label="Quorum" val={results.quorumMet ? '✓ Met' : '⚠ Not Met'} sub={`${results.quorumRequired}% required`} color={results.quorumMet ? 'sage' : 'red'} />
            <StatCard label="Ballot Items" val={String(selected.ballotItems.length)} sub="" />
            <StatCard label="Method Mix" val={`${selected.ballots.filter(b => b.method === 'virtual').length}v ${selected.ballots.filter(b => b.method === 'paper').length}p ${selected.ballots.filter(b => b.method === 'oral').length}o`} sub="virtual / paper / oral" />
          </div>
        )}

        {selected.description && <div className="bg-mist-50 border border-mist-200 rounded-xl p-4"><p className="text-sm text-ink-700">{selected.description}</p>{selected.legalRef && <p className="text-xs text-ink-400 mt-2">Legal Reference: {selected.legalRef}</p>}</div>}

        {/* Ballot Items */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-ink-700">Ballot Items</h3>
            {isBoard && selected.status === 'draft' && <button onClick={() => { setBallotItemForm({ title: '', description: '', type: 'yes_no', threshold: '50.1', maxSelections: '1', legalRef: '', candidates: [] }); setModal('addBallotItem'); }} className="text-xs text-accent-600 hover:text-accent-700 font-semibold">+ Add Item</button>}
          </div>
          {selected.ballotItems.length === 0 ? (
            <p className="text-xs text-ink-400 p-4 text-center border border-ink-100 rounded-xl">No ballot items yet.</p>
          ) : (
            <div className="space-y-3">
              {selected.ballotItems.map((item, idx) => {
                const ir = results?.itemResults.find(r => r.ballotItemId === item.id);
                return (
                  <div key={item.id} className="border border-ink-100 rounded-xl overflow-hidden">
                    <div className="p-4 bg-mist-50 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-ink-400">#{idx + 1}</span>
                          <h4 className="text-sm font-bold text-ink-900">{item.title}</h4>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-100 text-ink-600">{item.type === 'yes_no' ? 'Yes/No' : item.type === 'multi_candidate' ? 'Candidate' : 'Multi-Select'}</span>
                        </div>
                        {item.description && <p className="text-xs text-ink-500 mt-1">{item.description}</p>}
                        <p className="text-[10px] text-ink-400 mt-1">Threshold: {item.requiredThreshold}%{item.legalRef ? ` · ${item.legalRef}` : ''}</p>
                      </div>
                      {isBoard && selected.status === 'draft' && <button onClick={() => store.removeBallotItem(selected.id, item.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button>}
                    </div>
                    {item.candidates && item.candidates.length > 0 && (
                      <div className="p-4 border-t border-ink-50">
                        <p className="text-xs font-bold text-ink-600 mb-2">Candidates ({item.candidates.length}){item.maxSelections ? ` · Select up to ${item.maxSelections}` : ''}</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{item.candidates.map(c => (
                          <div key={c.id} className="bg-white border border-ink-100 rounded-lg p-3"><p className="text-sm font-medium text-ink-900">{c.name}</p><p className="text-[10px] text-ink-400">Unit {c.unit}</p>{c.bio && <p className="text-[10px] text-ink-500 mt-1">{c.bio}</p>}</div>
                        ))}</div>
                      </div>
                    )}
                    {/* Results (visible to everyone after closed/certified) */}
                    {ir && (selected.status === 'closed' || selected.status === 'certified') && (
                      <div className="p-4 border-t border-ink-50 bg-white">
                        {item.type === 'yes_no' ? (
                          <div>
                            <div className="flex items-center gap-3 mb-2"><span className={`text-sm font-bold ${ir.passed ? 'text-sage-700' : 'text-red-700'}`}>{ir.passed ? '✓ PASSED' : '✗ FAILED'}</span><span className="text-[10px] text-ink-400">(Threshold: {ir.threshold}%)</span></div>
                            <div className="grid grid-cols-3 gap-2">
                              <div className="bg-sage-50 rounded-lg p-2 text-center"><p className="text-xs text-sage-600">Approve</p><p className="text-sm font-bold text-sage-700">{ir.approvePct}%</p><p className="text-[10px] text-sage-500">{ir.approveCount} units</p></div>
                              <div className="bg-red-50 rounded-lg p-2 text-center"><p className="text-xs text-red-600">Deny</p><p className="text-sm font-bold text-red-700">{ir.denyPct}%</p><p className="text-[10px] text-red-500">{ir.denyCount} units</p></div>
                              <div className="bg-ink-50 rounded-lg p-2 text-center"><p className="text-xs text-ink-500">Abstain</p><p className="text-sm font-bold text-ink-600">{ir.abstainPct}%</p><p className="text-[10px] text-ink-400">{ir.abstainCount} units</p></div>
                            </div>
                          </div>
                        ) : (
                          <div><p className="text-xs font-bold text-ink-600 mb-2">Results</p><div className="space-y-2">{ir.candidateResults?.map((cr, ci) => (
                            <div key={cr.candidateId} className="flex items-center gap-3">
                              <span className={`text-xs font-bold w-6 ${ci === 0 ? 'text-sage-700' : 'text-ink-400'}`}>#{ci + 1}</span>
                              <div className="flex-1"><div className="flex items-center justify-between"><span className="text-sm font-medium text-ink-900">{cr.name}</span><span className="text-sm font-bold text-ink-700">{cr.votePct}%</span></div><div className="w-full h-1.5 bg-ink-100 rounded-full mt-1"><div className={`h-full rounded-full ${ci === 0 ? 'bg-sage-500' : 'bg-accent-400'}`} style={{ width: `${results ? Math.min((cr.votePct / results.totalVotedPct) * 100, 100) : 0}%` }} /></div><p className="text-[10px] text-ink-400">{cr.voteCount} unit{cr.voteCount !== 1 ? 's' : ''}</p></div>
                            </div>
                          ))}</div></div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Board: Record Ballot + Proxy */}
        {selected.status === 'open' && isBoard && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-ink-700">Record Ballots</h3>
              <button onClick={() => { const initVotes: Record<string, VoteChoice | string[]> = {}; selected.ballotItems.forEach(bi => { initVotes[bi.id] = bi.type === 'yes_no' ? '' as any : []; }); setBallotForm({ unitNumber: '', method: 'virtual', proxyFor: '', votes: initVotes }); setModal('recordBallot'); }} className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-semibold hover:bg-ink-800">+ Record Ballot</button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-sage-50 border border-sage-200 rounded-xl p-3"><p className="text-xs font-bold text-sage-700 mb-1">Voted ({selected.ballots.length})</p><div className="flex flex-wrap gap-1">{selected.ballots.map(b => <span key={b.id} className="text-[10px] bg-sage-100 text-sage-700 px-2 py-0.5 rounded font-medium">{METHOD_ICON[b.method]} {b.unitNumber}{b.proxyFor ? ` (proxy: ${b.proxyFor})` : ''}</span>)}</div>{selected.ballots.length === 0 && <p className="text-[10px] text-sage-500">None yet</p>}</div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3"><p className="text-xs font-bold text-amber-700 mb-1">Pending ({unvotedUnits.length})</p><div className="flex flex-wrap gap-1">{unvotedUnits.slice(0, 20).map(u => <span key={u.number} className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">{u.number} ({u.votingPct}%)</span>)}</div></div>
            </div>
          </div>
        )}

        {/* Ballot Log (board sees all details, residents see summary) */}
        {selected.ballots.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-ink-700 mb-3">Ballot Log ({selected.ballots.length})</h3>
            <div className="bg-white rounded-xl border border-ink-100 divide-y divide-ink-50">
              {selected.ballots.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).map(b => (
                <div key={b.id} className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{METHOD_ICON[b.method]}</span>
                    <div>
                      <p className="text-sm font-medium text-ink-900">Unit {b.unitNumber}{isBoard ? ` — ${b.owner}` : ''}</p>
                      <p className="text-[10px] text-ink-400">
                        {b.votingPct}% · {b.method}
                        {b.proxyFor && <span className="ml-1 text-accent-600">· Proxy: {b.proxyFor}</span>}
                        {isBoard && ` · by ${b.recordedBy} · ${new Date(b.recordedAt).toLocaleString()}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isBoard && <div className="flex gap-1">{Object.entries(b.votes).map(([itemId, vote]) => {
                      if (typeof vote === 'string') return <span key={itemId} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${vote === 'approve' ? 'bg-sage-100 text-sage-700' : vote === 'deny' ? 'bg-red-100 text-red-700' : 'bg-ink-100 text-ink-500'}`}>{vote || '—'}</span>;
                      return <span key={itemId} className="text-[10px] px-1.5 py-0.5 rounded bg-accent-100 text-accent-700 font-medium">{(vote as string[]).length} sel.</span>;
                    })}</div>}
                    {isBoard && selected.status === 'open' && <button onClick={() => store.removeBallot(selected.id, b.id)} className="text-xs text-red-400 hover:text-red-600">×</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selected.status === 'certified' && (
          <div className="bg-sage-50 border border-sage-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1"><span className="text-lg">✅</span><h4 className="text-sm font-bold text-sage-800">Results Certified</h4></div>
            <p className="text-xs text-sage-700">Certified by {selected.certifiedBy} on {selected.certifiedAt ? new Date(selected.certifiedAt).toLocaleString() : '—'}</p>
          </div>
        )}
      </div>

      {/* ─── Modals ─── */}

      {/* Resident self-vote */}
      {modal === 'castVote' && selected && (
        <Modal title={`Cast Your Vote — Unit ${selfVoteUnit}`} onClose={() => setModal(null)} onSave={handleSelfVote} saveLabel="Submit Vote">
          <div className="space-y-4">
            {(() => { const u = units.find(x => x.number === selfVoteUnit); return u ? <div className="bg-accent-50 border border-accent-200 rounded-lg p-3"><p className="text-xs text-accent-800"><strong>Unit {u.number}</strong> · {u.owner} · {u.votingPct}% ownership weight</p></div> : null; })()}

            {/* Proxy option for residents */}
            <div className="bg-mist-50 border border-mist-200 rounded-lg p-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!ballotForm.proxyFor} onChange={e => setBallotForm({ ...ballotForm, proxyFor: e.target.checked ? '' : '' })} className="h-3.5 w-3.5" />
                <span className="text-xs text-ink-700">I am voting as a designated proxy</span>
              </label>
              {ballotForm.proxyFor !== undefined && (
                <input value={ballotForm.proxyFor} onChange={e => setBallotForm({ ...ballotForm, proxyFor: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm mt-2" placeholder="Name of person who designated you as proxy" />
              )}
            </div>

            <div className="border-t border-ink-100 pt-4">
              <p className="text-xs font-bold text-ink-700 mb-3">Your Selections</p>
              {selected.ballotItems.map((item, idx) => (
                <div key={item.id} className="mb-4 bg-mist-50 rounded-xl p-4">
                  <p className="text-xs font-bold text-ink-900 mb-0.5">#{idx + 1}: {item.title}</p>
                  {item.description && <p className="text-[10px] text-ink-500 mb-2">{item.description}</p>}
                  {item.type === 'yes_no' ? (
                    <div className="flex gap-4 mt-2">
                      {(['approve', 'deny', 'abstain'] as VoteChoice[]).map(choice => (
                        <label key={choice} className={`flex items-center gap-2 cursor-pointer px-4 py-2.5 rounded-lg border-2 transition-all ${selfVotes[item.id] === choice ? (choice === 'approve' ? 'border-sage-500 bg-sage-50' : choice === 'deny' ? 'border-red-400 bg-red-50' : 'border-ink-300 bg-ink-50') : 'border-ink-100 hover:border-ink-200'}`}>
                          <input type="radio" name={`self-${item.id}`} checked={selfVotes[item.id] === choice} onChange={() => setSelfVotes({ ...selfVotes, [item.id]: choice })} className="h-4 w-4" />
                          <span className={`text-sm font-semibold ${choice === 'approve' ? 'text-sage-700' : choice === 'deny' ? 'text-red-700' : 'text-ink-500'}`}>{choice.charAt(0).toUpperCase() + choice.slice(1)}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2 mt-2">
                      {(item.candidates || []).map(c => {
                        const cur = (selfVotes[item.id] as string[]) || [];
                        const isSel = cur.includes(c.id);
                        const max = item.maxSelections || 1;
                        return (
                          <label key={c.id} className={`flex items-center gap-3 cursor-pointer p-3 rounded-lg border-2 transition-all ${isSel ? 'border-accent-500 bg-accent-50' : 'border-ink-100 hover:border-ink-200'}`}>
                            <input type={item.type === 'multi_candidate' ? 'radio' : 'checkbox'} name={`self-${item.id}`} checked={isSel} onChange={() => {
                              let newSel: string[];
                              if (item.type === 'multi_candidate') { newSel = [c.id]; } else { newSel = isSel ? cur.filter(x => x !== c.id) : [...cur, c.id].slice(0, max); }
                              setSelfVotes({ ...selfVotes, [item.id]: newSel });
                            }} className="h-4 w-4" />
                            <div><p className="text-sm font-medium text-ink-900">{c.name}</p><p className="text-[10px] text-ink-400">Unit {c.unit}{c.bio ? ` · ${c.bio}` : ''}</p></div>
                          </label>
                        );
                      })}
                      {item.type === 'multi_select' && <p className="text-[10px] text-ink-400">Select up to {item.maxSelections}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3"><p className="text-xs text-amber-800">Your vote is final and will be weighted at {units.find(u => u.number === selfVoteUnit)?.votingPct || 0}% ownership. You cannot change your vote after submitting.</p></div>
          </div>
        </Modal>
      )}

      {/* Board: Add Ballot Item */}
      {modal === 'addBallotItem' && (
        <Modal title="Add Ballot Item" onClose={() => setModal(null)} onSave={handleAddBallotItem} saveLabel="Add to Ballot">
          <div className="space-y-4">
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Title *</label><input value={ballotItemForm.title} onChange={e => setBallotItemForm({ ...ballotItemForm, title: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Approve FY 2026 Operating Budget" /></div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Description</label><textarea value={ballotItemForm.description} onChange={e => setBallotItemForm({ ...ballotItemForm, description: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={2} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Vote Type</label><select value={ballotItemForm.type} onChange={e => setBallotItemForm({ ...ballotItemForm, type: e.target.value as any })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="yes_no">Yes / No Motion</option><option value="multi_candidate">Candidate (pick 1)</option><option value="multi_select">Multi-Select (pick N)</option></select></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Threshold (%)</label><input value={ballotItemForm.threshold} onChange={e => setBallotItemForm({ ...ballotItemForm, threshold: e.target.value })} type="number" step="0.1" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /><p className="text-[10px] text-ink-400 mt-1">50.1 = majority, 66.7 = supermajority</p></div>
            </div>
            {ballotItemForm.type === 'multi_select' && <div><label className="block text-xs font-medium text-ink-700 mb-1">Max Selections</label><input value={ballotItemForm.maxSelections} onChange={e => setBallotItemForm({ ...ballotItemForm, maxSelections: e.target.value })} type="number" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>}
            {ballotItemForm.type !== 'yes_no' && (
              <div>
                <div className="flex items-center justify-between mb-2"><label className="text-xs font-medium text-ink-700">Candidates ({ballotItemForm.candidates.length})</label><button onClick={() => setModal('addCandidate')} className="text-xs text-accent-600 font-semibold">+ Add</button></div>
                {ballotItemForm.candidates.length > 0 && <div className="space-y-1">{ballotItemForm.candidates.map(c => <div key={c.id} className="flex items-center justify-between bg-mist-50 rounded-lg p-2"><span className="text-xs font-medium text-ink-800">{c.name} (Unit {c.unit})</span><button onClick={() => setBallotItemForm({ ...ballotItemForm, candidates: ballotItemForm.candidates.filter(x => x.id !== c.id) })} className="text-xs text-red-400">×</button></div>)}</div>}
              </div>
            )}
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Legal Reference</label><input value={ballotItemForm.legalRef} onChange={e => setBallotItemForm({ ...ballotItemForm, legalRef: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Bylaws Art. IV" /></div>
          </div>
        </Modal>
      )}

      {/* Add Candidate */}
      {modal === 'addCandidate' && (
        <Modal title="Add Candidate" onClose={() => setModal('addBallotItem')} onSave={() => { if (!candidateForm.name) return; setBallotItemForm({ ...ballotItemForm, candidates: [...ballotItemForm.candidates, { id: 'cand_' + Date.now(), ...candidateForm }] }); setCandidateForm({ name: '', unit: '', bio: '' }); setModal('addBallotItem'); }} saveLabel="Add">
          <div className="space-y-3">
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Name *</label><input value={candidateForm.name} onChange={e => setCandidateForm({ ...candidateForm, name: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Unit</label><select value={candidateForm.unit} onChange={e => setCandidateForm({ ...candidateForm, unit: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="">Select</option>{occupiedUnits.map(u => <option key={u.number} value={u.number}>{u.number} — {u.owner}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Bio</label><textarea value={candidateForm.bio} onChange={e => setCandidateForm({ ...candidateForm, bio: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={2} /></div>
          </div>
        </Modal>
      )}

      {/* Board: Record Ballot (paper/oral/proxy) */}
      {modal === 'recordBallot' && (
        <Modal title="Record Unit Ballot" onClose={() => setModal(null)} onSave={handleRecordBallot} saveLabel="Record Ballot">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">Unit *</label>
                <select value={ballotForm.unitNumber} onChange={e => setBallotForm({ ...ballotForm, unitNumber: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                  <option value="">Select unit</option>
                  {occupiedUnits.map(u => <option key={u.number} value={u.number} disabled={votedUnits.has(u.number)}>{u.number} — {u.owner} ({u.votingPct}%){votedUnits.has(u.number) ? ' ✓' : ''}</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Method</label><select value={ballotForm.method} onChange={e => setBallotForm({ ...ballotForm, method: e.target.value as VoteMethod })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="paper">📄 Paper Ballot</option><option value="oral">🗣 Oral / In-Person</option><option value="virtual">💻 Virtual</option></select></div>
            </div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Proxy Authorization (if applicable)</label><input value={ballotForm.proxyFor} onChange={e => setBallotForm({ ...ballotForm, proxyFor: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Name of person who authorized this proxy vote" /><p className="text-[10px] text-ink-400 mt-1">Leave blank if the unit owner voted directly.</p></div>

            <div className="border-t border-ink-100 pt-4">
              <p className="text-xs font-bold text-ink-700 mb-3">Ballot Selections</p>
              {selected.ballotItems.map((item, idx) => (
                <div key={item.id} className="mb-4 bg-mist-50 rounded-xl p-4">
                  <p className="text-xs font-bold text-ink-900 mb-1">#{idx + 1}: {item.title}</p>
                  {item.type === 'yes_no' ? (
                    <div className="flex gap-3 mt-2">{(['approve', 'deny', 'abstain'] as VoteChoice[]).map(choice => (
                      <label key={choice} className="flex items-center gap-1.5 cursor-pointer"><input type="radio" name={`rec-${item.id}`} checked={ballotForm.votes[item.id] === choice} onChange={() => setBallotForm({ ...ballotForm, votes: { ...ballotForm.votes, [item.id]: choice } })} className="h-3.5 w-3.5" /><span className={`text-sm font-medium ${choice === 'approve' ? 'text-sage-700' : choice === 'deny' ? 'text-red-700' : 'text-ink-500'}`}>{choice.charAt(0).toUpperCase() + choice.slice(1)}</span></label>
                    ))}</div>
                  ) : (
                    <div className="space-y-1.5 mt-2">{(item.candidates || []).map(c => {
                      const cur = (ballotForm.votes[item.id] as string[]) || [];
                      const isSel = cur.includes(c.id);
                      const max = item.maxSelections || 1;
                      return (
                        <label key={c.id} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-white">
                          <input type={item.type === 'multi_candidate' ? 'radio' : 'checkbox'} name={`rec-${item.id}`} checked={isSel} onChange={() => { let newSel: string[]; if (item.type === 'multi_candidate') { newSel = [c.id]; } else { newSel = isSel ? cur.filter(x => x !== c.id) : [...cur, c.id].slice(0, max); } setBallotForm({ ...ballotForm, votes: { ...ballotForm.votes, [item.id]: newSel } }); }} className="h-3.5 w-3.5" />
                          <span className="text-sm text-ink-800">{c.name} <span className="text-ink-400">(Unit {c.unit})</span></span>
                        </label>
                      );
                    })}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function StatCard({ label, val, sub, color }: { label: string; val: string; sub: string; color?: string }) {
  return (
    <div className={`rounded-xl p-3 border ${color === 'sage' ? 'bg-sage-50 border-sage-200' : color === 'red' ? 'bg-red-50 border-red-200' : 'bg-mist-50 border-mist-100'}`}>
      <p className="text-[11px] text-ink-400">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${color === 'sage' ? 'text-sage-700' : color === 'red' ? 'text-red-700' : 'text-ink-900'}`}>{val}</p>
      {sub && <p className="text-[10px] text-ink-400">{sub}</p>}
    </div>
  );
}

