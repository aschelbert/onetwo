import type { ReactNode } from 'react';

/**
 * The module header every UX2 module uses, so the layout never shifts
 * between modules or tabs:
 *
 *   Title                                   [status chips]
 *   subtitle
 *   [ section tabs ............ ]                [tabs end]
 *   [action] [action] [action]
 *
 * Status (scores, alerts) sits beside the title; an icon button that belongs
 * to the navigation (the Funds gear) sits at the right end of the tabs row;
 * calls to action always sit in their own row under the tabs.
 */
export function ModuleHeader({ title, subtitle, status, tabs, tabsEnd, actions }: {
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  tabs: ReactNode;
  tabsEnd?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-[320px]">
          <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ux2-ink">{title}</h1>
          {subtitle && <p className="max-w-[760px] text-sm text-ux2-muted">{subtitle}</p>}
        </div>
        {status && <div className="flex max-w-full flex-wrap items-center justify-end gap-2">{status}</div>}
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">{tabs}</div>
        {tabsEnd && <div className="flex shrink-0 items-center gap-2">{tabsEnd}</div>}
      </div>
      {actions && <div role="group" aria-label="Actions" className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** The outline button used in the actions row. */
export const ACTION_BUTTON = 'h-10 rounded-full border border-ux2-line-strong bg-white px-4 text-sm font-semibold text-ux2-ink hover:bg-ux2-surface';
/** Status chips beside the title share one size. */
export const STATUS_CHIP = 'h-11 shrink-0 px-5 !text-sm';
