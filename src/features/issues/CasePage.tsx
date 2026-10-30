/**
 * CasePage — depth-view for a single case.
 *
 * Renders header (situation tag, approach tag, opened date, title, parties, legalRef),
 * step strip, timeline, composer, and right sidebar (parties, documents, money,
 * linked items, owner-sees section).
 *
 * Menu actions (Pause, Resume, Change approach, Close, Delete) use useUndoableAction.
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  MoreVertical,
  PauseCircle,
  PlayCircle,
  FileText,
  Trash2,
  XCircle,
  Users,
  DollarSign,
  Link2,
  Eye,
  MessageCircle,
  Upload,
  Phone,
  RefreshCw,
} from 'lucide-react';
import { useIssuesStore, CATS, APPR_LABELS, APPR_COLORS, PRIO_COLORS } from '@/store/useIssuesStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useUndoableAction } from '@/hooks/useUndoableAction';
import { BOARD_ROLE_LABELS, type BoardRoleKey } from '@/types/auth';
import type { CaseTrackerCase, CaseApproach } from '@/types/issues';
import CaseTimeline from './components/CaseTimeline';
import CaseStepDrawer from './components/CaseStepDrawer';

interface CasePageProps {
  caseId: string;
  /** If provided, render inline (inside CasesTab) rather than as a full page */
  inline?: boolean;
  onBack?: () => void;
}

function formatDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function DuePill({ date }: { date?: string }) {
  if (!date) return null;
  const d = new Date(date + 'T00:00:00');
  const now = new Date();
  const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const color =
    diff < 0
      ? 'bg-red-100 text-red-700'
      : diff <= 7
      ? 'bg-amber-100 text-amber-700'
      : 'bg-ink-100 text-ink-600';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${color}`}>
      <Calendar size={10} />
      {diff < 0 ? `${Math.abs(diff)}d overdue` : diff === 0 ? 'Due today' : `${diff}d left`}
    </span>
  );
}

export default function CasePage({ caseId, inline, onBack }: CasePageProps) {
  const store = useIssuesStore();
  const caseData = store.cases.find(c => c.id === caseId);
  const { currentUser } = useAuthStore();
  const { run: runUndoable } = useUndoableAction();
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [stepDrawerIdx, setStepDrawerIdx] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  if (!caseData) {
    return (
      <div className="flex items-center justify-center py-12 text-ink-400 text-sm">
        Case not found.
      </div>
    );
  }

  const cat = CATS.find(c => c.id === caseData.catId);
  const sit = cat?.sits.find(s => s.id === caseData.sitId);
  const steps = caseData.steps || [];
  const doneSteps = steps.filter(s => s.done).length;
  const totalSteps = steps.length;
  const progressPct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;
  const currentStepIdx = steps.findIndex(s => !s.done);
  const currentStep = currentStepIdx >= 0 ? steps[currentStepIdx] : null;

  // Owner role label
  const ownerRole = caseData.assignedRole
    ? BOARD_ROLE_LABELS[caseData.assignedRole as BoardRoleKey] || caseData.assignedRole
    : caseData.assignedTo || 'Board';

  // Menu actions
  const handlePause = () => {
    setMenuOpen(false);
    const prevStatus = caseData.status;
    runUndoable({
      label: `Case "${caseData.title}" paused`,
      commit: () => store.putOnHold(caseId, 'Paused by board'),
      undo: () => {
        if (prevStatus === 'open') store.resumeCase(caseId);
      },
    });
  };

  const handleResume = () => {
    setMenuOpen(false);
    runUndoable({
      label: `Case "${caseData.title}" resumed`,
      commit: () => store.resumeCase(caseId),
      undo: () => store.putOnHold(caseId, 'Paused by board'),
    });
  };

  const handleClose = () => {
    setMenuOpen(false);
    const prevStatus = caseData.status;
    runUndoable({
      label: `Case "${caseData.title}" closed`,
      commit: () => store.closeCaseWithReason(caseId, 'Resolved', ''),
      undo: () => {
        if (prevStatus === 'open') store.reopenCase(caseId);
      },
    });
  };

  const handleDelete = () => {
    setMenuOpen(false);
    const snapshot = { ...caseData };
    runUndoable({
      label: `Case "${caseData.title}" deleted`,
      commit: () => store.deleteCase(caseId),
      undo: () => {
        // Re-add the case (simplified — the store add pattern would need adjustment)
        // For now, we just recreate
        store.createCase({
          catId: snapshot.catId,
          sitId: snapshot.sitId,
          approach: snapshot.approach,
          title: snapshot.title,
          unit: snapshot.unit,
          owner: snapshot.owner,
          priority: snapshot.priority,
          notes: snapshot.notes,
        });
      },
    });
    if (onBack) onBack();
    else if (!inline) navigate('/boardroom?tab=cases');
  };

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    store.addComm(caseId, {
      type: 'note',
      subject: 'Note',
      date: new Date().toISOString().split('T')[0],
      method: 'portal',
      recipient: '',
      sentBy: currentUser.name,
      notes: noteText.trim(),
      status: 'sent',
    });
    setNoteText('');
  };

  const goBack = () => {
    if (onBack) onBack();
    else navigate('/boardroom?tab=cases');
  };

  return (
    <div className={inline ? '' : 'max-w-6xl mx-auto'}>
      {/* Back button */}
      {!inline && (
        <button onClick={goBack} className="flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700 mb-4">
          <ArrowLeft size={14} /> Back to Cases
        </button>
      )}

      {/* Header */}
      <div className="bg-white rounded-xl border border-ink-200 p-5 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Tags row */}
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {sit && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-ink-100 text-ink-600">
                  {sit.title}
                </span>
              )}
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${APPR_COLORS[caseData.approach]}`}>
                {APPR_LABELS[caseData.approach]}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${PRIO_COLORS[caseData.priority]}`}>
                {caseData.priority}
              </span>
              {caseData.status === 'on-hold' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">
                  On Hold
                </span>
              )}
              {caseData.status === 'closed' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-ink-100 text-ink-500">
                  Closed
                </span>
              )}
            </div>

            <h2 className="font-display text-lg font-bold text-ink-900">{caseData.title}</h2>

            <div className="flex items-center gap-3 mt-1.5 text-xs text-ink-500">
              <span>Opened {formatDate(caseData.created)}</span>
              {caseData.unit && <span>Unit {caseData.unit}</span>}
              {caseData.owner && <span>{caseData.owner}</span>}
              <DuePill date={caseData.dueDate} />
            </div>
          </div>

          {/* Actions menu */}
          <div ref={menuRef} className="relative shrink-0">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 hover:bg-ink-100 rounded-lg transition-colors"
            >
              <MoreVertical size={16} className="text-ink-500" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-10 z-30 bg-white border border-ink-200 rounded-lg shadow-lg py-1 w-48">
                {caseData.status === 'open' && (
                  <button onClick={handlePause} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-mist-50">
                    <PauseCircle size={14} /> Pause
                  </button>
                )}
                {caseData.status === 'on-hold' && (
                  <button onClick={handleResume} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-mist-50">
                    <PlayCircle size={14} /> Resume
                  </button>
                )}
                {caseData.status !== 'closed' && (
                  <button onClick={handleClose} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-mist-50">
                    <XCircle size={14} /> Close
                  </button>
                )}
                {caseData.status === 'closed' && (
                  <button onClick={() => { setMenuOpen(false); store.reopenCase(caseId); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-mist-50">
                    <RefreshCw size={14} /> Reopen
                  </button>
                )}
                <button onClick={handleDelete} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Next step CTA */}
        {currentStep && caseData.status === 'open' && (
          <button
            onClick={() => setStepDrawerIdx(currentStepIdx)}
            className="mt-4 p-3 rounded-lg bg-accent-50 border border-accent-200 w-full text-left hover:bg-accent-100 transition-colors"
          >
            <p className="text-[10px] font-bold text-accent-600 uppercase tracking-wide mb-1">
              Next Step ({currentStepIdx + 1} of {totalSteps})
            </p>
            <p className="text-sm font-medium text-ink-800">{currentStep.s}</p>
            {currentStep.t && (
              <p className="text-xs text-ink-500 mt-0.5">{currentStep.t}</p>
            )}
          </button>
        )}
      </div>

      {/* Main content: two-column on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: step strip + timeline + composer */}
        <div className="lg:col-span-2 space-y-4">
          {/* Step strip */}
          {totalSteps > 0 && (
            <div className="bg-white rounded-xl border border-ink-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-ink-500 uppercase tracking-wide">
                  Steps ({doneSteps}/{totalSteps})
                </p>
                <span className="text-xs text-ink-400">{progressPct}%</span>
              </div>
              {/* Progress bar */}
              <div className="h-1.5 bg-ink-100 rounded-full mb-3">
                <div
                  className="h-full bg-accent-500 rounded-full transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {/* Step list */}
              <div className="space-y-1.5">
                {steps.map((step, i) => (
                  <button
                    key={step.id || i}
                    onClick={() => store.toggleStep(caseId, i)}
                    className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md hover:bg-ink-50 transition-colors"
                  >
                    <span
                      className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        step.done
                          ? 'bg-sage-500 text-white'
                          : i === currentStepIdx
                          ? 'bg-accent-50 text-accent-600 border border-accent-200'
                          : 'bg-ink-50 text-ink-400 border border-ink-200'
                      }`}
                    >
                      {step.done ? '\u2713' : i + 1}
                    </span>
                    <span
                      className={`text-xs leading-tight ${
                        step.done ? 'text-ink-400 line-through' : 'text-ink-700'
                      }`}
                    >
                      {step.s}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="bg-white rounded-xl border border-ink-200 p-4">
            <p className="text-xs font-bold text-ink-500 uppercase tracking-wide mb-3">
              What has happened
            </p>
            <CaseTimeline caseData={caseData} />
          </div>

          {/* Composer for notes */}
          <div className="bg-white rounded-xl border border-ink-200 p-4">
            <p className="text-xs font-bold text-ink-500 uppercase tracking-wide mb-3">
              Add a note
            </p>
            <div className="flex gap-2">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Type a note, paste a file reference, or log a call..."
                className="flex-1 px-3 py-2 border border-ink-200 rounded-lg text-sm resize-none"
                rows={2}
              />
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  onClick={handleAddNote}
                  disabled={!noteText.trim()}
                  className="px-3 py-1.5 bg-ink-900 text-white rounded-lg text-xs font-medium hover:bg-ink-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <MessageCircle size={12} className="inline mr-1" />
                  Note
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Parties */}
          <div className="bg-white rounded-xl border border-ink-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users size={14} className="text-ink-400" />
              <p className="text-xs font-bold text-ink-500 uppercase tracking-wide">Parties</p>
            </div>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-ink-400 text-xs">Owner</span>
                <p className="text-ink-700">{ownerRole}</p>
              </div>
              {caseData.unit && (
                <div>
                  <span className="text-ink-400 text-xs">Unit</span>
                  <p className="text-ink-700">{caseData.unit}</p>
                </div>
              )}
              {caseData.owner && (
                <div>
                  <span className="text-ink-400 text-xs">Reporter</span>
                  <p className="text-ink-700">{caseData.owner}</p>
                </div>
              )}
            </div>
          </div>

          {/* Documents */}
          <div className="bg-white rounded-xl border border-ink-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText size={14} className="text-ink-400" />
              <p className="text-xs font-bold text-ink-500 uppercase tracking-wide">Documents</p>
            </div>
            {caseData.attachments.length > 0 ? (
              <div className="space-y-1.5">
                {caseData.attachments.map((doc, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-ink-600">
                    <FileText size={12} className="text-ink-400 shrink-0" />
                    <span className="truncate">{doc.name}</span>
                    <span className="text-ink-400 shrink-0">{doc.size}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink-400">No documents attached.</p>
            )}
          </div>

          {/* Linked Items */}
          <div className="bg-white rounded-xl border border-ink-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Link2 size={14} className="text-ink-400" />
              <p className="text-xs font-bold text-ink-500 uppercase tracking-wide">Linked Items</p>
            </div>
            <div className="space-y-1.5 text-xs">
              {caseData.linkedWOs.length > 0 && (
                <div className="text-ink-600">
                  {caseData.linkedWOs.length} Work Order{caseData.linkedWOs.length !== 1 ? 's' : ''}
                </div>
              )}
              {caseData.linkedLetterIds.length > 0 && (
                <div className="text-ink-600">
                  {caseData.linkedLetterIds.length} Letter{caseData.linkedLetterIds.length !== 1 ? 's' : ''}
                </div>
              )}
              {caseData.linkedInvoiceIds.length > 0 && (
                <div className="text-ink-600">
                  {caseData.linkedInvoiceIds.length} Invoice{caseData.linkedInvoiceIds.length !== 1 ? 's' : ''}
                </div>
              )}
              {caseData.linkedMeetingIds.length > 0 && (
                <div className="text-ink-600">
                  {caseData.linkedMeetingIds.length} Meeting{caseData.linkedMeetingIds.length !== 1 ? 's' : ''}
                </div>
              )}
              {caseData.linkedWOs.length === 0 &&
               caseData.linkedLetterIds.length === 0 &&
               caseData.linkedInvoiceIds.length === 0 &&
               caseData.linkedMeetingIds.length === 0 && (
                <p className="text-ink-400">No linked items.</p>
              )}
            </div>
          </div>

          {/* Legal reference */}
          {sit?.notes && Object.keys(sit.notes).length > 0 && (
            <div className="bg-white rounded-xl border border-ink-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Eye size={14} className="text-ink-400" />
                <p className="text-xs font-bold text-ink-500 uppercase tracking-wide">Legal References</p>
              </div>
              <div className="space-y-2 text-xs text-ink-600">
                {Object.entries(sit.notes).map(([key, val]) => (
                  <div key={key}>
                    <span className="font-medium text-ink-700">{key === '_' ? 'General' : key}:</span>{' '}
                    <span className="line-clamp-3">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CaseStepDrawer */}
      {stepDrawerIdx !== null && (
        <CaseStepDrawer
          open={true}
          onClose={() => setStepDrawerIdx(null)}
          caseId={caseId}
          stepIndex={stepDrawerIdx}
        />
      )}
    </div>
  );
}
