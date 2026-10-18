import React from 'react';
import RoleChip from './RoleChip';

// TODO: import from @/types/auth once handoff 01 merges
type BoardRoleKey = 'president' | 'vice_president' | 'treasurer' | 'secretary' | 'member_at_large';

interface QueueCardProps {
  roleKey?: BoardRoleKey;
  roleLabel?: string;
  roleState?: 'mine' | 'backstop' | 'other';
  containerLine?: string;
  tag?: { label: string; tone: 'neutral' | 'vote' | 'request' | 'case' };
  title: string;
  why?: string;
  due?: { label: string; tone: 'overdue' | 'soon' | 'normal' };
  primary?: { label: string; onClick: () => void };
  secondary?: Array<{ label: string; onClick: () => void }>;
  onOpen?: () => void;
  emphasis?: boolean;
  dimmed?: boolean;
}

const TAG_STYLES: Record<string, string> = {
  neutral: 'bg-ink-100 text-ink-600',
  vote: 'bg-brand-teal-light text-brand-teal',
  request: 'bg-amber-50 text-amber-700',
  case: 'bg-mist-100 text-mist-700',
};

const DUE_STYLES: Record<string, string> = {
  overdue: 'text-brand-red font-medium',
  soon: 'text-amber-600',
  normal: 'text-ink-400',
};

export default function QueueCard({
  roleKey,
  roleLabel,
  roleState,
  containerLine,
  tag,
  title,
  why,
  due,
  primary,
  secondary,
  onOpen,
  emphasis = false,
  dimmed = false,
}: QueueCardProps) {
  return (
    <div
      className={`
        bg-white rounded-xl border p-4 transition-colors
        ${emphasis ? 'border-brand-teal border-2' : 'border-ink-100'}
        ${dimmed ? 'opacity-50' : ''}
      `}
    >
      {/* Top row: role chip + container line */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {roleLabel && (
            <RoleChip
              label={roleLabel}
              tone={
                roleState === 'backstop'
                  ? 'amber'
                  : roleState === 'mine'
                  ? 'teal'
                  : 'default'
              }
            />
          )}
          {tag && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                TAG_STYLES[tag.tone] || TAG_STYLES.neutral
              }`}
            >
              {tag.label}
            </span>
          )}
        </div>
        {containerLine && (
          <span className="text-xs text-ink-400 shrink-0">{containerLine}</span>
        )}
      </div>

      {/* Title row -- clickable */}
      <button
        onClick={onOpen}
        className="text-left w-full group"
        type="button"
        data-testid="queue-card-title"
      >
        <h3 className="text-sm font-medium text-navy group-hover:text-brand-teal transition-colors leading-snug">
          {title}
        </h3>
      </button>

      {/* Why */}
      {why && <p className="text-xs text-ink-400 mt-1 leading-relaxed">{why}</p>}

      {/* Due + actions row */}
      <div className="flex items-center justify-between mt-3">
        {due ? (
          <span
            className={`text-xs ${DUE_STYLES[due.tone] || DUE_STYLES.normal}`}
            data-testid="queue-card-due"
          >
            {due.label}
          </span>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-2">
          {secondary?.map((action, i) => (
            <button
              key={i}
              onClick={action.onClick}
              className="text-xs text-ink-500 hover:text-ink-700 underline transition-colors"
            >
              {action.label}
            </button>
          ))}
          {primary && (
            <button
              onClick={primary.onClick}
              className="text-xs font-medium text-white bg-navy px-3 py-1.5 rounded-lg hover:bg-navy-800 transition-colors"
            >
              {primary.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export type { QueueCardProps, BoardRoleKey };
