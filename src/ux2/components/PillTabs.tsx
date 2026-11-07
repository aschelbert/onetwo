import type { ReactNode } from 'react';
import { cn } from '@/lib/formatters';
import { Chip, type ChipTone } from './Chip';

export interface PillTab<T extends string = string> {
  id: T;
  label: ReactNode;
  /** Optional count or state chip after the label. */
  badge?: ReactNode;
  badgeTone?: ChipTone;
}

export interface PillTabsProps<T extends string = string> {
  tabs: PillTab<T>[];
  value: T;
  onChange: (id: T) => void;
  'aria-label': string;
  className?: string;
  /** Compact pills (36px) for in-card filters; default is the sub-tab row (40px). */
  size?: 'tabs' | 'filter';
  /** In-card filters sit on a grey card, so their group is white. */
  surface?: 'surface' | 'white';
}

/**
 * The pill group used for module sub-tabs and in-card filters.
 * Active pill is navy; its badge turns cyan so counts stay legible.
 */
export function PillTabs<T extends string = string>({ tabs, value, onChange, className, size = 'tabs', surface = 'surface', ...rest }: PillTabsProps<T>) {
  return (
    <nav
      aria-label={rest['aria-label']}
      className={cn(
        'inline-flex min-w-0 max-w-full gap-0.5 self-start overflow-x-auto rounded-full border border-ux2-line p-[3px] [scrollbar-width:none]',
        surface === 'white' ? 'bg-white' : 'bg-ux2-surface',
        className,
      )}
    >
      {tabs.map(t => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            aria-current={on ? 'page' : undefined}
            onClick={() => onChange(t.id)}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold transition-colors',
              size === 'tabs' ? 'h-10' : 'h-9',
              on ? 'bg-ux2-navy text-white' : surface === 'white' ? 'text-ink-700 hover:bg-ux2-surface' : 'text-ink-700 hover:bg-white',
            )}
          >
            {t.label}
            {t.badge !== undefined && (
              <Chip tone={on ? 'cyan' : t.badgeTone ?? 'ghost'} className="px-2 py-1 text-[11px]">
                {t.badge}
              </Chip>
            )}
          </button>
        );
      })}
    </nav>
  );
}

export default PillTabs;
