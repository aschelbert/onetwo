/**
 * AfterTab -- Post-meeting workflow: minutes review, editing, approvals,
 * distribution, and archiving.
 */

import { useState, useMemo, useCallback } from 'react';
import {
  FileText,
  Check,
  CheckCircle2,
  Circle,
  Edit,
  Send,
  Archive,
  ChevronDown,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { useMeetingsStore, type Meeting, type MinutesApproval } from '@/store/useMeetingsStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useUndoableAction } from '@/hooks/useUndoableAction';
import type { BuildingSettings } from '@/lib/buildingSettings';

interface AfterTabProps {
  settings: BuildingSettings;
  isBoard: boolean;
}

export default function AfterTab({ settings, isBoard }: AfterTabProps) {
  const mtg = useMeetingsStore();
  const { board } = useBuildingStore();
  const { currentUser } = useAuthStore();
  const { run: undoRun } = useUndoableAction();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingMinutesId, setEditingMinutesId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // Completed meetings, unapproved first
  const completedMeetings = useMemo(() => {
    const completed = mtg.meetings.filter(m => m.status === 'COMPLETED');
    // Sort: unapproved (no minutesApprovedAt) first, then by date desc
    return completed.sort((a, b) => {
      const aApproved = !!a.minutesApprovedAt;
      const bApproved = !!b.minutesApprovedAt;
      if (aApproved !== bApproved) return aApproved ? 1 : -1;
      return b.date.localeCompare(a.date);
    });
  }, [mtg.meetings]);

  const handleApproveMinutes = useCallback((meeting: Meeting) => {
    if (!currentUser) return;
    const boardMember = board.find(b => b.name === currentUser.name);
    const role = boardMember?.role || 'Board Member';

    const approval: MinutesApproval = {
      name: currentUser.name,
      role,
      date: new Date().toISOString().split('T')[0],
    };

    // Optimistically apply
    mtg.approveMinutes(meeting.id, approval);

    // Check if this reaches majority
    const updatedMeeting = useMeetingsStore.getState().meetings.find(m => m.id === meeting.id);
    const approvals = updatedMeeting?.minutesApprovals || [];
    const majority = Math.ceil(board.length / 2);
    if (approvals.length >= majority && !meeting.minutesApprovedAt) {
      mtg.setMinutesApprovedAt(meeting.id, new Date().toISOString());
    }

    undoRun({
      label: `Minutes approved by ${currentUser.name}`,
      undo: () => {
        mtg.revokeMinutesApproval(meeting.id, currentUser.name);
        // If we had set minutesApprovedAt, undo that too
        if (approvals.length >= majority) {
          mtg.updateMeeting(meeting.id, { minutesApprovedAt: null });
        }
      },
      commit: () => {
        // Side effects on commit: notify owners, file in archives, etc.
        // (would trigger backend functions in production)
      },
    });
  }, [currentUser, board, mtg, undoRun]);

  const handleRequestChange = useCallback((_meeting: Meeting) => {
    // Navigate to outbox or open compose
    // For now, this is a placeholder that could open the compose drawer
  }, []);

  const handleEditMinutes = useCallback((meeting: Meeting) => {
    const minutesText = meeting.minutesDoc?.text || meeting.minutes || '';
    setEditText(minutesText);
    setEditingMinutesId(meeting.id);
  }, []);

  const handleSaveMinutesEdit = useCallback(() => {
    if (!editingMinutesId) return;
    mtg.updateMinutes(editingMinutesId, editText);
    // Also update minutesDoc if present
    const meeting = mtg.meetings.find(m => m.id === editingMinutesId);
    if (meeting?.minutesDoc) {
      mtg.setMinutesDoc(editingMinutesId, {
        html: meeting.minutesDoc.html,
        text: editText,
      });
    }
    setEditingMinutesId(null);
    setEditText('');
  }, [editingMinutesId, editText, mtg]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-lg font-bold text-ink-900">After the Meeting</h3>
        <p className="text-xs text-ink-400 mt-1">
          Review generated minutes, approve with one click, and distribute to owners.
        </p>
      </div>

      {completedMeetings.length === 0 ? (
        <div className="bg-white border border-ink-100 rounded-xl p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-ink-50 flex items-center justify-center mx-auto mb-4">
            <FileText size={24} className="text-ink-400" />
          </div>
          <h4 className="font-display text-lg font-bold text-navy mb-2">
            No completed meetings
          </h4>
          <p className="text-sm text-ink-500 max-w-sm mx-auto">
            Completed meetings will appear here with generated minutes ready for review and approval.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {completedMeetings.map(meeting => {
            const isExpanded = expandedId === meeting.id;
            const approvals = meeting.minutesApprovals || [];
            const majority = Math.ceil(board.length / 2);
            const isFullyApproved = !!meeting.minutesApprovedAt || approvals.length >= majority;
            const hasMinutes = !!(meeting.minutesDoc?.text || meeting.minutes);
            const isEditing = editingMinutesId === meeting.id;
            const currentUserApproved = approvals.some(a => a.name === currentUser?.name);

            return (
              <div
                key={meeting.id}
                className={`border rounded-xl overflow-hidden transition-all ${
                  isFullyApproved
                    ? 'border-sage-200 bg-sage-50'
                    : hasMinutes
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-ink-100 bg-white'
                }`}
              >
                {/* Header */}
                <div
                  className="flex items-center gap-3 px-5 py-4 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : meeting.id)}
                >
                  {isFullyApproved ? (
                    <CheckCircle2 size={20} className="text-sage-600 shrink-0" />
                  ) : (
                    <Circle size={20} className="text-amber-500 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-ink-800 truncate">{meeting.title}</h4>
                    <p className="text-xs text-ink-500">{meeting.date}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      isFullyApproved
                        ? 'bg-sage-200 text-sage-700'
                        : `bg-amber-200 text-amber-700`
                    }`}>
                      {isFullyApproved
                        ? 'Approved'
                        : hasMinutes
                        ? `${approvals.length}/${majority} approvals`
                        : 'No minutes'
                      }
                    </span>
                    {isExpanded ? <ChevronDown size={16} className="text-ink-400" /> : <ChevronRight size={16} className="text-ink-400" />}
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-ink-100 px-5 py-4 space-y-4 bg-white">
                    {/* Minutes preview / edit */}
                    {hasMinutes && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-bold text-ink-600 uppercase tracking-wide">
                            Generated Minutes
                          </p>
                          {isBoard && !isEditing && (
                            <button
                              onClick={() => handleEditMinutes(meeting)}
                              className="flex items-center gap-1 text-xs text-accent-600 hover:underline"
                            >
                              <Edit size={12} />
                              Edit wording
                            </button>
                          )}
                        </div>

                        {isEditing ? (
                          <div className="space-y-2">
                            <textarea
                              value={editText}
                              onChange={e => setEditText(e.target.value)}
                              rows={12}
                              className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg resize-none font-mono"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={handleSaveMinutesEdit}
                                className="px-4 py-2 bg-navy text-white rounded-lg text-sm font-medium hover:bg-navy-800"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => { setEditingMinutesId(null); setEditText(''); }}
                                className="px-4 py-2 border border-ink-200 text-ink-600 rounded-lg text-sm hover:bg-ink-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-mist-50 border border-mist-200 rounded-lg p-4 max-h-48 overflow-y-auto">
                            <p className="text-sm text-ink-700 whitespace-pre-wrap">
                              {meeting.minutesDoc?.text || meeting.minutes}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Approvals list */}
                    <div>
                      <p className="text-xs font-bold text-ink-600 uppercase tracking-wide mb-2">
                        Board Approvals ({approvals.length}/{board.length})
                      </p>
                      <div className="space-y-1.5">
                        {board.map(bm => {
                          const approval = approvals.find(a => a.name === bm.name);
                          return (
                            <div key={bm.id} className="flex items-center gap-2 text-sm">
                              {approval ? (
                                <CheckCircle2 size={16} className="text-sage-600 shrink-0" />
                              ) : (
                                <Circle size={16} className="text-ink-300 shrink-0" />
                              )}
                              <span className={approval ? 'text-sage-700' : 'text-ink-500'}>
                                {bm.name}
                              </span>
                              <span className="text-xs text-ink-400">({bm.role})</span>
                              {approval && (
                                <span className="text-[10px] text-ink-400 ml-auto">
                                  {approval.date}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Action buttons */}
                    {isBoard && hasMinutes && !isFullyApproved && (
                      <div className="flex items-center gap-3 pt-2 border-t border-ink-100">
                        {!currentUserApproved ? (
                          <button
                            onClick={() => handleApproveMinutes(meeting)}
                            className="flex items-center gap-2 px-4 py-2 bg-navy text-white rounded-lg text-sm font-medium hover:bg-navy-800 transition-colors"
                          >
                            <Check size={14} />
                            Approve Minutes
                          </button>
                        ) : (
                          <span className="text-xs text-sage-600 font-medium flex items-center gap-1">
                            <CheckCircle2 size={14} />
                            You approved
                          </span>
                        )}
                        <button
                          onClick={() => handleRequestChange(meeting)}
                          className="flex items-center gap-2 px-4 py-2 border border-ink-200 text-ink-600 rounded-lg text-sm hover:bg-ink-50 transition-colors"
                        >
                          <RotateCcw size={14} />
                          Request a Change
                        </button>
                      </div>
                    )}

                    {/* Fully approved state */}
                    {isFullyApproved && (
                      <div className="flex items-center gap-4 pt-2 border-t border-sage-200">
                        <span className="text-xs text-sage-700 font-medium flex items-center gap-1">
                          <CheckCircle2 size={14} />
                          Minutes approved by majority
                        </span>
                        <span className="text-xs text-ink-400">
                          {meeting.minutesApprovedAt
                            ? `Approved ${new Date(meeting.minutesApprovedAt).toLocaleDateString()}`
                            : 'Approved'
                          }
                        </span>
                        <div className="flex items-center gap-2 ml-auto">
                          <button className="flex items-center gap-1 text-xs text-accent-600 hover:underline">
                            <Send size={12} />
                            Sent to owners
                          </button>
                          <button className="flex items-center gap-1 text-xs text-ink-400 hover:underline">
                            <Archive size={12} />
                            Filed in Archives
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
