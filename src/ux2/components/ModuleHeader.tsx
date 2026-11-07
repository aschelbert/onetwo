import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * The module header every UX2 module uses, so the layout never shifts
 * between modules or tabs:
 *
 *   Title                                              [status chips]
 *   subtitle
 *   [ section tabs ......... ]   [tab actions] [module actions] [gear]
 *
 * Status (scores, alerts) sits beside the title. Calls to action sit on the
 * tabs row, right-justified, to the left of any navigation icon (the Funds
 * gear). A tab body adds its own buttons there with <HeaderActions>, so a
 * button keeps its inline form in the tab but shows up in the same place on
 * every tab. When the row is too narrow the right group wraps under the
 * tabs, still right-aligned.
 */
const HeaderSlot = createContext<HTMLElement | null>(null);
export const HeaderSlotProvider = HeaderSlot.Provider;

/** Renders its children into the module header's actions slot. */
export function HeaderActions({ children }: { children: ReactNode }) {
  const slot = useContext(HeaderSlot);
  return slot ? createPortal(children, slot) : null;
}

export function ModuleHeader({ title, subtitle, status, tabs, tabsEnd, actions, slotRef }: {
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  tabs: ReactNode;
  tabsEnd?: ReactNode;
  actions?: ReactNode;
  /** Receives the element tab bodies portal their <HeaderActions> into. */
  slotRef?: (el: HTMLElement | null) => void;
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 max-w-full">{tabs}</div>
        <div role="group" aria-label="Actions" className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-1.5 [&_button:not([data-nav-icon])]:!h-10 [&_button:not([data-nav-icon])]:!px-3.5 [&_button:not([data-nav-icon])]:!text-[13px] [&_input]:!h-10">
          <div ref={slotRef} className="contents" />
          {actions}
          {tabsEnd}
        </div>
      </div>
    </header>
  );
}

/** The outline button used for header actions. */
export const ACTION_BUTTON = 'h-10 rounded-full border border-ux2-line-strong bg-white px-4 text-sm font-semibold text-ux2-ink hover:bg-ux2-surface';
/** Status chips beside the title share one size. */
export const STATUS_CHIP = 'h-11 shrink-0 px-5 !text-sm';
