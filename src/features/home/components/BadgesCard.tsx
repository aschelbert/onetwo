import { Award } from 'lucide-react';

export interface BadgeEntry {
  id: string;
  label: string;
  earned: boolean;
  detail: string;
}

interface BadgesCardProps {
  badges: BadgeEntry[];
}

function BadgeItem({ badge }: { badge: BadgeEntry }) {
  const earned = badge.earned;

  return (
    <div
      className={`flex items-center gap-2 p-2 rounded-lg ${earned ? 'bg-navy/5' : 'bg-ink-50/50'}`}
      title={badge.detail}
    >
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          earned ? 'bg-navy text-white' : 'bg-ink-200 text-ink-400'
        }`}
      >
        <Award className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className={`text-xs font-medium truncate ${earned ? 'text-navy' : 'text-ink-400'}`}>
          {badge.label}
        </p>
        <p className="text-[10px] text-ink-400 truncate">{badge.detail}</p>
      </div>
    </div>
  );
}

export default function BadgesCard({ badges }: BadgesCardProps) {
  return (
    <div className="bg-white rounded-xl border border-ink-100 p-4">
      <h3 className="text-sm font-bold text-ink-700 mb-3 flex items-center gap-1.5">
        <Award className="w-4 h-4 text-ink-400" />
        Badges
      </h3>

      {badges.length === 0 ? (
        <p className="text-xs text-ink-400">No badges available yet.</p>
      ) : (
        <div className="space-y-2">
          {badges.map((badge) => (
            <BadgeItem key={badge.id} badge={badge} />
          ))}
        </div>
      )}
    </div>
  );
}
