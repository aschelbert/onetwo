import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/formatters';

/**
 * Card surfaces. `tone` follows the design rules:
 *  surface (default) grey card · navy = act now · teal = help / good standing /
 *  decisions · cyan = worth noticing · red = overdue · outline = needs you, on white.
 */
export type CardTone = 'surface' | 'navy' | 'teal' | 'cyan' | 'red' | 'outline';

const TONES: Record<CardTone, string> = {
  surface: 'bg-ux2-surface border-ux2-line text-ux2-ink',
  navy: 'bg-ux2-navy border-ux2-navy text-white',
  teal: 'bg-ux2-teal border-ux2-teal text-white',
  cyan: 'bg-ux2-cyan border-ux2-cyan text-ux2-navy',
  red: 'bg-ux2-red border-ux2-red text-white',
  /** White with a red border: a thing that needs the viewer now, without a dark fill. */
  outline: 'bg-white border-ux2-red text-ux2-ink',
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
  children: ReactNode;
}

export function Card({ tone = 'surface', className, children, ...rest }: CardProps) {
  return (
    <div
      data-tone={tone}
      className={cn('flex flex-col gap-2.5 rounded-[22px] border px-[22px] py-5', TONES[tone], className)}
      {...rest}
    >
      {children}
    </div>
  );
}

/** A white inner panel inside a card (table wrapper, detail box). */
export function Inner({ className, children, ...rest }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={cn('rounded-[14px] border border-ux2-line bg-white px-3.5 py-3', className)} {...rest}>
      {children}
    </div>
  );
}

/** Uppercase section label. */
export function SectionLabel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('text-xs font-semibold uppercase tracking-[0.08em] text-ux2-muted', className)}>{children}</div>
  );
}

export default Card;
