import { useState } from 'react';
import { CATS, APPR_LABELS, APPR_COLORS } from '@/store/useIssuesStore';
import { useLetterStore } from '@/store/useLetterStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { useAuthStore } from '@/store/useAuthStore';
import { getSuggestedTemplateCategories } from '../templateMapping';
import type { CaseTrackerCase } from '@/types/issues';
import type { BoardMember } from '@/store/useBuildingStore';
import type { LetterTemplate } from '@/lib/services/letterEngine';

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

// ─── Helpers ──────────────────────────────────────────
function substituteVariables(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    return values[varName] !== undefined && values[varName] !== '' ? values[varName] : match;
  });
}

// ─── Communication Modal (Quick Log + Use Template) ──────
export function CommModal({ caseId, store, onClose, catId, sitId, issueId }: ModalProps & { caseId?: string; store: any; catId?: string; sitId?: string; issueId?: string }) {
  const [mode, setMode] = useState<'quick' | 'template'>('quick');

  // Quick Log state
  const [type, setType] = useState('notice');
  const [subject, setSubject] = useState('');
  const [method, setMethod] = useState('email');
  const [recipient, setRecipient] = useState('');
  const [sentBy, setSentBy] = useState('');
  const [notes, setNotes] = useState('');

  // Template state
  const letterStore = useLetterStore();
  const { units } = useFinancialStore();
  const { currentUser } = useAuthStore();
  const { templates } = letterStore;
  const suggestedCats = catId && sitId ? getSuggestedTemplateCategories(catId, sitId) : ['general'];
  const [selectedTemplate, setSelectedTemplate] = useState<LetterTemplate | null>(null);
  const [templateUnit, setTemplateUnit] = useState('');
  const [templateValues, setTemplateValues] = useState<Record<string, string>>({});
  const [templateSentVia, setTemplateSentVia] = useState('email');

  const handleQuickSave = () => {
    if (!subject.trim() || !recipient.trim()) return alert('Subject and recipient are required.');
    const commData = {
      type, subject, date: new Date().toISOString().split('T')[0],
      method, recipient, sentBy, notes, status: 'sent'
    };
    if (issueId) {
      store.addIssueComm(issueId, commData);
    } else if (caseId) {
      store.addComm(caseId, commData);
    }
    onClose();
  };

  const handleTemplateSend = () => {
    if (!selectedTemplate) return;
    const finalSubject = substituteVariables(selectedTemplate.subject, templateValues);
    const finalBody = substituteVariables(selectedTemplate.body, templateValues);
    const recipientName = templateValues['owner_name'] || templateValues['recipient_name'] || '';
    const unitNum = templateUnit || templateValues['unit_number'] || '';
    const today = new Date().toISOString().split('T')[0];

    // Find linked case for issue-based comms
    const linkedCaseId = issueId
      ? store.cases.find((c: any) => c.source === 'issue' && c.sourceId === issueId)?.id
      : caseId;

    // 1. Create GeneratedLetter (link to case if one exists)
    letterStore.addLetter({
      templateId: selectedTemplate.id,
      templateName: selectedTemplate.name,
      recipient: recipientName,
      unitNumber: unitNum,
      subject: finalSubject,
      body: finalBody,
      status: 'sent',
      sentDate: today,
      sentVia: templateSentVia,
      createdBy: currentUser.name,
      caseId: linkedCaseId,
    });

    // 2. Link the letter to case if one exists
    if (linkedCaseId) {
      setTimeout(() => {
        const latest = letterStore.letters[0];
        if (latest) store.linkLetter(linkedCaseId, latest.id);
      }, 50);
    }

    // 3. Log as comm
    const commData = {
      type: 'notice', subject: finalSubject, date: today,
      method: templateSentVia, recipient: recipientName ? `Unit ${unitNum} — ${recipientName}` : `Unit ${unitNum}`,
      sentBy: currentUser.name, notes: `Sent via template: ${selectedTemplate.name}`, status: 'sent'
    };
    if (issueId) {
      store.addIssueComm(issueId, commData);
    } else if (caseId) {
      store.addComm(caseId, commData);
    }
    onClose();
  };

  const handleSelectTemplate = (t: LetterTemplate) => {
    setSelectedTemplate(t);
    const vals: Record<string, string> = {};
    t.variables.forEach(v => { vals[v.name] = v.defaultValue || ''; });
    setTemplateValues(vals);
  };

  // Sort templates: suggested categories first
  const sortedTemplates = [...templates].sort((a, b) => {
    const aIdx = suggestedCats.indexOf(a.category);
    const bIdx = suggestedCats.indexOf(b.category);
    if (aIdx !== -1 && bIdx === -1) return -1;
    if (aIdx === -1 && bIdx !== -1) return 1;
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-b p-6">
          <h2 className="text-xl font-bold text-ink-900">Send Communication</h2>
          {/* Mode toggle */}
          <div className="flex gap-1 bg-mist-50 rounded-lg p-1 mt-3 w-fit">
            <button onClick={() => setMode('quick')} className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${mode === 'quick' ? 'bg-white shadow-sm text-ink-900' : 'text-ink-500 hover:text-ink-700'}`}>Quick Log</button>
            <button onClick={() => setMode('template')} className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${mode === 'template' ? 'bg-white shadow-sm text-ink-900' : 'text-ink-500 hover:text-ink-700'}`}>Use Template</button>
          </div>
        </div>

        {mode === 'quick' ? (
          <>
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
              <button onClick={handleQuickSave} className="px-6 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 font-medium">Send</button>
            </div>
          </>
        ) : !selectedTemplate ? (
          <>
            <div className="p-6 space-y-3">
              <p className="text-sm text-ink-500">Select a template to compose a letter. Suggested templates for this case type appear first.</p>
              {templates.length === 0 ? (
                <p className="text-sm text-ink-400 text-center py-8">No templates available. Create templates in the Communications tab.</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {sortedTemplates.map(t => {
                    const isSuggested = suggestedCats.includes(t.category);
                    return (
                      <button key={t.id} onClick={() => handleSelectTemplate(t)} className="w-full text-left p-3 bg-mist-50 border border-mist-100 rounded-lg hover:border-accent-300 transition-all">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-ink-900">{t.name}</span>
                          <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-ink-100 text-ink-500">{t.category}</span>
                          {isSuggested && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-accent-100 text-accent-700">Suggested</span>}
                        </div>
                        <p className="text-xs text-ink-400 mt-0.5 truncate">{t.subject}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="border-t p-6 flex justify-end">
              <button onClick={onClose} className="px-4 py-2 text-ink-700 font-medium">Cancel</button>
            </div>
          </>
        ) : (
          <>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelectedTemplate(null)} className="text-xs text-ink-400 hover:text-ink-600">← Back to templates</button>
                  <span className="text-sm font-medium text-ink-700">{selectedTemplate.name}</span>
                </div>
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-ink-100 text-ink-500">{selectedTemplate.category}</span>
              </div>

              {/* Unit selector */}
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Unit</label>
                <select value={templateUnit} onChange={e => { setTemplateUnit(e.target.value); const u = units.find(x => x.number === e.target.value); if (u) setTemplateValues(v => ({ ...v, unit_number: u.number, owner_name: u.owner })); }} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                  <option value="">Select unit...</option>
                  {units.map(u => <option key={u.number} value={u.number}>Unit {u.number} — {u.owner}</option>)}
                </select>
              </div>

              {/* Variable fields */}
              {selectedTemplate.variables.filter(v => v.name !== 'unit_number' && v.name !== 'owner_name').map(v => (
                <div key={v.name}>
                  <label className="block text-sm font-medium text-ink-700 mb-1">{v.label}</label>
                  <input value={templateValues[v.name] || ''} onChange={e => setTemplateValues(prev => ({ ...prev, [v.name]: e.target.value }))} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder={v.defaultValue || ''} />
                </div>
              ))}

              {/* Send via */}
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Send Via</label>
                <select value={templateSentVia} onChange={e => setTemplateSentVia(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
                  <option value="email">Email</option>
                  <option value="certified mail">Certified Mail</option>
                  <option value="posted">Posted</option>
                  <option value="hand delivered">Hand Delivered</option>
                </select>
              </div>

              {/* Live preview */}
              <div>
                <p className="text-[10px] text-ink-400 uppercase tracking-wider font-semibold mb-2">Live Preview</p>
                <div className="bg-ink-50 rounded-xl border border-ink-100 overflow-hidden">
                  <div className="bg-white border-b border-ink-100 px-4 py-3">
                    <div className="flex items-center gap-2 text-xs text-ink-400 mb-1.5">
                      <span className="font-semibold text-ink-500">To:</span>
                      <span>{templateValues['owner_name'] || '(recipient)'}</span>
                      {(templateUnit || templateValues['unit_number']) && <span className="text-ink-300">| Unit {templateUnit || templateValues['unit_number']}</span>}
                    </div>
                    <p className="text-sm font-bold text-ink-900">{substituteVariables(selectedTemplate.subject, templateValues)}</p>
                  </div>
                  <div className="px-4 py-3 text-sm text-ink-700 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                    {substituteVariables(selectedTemplate.body, templateValues)}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-ink-400 mt-2">
                  <span>Via: {templateSentVia}</span>
                  <span>By: {currentUser.name}</span>
                </div>
              </div>
            </div>
            <div className="border-t p-6 flex justify-end space-x-3">
              <button onClick={onClose} className="px-4 py-2 text-ink-700 font-medium">Cancel</button>
              <button onClick={handleTemplateSend} className="px-6 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 font-medium">Send Letter</button>
            </div>
          </>
        )}
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

// ─── Link Letter Modal ────────────────────────────────────
export function LinkLetterModal({ caseId, caseUnit, store, onClose }: ModalProps & { caseId: string; caseUnit?: string; store: any }) {
  const { letters } = useLetterStore();
  const c = store.cases.find((x: CaseTrackerCase) => x.id === caseId);
  const alreadyLinked = new Set(c?.linkedLetterIds || []);

  // Filter to case's unit if populated, show all otherwise
  const filtered = caseUnit && caseUnit !== 'Common'
    ? letters.filter(l => l.unitNumber === caseUnit || !l.unitNumber)
    : letters;

  const available = filtered.filter(l => !alreadyLinked.has(l.id));

  const handleLink = (letterId: string) => {
    store.linkLetter(caseId, letterId);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-b p-6">
          <h2 className="text-xl font-bold text-ink-900">Link Existing Letter</h2>
          <p className="text-sm text-ink-500 mt-1">Select a letter to link to this case</p>
        </div>
        <div className="p-6">
          {available.length === 0 ? (
            <p className="text-sm text-ink-400 text-center py-8">No available letters to link.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {available.map(l => {
                const sc: Record<string, string> = { draft: 'bg-yellow-100 text-yellow-700', sent: 'bg-sage-100 text-sage-700', archived: 'bg-ink-100 text-ink-500' };
                return (
                  <button key={l.id} onClick={() => handleLink(l.id)} className="w-full text-left p-3 bg-mist-50 border border-mist-100 rounded-lg hover:border-accent-300 transition-all">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${sc[l.status] || 'bg-ink-100 text-ink-500'}`}>{l.status}</span>
                      <span className="text-sm font-medium text-ink-900 truncate">{l.subject}</span>
                    </div>
                    <p className="text-xs text-ink-400 mt-0.5">{l.recipient}{l.unitNumber ? ` · Unit ${l.unitNumber}` : ''} · {l.sentDate}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="border-t p-6 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-ink-700 font-medium">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Invoice Create Modal ─────────────────────────────────
export function InvoiceCreateModal({ caseId, caseUnit, store, onClose }: ModalProps & { caseId: string; caseUnit?: string; store: any }) {
  const fin = useFinancialStore();
  const [unitNum, setUnitNum] = useState(caseUnit && caseUnit !== 'Common' ? caseUnit : '');
  const [invType, setInvType] = useState<'fee' | 'special_assessment'>('fee');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const handleSave = () => {
    if (!unitNum || !amount || !description.trim()) return alert('Unit, amount, and description are required.');
    const invoice = fin.createUnitInvoice(unitNum, invType, parseFloat(amount), description, caseId);
    store.linkInvoice(caseId, invoice.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="border-b p-6">
          <h2 className="text-xl font-bold text-ink-900">Create Invoice</h2>
          <p className="text-sm text-ink-500 mt-1">Create and link a unit invoice to this case</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Unit *</label>
            <select value={unitNum} onChange={e => setUnitNum(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
              <option value="">Select unit...</option>
              {fin.units.map(u => <option key={u.number} value={u.number}>Unit {u.number} — {u.owner}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Type</label>
            <select value={invType} onChange={e => setInvType(e.target.value as any)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm">
              <option value="fee">Fee</option>
              <option value="special_assessment">Special Assessment</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Amount *</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="0.00" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Description *</label>
            <input value={description} onChange={e => setDescription(e.target.value)} className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm" placeholder="Invoice description" />
          </div>
          <div className="bg-mist-50 border border-mist-200 rounded-lg p-3">
            <p className="text-xs text-ink-600">This creates a unit invoice in Fiscal Lens and links it to case <strong>{caseId}</strong>.</p>
          </div>
        </div>
        <div className="border-t p-6 flex justify-end space-x-3">
          <button onClick={onClose} className="px-4 py-2 text-ink-700 font-medium">Cancel</button>
          <button onClick={handleSave} className="px-6 py-2 bg-ink-900 text-white rounded-lg hover:bg-ink-800 font-medium">Create & Link</button>
        </div>
      </div>
    </div>
  );
}

// ─── Link Invoice Modal ───────────────────────────────────
export function LinkInvoiceModal({ caseId, caseUnit, store, onClose }: ModalProps & { caseId: string; caseUnit?: string; store: any }) {
  const { unitInvoices } = useFinancialStore();
  const c = store.cases.find((x: CaseTrackerCase) => x.id === caseId);
  const alreadyLinked = new Set(c?.linkedInvoiceIds || []);

  const filtered = caseUnit && caseUnit !== 'Common'
    ? unitInvoices.filter(inv => inv.unitNumber === caseUnit)
    : unitInvoices;

  const available = filtered.filter(inv => !alreadyLinked.has(inv.id));

  const handleLink = (invoiceId: string) => {
    store.linkInvoice(caseId, invoiceId);
    onClose();
  };

  const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-b p-6">
          <h2 className="text-xl font-bold text-ink-900">Link Existing Invoice</h2>
          <p className="text-sm text-ink-500 mt-1">Select an invoice to link to this case</p>
        </div>
        <div className="p-6">
          {available.length === 0 ? (
            <p className="text-sm text-ink-400 text-center py-8">No available invoices to link.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {available.map(inv => {
                const sc: Record<string, string> = { sent: 'bg-accent-100 text-accent-700', paid: 'bg-sage-100 text-sage-700', overdue: 'bg-red-100 text-red-700', void: 'bg-ink-100 text-ink-500' };
                return (
                  <button key={inv.id} onClick={() => handleLink(inv.id)} className="w-full text-left p-3 bg-mist-50 border border-mist-100 rounded-lg hover:border-accent-300 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${sc[inv.status] || 'bg-ink-100 text-ink-500'}`}>{inv.status}</span>
                        <span className="text-xs font-mono text-ink-300">{inv.id}</span>
                        <span className="text-sm text-ink-700 truncate">{inv.description}</span>
                      </div>
                      <span className="font-bold text-ink-900 shrink-0 ml-2">{fmt(inv.amount)}</span>
                    </div>
                    <p className="text-xs text-ink-400 mt-0.5">Unit {inv.unitNumber} · {inv.createdDate}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="border-t p-6 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-ink-700 font-medium">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Link Meeting Modal ───────────────────────────────────
export function LinkMeetingModal({ caseId, store, onClose }: ModalProps & { caseId: string; store: any }) {
  const { meetings } = useMeetingsStore();
  const c = store.cases.find((x: CaseTrackerCase) => x.id === caseId);
  const alreadyLinked = new Set(c?.linkedMeetingIds || []);
  const available = meetings.filter(m => !alreadyLinked.has(m.id));

  const handleLink = (meetingId: string) => {
    store.linkMeeting(caseId, meetingId);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-b p-6">
          <h2 className="text-xl font-bold text-ink-900">Link Meeting</h2>
          <p className="text-sm text-ink-500 mt-1">Select a meeting to link to this case</p>
        </div>
        <div className="p-6">
          {available.length === 0 ? (
            <p className="text-sm text-ink-400 text-center py-8">No available meetings to link.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {available.map(m => {
                const sc: Record<string, string> = { scheduled: 'bg-accent-100 text-accent-700', completed: 'bg-sage-100 text-sage-700', cancelled: 'bg-red-100 text-red-700', draft: 'bg-yellow-100 text-yellow-700' };
                return (
                  <button key={m.id} onClick={() => handleLink(m.id)} className="w-full text-left p-3 bg-mist-50 border border-mist-100 rounded-lg hover:border-accent-300 transition-all">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${sc[m.status] || 'bg-ink-100 text-ink-500'}`}>{m.status}</span>
                      <span className="text-sm font-medium text-ink-900">{m.title}</span>
                    </div>
                    <p className="text-xs text-ink-400 mt-0.5">{m.date} · {m.type}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="border-t p-6 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-ink-700 font-medium">Cancel</button>
        </div>
      </div>
    </div>
  );
}
