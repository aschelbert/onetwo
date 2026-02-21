import { useState } from 'react';
import { CATS, APPR_LABELS, APPR_COLORS } from '@/store/useIssuesStore';
import type { CaseTrackerCase } from '@/types/issues';
import type { BoardMember } from '@/store/useBuildingStore';

interface ModalProps {
  onClose: () => void;
}

// ─── Board Vote Modal ──────────────────────────────────────
export function BoardVoteModal({ c, boardMembers, store, onClose }: ModalProps & { c: CaseTrackerCase; boardMembers: BoardMember[]; store: any }) {
  const [motion, setMotion] = useState(c.boardVotes?.motion || '');
  const [date, setDate] = useState(c.boardVotes?.date || new Date().toISOString().split('T')[0]);
  const [votes, setVotes] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    boardMembers.forEach(m => {
      const existing = c.boardVotes?.votes?.find(v => v.name === m.name);
      map[m.name] = existing?.vote || '';
    });
    return map;
  });

  const handleSave = () => {
    if (!motion.trim()) return alert('Motion text is required.');
    const voteList = boardMembers.map(m => ({ name: m.name, role: m.role, vote: votes[m.name] || '' }));
    store.saveBoardVote(c.id, motion, date, voteList);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-b p-6">
          <h2 className="text-xl font-bold text-ink-900">{c.boardVotes ? 'Edit Board Vote' : 'Record Board Vote'}</h2>
          <p className="text-sm text-ink-500 mt-1">Case: {c.title}</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Motion / Resolution *</label>
            <textarea value={motion} onChange={e => setMotion(e.target.value)} rows={2} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="e.g., Motion to approve emergency repair expenditure..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Vote Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-3">Board Member Votes</label>
            <div className="space-y-2">
              {boardMembers.map(m => (
                <div key={m.id} className="flex items-center justify-between p-3 bg-mist-50 border border-mist-100 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-ink-900">{m.name}</p>
                    <p className="text-xs text-ink-400">{m.role}</p>
                  </div>
                  <div className="flex gap-1">
                    {(['approve', 'deny', 'abstain'] as const).map(v => {
                      const selected = votes[m.name] === v;
                      const colors: Record<string, string> = {
                        approve: selected ? 'bg-sage-500 text-white ring-2 ring-sage-500' : 'bg-sage-100 text-sage-700 hover:bg-sage-200',
                        deny: selected ? 'bg-red-500 text-white ring-2 ring-red-400' : 'bg-red-100 text-red-700 hover:bg-red-200',
                        abstain: selected ? 'bg-ink-400 text-white ring-2 ring-ink-300' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                      };
                      return (
                        <button key={v} onClick={() => setVotes(prev => ({ ...prev, [m.name]: v }))} className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${colors[v]}`}>
                          {v.charAt(0).toUpperCase() + v.slice(1)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t p-6 flex justify-end space-x-3">
          <button onClick={onClose} className="px-4 py-2 text-ink-700 font-medium">Cancel</button>
          <button onClick={handleSave} className="px-6 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 font-medium">Save Vote</button>
        </div>
      </div>
    </div>
  );
}

// ─── Communication Modal ───────────────────────────────────
export function CommModal({ caseId, store, onClose }: ModalProps & { caseId: string; store: any }) {
  const [type, setType] = useState('notice');
  const [subject, setSubject] = useState('');
  const [method, setMethod] = useState('email');
  const [recipient, setRecipient] = useState('');
  const [sentBy, setSentBy] = useState('');
  const [notes, setNotes] = useState('');

  const handleSave = () => {
    if (!subject.trim() || !recipient.trim()) return alert('Subject and recipient are required.');
    store.addComm(caseId, {
      type, subject, date: new Date().toISOString().split('T')[0],
      method, recipient, sentBy, notes, status: 'sent'
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-b p-6">
          <h2 className="text-xl font-bold text-ink-900">Send Communication</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Type</label>
              <select value={type} onChange={e => setType(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                <option value="notice">Notice</option>
                <option value="response">Response</option>
                <option value="reminder">Reminder</option>
                <option value="violation">Violation</option>
                <option value="legal">Legal</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Method</label>
              <select value={method} onChange={e => setMethod(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                <option value="email">Email</option>
                <option value="certified mail">Certified Mail</option>
                <option value="posted">Posted</option>
                <option value="hand delivered">Hand Delivered</option>
                <option value="phone">Phone</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Subject *</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Communication subject" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Recipient *</label>
              <input value={recipient} onChange={e => setRecipient(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="e.g., Unit 502 — Lisa Chen" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Sent By</label>
              <input value={sentBy} onChange={e => setSentBy(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="e.g., President" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Additional details..." />
          </div>
        </div>
        <div className="border-t p-6 flex justify-end space-x-3">
          <button onClick={onClose} className="px-4 py-2 text-ink-700 font-medium">Cancel</button>
          <button onClick={handleSave} className="px-6 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 font-medium">Send</button>
        </div>
      </div>
    </div>
  );
}

// ─── Document Upload Modal ─────────────────────────────────
export function DocModal({ caseId, store, onClose }: ModalProps & { caseId: string; store: any }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('document');
  const [size, setSize] = useState('');

  const handleSave = () => {
    if (!name.trim()) return alert('Document name is required.');
    store.addDocument(caseId, {
      name, type,
      date: new Date().toISOString().split('T')[0],
      size: size || 'N/A'
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="border-b p-6">
          <h2 className="text-xl font-bold text-ink-900">Add Document</h2>
          <p className="text-sm text-ink-500 mt-1">Attach a document to this case</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Document Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="e.g., Violation-Photos-Unit502.zip" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Type</label>
              <select value={type} onChange={e => setType(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                <option value="document">Document</option>
                <option value="evidence">Evidence</option>
                <option value="notice">Notice</option>
                <option value="legal">Legal</option>
                <option value="claim">Claim</option>
                <option value="invoice">Invoice</option>
                <option value="photo">Photo</option>
                <option value="report">Report</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Size</label>
              <input value={size} onChange={e => setSize(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="e.g., 2.5 MB" />
            </div>
          </div>
        </div>
        <div className="border-t p-6 flex justify-end space-x-3">
          <button onClick={onClose} className="px-4 py-2 text-ink-700 font-medium">Cancel</button>
          <button onClick={handleSave} className="px-6 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 font-medium">Add Document</button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Approach Modal ────────────────────────────────────
export function ApproachModal({ c, store, onClose }: ModalProps & { c: CaseTrackerCase; store: any }) {
  const cat = CATS.find(x => x.id === c.catId);
  const sit = cat?.sits.find(x => x.id === c.sitId);
  if (!sit) { onClose(); return null; }

  const existing = [c.approach, ...(c.additionalApproaches || []).map((a: any) => a.approach)];
  const available = (['pre', 'self', 'legal'] as const).filter(a => !existing.includes(a));

  if (available.length === 0) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div className="bg-white rounded-xl max-w-md w-full p-6 text-center" onClick={e => e.stopPropagation()}>
          <p className="text-ink-500 mb-4">All approaches are already active on this case.</p>
          <button onClick={onClose} className="px-4 py-2 bg-ink-900 text-white rounded-lg font-medium">OK</button>
        </div>
      </div>
    );
  }

  const handleAdd = (approach: 'pre' | 'self' | 'legal') => {
    store.addApproach(c.id, approach);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="border-b p-6">
          <h2 className="text-xl font-bold text-ink-900">Add Approach</h2>
          <p className="text-sm text-ink-500 mt-1">Layer additional steps onto this case. Current: {APPR_LABELS[c.approach]}</p>
        </div>
        <div className="p-6 space-y-3">
          {available.map(a => {
            const src = a === 'legal' ? sit.legal : a === 'self' ? sit.self : sit.pre;
            return (
              <div key={a} onClick={() => handleAdd(a)} className="border border-ink-100 rounded-xl p-4 hover:border-accent-300 cursor-pointer transition-all">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${APPR_COLORS[a]}`}>{APPR_LABELS[a]}</span>
                  <span className="text-xs text-ink-400">{src.length} steps</span>
                </div>
                <div className="text-xs text-ink-500 space-y-1">
                  {src.slice(0, 3).map((s, i) => <p key={i}>{i + 1}. {s.s}</p>)}
                  {src.length > 3 && <p className="text-ink-300">...+{src.length - 3} more</p>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="border-t p-6 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-ink-700 font-medium">Cancel</button>
        </div>
      </div>
    </div>
  );
}
