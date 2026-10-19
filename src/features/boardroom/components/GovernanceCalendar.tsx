/**
 * GovernanceCalendar — 12-column calendar view showing seasons, role tasks,
 * meetings, and notice windows. Subscribe button copies the calendar-feed URL.
 */

import { useState, useMemo } from 'react';
import { Calendar, Copy, Check } from 'lucide-react';
import { useRunbook } from '@/features/compliance/useRunbook';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { seasonWindows } from '@/lib/seasons';
import { nextRegularMeetingDates, DEFAULT_SETTINGS } from '@/lib/buildingSettings';
import { BOARD_ROLE_LABELS, type BoardRoleKey } from '@/types/auth';
import RunbookDrawer from '@/features/compliance/RunbookDrawer';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const SEASON_COLORS: Record<string, string> = {
  filing: 'bg-violet-100 text-violet-700 border-violet-200',
  annual_meeting: 'bg-accent-100 text-accent-700 border-accent-200',
  maintenance: 'bg-amber-100 text-amber-700 border-amber-200',
  budget: 'bg-sage-100 text-sage-700 border-sage-200',
  setup: 'bg-mist-100 text-ink-600 border-mist-200',
};

const ROLE_COLORS: Record<BoardRoleKey, string> = {
  president: 'bg-accent-500',
  vice_president: 'bg-mist-500',
  treasurer: 'bg-sage-500',
  secretary: 'bg-amber-500',
  member_at_large: 'bg-violet-500',
};

interface GovernanceCalendarProps {
  settings?: typeof DEFAULT_SETTINGS;
}

export default function GovernanceCalendar({ settings: propSettings }: GovernanceCalendarProps) {
  const { allItems } = useRunbook();
  const { completions } = useComplianceStore();
  const { meetings } = useMeetingsStore();
  const [roleFilter, setRoleFilter] = useState<BoardRoleKey | 'all'>('all');
  const [drawerItemId, setDrawerItemId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const settings = propSettings || DEFAULT_SETTINGS;

  // Build 12-month columns starting from current month
  const now = new Date();
  const startMonth = now.getMonth(); // 0-indexed
  const startYear = now.getFullYear();

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const m = (startMonth + i) % 12;
      const y = startYear + Math.floor((startMonth + i) / 12);
      return { month: m, year: y, label: MONTH_LABELS[m], key: `${y}-${String(m + 1).padStart(2, '0')}` };
    });
  }, [startMonth, startYear]);

  // Compute season windows
  const fyYear = now.getMonth() + 1 >= settings.fiscalYearStartMonth ? startYear : startYear - 1;
  const windows = useMemo(() => {
    // Get windows for current FY and next FY to cover 12 months
    const w1 = seasonWindows(settings, fyYear);
    const w2 = seasonWindows(settings, fyYear + 1);
    return [...w1, ...w2];
  }, [settings, fyYear]);

  // Map months to seasons
  const monthSeasons = useMemo(() => {
    return months.map((m) => {
      const dateStr = `${m.year}-${String(m.month + 1).padStart(2, '0')}-15`;
      const win = windows.find(
        (w) => w.startDate <= dateStr && dateStr <= w.endDate,
      );
      return win;
    });
  }, [months, windows]);

  // Get upcoming meetings from nextRegularMeetingDates + existing meetings
  const meetingDates = useMemo(() => {
    const regularDates = nextRegularMeetingDates(settings, now, 12);
    const existingDates = meetings
      .filter((m) => m.status === 'SCHEDULED' || m.status === 'COMPLETED')
      .map((m) => ({ date: new Date(m.date + 'T00:00:00'), title: m.title, id: m.id }));
    return { regular: regularDates, existing: existingDates };
  }, [settings, meetings]);

  // Get unique roles from items
  const roles = useMemo(() => {
    const roleSet = new Set<BoardRoleKey>();
    for (const item of allItems) {
      if (item.primaryRole) roleSet.add(item.primaryRole);
    }
    return [...roleSet];
  }, [allItems]);

  // Group items by role, then filter by month they're due
  const roleRows = useMemo(() => {
    const filteredRoles = roleFilter === 'all' ? roles : [roleFilter];
    return filteredRoles.map((role) => {
      const items = allItems.filter((i) => i.primaryRole === role || i.backstopRole === role);
      const monthBlocks = months.map((m) => {
        return items.filter((item) => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(item.due)) return false;
          const dueDate = new Date(item.due + 'T00:00:00');
          return dueDate.getMonth() === m.month && dueDate.getFullYear() === m.year;
        });
      });
      return { role, items, monthBlocks };
    });
  }, [allItems, roles, roleFilter, months]);

  // Subscribe URL
  const calendarUrl = useMemo(() => {
    const base = import.meta.env.VITE_SUPABASE_URL || '';
    if (!base) return '';
    return `${base}/functions/v1/calendar-feed?token=SUBSCRIBE_TOKEN`;
  }, []);

  const handleCopyUrl = async () => {
    if (!calendarUrl) return;
    try {
      await navigator.clipboard.writeText(calendarUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Calendar size={18} className="text-ink-500" />
          <h3 className="font-display text-lg font-bold text-ink-900">Governance Calendar</h3>
        </div>
        <div className="flex items-center gap-2">
          {/* Role filter chips */}
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setRoleFilter('all')}
              className={`px-2.5 py-1 text-[10px] font-medium rounded-full transition-colors ${
                roleFilter === 'all'
                  ? 'bg-navy text-white'
                  : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
              }`}
            >
              All roles
            </button>
            {roles.map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`px-2.5 py-1 text-[10px] font-medium rounded-full transition-colors ${
                  roleFilter === r
                    ? 'bg-navy text-white'
                    : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
                }`}
              >
                {BOARD_ROLE_LABELS[r]}
              </button>
            ))}
          </div>

          {/* Subscribe button */}
          <button
            onClick={handleCopyUrl}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-600 border border-ink-200 rounded-lg hover:bg-mist-50 transition-colors"
          >
            {copied ? <Check size={14} className="text-sage-600" /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Subscribe'}
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="overflow-x-auto border border-ink-100 rounded-xl">
        <div className="min-w-[900px]">
          {/* Month headers */}
          <div className="grid grid-cols-[120px_repeat(12,1fr)] border-b border-ink-100">
            <div className="px-3 py-2 text-[10px] font-bold text-ink-500 uppercase tracking-wider bg-ink-50">
              {/* Corner */}
            </div>
            {months.map((m) => (
              <div
                key={m.key}
                className="px-2 py-2 text-[10px] font-bold text-ink-500 uppercase tracking-wider text-center bg-ink-50 border-l border-ink-100"
              >
                {m.label} {m.year !== startYear ? `'${String(m.year).slice(2)}` : ''}
              </div>
            ))}
          </div>

          {/* Seasons band */}
          <div className="grid grid-cols-[120px_repeat(12,1fr)] border-b border-ink-100">
            <div className="px-3 py-1.5 text-[10px] font-bold text-ink-500 uppercase tracking-wider">
              Season
            </div>
            {months.map((m, i) => {
              const season = monthSeasons[i];
              const color = season ? SEASON_COLORS[season.seasonId] || 'bg-ink-50' : 'bg-ink-50';
              return (
                <div
                  key={m.key}
                  className={`px-1.5 py-1.5 text-center border-l border-ink-100 ${color}`}
                >
                  {season && (
                    <span className="text-[9px] font-semibold">
                      {season.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Role rows */}
          {roleRows.map(({ role, monthBlocks }) => (
            <div
              key={role}
              className="grid grid-cols-[120px_repeat(12,1fr)] border-b border-ink-50 hover:bg-mist-50/30 transition-colors"
            >
              <div className="px-3 py-2 flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${ROLE_COLORS[role] || 'bg-ink-400'}`} />
                <span className="text-[11px] font-semibold text-ink-700 truncate">
                  {BOARD_ROLE_LABELS[role]}
                </span>
              </div>
              {monthBlocks.map((items, mi) => (
                <div
                  key={months[mi].key}
                  className="px-1 py-1.5 border-l border-ink-50 flex flex-wrap gap-0.5"
                >
                  {items.map((item) => {
                    const done = !!completions[item.id];
                    return (
                      <button
                        key={item.id}
                        onClick={() => setDrawerItemId(item.id)}
                        title={item.task}
                        className={`w-full text-left text-[9px] px-1.5 py-0.5 rounded truncate transition-colors ${
                          done
                            ? 'bg-sage-100 text-sage-700'
                            : item.critical
                              ? 'bg-red-100 text-red-700'
                              : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
                        }`}
                      >
                        {item.task}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}

          {/* Meetings row */}
          <div className="grid grid-cols-[120px_repeat(12,1fr)] border-b border-ink-50">
            <div className="px-3 py-2 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-navy" />
              <span className="text-[11px] font-semibold text-ink-700">Meetings</span>
            </div>
            {months.map((m) => {
              const existingInMonth = meetingDates.existing.filter(
                (d) => d.date.getMonth() === m.month && d.date.getFullYear() === m.year,
              );
              const regularInMonth = meetingDates.regular.filter(
                (d) => d.getMonth() === m.month && d.getFullYear() === m.year,
              );
              const hasExisting = existingInMonth.length > 0;
              const hasRegular = regularInMonth.length > 0;
              return (
                <div
                  key={m.key}
                  className="px-1 py-1.5 border-l border-ink-50 flex flex-wrap gap-0.5"
                >
                  {existingInMonth.map((mtg) => (
                    <span
                      key={mtg.id}
                      className="w-full text-[9px] px-1.5 py-0.5 rounded bg-accent-100 text-accent-700 truncate"
                      title={mtg.title}
                    >
                      {mtg.title}
                    </span>
                  ))}
                  {!hasExisting && hasRegular && (
                    <span className="w-full text-[9px] px-1.5 py-0.5 rounded border border-dashed border-ink-300 text-ink-400 truncate">
                      Regular meeting
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Notice windows row */}
          <div className="grid grid-cols-[120px_repeat(12,1fr)]">
            <div className="px-3 py-2 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full border-2 border-dashed border-ink-400" />
              <span className="text-[11px] font-semibold text-ink-700">Notices</span>
            </div>
            {months.map((m) => {
              // Check if any meeting in this month needs a notice window
              // Notice window = 2 days before for board, annualNoticeMinDays for annual
              const meetingsInMonth = meetingDates.existing.filter(
                (d) => d.date.getMonth() === m.month && d.date.getFullYear() === m.year,
              );
              return (
                <div
                  key={m.key}
                  className="px-1 py-1.5 border-l border-ink-50"
                >
                  {meetingsInMonth.length > 0 && (
                    <span className="w-full block text-[9px] px-1.5 py-0.5 rounded border border-dashed border-amber-400 text-amber-600 truncate">
                      Notice window
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* RunbookDrawer */}
      {drawerItemId && (
        <RunbookDrawer
          itemId={drawerItemId}
          onClose={() => setDrawerItemId(null)}
        />
      )}
    </div>
  );
}
