import { useState, useEffect } from 'react';
import { useElectionStore, generateComplianceChecks, type Election, type BallotItem, type VoteMethod, type VoteChoice, type ElectionType, type Candidate, type ComplianceCheck } from '@/store/useElectionStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import Modal from '@/components/ui/Modal';
import FileUpload from '@/components/ui/FileUpload';

const TYPE_LABELS: Record<ElectionType, string> = { board_election: 'Board Election', budget_approval: 'Budget Approval', special_assessment: 'Special Assessment', bylaw_amendment: 'Bylaw Amendment', rule_change: 'Rule Change', meeting_motion: 'Meeting Motion', other: 'Other' };
const STATUS_STYLE: Record<string, string> = { draft: 'bg-ink-100 text-ink-600', open: 'bg-green-100 text-green-700', closed: 'bg-yellow-100 text-yellow-700', certified: 'bg-sage-100 text-sage-700' };
const METHOD_ICON: Record<VoteMethod, string> = { paper: '📄', oral: '🗣', virtual: '💻' };
const CHECK_ICON: Record<string, string> = { pass: '✅', fail: '❌', warning: '⚠️', not_checked: '⬜' };

type ModalType = null | 'createElection' | 'addBallotItem' | 'addCandidate' | 'recordBallot' | 'castVote' | 'addAttachment' | 'viewBallotDetail' | 'addComment' | 'addResolution' | 'linkCaseToVote';
type DetailTab = 'ballot' | 'compliance' | 'timeline' | 'comments' | 'resolution';

export default function VotingPage() {
  const store = useElectionStore();
  const fin = useFinancialStore();
  const { currentUser, currentRole } = useAuthStore();
  const building = useBuildingStore();
  const issues = useIssuesStore();
  const isBoard = currentRole === 'BOARD_MEMBER' || currentRole === 'PROPERTY_MANAGER';
  const isResident = currentRole === 'RESIDENT';

  const units = fin.units;
  const occupiedUnits = units.filter(u => u.status === 'OCCUPIED');
  const myLinkedUnits = currentUser?.linkedUnits || [];
  const myUnits = units.filter(u => myLinkedUnits.includes(u.number));

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('ballot');
  const [modal, setModal] = useState<ModalType>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [ballotItemForm, setBallotItemForm] = useState<{ title: string; description: string; rationale: string; type: 'yes_no' | 'multi_candidate' | 'multi_select'; threshold: string; maxSelections: string; legalRef: string; financialImpact: string; candidates: Candidate[] }>({ title: '', description: '', rationale: '', type: 'yes_no', threshold: '50.1', maxSelections: '1', legalRef: '', financialImpact: '', candidates: [] });
  const [candidateForm, setCandidateForm] = useState({ name: '', unit: '', bio: '' });
  const [ballotForm, setBallotForm] = useState<{ unitNumber: string; method: VoteMethod; isProxy: boolean; proxyVoterName: string; proxyAuthorizedBy: string; votes: Record<string, VoteChoice | string[]>; comment: string }>({ unitNumber: '', method: 'paper', isProxy: false, proxyVoterName: '', proxyAuthorizedBy: '', votes: {}, comment: '' });
  // Resident self-vote
  const [selfVoteUnit, setSelfVoteUnit] = useState('');
  const [selfVotes, setSelfVotes] = useState<Record<string, VoteChoice | string[]>>({});
  const [selfComment, setSelfComment] = useState('');
  const [selfIsProxy, setSelfIsProxy] = useState(false);
  const [selfProxyUnits, setSelfProxyUnits] = useState<string[]>([]);
  const [selfProxyAuthorizedBy, setSelfProxyAuthorizedBy] = useState('');
  // Attachment
  const [attachTargetItemId, setAttachTargetItemId] = useState('');
  const [attachForm, setAttachForm] = useState({ name: '', size: '', type: '' });
  const [pendingFile, setPendingFile] = useState<{ name: string; size: string; type: string } | null>(null);
  // Link case
  const [linkCaseId, setLinkCaseId] = useState('');
  // Ballot detail view
  const [viewingItemId, setViewingItemId] = useState<string | null>(null);
  // Comment
  const [commentText, setCommentText] = useState('');
  // Resolution
  const [resolutionText, setResolutionText] = useState('');
  const [resolutionDate, setResolutionDate] = useState('');

  const f = (k: string) => form[k] || '';
  const sf = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const selected = store.elections.find(e => e.id === selectedId);
  const results = selected ? store.getResults(selected.id, units.map(u => ({ number: u.number, votingPct: u.votingPct, status: u.status }))) : null;
  const visibleElections = isBoard ? store.elections : store.elections.filter(e => e.status !== 'draft');

  const hasVoted = (electionId: string, unitNum: string) => {
    const el = store.elections.find(e => e.id === electionId);
    return el ? el.ballots.some(b => b.unitNumber === unitNum) : false;
  };

  // Run compliance checks when election changes
  useEffect(() => {
    if (selected && isBoard) {
      const checks = generateComplianceChecks({
        election: selected,
        jurisdiction: building.address.state,
        bylawDocs: building.legalDocuments.map(d => ({ name: d.name, status: d.status })),
        totalUnits: occupiedUnits.length,
      });
      // Only update if actually different
      if (JSON.stringify(checks.map(c => c.id + c.status)) !== JSON.stringify(selected.complianceChecks.map(c => c.id + c.status))) {
        store.setComplianceChecks(selected.id, checks);
      }
    }
  }, [selected?.id, selected?.ballotItems.length, selected?.ballots.length, selected?.noticeDate, selected?.openedAt]);

  // ─── Handlers ───
  const handleCreate = () => {
    if (!f('title')) { alert('Title required'); return; }
    store.addElection({
      title: f('title'), type: (f('type') || 'board_election') as ElectionType, status: 'draft',
      description: f('description'), createdBy: currentUser?.name || 'Board',
      openedAt: null, closedAt: null, certifiedAt: null, certifiedBy: null,
      scheduledCloseDate: f('closeDate') || null, noticeDate: f('noticeDate') || null,
      quorumRequired: parseFloat(f('quorum')) || 25, ballotItems: [],
      legalRef: f('legalRef'), notes: '', complianceChecks: [], linkedMeetingId: null,
    });
    setModal(null); setForm({});
  };

  const handleAddBallotItem = () => {
    if (!selected || !ballotItemForm.title) return;
    store.addBallotItem(selected.id, {
      title: ballotItemForm.title, description: ballotItemForm.description, rationale: ballotItemForm.rationale,
      type: ballotItemForm.type, candidates: ballotItemForm.type !== 'yes_no' ? ballotItemForm.candidates : undefined,
      maxSelections: ballotItemForm.type === 'multi_select' ? parseInt(ballotItemForm.maxSelections) || 1 : undefined,
      requiredThreshold: parseFloat(ballotItemForm.threshold) || 50.1, legalRef: ballotItemForm.legalRef,
      financialImpact: ballotItemForm.financialImpact || undefined,
    });
    setModal(null);
    setBallotItemForm({ title: '', description: '', rationale: '', type: 'yes_no', threshold: '50.1', maxSelections: '1', legalRef: '', financialImpact: '', candidates: [] });
  };

  const handleRecordBallot = () => {
    if (!selected || !ballotForm.unitNumber) { alert('Select a unit'); return; }
    const unit = units.find(u => u.number === ballotForm.unitNumber);
    if (!unit) return;
    store.recordBallot(selected.id, {
      unitNumber: unit.number, owner: unit.owner, votingPct: unit.votingPct,
      method: ballotForm.method, recordedBy: currentUser?.name || 'Board',
      isProxy: ballotForm.isProxy,
      proxyVoterName: ballotForm.isProxy ? ballotForm.proxyVoterName : undefined,
      proxyAuthorizedBy: ballotForm.isProxy ? ballotForm.proxyAuthorizedBy : undefined,
      votes: ballotForm.votes, comment: ballotForm.comment || undefined,
    }, currentUser?.name || 'Board');
    setModal(null);
    setBallotForm({ unitNumber: '', method: 'paper', isProxy: false, proxyVoterName: '', proxyAuthorizedBy: '', votes: {}, comment: '' });
  };

  const handleSelfVote = () => {
    if (!selected) return;
    const unitsToVote = selfIsProxy ? selfProxyUnits : [selfVoteUnit];
    unitsToVote.forEach(unitNum => {
      const unit = units.find(u => u.number === unitNum);
      if (!unit || hasVoted(selected.id, unitNum)) return;
      store.recordBallot(selected.id, {
        unitNumber: unit.number, owner: unit.owner, votingPct: unit.votingPct,
        method: 'virtual', recordedBy: currentUser?.name || unit.owner,
        isProxy: selfIsProxy, proxyVoterName: selfIsProxy ? currentUser?.name : undefined,
        proxyAuthorizedBy: selfIsProxy ? selfProxyAuthorizedBy : undefined,
        votes: selfVotes, comment: selfComment || undefined,
      }, currentUser?.name || 'Voter');
    });
    setModal(null); setSelfVotes({}); setSelfVoteUnit(''); setSelfComment(''); setSelfIsProxy(false); setSelfProxyUnits([]); setSelfProxyAuthorizedBy('');
  };

  const handleCreateCase = () => {
    if (!selected) return;
    const caseId = issues.createCase({
      catId: 'cat-gov', sitId: 'sit-vote', approach: 'self' as any,
      title: `Vote Compliance: ${selected.title}`,
      unit: 'N/A', owner: 'Board',
      priority: 'medium', notes: `Auto-created from Votes & Resolutions. Election ID: ${selected.id}. Status: ${selected.status}. Quorum: ${results?.quorumMet ? 'Met' : 'Not met'}. Items: ${selected.ballotItems.map(bi => bi.title).join(', ')}`,
    });
    store.linkCase(selected.id, caseId);
    alert(`Case ${caseId} created in Case Ops for compliance tracking.`);
  };

  const handleAddAttachment = () => {
    if (!selected || !attachTargetItemId || !pendingFile) { alert('Select a file'); return; }
    store.addBallotAttachment(selected.id, attachTargetItemId, {
      name: pendingFile.name, size: pendingFile.size, type: pendingFile.type,
      uploadedAt: new Date().toISOString(), uploadedBy: currentUser?.name || 'Board',
    });
    setModal(null); setPendingFile(null);
  };

  const handleAddComment = () => {
    if (!selected || !commentText.trim()) return;
    const unitNum = myUnits[0]?.number || currentUser?.unitNumber || '—';
    store.addComment(selected.id, { unitNumber: unitNum, owner: currentUser?.name || 'User', text: commentText.trim() });
    setCommentText(''); setModal(null);
  };

  const handleAddResolution = () => {
    if (!selected || !resolutionText.trim()) return;
    store.setResolution(selected.id, {
      text: resolutionText, effectiveDate: resolutionDate || new Date().toISOString().split('T')[0],
      recordedBy: currentUser?.name || 'Board', linkedCaseId: selected.linkedCaseId || undefined,
    });
    setResolutionText(''); setResolutionDate(''); setModal(null);
  };

  const initVotesForElection = (el: Election) => {
    const v: Record<string, VoteChoice | string[]> = {};
    el.ballotItems.forEach(bi => { v[bi.id] = bi.type === 'yes_no' ? '' as any : []; });
    return v;
  };

  // ─── ELECTION LIST ───
  if (!selected) {
    const openCount = visibleElections.filter(e => e.status === 'open').length;
    return (
      <div className="space-y-0">
        <div className="bg-gradient-to-r from-ink-900 via-ink-800 to-accent-800 rounded-t-xl p-8 text-white shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold">🗳 Votes & Resolutions</h2>
              <p className="text-accent-200 text-sm mt-1">{visibleElections.length} vote{visibleElections.length !== 1 ? 's' : ''}{openCount > 0 && <span className="ml-2 px-2 py-0.5 bg-green-500 bg-opacity-30 rounded text-[10px] font-bold">{openCount} open</span>}{isBoard && ' · Advanced Governance'}</p>
            </div>
            {isBoard && <button onClick={() => { setForm({ type: 'board_election', quorum: '25' }); setModal('createElection'); }} className="px-5 py-2.5 bg-white bg-opacity-15 hover:bg-opacity-25 text-white rounded-lg text-sm font-semibold border border-white border-opacity-25">+ New Vote</button>}
          </div>
        </div>
        <div className="bg-white rounded-b-xl border-x border-b border-ink-100 p-6">
          {visibleElections.length === 0 ? (
            <div className="text-center py-12"><p className="text-5xl mb-4">🗳</p><h3 className="text-lg font-bold text-ink-900 mb-2">{isBoard ? 'No votes yet' : 'No open votes'}</h3><p className="text-sm text-ink-500 max-w-md mx-auto">{isBoard ? 'Create a vote with full compliance tracking, document attachments, and ownership-weighted tallying.' : 'When the board opens a vote, it will appear here for you to review details and cast your ballot.'}</p></div>
          ) : (
            <div className="space-y-3">{visibleElections.map(e => {
              const r = store.getResults(e.id, units.map(u => ({ number: u.number, votingPct: u.votingPct, status: u.status })));
              const myStatus = isResident && myUnits.length > 0 ? myUnits.map(u => ({ unit: u.number, voted: hasVoted(e.id, u.number) })) : [];
              const allVoted = myStatus.length > 0 && myStatus.every(v => v.voted);
              const compPass = e.complianceChecks.filter(c => c.status === 'pass').length;
              const compTotal = e.complianceChecks.length;
              return (
                <div key={e.id} onClick={() => { setSelectedId(e.id); setDetailTab('ballot'); }} className={`border rounded-xl p-5 cursor-pointer hover:shadow-sm transition-all ${e.status === 'open' && isResident && !allVoted ? 'border-green-300 bg-green-50 bg-opacity-30' : 'border-ink-100 hover:border-accent-200'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-lg flex items-center justify-center text-xl ${e.status === 'open' ? 'bg-green-100' : 'bg-accent-50'}`}>🗳</div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap"><h3 className="font-bold text-ink-900">{e.title}</h3><span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${STATUS_STYLE[e.status]}`}>{e.status.toUpperCase()}</span>{compTotal > 0 && isBoard && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${compPass === compTotal ? 'bg-sage-100 text-sage-700' : 'bg-amber-100 text-amber-700'}`}>{compPass}/{compTotal} checks</span>}</div>
                        <p className="text-xs text-ink-500">{TYPE_LABELS[e.type]} · {e.ballotItems.length} item{e.ballotItems.length !== 1 ? 's' : ''} · {new Date(e.createdAt).toLocaleDateString()}{e.scheduledCloseDate ? ` · Closes ${new Date(e.scheduledCloseDate + 'T12:00').toLocaleDateString()}` : ''}</p>
                        <div className="flex items-center gap-1.5 mt-1"><span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${e.quorumRequired >= 50 ? 'bg-accent-100 text-accent-700' : 'bg-sage-100 text-sage-700'}`}>{e.quorumRequired >= 50 ? '🏛 Board Vote' : '🗳 Owner Vote'}</span>{e.linkedMeetingId && <span className="text-[10px] px-1.5 py-0.5 rounded bg-mist-100 text-ink-600 font-medium">📅 Meeting linked</span>}</div>
                        {isResident && e.status === 'open' && myStatus.length > 0 && <p className={`text-xs mt-1 font-medium ${allVoted ? 'text-sage-600' : 'text-green-700'}`}>{allVoted ? '✓ You have voted' : '⚡ Your vote is needed'}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-right">{r && <div><p className="text-sm font-bold text-ink-900">{r.unitsBalloted}/{r.unitsEligible}</p><p className={`text-xs ${r.quorumMet ? 'text-sage-600' : 'text-ink-400'}`}>{r.quorumMet ? '✓ Quorum' : '⚠ Pending'}</p></div>}<span className="text-accent-400">→</span></div>
                  </div>
                </div>
              );
            })}</div>
          )}
        </div>
        {modal === 'createElection' && (
          <Modal title="Create New Vote" onClose={() => setModal(null)} onSave={handleCreate} saveLabel="Create">
            <div className="space-y-4">
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Title *</label><input value={f('title')} onChange={e => sf('title', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="e.g., FY 2026 Budget Approval" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-ink-700 mb-1">Type</label><select value={f('type')} onChange={e => sf('type', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">{Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="block text-xs font-medium text-ink-700 mb-1">Quorum (%)</label><input value={f('quorum')} onChange={e => sf('quorum', e.target.value)} type="number" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="25" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-ink-700 mb-1">Notice Sent Date</label><input value={f('noticeDate')} onChange={e => sf('noticeDate', e.target.value)} type="date" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /><p className="text-[10px] text-ink-400 mt-1">For compliance: when notice was sent</p></div>
                <div><label className="block text-xs font-medium text-ink-700 mb-1">Voting Deadline</label><input value={f('closeDate')} onChange={e => sf('closeDate', e.target.value)} type="date" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>
              </div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Description</label><textarea value={f('description')} onChange={e => sf('description', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={3} /></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Legal Reference</label><input value={f('legalRef')} onChange={e => sf('legalRef', e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Bylaws Art. IV, Sec. 2" /></div>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  // ─── ELECTION DETAIL ───
  const votedUnits = new Set(selected.ballots.map(b => b.unitNumber));
  const unvotedUnits = occupiedUnits.filter(u => !votedUnits.has(u.number));
  const myUnvotedUnits = myUnits.filter(u => !votedUnits.has(u.number));
  const myVotedUnits = myUnits.filter(u => votedUnits.has(u.number));
  const compPass = selected.complianceChecks.filter(c => c.status === 'pass').length;
  const compFail = selected.complianceChecks.filter(c => c.status === 'fail').length;
  const compWarn = selected.complianceChecks.filter(c => c.status === 'warning').length;

  const TABS: { id: DetailTab; label: string; badge?: string }[] = [
    { id: 'ballot', label: 'Vote Items', badge: String(selected.ballotItems.length) },
    { id: 'compliance', label: 'Compliance', badge: compFail > 0 ? `${compFail} ✗` : compWarn > 0 ? `${compWarn} ⚠` : `${compPass} ✓` },
    { id: 'timeline', label: 'Timeline', badge: String(selected.timeline.length) },
    { id: 'comments', label: 'Discussion', badge: String(selected.comments.length) },
    { id: 'resolution', label: 'Resolution' },
  ];

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="bg-gradient-to-r from-ink-900 via-ink-800 to-accent-800 rounded-t-xl p-8 text-white shadow-sm">
        <button onClick={() => setSelectedId(null)} className="text-accent-200 hover:text-white text-sm mb-2">← Back</button>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap"><h2 className="font-display text-2xl font-bold">{selected.title}</h2><span className={`text-[10px] px-2.5 py-1 rounded font-bold ${STATUS_STYLE[selected.status]}`}>{selected.status.toUpperCase()}</span></div>
            <p className="text-accent-200 text-sm mt-1">{TYPE_LABELS[selected.type]} · {selected.ballots.length} ballot{selected.ballots.length !== 1 ? 's' : ''}{selected.scheduledCloseDate ? ` · Closes ${new Date(selected.scheduledCloseDate + 'T12:00').toLocaleDateString()}` : ''}</p>
          </div>
          {isBoard && (
            <div className="flex gap-2 flex-wrap">
              {selected.status === 'draft' && <button onClick={() => { if (!selected.ballotItems.length) { alert('Add vote items first'); return; } if (confirm('Open voting?')) store.openElection(selected.id, currentUser?.name || 'Board'); }} className="px-4 py-2 bg-green-500 bg-opacity-30 text-white rounded-lg text-sm font-semibold border border-green-300 border-opacity-40 hover:bg-opacity-50">▶ Open</button>}
              {selected.status === 'open' && <button onClick={() => { if (confirm('Close voting?')) store.closeElection(selected.id, currentUser?.name || 'Board'); }} className="px-4 py-2 bg-yellow-500 bg-opacity-30 text-white rounded-lg text-sm font-semibold border border-yellow-300 border-opacity-40 hover:bg-opacity-50">⏹ Close</button>}
              {selected.status === 'closed' && <button onClick={() => { if (confirm('Certify results?')) store.certifyElection(selected.id, currentUser?.name || 'Board'); }} className="px-4 py-2 bg-sage-500 bg-opacity-30 text-white rounded-lg text-sm font-semibold border border-sage-300 border-opacity-40 hover:bg-opacity-50">✓ Certify</button>}
              {(selected.status === 'closed' || selected.status === 'certified') && !selected.linkedCaseId && <button onClick={handleCreateCase} className="px-4 py-2 bg-accent-500 bg-opacity-30 text-white rounded-lg text-sm font-semibold border border-accent-300 border-opacity-40 hover:bg-opacity-50">📋 Create Case</button>}
              {!selected.linkedCaseId && <button onClick={() => { setLinkCaseId(''); setModal('linkCaseToVote'); }} className="px-4 py-2 bg-violet-500 bg-opacity-30 text-white rounded-lg text-sm font-semibold border border-violet-300 border-opacity-40 hover:bg-opacity-50">🔗 Link Case</button>}
              {selected.status === 'draft' && <button onClick={() => { if (confirm('Delete?')) { store.deleteElection(selected.id); setSelectedId(null); } }} className="px-4 py-2 bg-red-500 bg-opacity-20 text-white rounded-lg text-sm font-semibold border border-red-300 border-opacity-30">Delete</button>}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-b-xl border-x border-b border-ink-100">
        {/* Resident vote banner */}
        {isResident && selected.status === 'open' && myUnvotedUnits.length > 0 && (
          <div className="bg-green-50 border-b-2 border-green-300 p-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div><h3 className="text-base font-bold text-green-900">🗳 Cast Your Vote</h3><p className="text-sm text-green-700 mt-1">{myUnvotedUnits.map(u => `Unit ${u.number} (${u.votingPct}%)`).join(', ')}</p>{myVotedUnits.length > 0 && <p className="text-xs text-green-600 mt-0.5">✓ Voted: {myVotedUnits.map(u => `Unit ${u.number}`).join(', ')}</p>}</div>
              <div className="flex gap-2">
                {myUnvotedUnits.map(u => <button key={u.number} onClick={() => { setSelfVoteUnit(u.number); setSelfVotes(initVotesForElection(selected)); setSelfComment(''); setSelfIsProxy(false); setSelfProxyUnits([]); setModal('castVote'); }} className="px-5 py-2.5 bg-green-700 text-white rounded-lg text-sm font-bold hover:bg-green-800">Vote Unit {u.number}</button>)}
                {/* Proxy voting for other units */}
                {unvotedUnits.filter(u => !myLinkedUnits.includes(u.number)).length > 0 && (
                  <button onClick={() => { setSelfVoteUnit(''); setSelfVotes(initVotesForElection(selected)); setSelfComment(''); setSelfIsProxy(true); setSelfProxyUnits([]); setSelfProxyAuthorizedBy(''); setModal('castVote'); }} className="px-5 py-2.5 bg-accent-600 text-white rounded-lg text-sm font-bold hover:bg-accent-700">Vote by Proxy</button>
                )}
              </div>
            </div>
          </div>
        )}
        {isResident && selected.status === 'open' && myUnvotedUnits.length === 0 && myVotedUnits.length > 0 && (
          <div className="bg-sage-50 border-b border-sage-200 p-4"><p className="text-sm font-medium text-sage-800">✓ You have voted for {myVotedUnits.map(u => `Unit ${u.number}`).join(', ')}.</p></div>
        )}

        {/* Stats strip */}
        {results && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-0 border-b border-ink-100">
            <MiniStat label="Voted" val={`${results.unitsBalloted}/${results.unitsEligible}`} />
            <MiniStat label="Ownership" val={`${results.totalVotedPct.toFixed(1)}%`} />
            <MiniStat label="Quorum" val={results.quorumMet ? '✓ Met' : '⚠ No'} color={results.quorumMet ? 'sage' : 'red'} />
            <MiniStat label="Virtual" val={String(results.participationByMethod.virtual)} />
            <MiniStat label="Paper/Oral" val={`${results.participationByMethod.paper}/${results.participationByMethod.oral}`} />
            <MiniStat label="Proxy" val={String(results.proxyCount)} />
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-ink-100 overflow-x-auto">
          {TABS.map(t => <button key={t.id} onClick={() => setDetailTab(t.id)} className={`px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${detailTab === t.id ? 'border-accent-600 text-accent-700' : 'border-transparent text-ink-400 hover:text-ink-600'}`}>{t.label}{t.badge && <span className="ml-1.5 text-[10px] bg-ink-100 text-ink-600 px-1.5 py-0.5 rounded">{t.badge}</span>}</button>)}
        </div>

        <div className="p-6 space-y-5">
          {selected.description && detailTab === 'ballot' && <div className="bg-mist-50 border border-mist-200 rounded-xl p-4"><p className="text-sm text-ink-700">{selected.description}</p>{selected.legalRef && <p className="text-xs text-ink-400 mt-2">📜 {selected.legalRef}</p>}{selected.linkedCaseId && <p className="text-xs text-accent-600 mt-1">📋 Case Ops: {selected.linkedCaseId}</p>}</div>}

          {/* ─── BALLOT TAB ─── */}
          {detailTab === 'ballot' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-ink-700">Vote Items</h3>
                {isBoard && selected.status === 'draft' && <button onClick={() => { setBallotItemForm({ title: '', description: '', rationale: '', type: 'yes_no', threshold: '50.1', maxSelections: '1', legalRef: '', financialImpact: '', candidates: [] }); setModal('addBallotItem'); }} className="text-xs text-accent-600 font-semibold">+ Add Item</button>}
              </div>
              {selected.ballotItems.length === 0 ? <p className="text-xs text-ink-400 p-4 text-center border border-ink-100 rounded-xl">No vote items yet.</p> : (
                <div className="space-y-4">{selected.ballotItems.map((item, idx) => {
                  const ir = results?.itemResults.find(r => r.ballotItemId === item.id);
                  return (
                    <div key={item.id} className="border border-ink-100 rounded-xl overflow-hidden">
                      <div className="p-4 bg-mist-50">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap"><span className="text-xs font-bold text-ink-400">#{idx + 1}</span><h4 className="text-sm font-bold text-ink-900">{item.title}</h4><span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-100 text-ink-600">{item.type === 'yes_no' ? 'Yes/No' : item.type === 'multi_candidate' ? 'Candidate' : 'Multi-Select'}</span></div>
                            {item.description && <p className="text-xs text-ink-600 mt-1">{item.description}</p>}
                            <p className="text-[10px] text-ink-400 mt-1">Threshold: {item.requiredThreshold}%{item.legalRef ? ` · ${item.legalRef}` : ''}</p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            {isBoard && selected.status === 'draft' && <button onClick={() => { setAttachTargetItemId(item.id); setPendingFile(null); setModal('addAttachment'); }} className="text-[10px] text-accent-600 px-2 py-1 rounded bg-accent-50 hover:bg-accent-100">+ Doc</button>}
                            {isBoard && selected.status === 'draft' && <button onClick={() => store.removeBallotItem(selected.id, item.id)} className="text-xs text-red-400 hover:text-red-600 px-1">×</button>}
                          </div>
                        </div>
                      </div>
                      {/* Rationale */}
                      {item.rationale && <div className="px-4 py-3 border-t border-ink-50 bg-white"><p className="text-[10px] font-bold text-ink-400 uppercase tracking-wide mb-1">Background & Rationale</p><p className="text-xs text-ink-700">{item.rationale}</p></div>}
                      {/* Financial impact */}
                      {item.financialImpact && <div className="px-4 py-2 border-t border-ink-50 bg-yellow-50"><p className="text-[10px] font-bold text-yellow-700">💰 Financial Impact: {item.financialImpact}</p></div>}
                      {/* Attachments */}
                      {item.attachments.length > 0 && <div className="px-4 py-3 border-t border-ink-50 bg-white"><p className="text-[10px] font-bold text-ink-400 uppercase tracking-wide mb-1.5">📎 Supporting Documents</p><div className="flex flex-wrap gap-1.5">{item.attachments.map(a => <span key={a.id} className="inline-flex items-center gap-1 text-[10px] bg-accent-50 text-accent-700 px-2 py-1 rounded font-medium">📄 {a.name} <span className="text-ink-400">{a.size}</span>{isBoard && selected.status === 'draft' && <button onClick={() => store.removeBallotAttachment(selected.id, item.id, a.id)} className="text-red-400 ml-1">×</button>}</span>)}</div></div>}
                      {/* Candidates */}
                      {item.candidates && item.candidates.length > 0 && <div className="p-4 border-t border-ink-50"><p className="text-xs font-bold text-ink-600 mb-2">Candidates{item.maxSelections ? ` · Select up to ${item.maxSelections}` : ''}</p><div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{item.candidates.map(c => <div key={c.id} className="bg-white border border-ink-100 rounded-lg p-3"><p className="text-sm font-medium text-ink-900">{c.name}</p><p className="text-[10px] text-ink-400">Unit {c.unit}</p>{c.bio && <p className="text-[10px] text-ink-500 mt-1">{c.bio}</p>}</div>)}</div></div>}
                      {/* Results */}
                      {ir && (selected.status === 'closed' || selected.status === 'certified') && (
                        <div className="p-4 border-t border-ink-50 bg-white">
                          {item.type === 'yes_no' ? (
                            <div><div className="flex items-center gap-3 mb-2"><span className={`text-sm font-bold ${ir.passed ? 'text-sage-700' : 'text-red-700'}`}>{ir.passed ? '✓ PASSED' : '✗ FAILED'}</span><span className="text-[10px] text-ink-400">(need {ir.threshold}%)</span></div><div className="grid grid-cols-3 gap-2"><div className="bg-sage-50 rounded-lg p-2 text-center"><p className="text-xs text-sage-600">Approve</p><p className="text-sm font-bold text-sage-700">{ir.approvePct}%</p><p className="text-[10px] text-sage-500">{ir.approveCount} units</p></div><div className="bg-red-50 rounded-lg p-2 text-center"><p className="text-xs text-red-600">Deny</p><p className="text-sm font-bold text-red-700">{ir.denyPct}%</p><p className="text-[10px] text-red-500">{ir.denyCount} units</p></div><div className="bg-ink-50 rounded-lg p-2 text-center"><p className="text-xs text-ink-500">Abstain</p><p className="text-sm font-bold text-ink-600">{ir.abstainPct}%</p><p className="text-[10px] text-ink-400">{ir.abstainCount} units</p></div></div></div>
                          ) : (
                            <div><p className="text-xs font-bold text-ink-600 mb-2">Results</p>{ir.candidateResults?.map((cr, ci) => <div key={cr.candidateId} className="flex items-center gap-3 mb-2"><span className={`text-xs font-bold w-6 ${ci === 0 ? 'text-sage-700' : 'text-ink-400'}`}>#{ci + 1}</span><div className="flex-1"><div className="flex justify-between"><span className="text-sm font-medium text-ink-900">{cr.name}</span><span className="text-sm font-bold">{cr.votePct}%</span></div><div className="w-full h-1.5 bg-ink-100 rounded-full mt-1"><div className={`h-full rounded-full ${ci === 0 ? 'bg-sage-500' : 'bg-accent-400'}`} style={{ width: `${results ? Math.min((cr.votePct / results.totalVotedPct) * 100, 100) : 0}%` }} /></div></div></div>)}</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}</div>
              )}

              {/* Board: Record Ballot */}
              {selected.status === 'open' && isBoard && (
                <div className="mt-5">
                  <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-ink-700">Record Ballots</h3><button onClick={() => { setBallotForm({ unitNumber: '', method: 'paper', isProxy: false, proxyVoterName: '', proxyAuthorizedBy: '', votes: initVotesForElection(selected), comment: '' }); setModal('recordBallot'); }} className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-semibold hover:bg-ink-800">+ Record</button></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-sage-50 border border-sage-200 rounded-xl p-3"><p className="text-xs font-bold text-sage-700 mb-1">Voted ({selected.ballots.length})</p><div className="flex flex-wrap gap-1">{selected.ballots.map(b => <span key={b.id} className="text-[10px] bg-sage-100 text-sage-700 px-2 py-0.5 rounded font-medium">{METHOD_ICON[b.method]} {b.unitNumber}{b.isProxy ? ' ⚡proxy' : ''}</span>)}</div>{!selected.ballots.length && <p className="text-[10px] text-sage-500">None</p>}</div>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3"><p className="text-xs font-bold text-amber-700 mb-1">Pending ({unvotedUnits.length})</p><div className="flex flex-wrap gap-1">{unvotedUnits.slice(0, 15).map(u => <span key={u.number} className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded">{u.number}</span>)}{unvotedUnits.length > 15 && <span className="text-[10px] text-amber-600">+{unvotedUnits.length - 15} more</span>}</div></div>
                  </div>
                </div>
              )}

              {/* Ballot log */}
              {selected.ballots.length > 0 && (
                <div className="mt-5"><h3 className="text-sm font-bold text-ink-700 mb-3">Ballot Log</h3><div className="bg-white rounded-xl border border-ink-100 divide-y divide-ink-50">{selected.ballots.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).map(b => <div key={b.id} className="p-3 flex items-center justify-between"><div className="flex items-center gap-3"><span className="text-lg">{METHOD_ICON[b.method]}</span><div><p className="text-sm font-medium text-ink-900">Unit {b.unitNumber}{isBoard ? ` — ${b.owner}` : ''}{b.isProxy && <span className="ml-1.5 text-[10px] bg-accent-100 text-accent-700 px-1.5 py-0.5 rounded font-medium">Proxy{b.proxyVoterName ? `: ${b.proxyVoterName}` : ''}</span>}</p><p className="text-[10px] text-ink-400">{b.votingPct}% · {b.method}{isBoard && ` · ${b.recordedBy} · ${new Date(b.recordedAt).toLocaleString()}`}</p>{b.comment && isBoard && <p className="text-[10px] text-ink-500 mt-0.5 italic">"{b.comment}"</p>}</div></div>{isBoard && selected.status === 'open' && <button onClick={() => store.removeBallot(selected.id, b.id)} className="text-xs text-red-400">×</button>}</div>)}</div></div>
              )}
            </div>
          )}

          {/* ─── COMPLIANCE TAB ─── */}
          {detailTab === 'compliance' && (
            <div>
              <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-bold text-ink-700">Compliance Checks</h3><div className="flex gap-2 text-[10px]"><span className="bg-sage-100 text-sage-700 px-2 py-0.5 rounded font-medium">{compPass} Pass</span><span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">{compWarn} Warning</span><span className="bg-red-100 text-red-700 px-2 py-0.5 rounded font-medium">{compFail} Fail</span></div></div>
              {selected.complianceChecks.length === 0 ? <p className="text-xs text-ink-400 text-center p-4 border rounded-xl">Compliance checks will be generated when vote items are added.</p> : (
                <div className="space-y-2">{selected.complianceChecks.map(c => (
                  <div key={c.id} className={`rounded-xl p-4 border ${c.status === 'pass' ? 'bg-sage-50 border-sage-200' : c.status === 'fail' ? 'bg-red-50 border-red-200' : c.status === 'warning' ? 'bg-amber-50 border-amber-200' : 'bg-ink-50 border-ink-100'}`}>
                    <div className="flex items-start gap-2">
                      <span className="text-base">{CHECK_ICON[c.status]}</span>
                      <div className="flex-1">
                        <p className="text-xs font-bold text-ink-900">{c.rule}</p>
                        <p className="text-[10px] text-ink-600 mt-0.5">{c.requirement}</p>
                        <div className="flex items-center gap-2 mt-1"><span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${c.source === 'statute' ? 'bg-accent-100 text-accent-700' : c.source === 'bylaws' ? 'bg-sage-100 text-sage-700' : c.source === 'covenants' ? 'bg-yellow-100 text-yellow-700' : 'bg-ink-100 text-ink-500'}`}>{c.source}</span>{c.note && <span className="text-[10px] text-ink-400">{c.note}</span>}</div>
                      </div>
                      {isBoard && !c.autoChecked && <select value={c.status} onChange={e => store.updateComplianceCheck(selected.id, c.id, { status: e.target.value as any })} className="text-[10px] border rounded px-1 py-0.5"><option value="not_checked">Not Checked</option><option value="pass">Pass</option><option value="warning">Warning</option><option value="fail">Fail</option></select>}
                    </div>
                  </div>
                ))}</div>
              )}
              {selected.linkedCaseId && <div className="mt-4 bg-accent-50 border border-accent-200 rounded-xl p-3"><p className="text-xs font-medium text-accent-800">📋 Linked Case: {selected.linkedCaseId} — tracked in Case Ops for compliance assurance</p></div>}
            </div>
          )}

          {/* ─── TIMELINE TAB ─── */}
          {detailTab === 'timeline' && (
            <div>{selected.timeline.length === 0 ? <p className="text-xs text-ink-400 text-center p-4">No events yet.</p> : (
              <div className="relative pl-6 space-y-4">{selected.timeline.sort((a, b) => b.date.localeCompare(a.date)).map(ev => <div key={ev.id} className="relative"><div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-accent-400 border-2 border-white" /><p className="text-xs font-medium text-ink-900">{ev.description}</p><p className="text-[10px] text-ink-400">{ev.actor} · {new Date(ev.date).toLocaleString()}</p></div>)}</div>
            )}</div>
          )}

          {/* ─── COMMENTS/DISCUSSION TAB ─── */}
          {detailTab === 'comments' && (
            <div>
              {(selected.status === 'open' || selected.status === 'closed') && <div className="mb-4"><div className="flex gap-2"><input value={commentText} onChange={e => setCommentText(e.target.value)} className="flex-1 px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Add a comment or question about this vote..." onKeyDown={e => { if (e.key === 'Enter' && commentText.trim()) handleAddComment(); }} /><button onClick={handleAddComment} disabled={!commentText.trim()} className="px-4 py-2 bg-accent-600 text-white rounded-lg text-sm font-semibold disabled:opacity-40">Post</button></div></div>}
              {selected.comments.length === 0 ? <p className="text-xs text-ink-400 text-center p-4">No discussion yet. Ask questions or share thoughts about the items being voted on.</p> : (
                <div className="space-y-3">{selected.comments.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(c => <div key={c.id} className="bg-mist-50 rounded-xl p-4"><div className="flex items-center gap-2 mb-1"><span className="text-xs font-bold text-ink-800">{c.owner}</span><span className="text-[10px] text-ink-400">Unit {c.unitNumber} · {new Date(c.createdAt).toLocaleString()}</span></div><p className="text-sm text-ink-700">{c.text}</p></div>)}</div>
              )}
            </div>
          )}

          {/* ─── RESOLUTION TAB ─── */}
          {detailTab === 'resolution' && (
            <div>
              {selected.resolution ? (
                <div className="bg-sage-50 border border-sage-200 rounded-xl p-5"><div className="flex items-center gap-2 mb-3"><span className="text-lg">📜</span><h4 className="text-sm font-bold text-sage-800">Formal Resolution</h4></div><p className="text-sm text-ink-800 whitespace-pre-wrap">{selected.resolution.text}</p><p className="text-xs text-ink-400 mt-3">Effective: {selected.resolution.effectiveDate} · Recorded by {selected.resolution.recordedBy}{selected.resolution.linkedCaseId ? ` · Case: ${selected.resolution.linkedCaseId}` : ''}</p></div>
              ) : (
                <div className="text-center py-8"><p className="text-4xl mb-3">📜</p><p className="text-sm text-ink-500 mb-4">{isBoard ? 'Record the formal resolution text after certifying results.' : 'No resolution recorded yet.'}</p>{isBoard && (selected.status === 'closed' || selected.status === 'certified') && <button onClick={() => { setResolutionText(''); setResolutionDate(new Date().toISOString().split('T')[0]); setModal('addResolution'); }} className="px-5 py-2.5 bg-accent-600 text-white rounded-lg text-sm font-semibold hover:bg-accent-700">Draft Resolution</button>}</div>
              )}
              {selected.status === 'certified' && <div className="mt-4 bg-sage-50 border border-sage-200 rounded-xl p-4"><div className="flex items-center gap-2 mb-1"><span>✅</span><h4 className="text-sm font-bold text-sage-800">Certified</h4></div><p className="text-xs text-sage-700">By {selected.certifiedBy} on {selected.certifiedAt ? new Date(selected.certifiedAt).toLocaleString() : '—'}</p></div>}
            </div>
          )}
        </div>
      </div>

      {/* ─── MODALS ─── */}

      {modal === 'castVote' && selected && (
        <Modal title={selfIsProxy ? 'Vote by Proxy' : `Cast Your Vote — Unit ${selfVoteUnit}`} onClose={() => setModal(null)} onSave={handleSelfVote} saveLabel="Submit Vote">
          <div className="space-y-4">
            {selfIsProxy ? (
              <div className="space-y-3">
                <div className="bg-accent-50 border border-accent-200 rounded-lg p-3"><p className="text-xs text-accent-800 font-medium">You are voting as a designated proxy for other unit owners.</p></div>
                <div><label className="block text-xs font-medium text-ink-700 mb-1">Authorized By (unit owner name) *</label><input value={selfProxyAuthorizedBy} onChange={e => setSelfProxyAuthorizedBy(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Name of owner who authorized proxy" /></div>
                <div><label className="block text-xs font-medium text-ink-700 mb-2">Select Units to Vote For *</label><div className="space-y-1.5 max-h-40 overflow-y-auto">{unvotedUnits.filter(u => !myLinkedUnits.includes(u.number)).map(u => <label key={u.number} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border ${selfProxyUnits.includes(u.number) ? 'border-accent-400 bg-accent-50' : 'border-ink-100 hover:border-ink-200'}`}><input type="checkbox" checked={selfProxyUnits.includes(u.number)} onChange={e => setSelfProxyUnits(e.target.checked ? [...selfProxyUnits, u.number] : selfProxyUnits.filter(x => x !== u.number))} className="h-3.5 w-3.5" /><span className="text-sm text-ink-800">Unit {u.number} — {u.owner} ({u.votingPct}%)</span></label>)}</div></div>
              </div>
            ) : (
              (() => { const u = units.find(x => x.number === selfVoteUnit); return u ? <div className="bg-accent-50 border border-accent-200 rounded-lg p-3"><p className="text-xs text-accent-800"><strong>Unit {u.number}</strong> · {u.owner} · {u.votingPct}% ownership</p></div> : null; })()
            )}

            <div className="border-t border-ink-100 pt-4"><p className="text-xs font-bold text-ink-700 mb-3">Your Selections</p>
              {selected.ballotItems.map((item, idx) => (
                <div key={item.id} className="mb-4 bg-mist-50 rounded-xl p-4">
                  <p className="text-xs font-bold text-ink-900 mb-0.5">#{idx + 1}: {item.title}</p>
                  {item.description && <p className="text-[10px] text-ink-500 mb-1">{item.description}</p>}
                  {item.rationale && <details className="mb-2"><summary className="text-[10px] text-accent-600 cursor-pointer font-medium">View background & rationale</summary><p className="text-[10px] text-ink-600 mt-1 pl-2 border-l-2 border-accent-200">{item.rationale}</p></details>}
                  {item.financialImpact && <p className="text-[10px] text-yellow-700 mb-2">💰 {item.financialImpact}</p>}
                  {item.attachments.length > 0 && <div className="flex flex-wrap gap-1 mb-2">{item.attachments.map(a => <span key={a.id} className="text-[10px] bg-accent-50 text-accent-700 px-2 py-0.5 rounded">📄 {a.name}</span>)}</div>}
                  {item.type === 'yes_no' ? (
                    <div className="flex gap-3 mt-2">{(['approve', 'deny', 'abstain'] as VoteChoice[]).map(choice => <label key={choice} className={`flex items-center gap-2 cursor-pointer px-4 py-2.5 rounded-lg border-2 transition-all ${selfVotes[item.id] === choice ? (choice === 'approve' ? 'border-sage-500 bg-sage-50' : choice === 'deny' ? 'border-red-400 bg-red-50' : 'border-ink-300 bg-ink-50') : 'border-ink-100 hover:border-ink-200'}`}><input type="radio" name={`sv-${item.id}`} checked={selfVotes[item.id] === choice} onChange={() => setSelfVotes({ ...selfVotes, [item.id]: choice })} className="h-4 w-4" /><span className={`text-sm font-semibold ${choice === 'approve' ? 'text-sage-700' : choice === 'deny' ? 'text-red-700' : 'text-ink-500'}`}>{choice.charAt(0).toUpperCase() + choice.slice(1)}</span></label>)}</div>
                  ) : (
                    <div className="space-y-2 mt-2">{(item.candidates || []).map(c => { const cur = (selfVotes[item.id] as string[]) || []; const isSel = cur.includes(c.id); const max = item.maxSelections || 1; return <label key={c.id} className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer ${isSel ? 'border-accent-500 bg-accent-50' : 'border-ink-100 hover:border-ink-200'}`}><input type={item.type === 'multi_candidate' ? 'radio' : 'checkbox'} name={`sv-${item.id}`} checked={isSel} onChange={() => { let ns: string[]; if (item.type === 'multi_candidate') ns = [c.id]; else ns = isSel ? cur.filter(x => x !== c.id) : [...cur, c.id].slice(0, max); setSelfVotes({ ...selfVotes, [item.id]: ns }); }} className="h-4 w-4" /><div><p className="text-sm font-medium text-ink-900">{c.name}</p><p className="text-[10px] text-ink-400">Unit {c.unit}{c.bio ? ` · ${c.bio}` : ''}</p></div></label>; })}</div>
                  )}
                </div>
              ))}
            </div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Comment (optional)</label><textarea value={selfComment} onChange={e => setSelfComment(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={2} placeholder="Share reasoning or questions with the board..." /></div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3"><p className="text-xs text-amber-800">Your vote is final and weighted by ownership percentage. You cannot change it after submitting.</p></div>
          </div>
        </Modal>
      )}

      {modal === 'addBallotItem' && (
        <Modal title="Add Vote Item" onClose={() => setModal(null)} onSave={handleAddBallotItem} saveLabel="Add">
          <div className="space-y-4">
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Title *</label><input value={ballotItemForm.title} onChange={e => setBallotItemForm({ ...ballotItemForm, title: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Approve FY 2026 Operating Budget" /></div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Summary</label><input value={ballotItemForm.description} onChange={e => setBallotItemForm({ ...ballotItemForm, description: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Brief description for voters" /></div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Detailed Rationale / Background</label><textarea value={ballotItemForm.rationale} onChange={e => setBallotItemForm({ ...ballotItemForm, rationale: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={3} placeholder="Why is this vote being held? What are the key considerations?" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Vote Type</label><select value={ballotItemForm.type} onChange={e => setBallotItemForm({ ...ballotItemForm, type: e.target.value as any })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="yes_no">Yes / No</option><option value="multi_candidate">Candidate (pick 1)</option><option value="multi_select">Multi-Select</option></select></div>
              <div><label className="block text-xs font-medium text-ink-700 mb-1">Threshold (%)</label><input value={ballotItemForm.threshold} onChange={e => setBallotItemForm({ ...ballotItemForm, threshold: e.target.value })} type="number" step="0.1" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>
            </div>
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Financial Impact</label><input value={ballotItemForm.financialImpact} onChange={e => setBallotItemForm({ ...ballotItemForm, financialImpact: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="e.g., $45,000 annual increase to operating budget" /></div>
            {ballotItemForm.type === 'multi_select' && <div><label className="block text-xs font-medium text-ink-700 mb-1">Max Selections</label><input value={ballotItemForm.maxSelections} onChange={e => setBallotItemForm({ ...ballotItemForm, maxSelections: e.target.value })} type="number" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div>}
            {ballotItemForm.type !== 'yes_no' && <div><div className="flex items-center justify-between mb-2"><label className="text-xs font-medium text-ink-700">Candidates</label><button onClick={() => setModal('addCandidate')} className="text-xs text-accent-600 font-semibold">+ Add</button></div>{ballotItemForm.candidates.length > 0 && <div className="space-y-1">{ballotItemForm.candidates.map(c => <div key={c.id} className="flex items-center justify-between bg-mist-50 rounded-lg p-2"><span className="text-xs text-ink-800">{c.name} (Unit {c.unit})</span><button onClick={() => setBallotItemForm({ ...ballotItemForm, candidates: ballotItemForm.candidates.filter(x => x.id !== c.id) })} className="text-xs text-red-400">×</button></div>)}</div>}</div>}
            <div><label className="block text-xs font-medium text-ink-700 mb-1">Legal Reference</label><input value={ballotItemForm.legalRef} onChange={e => setBallotItemForm({ ...ballotItemForm, legalRef: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Bylaws Art. IV" /></div>
          </div>
        </Modal>
      )}

      {modal === 'addCandidate' && <Modal title="Add Candidate" onClose={() => setModal('addBallotItem')} onSave={() => { if (!candidateForm.name) return; setBallotItemForm({ ...ballotItemForm, candidates: [...ballotItemForm.candidates, { id: 'c_' + Date.now(), ...candidateForm }] }); setCandidateForm({ name: '', unit: '', bio: '' }); setModal('addBallotItem'); }} saveLabel="Add"><div className="space-y-3"><div><label className="block text-xs font-medium text-ink-700 mb-1">Name *</label><input value={candidateForm.name} onChange={e => setCandidateForm({ ...candidateForm, name: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Unit</label><select value={candidateForm.unit} onChange={e => setCandidateForm({ ...candidateForm, unit: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="">Select</option>{occupiedUnits.map(u => <option key={u.number} value={u.number}>{u.number} — {u.owner}</option>)}</select></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Bio</label><textarea value={candidateForm.bio} onChange={e => setCandidateForm({ ...candidateForm, bio: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={2} /></div></div></Modal>}

      {modal === 'addAttachment' && <Modal title="Attach Document" onClose={() => setModal(null)} onSave={handleAddAttachment} saveLabel="Attach"><div className="space-y-3"><FileUpload onFileSelected={f => setPendingFile(f)} label="Drop supporting document here or click to browse" />{pendingFile && <div className="bg-sage-50 border border-sage-200 rounded-lg p-3"><p className="text-xs text-sage-700">📎 <strong>{pendingFile.name}</strong> ({pendingFile.size})</p></div>}</div></Modal>}

      {modal === 'linkCaseToVote' && <Modal title="Link Case to Vote" onClose={() => setModal(null)} onSave={() => { if (selected && linkCaseId) { store.linkCase(selected.id, linkCaseId); setModal(null); } }} saveLabel="Link"><div className="space-y-3"><p className="text-xs text-ink-500">Associate a Case Ops case with this vote for governance tracking.</p><select value={linkCaseId} onChange={e => setLinkCaseId(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="">Select a case...</option>{issues.cases.filter(c => c.status !== 'closed').map(c => <option key={c.id} value={c.id}>{c.id}: {c.title} ({c.status})</option>)}</select></div></Modal>}

      {modal === 'recordBallot' && <Modal title="Record Unit Ballot" onClose={() => setModal(null)} onSave={handleRecordBallot} saveLabel="Record"><div className="space-y-4"><div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-medium text-ink-700 mb-1">Unit *</label><select value={ballotForm.unitNumber} onChange={e => setBallotForm({ ...ballotForm, unitNumber: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="">Select</option>{occupiedUnits.map(u => <option key={u.number} value={u.number} disabled={votedUnits.has(u.number)}>{u.number} — {u.owner}{votedUnits.has(u.number) ? ' ✓' : ''}</option>)}</select></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Method</label><select value={ballotForm.method} onChange={e => setBallotForm({ ...ballotForm, method: e.target.value as VoteMethod })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"><option value="paper">📄 Paper</option><option value="oral">🗣 Oral</option><option value="virtual">💻 Virtual</option></select></div></div>
        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={ballotForm.isProxy} onChange={e => setBallotForm({ ...ballotForm, isProxy: e.target.checked })} className="h-3.5 w-3.5" /><span className="text-xs text-ink-700 font-medium">This is a proxy vote</span></label>
        {ballotForm.isProxy && <div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-medium text-ink-700 mb-1">Proxy Voter</label><input value={ballotForm.proxyVoterName} onChange={e => setBallotForm({ ...ballotForm, proxyVoterName: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Who cast the vote" /></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Authorized By</label><input value={ballotForm.proxyAuthorizedBy} onChange={e => setBallotForm({ ...ballotForm, proxyAuthorizedBy: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Unit owner name" /></div></div>}
        <div className="border-t border-ink-100 pt-4"><p className="text-xs font-bold text-ink-700 mb-3">Selections</p>{selected.ballotItems.map((item, idx) => <div key={item.id} className="mb-4 bg-mist-50 rounded-xl p-4"><p className="text-xs font-bold text-ink-900 mb-1">#{idx + 1}: {item.title}</p>{item.type === 'yes_no' ? <div className="flex gap-3 mt-2">{(['approve', 'deny', 'abstain'] as VoteChoice[]).map(ch => <label key={ch} className="flex items-center gap-1.5"><input type="radio" name={`rb-${item.id}`} checked={ballotForm.votes[item.id] === ch} onChange={() => setBallotForm({ ...ballotForm, votes: { ...ballotForm.votes, [item.id]: ch } })} className="h-3.5 w-3.5" /><span className={`text-sm ${ch === 'approve' ? 'text-sage-700' : ch === 'deny' ? 'text-red-700' : 'text-ink-500'}`}>{ch.charAt(0).toUpperCase() + ch.slice(1)}</span></label>)}</div> : <div className="space-y-1.5 mt-2">{(item.candidates || []).map(c => { const cur = (ballotForm.votes[item.id] as string[]) || []; const sel = cur.includes(c.id); const mx = item.maxSelections || 1; return <label key={c.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-white cursor-pointer"><input type={item.type === 'multi_candidate' ? 'radio' : 'checkbox'} name={`rb-${item.id}`} checked={sel} onChange={() => { let ns: string[]; if (item.type === 'multi_candidate') ns = [c.id]; else ns = sel ? cur.filter(x => x !== c.id) : [...cur, c.id].slice(0, mx); setBallotForm({ ...ballotForm, votes: { ...ballotForm.votes, [item.id]: ns } }); }} className="h-3.5 w-3.5" /><span className="text-sm text-ink-800">{c.name} (Unit {c.unit})</span></label>; })}</div>}</div>)}</div>
        <div><label className="block text-xs font-medium text-ink-700 mb-1">Voter Comment</label><input value={ballotForm.comment} onChange={e => setBallotForm({ ...ballotForm, comment: e.target.value })} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Optional" /></div>
      </div></Modal>}

      {modal === 'addResolution' && <Modal title="Draft Resolution" onClose={() => setModal(null)} onSave={handleAddResolution} saveLabel="Record Resolution"><div className="space-y-3"><div><label className="block text-xs font-medium text-ink-700 mb-1">Resolution Text *</label><textarea value={resolutionText} onChange={e => setResolutionText(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" rows={5} placeholder="RESOLVED, that the Board of Directors hereby approves..." /></div><div><label className="block text-xs font-medium text-ink-700 mb-1">Effective Date</label><input value={resolutionDate} onChange={e => setResolutionDate(e.target.value)} type="date" className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" /></div></div></Modal>}
    </div>
  );
}

function MiniStat({ label, val, color }: { label: string; val: string; color?: string }) {
  return <div className="px-4 py-3 text-center"><p className="text-[10px] text-ink-400">{label}</p><p className={`text-sm font-bold ${color === 'sage' ? 'text-sage-700' : color === 'red' ? 'text-red-700' : 'text-ink-900'}`}>{val}</p></div>;
}
