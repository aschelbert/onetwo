/**
 * MeetingDrawer — Three-step drawer for scheduling a meeting.
 *
 * Step 1 (kind): Regular board, Annual owners, Special
 * Step 2 (when): Date and time selection with legal minimum
 * Step 3 (review): Drafted agenda, reorderable, title, notice checkbox
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  Video,
  GripVertical,
  X,
  Plus,
  Users,
  Gavel,
  Star,
} from 'lucide-react';
import DrawerShell from '@/components/ui/DrawerShell';
import { draftAgenda, assignAgendaIds } from '@/features/meetings/agendaDraft';
import { useMeetingsStore, type AgendaItem } from '@/store/useMeetingsStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import {
  nextRegularMeetingDates,
  earliestLegalDate,
  type BuildingSettings,
} from '@/lib/buildingSettings';
import type { QueueItem } from '@/lib/queue';
import { buildSeasons, currentSeason } from '@/lib/seasons';
import { useRunbook } from '@/features/compliance/useRunbook';
import { useBuildingStore } from '@/store/useBuildingStore';
import { supabase } from '@/lib/supabase';

type MeetingKind = 'board' | 'annual' | 'special';
type Step = 1 | 2 | 3;

const KIND_LABELS: Record<MeetingKind, string> = {
  board: 'Regular Board Meeting',
  annual: 'Annual Owners Meeting',
  special: 'Special Meeting',
};

const KIND_TYPE_MAP: Record<MeetingKind, string> = {
  board: 'BOARD',
  annual: 'ANNUAL',
  special: 'SPECIAL',
};

interface MeetingDrawerProps {
  prefill?: {
    kind?: MeetingKind;
    runbookItemId?: string;
    caseId?: string;
    approvalId?: string;
    dateHint?: string;
  };
  onClose: () => void;
  onScheduled?: (meetingId: string) => void;
  settings: BuildingSettings;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatMonthYear(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function MeetingDrawer({
  prefill,
  onClose,
  onScheduled,
  settings,
}: MeetingDrawerProps) {
  const mtg = useMeetingsStore();
  const comp = useComplianceStore();
  const { buildingMembers } = useAuthStore();
  const issues = useIssuesStore();
  const { allItems: runbookItems } = useRunbook();
  const building = useBuildingStore();

  // Step state
  const [step, setStep] = useState<Step>(prefill?.kind ? 2 : 1);
  const [kind, setKind] = useState<MeetingKind | null>(prefill?.kind || null);

  // Step 2 state
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState<string>(prefill?.dateHint || '');
  const [selectedTime, setSelectedTime] = useState(settings.meetingTime || '19:00');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customDate, setCustomDate] = useState('');

  // Step 3 state
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [title, setTitle] = useState('');
  const [sendNotice, setSendNotice] = useState(true);
  const [newItemText, setNewItemText] = useState('');
  const [sending, setSending] = useState(false);

  // Computed: last completed meeting
  const lastCompletedMeeting = useMemo(() => {
    return mtg.meetings
      .filter(m => m.status === 'COMPLETED')
      .sort((a, b) => b.date.localeCompare(a.date))[0];
  }, [mtg.meetings]);

  // Computed: inferred location and virtual link
  const inferredLocation = lastCompletedMeeting?.location || 'Community Room';
  const inferredVirtualLink = lastCompletedMeeting?.virtualLink || '';

  // Computed: earliest legal date for current kind
  const minDate = useMemo(() => {
    if (!kind) return formatDate(today);
    const legalKind = kind === 'board' ? 'board' : 'annual';
    return formatDate(earliestLegalDate(settings, legalKind, today));
  }, [kind, settings, today]);

  // Computed: next regular meeting dates
  const suggestedDates = useMemo(() => {
    if (!kind) return [];
    const dates = nextRegularMeetingDates(settings, today, 3);
    return dates
      .map(d => formatDate(d))
      .filter(d => d >= minDate);
  }, [kind, settings, today, minDate]);

  // Build the seasons/queue for agenda drafting
  const seasons = useMemo(() => {
    return buildSeasons({
      items: runbookItems,
      completions: comp.completions,
      filings: comp.filings,
      settings,
      tenantStatus: 'active',
      today,
    });
  }, [runbookItems, comp.completions, comp.filings, settings, today]);

  const currentSeasonState = useMemo(() => currentSeason(seasons), [seasons]);

  // Runbook queue items with satisfyingAction === 'meeting' due within 45 days
  const meetingQueueItems = useMemo(() => {
    const horizonDate = new Date(today);
    horizonDate.setDate(horizonDate.getDate() + 45);
    const horizonStr = formatDate(horizonDate);

    return runbookItems
      .filter(item => {
        if (comp.completions[item.id]) return false;
        if (item.satisfyingAction !== 'meeting') return false;
        if (!item.due || !/^\d{4}-\d{2}-\d{2}$/.test(item.due)) return false;
        return item.due <= horizonStr;
      })
      .map(item => ({
        id: `runbook-${item.id}`,
        source: 'runbook' as const,
        sourceId: item.id,
        title: item.task,
        why: `Due ${item.due}`,
        roleKey: item.primaryRole ?? 'member_at_large' as const,
        roleState: 'mine' as const,
        containerLine: 'Compliance',
        dueDate: item.due,
        dueTone: 'normal' as const,
        priority: 20,
        primaryAction: { label: 'Open', drawer: 'runbook', params: { itemId: item.id } },
        secondaryActions: [],
      } satisfies QueueItem));
  }, [runbookItems, comp.completions, today]);

  // Open cases with next step (derived from case steps array)
  const openCases = useMemo(() => {
    return issues.cases
      .filter(c => c.status === 'open')
      .map(c => {
        const steps = c.steps || [];
        const nextUndone = steps.find(s => !s.done);
        return {
          id: c.id,
          title: c.title,
          nextStep: nextUndone ? { title: nextUndone.s } : undefined,
        };
      });
  }, [issues.cases]);

  // Approvals needing a vote (above spending limit)
  const approvalsNeedingVote = useMemo(() => {
    // Look for pending approvals above spending limit in the queue pattern
    // For now, use an empty array as approvals come from a different store
    return [] as Array<{ id: string; title: string; amount: number }>;
  }, []);

  // Active owners count
  const ownerCount = useMemo(() => {
    return buildingMembers.filter(m => m.status === 'active').length;
  }, [buildingMembers]);

  // Build agenda when entering step 3
  const buildAndSetAgenda = useCallback(() => {
    if (!kind || !selectedDate) return;

    const drafted = draftAgenda({
      kind,
      date: selectedDate,
      queue: meetingQueueItems,
      openCases,
      approvalsNeedingVote,
      season: currentSeasonState,
      lastMeeting: lastCompletedMeeting,
      settings,
    });

    setAgendaItems(assignAgendaIds(drafted));
    setTitle(`${formatMonthYear(selectedDate)} ${KIND_LABELS[kind]}`);
  }, [kind, selectedDate, meetingQueueItems, openCases, approvalsNeedingVote, currentSeasonState, lastCompletedMeeting, settings]);

  // Step navigation
  const goToStep = useCallback((s: Step) => {
    if (s === 3) buildAndSetAgenda();
    setStep(s);
  }, [buildAndSetAgenda]);

  // Add manual agenda item
  const addManualItem = useCallback(() => {
    if (!newItemText.trim()) return;
    const newItem: AgendaItem = {
      id: `ai${crypto.randomUUID().slice(0, 8)}`,
      position: agendaItems.length,
      title: newItemText.trim(),
      sourceType: 'manual',
      sourceId: null,
      requiresVote: false,
      locked: false,
    };
    setAgendaItems(prev => [...prev, newItem]);
    setNewItemText('');
  }, [newItemText, agendaItems.length]);

  // Remove agenda item (non-locked only)
  const removeItem = useCallback((itemId: string) => {
    setAgendaItems(prev => prev.filter(a => a.id !== itemId).map((a, i) => ({ ...a, position: i })));
  }, []);

  // Move item up
  const moveItem = useCallback((index: number, direction: -1 | 1) => {
    setAgendaItems(prev => {
      const next = [...prev];
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= next.length) return prev;
      [next[index], next[newIndex]] = [next[newIndex], next[index]];
      return next.map((a, i) => ({ ...a, position: i }));
    });
  }, []);

  // Schedule meeting
  const handleSchedule = useCallback(async () => {
    if (!kind || !selectedDate || !title.trim()) return;

    setSending(true);
    try {
      const meetingId = mtg.addMeetingWithAgenda(
        {
          title: title.trim(),
          type: KIND_TYPE_MAP[kind],
          status: 'SCHEDULED',
          date: selectedDate,
          time: selectedTime,
          location: inferredLocation,
          virtualLink: inferredVirtualLink,
          agenda: agendaItems.map(a => a.title),
          notes: '',
          agendaItems,
          noticeSentAt: null,
          reminderScheduledFor: null,
          packetReady: false,
          conflictCheckStatus: [],
        },
        agendaItems.map(a => ({
          position: a.position,
          title: a.title,
          sourceType: a.sourceType,
          sourceId: a.sourceId,
          requiresVote: a.requiresVote,
          locked: a.locked,
        })),
      );

      // If notice checkbox is checked, send meeting notice
      if (sendNotice) {
        try {
          const sbUrl = import.meta.env.VITE_SUPABASE_URL as string;
          const sbKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
          if (sbUrl && sbKey) {
            const session = supabase ? (await supabase.auth.getSession()).data.session : null;
            const recipients = buildingMembers
              .filter(m => m.email && m.status === 'active')
              .map(m => ({ email: m.email, name: m.name }));

            const res = await fetch(`${sbUrl}/functions/v1/send-meeting-notice`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': session ? `Bearer ${session.access_token}` : `Bearer ${sbKey}`,
                'apikey': sbKey,
              },
              body: JSON.stringify({
                title: title.trim(),
                date: selectedDate,
                time: selectedTime,
                location: inferredLocation,
                virtualLink: inferredVirtualLink,
                agenda: agendaItems.map(a => a.title),
                recipients,
              }),
            });

            if (res.ok) {
              mtg.setNoticeSent(meetingId, new Date().toISOString());
              comp.addCommunication({
                type: 'notice',
                subject: `Meeting Notice: ${title.trim()}`,
                date: new Date().toISOString().split('T')[0],
                method: 'email',
                recipients: `All owners (${recipients.length})`,
                respondedBy: null,
                status: 'sent',
                notes: `Sent with meeting schedule for ${selectedDate}.`,
              });
            }
          }
        } catch {
          // Notice send failed silently — meeting is still scheduled
        }
      }

      onScheduled?.(meetingId);
      onClose();
    } finally {
      setSending(false);
    }
  }, [
    kind, selectedDate, selectedTime, title, agendaItems, sendNotice,
    inferredLocation, inferredVirtualLink, buildingMembers,
    mtg, comp, onScheduled, onClose,
  ]);

  // Vote count in agenda
  const voteCount = agendaItems.filter(a => a.requiresVote).length;
  const itemCount = agendaItems.length;

  // Step labels
  const stepTitle = step === 1 ? 'What kind of meeting?' : step === 2 ? 'When?' : 'Review agenda';

  return (
    <DrawerShell
      open
      onClose={onClose}
      breadcrumb={['Board Room', 'Schedule Meeting']}
      title={stepTitle}
      step={{ current: step, total: 3 }}
      footer={{
        primaryLabel:
          step === 1
            ? 'Next'
            : step === 2
            ? 'Next'
            : sendNotice
            ? `Schedule and send to ${ownerCount} owners`
            : 'Schedule',
        onPrimary:
          step === 1
            ? () => kind && goToStep(2)
            : step === 2
            ? () => selectedDate && goToStep(3)
            : handleSchedule,
        primaryDisabled:
          step === 1
            ? !kind
            : step === 2
            ? !selectedDate
            : !title.trim() || sending,
        secondaryLabel: step === 1 ? 'Cancel' : 'Back',
        onSecondary: step === 1 ? onClose : () => setStep((step - 1) as Step),
      }}
    >
      <div className="space-y-5">
        {/* ── Step 1: Kind ── */}
        {step === 1 && (
          <div className="space-y-3">
            {(['board', 'annual', 'special'] as const).map(k => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`
                  w-full text-left px-4 py-4 rounded-xl border-2 transition-all
                  ${kind === k
                    ? 'border-brand-teal bg-brand-teal-light'
                    : 'border-ink-100 hover:border-brand-teal bg-white'
                  }
                `}
              >
                <div className="flex items-center gap-3">
                  <span className={`shrink-0 ${kind === k ? 'text-brand-teal' : 'text-ink-400'}`}>
                    {k === 'board' && <Gavel size={20} />}
                    {k === 'annual' && <Users size={20} />}
                    {k === 'special' && <Star size={20} />}
                  </span>
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${kind === k ? 'text-brand-teal' : 'text-ink-800'}`}>
                      {KIND_LABELS[k]}
                    </p>
                    <p className="text-xs text-ink-400 mt-0.5">
                      {k === 'board' && 'Regular board business, motions, and reports'}
                      {k === 'annual' && 'Elections, annual report, and owner votes'}
                      {k === 'special' && 'Single-topic meeting with owner notice'}
                    </p>
                  </div>
                  {kind === k && (
                    <span className="w-5 h-5 rounded-full bg-brand-teal flex items-center justify-center shrink-0">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ── Step 2: When ── */}
        {step === 2 && kind && (
          <div className="space-y-5">
            {/* Legal minimum notice */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-800">
                <span className="font-semibold">Minimum notice:</span>{' '}
                {kind === 'board'
                  ? `${settings.boardNoticeHours} hours`
                  : `${settings.annualNoticeMinDays} days`
                }
                . Earliest date: {formatDateDisplay(minDate)}.
              </p>
            </div>

            {/* Suggested dates */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-ink-600 uppercase tracking-wide">Suggested dates</p>
              {suggestedDates.slice(0, 2).map((date, i) => (
                <button
                  key={date}
                  type="button"
                  onClick={() => { setSelectedDate(date); setShowDatePicker(false); }}
                  className={`
                    w-full text-left px-4 py-3 rounded-xl border-2 transition-all
                    ${selectedDate === date && !showDatePicker
                      ? 'border-brand-teal bg-brand-teal-light'
                      : 'border-ink-100 hover:border-brand-teal bg-white'
                    }
                  `}
                >
                  <div className="flex items-center gap-3">
                    <Calendar size={16} className={selectedDate === date ? 'text-brand-teal' : 'text-ink-400'} />
                    <div>
                      <p className="text-sm font-medium text-ink-800">{formatDateDisplay(date)}</p>
                      <p className="text-xs text-ink-400">{i === 0 ? 'Next regular slot' : 'The one after'}</p>
                    </div>
                  </div>
                </button>
              ))}

              {/* Pick a date */}
              <button
                type="button"
                onClick={() => setShowDatePicker(true)}
                className={`
                  w-full text-left px-4 py-3 rounded-xl border-2 transition-all
                  ${showDatePicker
                    ? 'border-brand-teal bg-brand-teal-light'
                    : 'border-ink-100 hover:border-brand-teal bg-white'
                  }
                `}
              >
                <div className="flex items-center gap-3">
                  <Calendar size={16} className={showDatePicker ? 'text-brand-teal' : 'text-ink-400'} />
                  <p className="text-sm font-medium text-ink-800">Pick a date</p>
                </div>
              </button>

              {showDatePicker && (
                <div className="ml-4 mt-2">
                  <input
                    type="date"
                    min={minDate}
                    value={customDate}
                    onChange={e => {
                      setCustomDate(e.target.value);
                      setSelectedDate(e.target.value);
                    }}
                    className="px-3 py-2 border border-ink-200 rounded-lg text-sm w-full"
                  />
                </div>
              )}
            </div>

            {/* Time */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-ink-600 uppercase tracking-wide">Time</label>
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-ink-400" />
                <input
                  type="time"
                  value={selectedTime}
                  onChange={e => setSelectedTime(e.target.value)}
                  className="px-3 py-2 border border-ink-200 rounded-lg text-sm"
                />
              </div>
            </div>

            {/* Location & virtual */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-ink-500">
                <MapPin size={14} className="text-ink-400" />
                <span>{inferredLocation}</span>
              </div>
              {inferredVirtualLink && (
                <div className="flex items-center gap-2 text-xs text-ink-500">
                  <Video size={14} className="text-ink-400" />
                  <span className="truncate">{inferredVirtualLink}</span>
                </div>
              )}
              <p className="text-[10px] text-ink-400">Location inferred from last completed meeting</p>
            </div>
          </div>
        )}

        {/* ── Step 3: Review ── */}
        {step === 3 && (
          <div className="space-y-5">
            {/* Title */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-ink-600 uppercase tracking-wide">Title</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-ink-200 rounded-lg text-sm"
              />
            </div>

            {/* Meeting summary */}
            <div className="bg-mist-50 rounded-lg p-3 space-y-1 text-xs text-ink-600">
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-ink-400" />
                <span>{selectedDate ? formatDateDisplay(selectedDate) : ''} at {selectedTime}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin size={14} className="text-ink-400" />
                <span>{inferredLocation}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-ink-400">{itemCount} items, {voteCount} requiring vote</span>
              </div>
            </div>

            {/* Agenda list */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-ink-600 uppercase tracking-wide">Agenda</p>
              <div className="border border-ink-100 rounded-xl overflow-hidden divide-y divide-ink-50">
                {agendaItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 px-3 py-2.5 hover:bg-mist-50 transition-colors"
                  >
                    {/* Drag handle / reorder buttons */}
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveItem(idx, -1)}
                        disabled={idx === 0}
                        className="text-ink-300 hover:text-ink-500 disabled:opacity-30"
                        aria-label="Move up"
                      >
                        <GripVertical size={14} />
                      </button>
                    </div>

                    {/* Position number */}
                    <span className="w-5 h-5 rounded-full bg-ink-100 text-ink-500 flex items-center justify-center shrink-0 text-[10px] font-bold">
                      {idx + 1}
                    </span>

                    {/* Title */}
                    <span className="flex-1 text-sm text-ink-800 min-w-0 truncate">{item.title}</span>

                    {/* Badges */}
                    {item.requiresVote && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium shrink-0">
                        Vote
                      </span>
                    )}
                    {item.locked && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-100 text-ink-500 font-medium shrink-0">
                        Locked
                      </span>
                    )}

                    {/* Remove (non-locked only) */}
                    {!item.locked && (
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="text-ink-300 hover:text-red-500 shrink-0"
                        aria-label="Remove item"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add item */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newItemText}
                  onChange={e => setNewItemText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addManualItem(); }}
                  placeholder="Add agenda item..."
                  className="flex-1 px-3 py-2 border border-ink-200 rounded-lg text-sm"
                />
                <button
                  type="button"
                  onClick={addManualItem}
                  disabled={!newItemText.trim()}
                  className="p-2 rounded-lg border border-ink-200 hover:bg-ink-50 disabled:opacity-40"
                >
                  <Plus size={16} className="text-ink-500" />
                </button>
              </div>
            </div>

            {/* Notice checkbox */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={sendNotice}
                onChange={e => setSendNotice(e.target.checked)}
                className="w-4 h-4 rounded border-ink-300 text-brand-teal focus:ring-brand-teal"
              />
              <span className="text-sm text-ink-700">
                Send meeting notice to all {ownerCount} owners
              </span>
            </label>
          </div>
        )}
      </div>
    </DrawerShell>
  );
}
