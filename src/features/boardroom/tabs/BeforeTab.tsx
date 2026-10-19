/**
 * BeforeTab — "Before the Meeting" tab for Board Room (v2BoardRoom).
 *
 * Shows a hero card for the next SCHEDULED meeting with prep checklist,
 * or a prompt to schedule one if none exists.
 */

import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  Edit,
  RefreshCw,
  CheckCircle2,
  Circle,
  AlertCircle,
  Gavel,
  FileText,
  Shield,
  Bell,
  Plus,
} from 'lucide-react';
import RoleChip from '@/components/ui/RoleChip';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import MeetingDrawer from '@/features/meetings/MeetingDrawer';
import type { BuildingSettings } from '@/lib/buildingSettings';

interface BeforeTabProps {
  settings: BuildingSettings;
  isBoard: boolean;
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTimeDisplay(time: string): string {
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${m} ${ampm}`;
}

interface PrepCheckItem {
  id: string;
  label: string;
  role: string;
  roleTone: 'default' | 'teal' | 'amber' | 'red';
  done: boolean;
  auto?: boolean;
  icon: React.ReactNode;
}

export default function BeforeTab({ settings, isBoard }: BeforeTabProps) {
  const mtg = useMeetingsStore();
  const [showDrawer, setShowDrawer] = useState(false);
  const [drawerPrefill, setDrawerPrefill] = useState<{
    kind?: 'board' | 'annual' | 'special';
    runbookItemId?: string;
    caseId?: string;
    approvalId?: string;
    dateHint?: string;
  } | undefined>(undefined);

  // Next scheduled meeting
  const nextMeeting = useMemo(() => {
    return mtg.meetings
      .filter(m => m.status === 'SCHEDULED' || m.status === 'RESCHEDULED')
      .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  }, [mtg.meetings]);

  // Agenda counts
  const itemCount = nextMeeting ? (nextMeeting.agendaItems?.length || nextMeeting.agenda.length) : 0;
  const voteCount = nextMeeting ? (nextMeeting.agendaItems?.filter(a => a.requiresVote).length || 0) : 0;

  // Prep checklist
  const prepChecklist: PrepCheckItem[] = useMemo(() => {
    if (!nextMeeting) return [];

    return [
      {
        id: 'notice',
        label: 'Notice sent',
        role: 'Secretary',
        roleTone: 'default' as const,
        done: !!nextMeeting.noticeSentAt,
        icon: <Bell size={16} />,
      },
      {
        id: 'budget',
        label: 'Draft budget attached',
        role: 'Treasurer',
        roleTone: 'amber' as const,
        done: nextMeeting.documents?.some(d =>
          d.name.toLowerCase().includes('budget')
        ) || false,
        icon: <FileText size={16} />,
      },
      {
        id: 'packet',
        label: 'Board packet',
        role: 'President',
        roleTone: 'teal' as const,
        done: nextMeeting.packetReady || false,
        icon: <FileText size={16} />,
      },
      {
        id: 'conflict',
        label: 'Conflict of interest check',
        role: 'President',
        roleTone: 'teal' as const,
        done: Array.isArray(nextMeeting.conflictCheckStatus) && nextMeeting.conflictCheckStatus.length > 0,
        icon: <Shield size={16} />,
      },
      {
        id: 'reminder',
        label: 'Reminder',
        role: 'Auto',
        roleTone: 'default' as const,
        done: !!nextMeeting.reminderScheduledFor,
        auto: true,
        icon: <Bell size={16} />,
      },
    ];
  }, [nextMeeting]);

  const completedPrep = prepChecklist.filter(c => c.done).length;

  const openScheduleDrawer = (prefill?: typeof drawerPrefill) => {
    setDrawerPrefill(prefill);
    setShowDrawer(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-lg font-bold text-ink-900">Before the Meeting</h3>
        <p className="text-xs text-ink-400 mt-1">
          Prepare agendas, notices, and materials for upcoming meetings.
        </p>
      </div>

      {/* ── Next meeting hero card ── */}
      {nextMeeting ? (
        <div className="bg-white border-2 border-accent-200 rounded-xl overflow-hidden shadow-sm">
          {/* Header */}
          <div className="bg-gradient-to-r from-accent-50 to-mist-50 px-5 py-4 border-b border-accent-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-accent-600 uppercase tracking-wider mb-1">
                  Next Meeting
                </p>
                <h4 className="font-display text-lg font-bold text-navy">{nextMeeting.title}</h4>
              </div>
              <div className="flex items-center gap-2">
                {isBoard && (
                  <>
                    <button
                      onClick={() => openScheduleDrawer()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-600 border border-ink-200 rounded-lg hover:bg-white transition-colors"
                    >
                      <Edit size={14} />
                      Edit agenda
                    </button>
                    <button
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-600 border border-ink-200 rounded-lg hover:bg-white transition-colors"
                    >
                      <RefreshCw size={14} />
                      Reschedule
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="px-5 py-4 space-y-4">
            {/* Date, time, location */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-ink-600">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-accent-500" />
                <span>{formatDateDisplay(nextMeeting.date)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-accent-500" />
                <span>{formatTimeDisplay(nextMeeting.time)}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-accent-500" />
                <span>{nextMeeting.location}</span>
              </div>
            </div>

            {/* Item and vote counts */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs text-ink-500">
                <Gavel size={14} className="text-ink-400" />
                <span>{itemCount} agenda item{itemCount !== 1 ? 's' : ''}</span>
              </div>
              {voteCount > 0 && (
                <div className="flex items-center gap-2 text-xs text-amber-700">
                  <AlertCircle size={14} className="text-amber-500" />
                  <span>{voteCount} requiring vote</span>
                </div>
              )}
            </div>

            {/* Prep checklist */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-ink-600 uppercase tracking-wide">
                  Prep checklist
                </p>
                <span className="text-[10px] text-ink-400">
                  {completedPrep}/{prepChecklist.length} complete
                </span>
              </div>
              <div className="space-y-2">
                {prepChecklist.map(item => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                      item.done
                        ? 'bg-sage-50 border-sage-200'
                        : 'bg-white border-ink-100'
                    }`}
                  >
                    {/* Status icon */}
                    {item.done ? (
                      <CheckCircle2 size={18} className="text-sage-600 shrink-0" />
                    ) : (
                      <Circle size={18} className="text-ink-300 shrink-0" />
                    )}

                    {/* Icon */}
                    <span className={item.done ? 'text-sage-500' : 'text-ink-400'}>
                      {item.icon}
                    </span>

                    {/* Label */}
                    <span className={`flex-1 text-sm ${item.done ? 'text-sage-700' : 'text-ink-700'}`}>
                      {item.label}
                    </span>

                    {/* Role chip */}
                    <RoleChip
                      label={item.role}
                      tone={item.auto ? 'default' : item.roleTone}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── No meeting prompt ── */
        <div className="bg-white border border-ink-100 rounded-xl p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-accent-50 flex items-center justify-center mx-auto mb-4">
            <Calendar size={24} className="text-accent-500" />
          </div>
          <h4 className="font-display text-lg font-bold text-navy mb-2">
            No upcoming meeting
          </h4>
          <p className="text-sm text-ink-500 mb-5 max-w-sm mx-auto">
            Schedule a board meeting to build your agenda, assign prep tasks, and send notices to owners.
          </p>
          {isBoard && (
            <button
              onClick={() => openScheduleDrawer()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-navy text-white rounded-lg text-sm font-medium hover:bg-navy-800 transition-colors"
            >
              <Plus size={16} />
              Schedule Meeting
            </button>
          )}
        </div>
      )}

      {/* Meeting drawer */}
      {showDrawer && (
        <MeetingDrawer
          prefill={drawerPrefill}
          onClose={() => setShowDrawer(false)}
          onScheduled={() => setShowDrawer(false)}
          settings={settings}
        />
      )}
    </div>
  );
}
