import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/formatters';

/**
 * Widget tile — the three-across tile row every module opens with.
 * One emphasised tile per row: navy = act now, red = overdue, teal = help or
 * good standing, cyan = worth noticing; grey is reference.
 */
export type TileTone = 'grey' | 'navy' | 'cyan' | 'teal' | 'red';

const TONES: Record<TileTone, string> = {
  grey: 'bg-ux2-surface border border-ux2-line text-ux2-ink',
  navy: 'bg-ux2-navy text-white',
  cyan: 'bg-ux2-cyan text-ux2-navy',
  teal: 'bg-ux2-teal text-white',
  red: 'bg-ux2-red text-white',
};

const DARK: TileTone[] = ['navy', 'teal', 'red'];

export interface TileProps extends HTMLAttributes<HTMLDivElement> {
  tone?: TileTone;
  /** Uppercase label at the top left. */
  label: ReactNode;
  /** Small text or chip at the top right. */
  meta?: ReactNode;
  /** The big number, with an optional small unit beside it. */
  value?: ReactNode;
  unit?: ReactNode;
  /** Explanatory line under the value. */
  sub?: ReactNode;
  /** Bottom action row (anchored to the tile's foot). */
  action?: ReactNode;
  /** Outline the tile as the selected one in a switcher. */
  selected?: boolean;
  children?: ReactNode;
}

export function Tile({ tone = 'grey', label, meta, value, unit, sub, action, selected, className, children, ...rest }: TileProps) {
  const dark = DARK.includes(tone);
  return (
    <div
      data-tone={tone}
      data-selected={selected ? 'true' : undefined}
      className={cn(
        'flex min-h-[230px] min-w-0 flex-col gap-2.5 rounded-[22px] px-5 py-[18px]',
        TONES[tone],
        selected && 'shadow-[0_0_0_2px_#FFFFFF,0_0_0_4px_#0D1B2E]',
        className,
      )}
      {...rest}
    >
      <div className={cn('flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.04em]', dark ? 'text-white/[0.66]' : tone === 'cyan' ? 'text-ux2-navy/[0.65]' : 'text-ux2-muted')}>
        <span>{label}</span>
        {meta && <span className="normal-case tracking-normal">{meta}</span>}
      </div>
      {value !== undefined && (
        <div className="text-[40px] font-semibold leading-none tracking-[-0.04em]">
          {value}
          {unit && <small className={cn('ml-1.5 text-sm font-medium tracking-normal', dark ? 'text-white/[0.66]' : 'text-ux2-muted')}>{unit}</small>}
        </div>
      )}
      {sub && <div className={cn('text-xs leading-[1.4]', dark ? 'text-white/[0.66]' : tone === 'cyan' ? 'text-ux2-navy/[0.65]' : 'text-ux2-muted')}>{sub}</div>}
      {children}
      {action && (
        <div
          className={cn(
            'mt-auto flex min-h-[44px] items-center justify-between gap-2 rounded-xl px-2.5 py-2 pl-3 text-[13px]',
            dark ? 'bg-white/[0.1] text-white' : tone === 'cyan' ? 'bg-white/[0.55]' : 'border border-ux2-line bg-white',
          )}
        >
          {action}
        </div>
      )}
    </div>
  );
}

/** Three tiles across on desktop, stacked on phones. */
export function TileRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-1 gap-3 md:grid-cols-3 items-stretch', className)}>{children}</div>;
}

export default Tile;
