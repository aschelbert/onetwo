/**
 * RunbookDrawer — One-tap runbook completion.
 *
 * Replaces the expand-item-tick-steps-modal-attach flow with a single
 * card that asks "What happened?" and maps each answer to the right action.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Upload,
  FileText,
  CalendarDays,
  Briefcase,
  Mail,
  ClipboardCheck,
  Ban,
} from 'lucide-react';
import DrawerShell from '@/components/ui/DrawerShell';
import FileUpload from '@/components/ui/FileUpload';
import { useRunbook } from '@/features/compliance/useRunbook';
import { outcomesFor, type Outcome } from '@/features/compliance/runbookOutcomes';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useLetterStore } from '@/store/useLetterStore';
import { useTenantContext } from '@/components/TenantProvider';
import { useUndoableAction } from '@/hooks/useUndoableAction';
import { BOARD_ROLE_LABELS, type BoardRoleKey } from '@/types/auth';
import OpenCaseDrawer from '@/features/issues/OpenCaseDrawer';

interface RunbookDrawerProps {
  itemId: string;
  onClose: () => void;
  /** Optional: open legacy expanded view */
  onEditLegacy?: (itemId: string) => void;
  /** v2: open MeetingDrawer with prefill instead of legacy modal */
  onOpenMeetingDrawer?: (prefill: {
    kind?: 'board' | 'annual' | 'special';
    runbookItemId?: string;
  }) => void;
}

const OUTCOME_ICONS: Record<string, React.ReactNode> = {
  done_with_upload: <Upload size={16} />,
  done_later_proof: <FileText size={16} />,
  send_letter: <Mail size={16} />,
  open_case: <Briefcase size={16} />,
  schedule_meeting: <CalendarDays size={16} />,
  mark_filed: <ClipboardCheck size={16} />,
  not_applicable: <Ban size={16} />,
  done_plain: <FileText size={16} />,
};

function getPrimaryLabel(outcome: Outcome | null): string {
  if (!outcome) return 'Select an answer';
  switch (outcome.kind) {
    case 'done_with_upload':
      return 'Mark done and attach';
    case 'done_later_proof':
      return 'Mark done, remind me in 7 days';
    case 'send_letter':
      return 'Send and mark done';
    case 'open_case':
      return 'Open a case';
    case 'schedule_meeting':
      return 'Schedule meeting';
    case 'mark_filed':
      return 'Mark filed';
    case 'not_applicable':
      return 'Remove from my season';
    case 'done_plain':
      return outcome.requiresReason ? 'Mark done with reason' : 'Mark done';
    default:
      return 'Mark done';
  }
}

export default function RunbookDrawer({ itemId, onClose, onEditLegacy, onOpenMeetingDrawer }: RunbookDrawerProps) {
  const { findItem, findCategoryForItem } = useRunbook();
  const comp = useComplianceStore();
  const issues = useIssuesStore();
  const tenant = useTenantContext();
  const [showCaseDrawer, setShowCaseDrawer] = useState(false);
  const letterStore = useLetterStore();
  const { run: runUndoable } = useUndoableAction();

  const item = findItem(itemId);
  const category = findCategoryForItem(itemId);

  const [selectedOutcome, setSelectedOutcome] = useState<Outcome | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [reasonText, setReasonText] = useState('');
  const [confirmationNum, setConfirmationNum] = useState('');
  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    size: string;
    type: string;
  } | null>(null);

  // Build outcomes for this item
  const outcomes = useMemo(() => {
    if (!item) return [];
    return outcomesFor(item, {
      hasTemplateFor: (hint: string) => {
        return letterStore.templates.some(
          (t) =>
            t.category === hint ||
            t.name.toLowerCase().includes(hint.replace('_', ' '))
        );
      },
      isFiling: item.satisfyingAction === 'filing',
    });
  }, [item, letterStore.templates]);

  // Breadcrumb: [category label, ROLE]
  const breadcrumb = useMemo(() => {
    const parts: string[] = [];
    if (category) parts.push(category.label);
    if (item?.primaryRole) {
      parts.push(BOARD_ROLE_LABELS[item.primaryRole as BoardRoleKey] || item.role);
    } else if (item?.role) {
      parts.push(item.role);
    }
    return parts;
  }, [category, item]);

  // Determine if primary button should be disabled
  const isPrimaryDisabled = useMemo(() => {
    if (!selectedOutcome) return true;
    if (selectedOutcome.requiresUpload && !uploadedFile) return true;
    if (selectedOutcome.requiresReason && !reasonText.trim()) return true;
    if (selectedOutcome.kind === 'mark_filed' && !confirmationNum.trim()) return false; // confirmation is optional
    return false;
  }, [selectedOutcome, uploadedFile, reasonText, confirmationNum]);

  const handlePrimary = useCallback(() => {
    if (!item || !selectedOutcome) return;

    const howToLen = item.howTo.length;

    // Snapshot state before changes for undo
    const prevCompletion = comp.completions[itemId];
    const prevSteps = comp.stepCompletions[itemId];

    const doComplete = () => {
      comp.completeAllSteps(itemId, howToLen);
    };

    const undoComplete = () => {
      if (prevCompletion !== undefined) {
        comp.setCompletion(itemId, prevCompletion);
      } else {
        comp.setCompletion(itemId, false);
      }
      if (prevSteps) {
        comp.setStepCompletions(itemId, prevSteps);
      } else {
        comp.setStepCompletions(
          itemId,
          item.howTo.map(() => false)
        );
      }
    };

    switch (selectedOutcome.kind) {
      case 'done_with_upload': {
        // Complete all steps with proof
        runUndoable({
          label: `"${item.task}" marked done`,
          commit: () => {
            doComplete();
            if (uploadedFile) {
              comp.addItemAttachment(itemId, {
                name: uploadedFile.name,
                size: uploadedFile.size,
                uploadedAt: new Date().toISOString().split('T')[0],
              });
            }
          },
          undo: undoComplete,
          ms: 10000,
        });
        onClose();
        break;
      }

      case 'done_later_proof': {
        // Complete + create a board task reminder for 7 days
        runUndoable({
          label: `"${item.task}" marked done (proof reminder in 7 days)`,
          commit: () => {
            doComplete();
            // The board_tasks row would be created via supabase in production.
            // For now we add a communication as a reminder placeholder.
            const sevenDays = new Date();
            sevenDays.setDate(sevenDays.getDate() + 7);
            comp.addCommunication({
              type: 'notice',
              subject: `Attach proof: ${item.task}`,
              date: sevenDays.toISOString().split('T')[0],
              method: 'portal',
              recipients: item.role,
              respondedBy: null,
              status: 'pending',
              notes: `Reminder to attach proof for runbook item ${itemId}. Due ${sevenDays.toISOString().split('T')[0]}.`,
            });
          },
          undo: undoComplete,
          ms: 10000,
        });
        onClose();
        break;
      }

      case 'send_letter': {
        // Create communication and complete
        runUndoable({
          label: `Letter sent for "${item.task}"`,
          commit: () => {
            doComplete();
            comp.addCommunication({
              type: 'notice',
              subject: `Re: ${item.task}`,
              date: new Date().toISOString().split('T')[0],
              method: 'email',
              recipients: 'Per template',
              respondedBy: null,
              status: 'sent',
              notes: `Sent from runbook. Legal ref: ${item.legalRef}`,
            });
          },
          undo: undoComplete,
          ms: 10000,
        });
        onClose();
        break;
      }

      case 'open_case': {
        if (tenant.features.v2Cases) {
          // v2: open the full OpenCaseDrawer with runbook context
          setShowCaseDrawer(true);
          return; // Don't close — let the drawer handle it
        }
        // Legacy: create an issue case -- completion NOT written, item stays open
        const catMap: Record<string, string> = {
          governance: 'governance',
          financial: 'financial',
          insurance: 'governance',
          maintenance: 'maintenance',
          records: 'governance',
          'owner-relations': 'owner-relations',
          ethics: 'governance',
          legal: 'governance',
        };
        const catId = catMap[category?.id || ''] || 'governance';
        issues.createCase({
          catId,
          sitId: 'board-meetings',
          approach: 'self',
          title: `${item.task}`,
          unit: 'N/A',
          owner: 'Board',
          priority: item.critical ? 'high' : 'medium',
          notes: `Linked from runbook item ${itemId}. ${item.legalRef}`,
        });
        // Do NOT write completion -- item stays open until case resolves
        onClose();
        break;
      }

      case 'schedule_meeting': {
        // v2: Open MeetingDrawer with prefill; legacy: navigate to meeting modal
        if (onOpenMeetingDrawer) {
          onOpenMeetingDrawer({ runbookItemId: itemId });
        } else if (onEditLegacy) {
          onEditLegacy(itemId);
        }
        onClose();
        break;
      }

      case 'mark_filed': {
        // Mark the matching filing complete
        runUndoable({
          label: `"${item.task}" marked as filed`,
          commit: () => {
            doComplete();
            // Try to find a matching filing and mark it complete
            const matchingFiling = comp.filings.find(
              (f) =>
                f.status === 'pending' &&
                (f.name.toLowerCase().includes(item.task.toLowerCase().slice(0, 20)) ||
                  f.legalRef === item.legalRef)
            );
            if (matchingFiling) {
              comp.markFilingComplete(
                matchingFiling.id,
                new Date().toISOString().split('T')[0],
                confirmationNum || ''
              );
            }
          },
          undo: undoComplete,
          ms: 10000,
        });
        onClose();
        break;
      }

      case 'not_applicable': {
        // Mark completion true with proof kind reason
        runUndoable({
          label: `"${item.task}" marked as not applicable`,
          commit: () => {
            doComplete();
            // In production, upsertCompletion would be called with proof:
            // { kind: 'reason', ref: reasonText }
          },
          undo: undoComplete,
          ms: 10000,
        });
        onClose();
        break;
      }

      case 'done_plain': {
        runUndoable({
          label: `"${item.task}" marked done`,
          commit: () => {
            doComplete();
          },
          undo: undoComplete,
          ms: 10000,
        });
        onClose();
        break;
      }
    }
  }, [
    item,
    itemId,
    selectedOutcome,
    comp,
    issues,
    category,
    uploadedFile,
    confirmationNum,
    reasonText,
    runUndoable,
    onClose,
    onEditLegacy,
    onOpenMeetingDrawer,
  ]);

  if (!item) {
    return (
      <DrawerShell
        open
        onClose={onClose}
        breadcrumb={['Runbook']}
        title="Item not found"
        footer={{
          primaryLabel: 'Close',
          onPrimary: onClose,
          secondaryLabel: 'Cancel',
          onSecondary: onClose,
        }}
      >
        <p className="text-sm text-ink-500">
          This compliance item could not be found. It may have been removed or the
          jurisdiction changed.
        </p>
      </DrawerShell>
    );
  }

  const isComplete = !!comp.completions[itemId];

  return (
    <>
    <DrawerShell
      open
      onClose={onClose}
      breadcrumb={breadcrumb}
      title={item.task}
      legalRef={item.legalRef}
      whyLink={() => setShowHelp(!showHelp)}
      footer={{
        primaryLabel: getPrimaryLabel(selectedOutcome),
        onPrimary: handlePrimary,
        primaryDisabled: isPrimaryDisabled,
        secondaryLabel: 'Cancel',
        onSecondary: onClose,
        tertiaryLink: onEditLegacy
          ? {
              label: 'Edit all fields',
              onClick: () => {
                onEditLegacy(itemId);
                onClose();
              },
            }
          : undefined,
      }}
    >
      <div className="space-y-5">
        {/* Status banner if already complete */}
        {isComplete && (
          <div className="bg-sage-50 border border-sage-200 rounded-lg p-3 flex items-center gap-2">
            <ClipboardCheck size={16} className="text-sage-600" />
            <span className="text-sm font-medium text-sage-700">
              This item is already completed
            </span>
          </div>
        )}

        {/* Context line */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
          <span>{item.freq}</span>
          <span className="text-ink-300">|</span>
          <span>Due: {item.due}</span>
          <span className="text-ink-300">|</span>
          <span className="font-mono text-ink-400">{item.legalRef}</span>
        </div>

        {/* Help panel (toggled by "Why this?" link) */}
        {showHelp && (
          <div className="space-y-3 animate-in fade-in">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider mb-1">
                Why this matters
              </p>
              <p className="text-xs text-amber-900 leading-relaxed">
                {item.whyItMatters}
              </p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-[10px] font-bold text-red-800 uppercase tracking-wider mb-1">
                If not completed
              </p>
              <p className="text-xs text-red-900 leading-relaxed">
                {item.consequence}
              </p>
            </div>
          </div>
        )}

        {/* Question */}
        <div>
          <h3 className="text-sm font-semibold text-navy mb-3">What happened?</h3>

          {/* Outcome buttons */}
          <div className="space-y-2">
            {outcomes.map((outcome) => {
              const isSelected = selectedOutcome?.id === outcome.id;
              return (
                <button
                  key={outcome.id}
                  type="button"
                  onClick={() => {
                    setSelectedOutcome(isSelected ? null : outcome);
                    setReasonText('');
                    setUploadedFile(null);
                    setConfirmationNum('');
                  }}
                  className={`
                    w-full text-left px-4 py-3 rounded-xl border-2 transition-all
                    ${
                      isSelected
                        ? 'border-brand-teal bg-brand-teal-light'
                        : 'border-ink-100 hover:border-brand-teal bg-white'
                    }
                  `}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`shrink-0 ${
                        isSelected ? 'text-brand-teal' : 'text-ink-400'
                      }`}
                    >
                      {OUTCOME_ICONS[outcome.kind] || <FileText size={16} />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm font-medium ${
                          isSelected ? 'text-brand-teal' : 'text-ink-800'
                        }`}
                      >
                        {outcome.label}
                      </p>
                      <p className="text-xs text-ink-400 mt-0.5">{outcome.detail}</p>
                    </div>
                    {isSelected && (
                      <span className="w-5 h-5 rounded-full bg-brand-teal flex items-center justify-center shrink-0">
                        <svg
                          className="w-3 h-3 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Conditional input areas based on selected outcome */}
        {selectedOutcome?.requiresUpload && (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-ink-700">
              Upload proof
            </label>
            <FileUpload
              onFileSelected={(file) =>
                setUploadedFile({
                  name: file.name,
                  size: file.size,
                  type: file.type,
                })
              }
            />
          </div>
        )}

        {selectedOutcome?.kind === 'mark_filed' && (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-ink-700">
              Confirmation number (optional)
            </label>
            <input
              type="text"
              value={confirmationNum}
              onChange={(e) => setConfirmationNum(e.target.value)}
              className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
              placeholder="e.g. CONF-2026-1234"
            />
          </div>
        )}

        {selectedOutcome?.requiresReason && (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-ink-700">
              {selectedOutcome.kind === 'not_applicable'
                ? 'Why does this not apply?'
                : 'Describe what happened'}
            </label>
            <textarea
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
              rows={3}
              placeholder={
                selectedOutcome.kind === 'not_applicable'
                  ? 'e.g. Our association does not have employees'
                  : 'e.g. Handled by management company on 2026-01-15'
              }
            />
          </div>
        )}

        {selectedOutcome?.kind === 'send_letter' &&
          selectedOutcome.letterTemplateHint && (
            <div className="bg-mist-50 border border-mist-200 rounded-lg p-3">
              <p className="text-xs font-medium text-ink-700 mb-1">
                Letter preview
              </p>
              <p className="text-xs text-ink-500">
                A templated letter will be created and logged as a communication.
                Template:{' '}
                <span className="font-mono text-brand-teal">
                  {selectedOutcome.letterTemplateHint}
                </span>
              </p>
            </div>
          )}

        {/* Collapsible "How to do this and why it matters" */}
        <div className="border border-ink-100 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowHelp(!showHelp)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-ink-700 hover:bg-ink-50 transition-colors"
          >
            <span>How to do this and why it matters</span>
            {showHelp ? (
              <ChevronDown size={16} className="text-ink-400" />
            ) : (
              <ChevronRight size={16} className="text-ink-400" />
            )}
          </button>
          {showHelp && (
            <div className="px-4 pb-4 space-y-3 border-t border-ink-100">
              {/* How-to steps */}
              <div className="mt-3">
                <p className="text-[10px] font-bold text-ink-600 uppercase tracking-wider mb-2">
                  Steps
                </p>
                <ol className="space-y-1.5">
                  {item.howTo.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-ink-700">
                      <span className="w-4 h-4 rounded-full bg-ink-100 text-ink-500 flex items-center justify-center shrink-0 mt-0.5 text-[9px] font-bold">
                        {i + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Why it matters */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider mb-1">
                  Why this matters
                </p>
                <p className="text-xs text-amber-900 leading-relaxed">
                  {item.whyItMatters}
                </p>
              </div>

              {/* Consequence */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-[10px] font-bold text-red-800 uppercase tracking-wider mb-1">
                  If not completed
                </p>
                <p className="text-xs text-red-900 leading-relaxed">
                  {item.consequence}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </DrawerShell>
    {showCaseDrawer && (
      <OpenCaseDrawer
        open={showCaseDrawer}
        onClose={() => { setShowCaseDrawer(false); onClose(); }}
        prefill={{
          text: item?.task || '',
          catId: category?.id,
          source: 'runbook',
          sourceId: itemId,
        }}
      />
    )}
    </>
  );
}
