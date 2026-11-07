import { createContext, useContext, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * The module header every UX2 module uses, so the layout never shifts
 * between modules or tabs:
 *
 *   Title (i)                                          [status chips]
 *   [ section tabs ......... ]   [tab actions] [module actions] [gear]
 *
 * The description lives behind the (i) beside the title. Status (scores,
 * alerts) sits at the right of the title. Calls to action sit on the
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
        <div className="relative flex min-w-0 flex-1 basis-[320px] items-start gap-1.5">
          <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ux2-ink">{title}</h1>
          {subtitle && <InfoTip label={`About ${typeof title === 'string' ? title : 'this page'}`}>{subtitle}</InfoTip>}
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

/**
 * The page description, behind a superscript "i" beside the title. The
 * popover anchors to the title block (the nearest positioned ancestor), so
 * it never runs past the page edge on a phone. It opens on hover, on
 * keyboard focus and on tap (focus), and stays in the DOM so screen readers
 * get it through aria-describedby.
 */
function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <span className="group mt-0.5 inline-flex">
      <button type="button" aria-label={label} aria-describedby={id} className="grid h-5 w-5 place-items-center rounded-full border border-ux2-line-strong bg-white text-[11px] font-bold italic leading-none text-ux2-muted hover:border-ux2-navy hover:text-ux2-navy focus:border-ux2-navy focus:text-ux2-navy focus:outline-none">i</button>
      <span id={id} role="tooltip" className="invisible absolute left-0 top-full z-40 mt-1 w-[min(420px,100%)] min-w-[260px] max-w-full rounded-[14px] border border-ux2-line bg-white px-4 py-3 text-sm leading-relaxed text-ux2-ink opacity-0 shadow-[0_14px_36px_rgba(13,27,46,.14)] transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">{children}</span>
    </span>
  );
}

/** The outline button used for header actions. */
export const ACTION_BUTTON = 'h-10 rounded-full border border-ux2-line-strong bg-white px-4 text-sm font-semibold text-ux2-ink hover:bg-ux2-surface';
/** Status chips beside the title share one size. */
export const STATUS_CHIP = 'h-11 shrink-0 px-5 !text-sm';
