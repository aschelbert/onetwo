import { Flame, TrendingUp } from 'lucide-react';

export interface StreakEntry {
  label: string;
  count: number;
  brokenOn?: string;
}

interface StreaksCardProps {
  streaks: StreakEntry[];
}

const STREAK_DISPLAY: Record<string, { label: string; unit: string }> = {
  months_nothing_overdue: { label: 'Nothing overdue', unit: 'months' },
  meetings_noticed_on_time: { label: 'Meetings noticed on time', unit: 'meetings' },
  minutes_within_7_days: { label: 'Minutes approved within 7d', unit: 'meetings' },
  books_closed_by_10th: { label: 'Books closed on time', unit: 'months' },
  dcra_on_time_years: { label: 'DCRA filed on time', unit: 'years' },
};

function StreakRow({ label, value, unit }: { label: string; value: number; unit: string }) {
  const isActive = value > 0;

  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-ink-600">{label}</span>
      <span className={`text-xs font-bold ${isActive ? 'text-ink-800' : 'text-ink-300'}`}>
        {value > 0 ? (
          <span className="flex items-center gap-1">
            <Flame className="w-3 h-3 text-orange-500" />
            {value} {unit}
          </span>
        ) : (
          <span>--</span>
        )}
      </span>
    </div>
  );
}

export default function StreaksCard({ streaks }: StreaksCardProps) {
  return (
    <div className="bg-white rounded-xl border border-ink-100 p-4">
      <h3 className="text-sm font-bold text-ink-700 mb-2 flex items-center gap-1.5">
        <TrendingUp className="w-4 h-4 text-ink-400" />
        Streaks
      </h3>

      {streaks.length === 0 ? (
        <p className="text-xs text-ink-400 py-2">No streaks tracked yet.</p>
      ) : (
        <div className="divide-y divide-ink-50">
          {streaks.map((s) => {
            const display = STREAK_DISPLAY[s.label] || { label: s.label, unit: '' };
            return (
              <StreakRow key={s.label} label={display.label} value={s.count} unit={display.unit} />
            );
          })}
        </div>
      )}
    </div>
  );
}
