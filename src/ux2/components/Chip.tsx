import type { ReactNode } from 'react';
import { cn } from '@/lib/formatters';

/**
 * Chip tones follow the design rules: the colour carries meaning.
 *  navy  = active / current          red   = overdue or money to chase
 *  cyan  = worth noticing            teal  = help, good standing, decisions
 *  plum  = votes and oversight       sage  = done / on track
 *  amber = reach / due soon          ghost = neutral count or label
 */
export type ChipTone = 'navy' | 'red' | 'pink' | 'cyan' | 'teal' | 'plum' | 'sage' | 'amber' | 'ghost' | 'white';

const TONES: Record<ChipTone, string> = {
  navy: 'bg-ux2-navy text-white',
  white: 'bg-ux2-navy text-white',
  pink: 'bg-ux2-red text-white',
  red: 'bg-ux2-red-tint text-ux2-red-ink',
  cyan: 'bg-ux2-cyan text-ux2-navy',
  teal: 'bg-ux2-teal-tint text-ux2-teal',
  plum: 'bg-ux2-plum-tint text-ux2-plum',
  sage: 'bg-ux2-sage-tint text-ux2-sage',
  amber: 'bg-ux2-amber-tint text-ux2-amber',
  ghost: 'bg-white text-ink-700 border border-ux2-line-strong',
};

export interface ChipProps {
  tone?: ChipTone;
  children: ReactNode;
  className?: string;
  title?: string;
}

export function Chip({ tone = 'ghost', children, className, title }: ChipProps) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 px-[11px] py-[6px] rounded-full text-xs font-semibold leading-none whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export default Chip;
