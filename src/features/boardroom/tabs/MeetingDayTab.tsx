/**
 * MeetingDayTab -- Run the meeting in the app: attendance by tap, agenda
 * stepped through, votes recorded inline per member, notes per item.
 */

import { useState, useMemo, useCallback } from 'react';
import {
  Play,
  Users,
  Video,
  ChevronRight,
  ChevronDown,
  Check,
  Minus,
  Plus,
  AlertTriangle,
  Gavel,
} from 'lucide-react';
import { useMeetingsStore, type AgendaItem, type AgendaOutcome, type AgendaTally, type MeetingAttendance } from '@/store/useMeetingsStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useTenantContext } from '@/components/TenantProvider';
import { generateMinutes } from '@/features/meetings/minutesGenerator';
import OpenCaseDrawer from '@/features/issues/OpenCaseDrawer';
import type { BuildingSettings } from '@/lib/buildingSettings';

interface MeetingDayTabProps {
  settings: BuildingSettings;
  isBoard: boolean;
}

function formatTimeDisplay(time: string): string {
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${m} ${ampm}`;
}

export default function MeetingDayTab({ settings, isBoard }: MeetingDayTabProps) {
  const mtg = useMeetingsStore();
  const { board } = useBuildingStore();
  const tenant = useTenantContext();
  const [currentItemIdx, setCurrentItemIdx] = useState(0);
  const [caseDrawerMeeting, setCaseDrawerMeeting] = useState<string | null>(null);
  const [localNotes, setLocalNotes] = useState<Record<string, string>>({});
  const [localMotion, setLocalMotion] = useState<Record<string, string>>({});
  const [localMovedBy, setLocalMovedBy] = useState<Record<string, string>>({});
  const [localSecondedBy, setLocalSecondedBy] = useState<Record<string, string>>({});
  const [localTally, setLocalTally] = useState<Record<string, AgendaTally>>({});
  const [localConflicts, setLocalConflicts] = useState<Record<string, string[]>>({});
  const [localOutcome, setLocalOutcome] = useState<Record<string, AgendaOutcome | ''>>({});

  // Find the target meeting: today's meeting or next SCHEDULED one
  const meeting = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    // First, check for a meeting today (in progress or scheduled)
    const todayMtg = mtg.meetings.find(m =>
      m.date === todayStr && (m.status === 'SCHEDULED' || m.status === 'IN_PROGRESS')
    );
    if (todayMtg) return todayMtg;
    // Otherwise, the next SCHEDULED meeting
    return mtg.meetings
      .filter(m => m.status === 'SCHEDULED' || m.status === 'IN_PROGRESS')
      .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  }, [mtg.meetings]);

  const items = useMemo(() => {
    if (!meeting) return [];
    const agendaItems = meeting.agendaItems || [];
    if (agendaItems.length > 0) {
      return [...agendaItems].sort((a, b) => a.position - b.position);
    }
    // Fallback: generate items from the agenda strings
    return meeting.agenda.map((title, i) => ({
      id: `fallback-${i}`,
      position: i,
      title,
      sourceType: 'manual' as const,
      sourceId: null,
      requiresVote: false,
      locked: false,
      motionText: '',
      movedBy: '',
      secondedBy: '',
      tally: {} as AgendaTally,
      outcome: undefined as AgendaOutcome | undefined,
      notes: '',
      conflictsDeclared: [] as string[],
      completedAt: undefined as string | undefined,
    }));
  }, [meeting]);

  const attendance: MeetingAttendance[] = useMemo(() => {
    if (!meeting) return [];
    if (meeting.boardAttendance && meeting.boardAttendance.length > 0) {
      return meeting.boardAttendance;
    }
    // Initialize from board members
    return board.map(bm => ({
      name: bm.name,
      present: false,
      byVideo: false,
    }));
  }, [meeting, board]);

  const presentMembers = attendance.filter(a => a.present);
  const ownersPresent = meeting?.ownersPresent ?? 0;

  // Quorum: based on board members present out of total board
  const quorumPct = settings.quorumPct;
  const quorumThreshold = Math.ceil(board.length * (quorumPct / 100));
  const quorumMet = presentMembers.length >= quorumThreshold;

  const isStarted = !!meeting?.calledToOrderAt;

  const handleTogglePresent = useCallback((name: string) => {
    if (!meeting) return;
    const updated = attendance.map(a =>
      a.name === name ? { ...a, present: !a.present, byVideo: !a.present ? a.byVideo : false } : a
    );
    mtg.setBoardAttendance(meeting.id, updated);
    mtg.setQuorumMet(meeting.id, updated.filter(a => a.present).length >= quorumThreshold);
  }, [meeting, attendance, mtg, quorumThreshold]);

  const handleToggleVideo = useCallback((name: string) => {
    if (!meeting) return;
    const updated = attendance.map(a =>
      a.name === name ? { ...a, byVideo: !a.byVideo } : a
    );
    mtg.setBoardAttendance(meeting.id, updated);
  }, [meeting, attendance, mtg]);

  const handleOwnersPresent = useCallback((delta: number) => {
    if (!meeting) return;
    const newCount = Math.max(0, ownersPresent + delta);
    mtg.setOwnersPresent(meeting.id, newCount);
  }, [meeting, ownersPresent, mtg]);

  const handleStartMeeting = useCallback(() => {
    if (!meeting) return;
    mtg.callToOrder(meeting.id);
  }, [meeting, mtg]);

  const currentItem = items[currentItemIdx] || null;

  const handleRecordAndNext = useCallback(() => {
    if (!meeting || !currentItem) return;
    const itemId = currentItem.id;
    const notes = localNotes[itemId] ?? currentItem.notes ?? '';
    const motion = localMotion[itemId] ?? currentItem.motionText ?? '';
    const movedBy = localMovedBy[itemId] ?? currentItem.movedBy ?? '';
    const secondedBy = localSecondedBy[itemId] ?? currentItem.secondedBy ?? '';
    const tally = localTally[itemId] ?? currentItem.tally ?? {};
    const conflicts = localConflicts[itemId] ?? currentItem.conflictsDeclared ?? [];
    const outcomeVal = localOutcome[itemId] || currentItem.outcome;

    // Compute outcome from tally if vote item and no explicit outcome set
    let outcome: AgendaOutcome | undefined = outcomeVal || undefined;
    if (currentItem.requiresVote && tally && Object.keys(tally).length > 0 && !outcome) {
      const yes = Object.values(tally).filter(v => v === 'yes').length;
      const no = Object.values(tally).filter(v => v === 'no').length;
      outcome = yes > no ? 'passed' : 'failed';
    }

    mtg.recordAgendaItem(meeting.id, itemId, {
      notes,
      motionText: motion || undefined,
      movedBy: movedBy || undefined,
      secondedBy: secondedBy || undefined,
      tally: Object.keys(tally).length > 0 ? tally : undefined,
      outcome,
      conflictsDeclared: conflicts.length > 0 ? conflicts : undefined,
      completedAt: new Date().toISOString(),
    });

    // Move to next item
    if (currentItemIdx < items.length - 1) {
      setCurrentItemIdx(currentItemIdx + 1);
    }
  }, [meeting, currentItem, currentItemIdx, items, localNotes, localMotion, localMovedBy, localSecondedBy, localTally, localConflicts, localOutcome, mtg]);

  const handleAdjourn = useCallback(() => {
    if (!meeting) return;
    // Record the last item if not yet completed
    if (currentItem && !currentItem.completedAt) {
      handleRecordAndNext();
    }
    // Generate minutes
    const allItems = useMeetingsStore.getState().meetings.find(m => m.id === meeting.id)?.agendaItems || items;
    const doc = generateMinutes({
      meeting: useMeetingsStore.getState().meetings.find(m => m.id === meeting.id) || meeting,
      items: allItems,
      members: board,
      settings: { quorumPct: settings.quorumPct },
    });
    mtg.setMinutesDoc(meeting.id, doc);
    mtg.adjourn(meeting.id);
  }, [meeting, currentItem, items, board, settings, mtg, handleRecordAndNext]);

  const setVote = useCallback((itemId: string, memberName: string, vote: 'yes' | 'no' | 'abstain') => {
    setLocalTally(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || {}), [memberName]: vote },
    }));
  }, []);

  const toggleConflict = useCallback((itemId: string, memberName: string) => {
    setLocalConflicts(prev => {
      const current = prev[itemId] || [];
      const has = current.includes(memberName);
      return {
        ...prev,
        [itemId]: has ? current.filter(n => n !== memberName) : [...current, memberName],
      };
    });
  }, []);

  // ── Empty state ──
  if (!meeting) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="font-display text-lg font-bold text-ink-900">Meeting Day</h3>
          <p className="text-xs text-ink-400 mt-1">
            Run your meeting with attendance, voting, and real-time notes.
          </p>
        </div>
        <div className="bg-white border border-ink-100 rounded-xl p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-ink-50 flex items-center justify-center mx-auto mb-4">
            <Gavel size={24} className="text-ink-400" />
          </div>
          <h4 className="font-display text-lg font-bold text-navy mb-2">
            No meeting today
          </h4>
          <p className="text-sm text-ink-500 max-w-sm mx-auto">
            Schedule a meeting in the Before tab and come back on meeting day.
          </p>
        </div>
      </div>
    );
  }

  const isCompleted = meeting.status === 'COMPLETED';

  // ── Main render ──
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-lg font-bold text-ink-900">Meeting Day</h3>
        <p className="text-xs text-ink-400 mt-1">
          Run your meeting with attendance, voting, and real-time notes.
        </p>
      </div>

      {/* Meeting header card */}
      <div className="bg-white border-2 border-accent-200 rounded-xl overflow-hidden">
        <div className="bg-gradient-to-r from-accent-50 to-mist-50 px-5 py-4 border-b border-accent-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-accent-600 uppercase tracking-wider mb-1">
                {isCompleted ? 'Meeting Completed' : isStarted ? 'Meeting In Progress' : 'Ready to Start'}
              </p>
              <h4 className="font-display text-lg font-bold text-navy">{meeting.title}</h4>
              <p className="text-sm text-ink-500 mt-1">
                {meeting.date} at {formatTimeDisplay(meeting.time)} -- {meeting.location}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isBoard && true && (
                <button
                  onClick={() => setCaseDrawerMeeting(meeting.id)}
                  className="px-4 py-2.5 border border-accent-200 text-accent-600 rounded-lg text-sm font-medium hover:bg-accent-50 transition-colors"
                >
                  Open a case
                </button>
              )}
              {!isStarted && !isCompleted && isBoard && (
                <button
                  onClick={handleStartMeeting}
                  className="flex items-center gap-2 px-5 py-2.5 bg-navy text-white rounded-lg text-sm font-medium hover:bg-navy-800 transition-colors"
                >
                  <Play size={16} />
                  Start Meeting
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Attendance section */}
        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-accent-500" />
              <span className="text-sm font-bold text-ink-700">Board Attendance</span>
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${quorumMet ? 'bg-sage-100 text-sage-700' : 'bg-amber-100 text-amber-700'}`}>
              {presentMembers.length}/{board.length} present {quorumMet ? '-- Quorum met' : '-- No quorum'}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {attendance.map(a => (
              <div key={a.name} className="flex items-center gap-1">
                <button
                  onClick={() => handleTogglePresent(a.name)}
                  disabled={isCompleted}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    a.present
                      ? 'bg-sage-100 border-sage-300 text-sage-800'
                      : 'bg-white border-ink-200 text-ink-400'
                  } ${isCompleted ? 'cursor-default' : 'hover:border-accent-300'}`}
                >
                  {a.present && <Check size={12} className="inline mr-1" />}
                  {a.name}
                </button>
                {a.present && (
                  <button
                    onClick={() => handleToggleVideo(a.name)}
                    disabled={isCompleted}
                    title="By video"
                    className={`p-1 rounded transition-colors ${
                      a.byVideo
                        ? 'text-accent-600 bg-accent-50'
                        : 'text-ink-300 hover:text-ink-500'
                    } ${isCompleted ? 'cursor-default' : ''}`}
                  >
                    <Video size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Owners present stepper */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-ink-600">Owners present:</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleOwnersPresent(-1)}
                disabled={isCompleted || ownersPresent <= 0}
                className="w-7 h-7 rounded border border-ink-200 flex items-center justify-center text-ink-500 hover:bg-ink-50 disabled:opacity-30"
              >
                <Minus size={14} />
              </button>
              <span className="w-10 text-center text-sm font-medium">{ownersPresent}</span>
              <button
                onClick={() => handleOwnersPresent(1)}
                disabled={isCompleted}
                className="w-7 h-7 rounded border border-ink-200 flex items-center justify-center text-ink-500 hover:bg-ink-50 disabled:opacity-30"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Agenda stepper -- only show if started */}
      {isStarted && !isCompleted && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-ink-700 uppercase tracking-wide">Agenda</h4>
            <span className="text-xs text-ink-400">
              Item {currentItemIdx + 1} of {items.length}
            </span>
          </div>

          {/* Item list */}
          {items.map((item, idx) => {
            const isActive = idx === currentItemIdx;
            const isDone = !!item.completedAt;
            return (
              <div
                key={item.id}
                className={`border rounded-xl transition-all ${
                  isActive
                    ? 'border-accent-300 bg-white shadow-sm'
                    : isDone
                    ? 'border-sage-200 bg-sage-50'
                    : 'border-ink-100 bg-ink-50'
                }`}
              >
                {/* Item header */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                  onClick={() => !isDone && setCurrentItemIdx(idx)}
                >
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    isDone ? 'bg-sage-200 text-sage-700' : isActive ? 'bg-accent-100 text-accent-700' : 'bg-ink-100 text-ink-400'
                  }`}>
                    {isDone ? <Check size={14} /> : idx + 1}
                  </span>
                  <span className={`flex-1 text-sm font-medium ${isDone ? 'text-sage-700' : 'text-ink-800'}`}>
                    {item.title}
                  </span>
                  {item.requiresVote && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                      Vote
                    </span>
                  )}
                  {isActive ? <ChevronDown size={16} className="text-ink-400" /> : <ChevronRight size={16} className="text-ink-300" />}
                </div>

                {/* Expanded item */}
                {isActive && (
                  <div className="px-4 pb-4 space-y-4 border-t border-ink-100 pt-3">
                    {item.sourceType !== 'standing' && (
                      <p className="text-[10px] text-ink-400">
                        Source: {item.sourceType}{item.sourceId ? ` -- ${item.sourceId}` : ''}
                      </p>
                    )}

                    {/* Vote section for requires_vote items */}
                    {item.requiresVote && (
                      <div className="space-y-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-xs font-bold text-amber-800">Motion & Vote</p>

                        {/* Motion text */}
                        <div>
                          <label className="text-xs text-ink-500 block mb-1">Motion text</label>
                          <input
                            type="text"
                            value={localMotion[item.id] ?? item.motionText ?? ''}
                            onChange={e => setLocalMotion(prev => ({ ...prev, [item.id]: e.target.value }))}
                            className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg"
                            placeholder="Describe the motion..."
                          />
                        </div>

                        {/* Moved by / Seconded by */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-ink-500 block mb-1">Moved by</label>
                            <select
                              value={localMovedBy[item.id] ?? item.movedBy ?? ''}
                              onChange={e => setLocalMovedBy(prev => ({ ...prev, [item.id]: e.target.value }))}
                              className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg bg-white"
                            >
                              <option value="">Select...</option>
                              {presentMembers.map(a => (
                                <option key={a.name} value={a.name}>{a.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-ink-500 block mb-1">Seconded by</label>
                            <select
                              value={localSecondedBy[item.id] ?? item.secondedBy ?? ''}
                              onChange={e => setLocalSecondedBy(prev => ({ ...prev, [item.id]: e.target.value }))}
                              className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg bg-white"
                            >
                              <option value="">Select...</option>
                              {presentMembers.map(a => (
                                <option key={a.name} value={a.name}>{a.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Per-member vote buttons */}
                        <div className="space-y-2">
                          <label className="text-xs text-ink-500 block">Votes</label>
                          {presentMembers.map(a => {
                            const currentVote = (localTally[item.id] || {})[a.name] || '';
                            return (
                              <div key={a.name} className="flex items-center justify-between gap-2">
                                <span className="text-sm text-ink-700 flex-1">{a.name}</span>
                                <div className="flex gap-1">
                                  {(['yes', 'no', 'abstain'] as const).map(v => (
                                    <button
                                      key={v}
                                      onClick={() => setVote(item.id, a.name, v)}
                                      className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                                        currentVote === v
                                          ? v === 'yes' ? 'bg-sage-200 border-sage-400 text-sage-800'
                                          : v === 'no' ? 'bg-red-100 border-red-300 text-red-700'
                                          : 'bg-amber-100 border-amber-300 text-amber-700'
                                          : 'bg-white border-ink-200 text-ink-500 hover:bg-ink-50'
                                      }`}
                                    >
                                      {v === 'yes' ? 'Yes' : v === 'no' ? 'No' : 'Abstain'}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Live result */}
                        {(() => {
                          const tally = localTally[item.id] || {};
                          const yesCount = Object.values(tally).filter(v => v === 'yes').length;
                          const noCount = Object.values(tally).filter(v => v === 'no').length;
                          const absCount = Object.values(tally).filter(v => v === 'abstain').length;
                          if (yesCount + noCount + absCount === 0) return null;
                          return (
                            <div className="text-xs text-ink-600 bg-white rounded p-2 border border-ink-100">
                              Result: {yesCount} Yes, {noCount} No, {absCount} Abstain
                              {yesCount > noCount && <span className="ml-2 text-sage-700 font-medium">-- Passing</span>}
                              {noCount >= yesCount && yesCount + noCount > 0 && <span className="ml-2 text-red-600 font-medium">-- Failing</span>}
                            </div>
                          );
                        })()}

                        {/* Outcome override */}
                        <div>
                          <label className="text-xs text-ink-500 block mb-1">Outcome (optional override)</label>
                          <select
                            value={localOutcome[item.id] ?? item.outcome ?? ''}
                            onChange={e => setLocalOutcome(prev => ({ ...prev, [item.id]: e.target.value as AgendaOutcome }))}
                            className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg bg-white"
                          >
                            <option value="">Auto from tally</option>
                            <option value="passed">Passed</option>
                            <option value="failed">Failed</option>
                            <option value="tabled">Tabled</option>
                          </select>
                        </div>

                        {/* Conflicts declared */}
                        <div>
                          <label className="text-xs text-ink-500 block mb-1">Conflicts declared</label>
                          <div className="flex flex-wrap gap-1">
                            {presentMembers.map(a => {
                              const conflicts = localConflicts[item.id] || [];
                              const isConflict = conflicts.includes(a.name);
                              return (
                                <button
                                  key={a.name}
                                  onClick={() => toggleConflict(item.id, a.name)}
                                  className={`px-2 py-1 text-[10px] rounded-full border transition-colors ${
                                    isConflict
                                      ? 'bg-red-100 border-red-300 text-red-700'
                                      : 'bg-white border-ink-200 text-ink-400 hover:bg-ink-50'
                                  }`}
                                >
                                  {isConflict && <AlertTriangle size={10} className="inline mr-0.5" />}
                                  {a.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Notes field */}
                    <div>
                      <label className="text-xs text-ink-500 block mb-1">Notes</label>
                      <textarea
                        value={localNotes[item.id] ?? item.notes ?? ''}
                        onChange={e => setLocalNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                        rows={3}
                        className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg resize-none"
                        placeholder="Notes for this agenda item..."
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleRecordAndNext}
                        className="flex items-center gap-2 px-4 py-2 bg-navy text-white rounded-lg text-sm font-medium hover:bg-navy-800 transition-colors"
                      >
                        <Check size={14} />
                        {currentItemIdx < items.length - 1 ? 'Record & Next' : 'Record Item'}
                      </button>
                      {currentItemIdx === items.length - 1 && (
                        <button
                          onClick={handleAdjourn}
                          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                        >
                          <Gavel size={14} />
                          Adjourn
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Adjourn button always available */}
          {currentItemIdx < items.length - 1 && (
            <div className="pt-2">
              <button
                onClick={handleAdjourn}
                className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
              >
                <Gavel size={14} />
                Adjourn Early
              </button>
            </div>
          )}
        </div>
      )}

      {/* Completed state */}
      {isCompleted && (
        <div className="bg-sage-50 border border-sage-200 rounded-xl p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-sage-100 flex items-center justify-center mx-auto mb-4">
            <Check size={24} className="text-sage-600" />
          </div>
          <h4 className="font-display text-lg font-bold text-sage-800 mb-2">Meeting Complete</h4>
          <p className="text-sm text-sage-600 mb-1">
            Minutes have been generated. Review and approve them in the After tab.
          </p>
          {meeting.minutesDoc && (
            <div className="mt-4 bg-white border border-sage-200 rounded-lg p-4 text-left max-h-48 overflow-y-auto">
              <p className="text-xs text-ink-400 mb-2 font-medium">Generated Minutes Preview:</p>
              <div className="text-sm text-ink-700 whitespace-pre-wrap">{meeting.minutesDoc.text}</div>
            </div>
          )}
        </div>
      )}

      {/* v2Cases: Open a case drawer from a meeting */}
      {true && caseDrawerMeeting && (
        <OpenCaseDrawer
          open={true}
          onClose={() => setCaseDrawerMeeting(null)}
          prefill={{ meetingId: caseDrawerMeeting, source: 'meeting', sourceId: caseDrawerMeeting }}
        />
      )}
    </div>
  );
}
