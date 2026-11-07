import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode, type TdHTMLAttributes, type ThHTMLAttributes } from 'react';
import { cn } from '@/lib/formatters';

/**
 * The list primitives from the design boards: a white table block inside a
 * grey card, 12px muted headers, hairline rows, a round ··· menu per row, the
 * thin progress bar with its "where you should be" mark, and key/value rows.
 */

export function Table({ children, minWidth = 900, className, ...rest }: HTMLAttributes<HTMLDivElement> & { children: ReactNode; minWidth?: number }) {
  return (
    <div className={cn('overflow-hidden rounded-[14px] border border-ux2-line bg-white', className)} {...rest}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" style={{ minWidth }}>{children}</table>
      </div>
    </div>
  );
}

export function Th({ num, className, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement> & { num?: boolean }) {
  return (
    <th className={cn('whitespace-nowrap border-b border-ux2-line px-3 py-2.5 text-left text-xs font-semibold text-ux2-muted', num && 'text-right', className)} {...rest}>
      {children}
    </th>
  );
}

export function Td({ num, className, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { num?: boolean }) {
  return (
    <td className={cn('border-b border-[#EEF2F6] px-3 py-[9px] align-middle leading-[1.4] text-ux2-ink [tr:last-child>&]:border-b-0', num && 'whitespace-nowrap text-right', className)} {...rest}>
      {children}
    </td>
  );
}

/** Primary cell: a name with a muted note under or beside it. */
export function Cell({ title, note, className }: { title: ReactNode; note?: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="font-semibold text-ux2-ink">{title}</div>
      {note && <div className="text-xs text-ux2-muted">{note}</div>}
    </div>
  );
}

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

/** The round ··· button with a small menu under it. */
export function RowMenu({ label, items, className }: { label: string; items: MenuItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div ref={ref} className={cn('relative inline-block', className)}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-ux2-line-strong bg-white text-base font-bold tracking-[0.1em] text-ink-700 hover:bg-ux2-surface"
      >
        ···
      </button>
      {open && (
        <ul role="menu" className="absolute right-0 z-20 mt-1 min-w-[200px] list-none rounded-[14px] border border-ux2-line bg-white p-1.5 shadow-lg">
          {items.map(it => (
            <li key={it.label} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); it.onSelect(); }}
                className={cn('block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-ux2-surface', it.danger ? 'text-ux2-red-ink' : 'text-ux2-ink')}
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 8px progress bar; `mark` draws the "should be here by now" tick. Dark variant for navy cards. */
export function Bar({ pct, mark, tone = 'teal', dark, className, label }: { pct: number; mark?: number; tone?: 'teal' | 'red' | 'navy' | 'cyan'; dark?: boolean; className?: string; label?: string }) {
  const fill = { teal: 'bg-ux2-teal', red: 'bg-ux2-red', navy: 'bg-ux2-navy', cyan: 'bg-ux2-cyan' }[tone];
  return (
    <div role="img" aria-label={label ?? `${Math.round(pct)} percent`} className={cn('relative h-2 overflow-visible rounded-full', dark ? 'bg-white/[0.14]' : 'bg-ux2-line', className)}>
      <div className={cn('h-full rounded-full', dark ? 'bg-ux2-cyan' : fill)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      {mark !== undefined && <span className={cn('absolute -top-[3px] h-[14px] w-[2px]', dark ? 'bg-white' : 'bg-ux2-navy')} style={{ left: `${Math.max(0, Math.min(100, mark))}%` }} />}
    </div>
  );
}

/** A key/value line: label left, bold value right, hairline between rows. */
export function KV({ label, children, className, dark }: { label: ReactNode; children: ReactNode; className?: string; dark?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-2 text-sm last:border-b-0', dark ? 'border-b border-white/[0.12]' : 'border-b border-ux2-line', className)}>
      <span className={dark ? 'text-white/[0.75]' : 'text-ux2-muted'}>{label}</span>
      <b className="text-right font-semibold">{children}</b>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, label, className }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; className?: string }) {
  return (
    <input
      type="search"
      aria-label={label}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn('h-9 w-[200px] rounded-full border border-ux2-line-strong bg-white px-3.5 text-sm text-ux2-ink placeholder:text-ux2-dim', className)}
    />
  );
}

/** Small-print explanation under a list. */
export function Why({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('m-0 text-xs leading-[1.5] text-ux2-muted', className)}>{children}</p>;
}

/** Labelled input for the inline forms that replace modals. */
export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1 text-xs font-semibold text-ux2-muted', className)}>
      {label}
      {children}
    </label>
  );
}

export const INPUT = 'h-10 w-full rounded-full border border-ux2-line-strong bg-white px-3.5 text-sm font-normal text-ux2-ink placeholder:text-ux2-dim';
