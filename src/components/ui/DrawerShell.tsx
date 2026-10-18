import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface DrawerShellProps {
  open: boolean;
  onClose: () => void;
  breadcrumb: string[];
  title: string;
  legalRef?: string;
  whyLink?: () => void;
  step?: { current: number; total: number };
  footer: {
    primaryLabel: string;
    onPrimary: () => void;
    primaryDisabled?: boolean;
    secondaryLabel?: string;
    onSecondary?: () => void;
    tertiaryLink?: { label: string; onClick: () => void };
  };
  rail?: React.ReactNode;
  children: React.ReactNode;
}

function StepBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full ${
            i < current ? 'bg-brand-teal' : 'bg-ink-200'
          }`}
        />
      ))}
    </div>
  );
}

export default function DrawerShell({
  open,
  onClose,
  breadcrumb,
  title,
  legalRef,
  whyLink,
  step,
  footer,
  rail,
  children,
}: DrawerShellProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      document.body.style.overflow = 'hidden';
      // Focus the drawer after mount
      requestAnimationFrame(() => {
        drawerRef.current?.focus();
      });
    } else {
      document.body.style.overflow = '';
      previousFocusRef.current?.focus();
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Focus trap
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const container = drawerRef.current;
      if (!container) return;

      const focusable = container.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    []
  );

  if (!open) return null;

  const hasRail = !!rail;
  const drawerWidth = hasRail ? 'w-[640px]' : 'w-[520px]';

  const content = (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(13,27,46,0.45)' }}
        onClick={onClose}
        data-testid="drawer-backdrop"
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`
          absolute right-0 top-0 h-full bg-white shadow-xl
          flex flex-col outline-none
          max-md:w-full max-md:inset-0
          md:${drawerWidth}
        `}
      >
        <div className="flex flex-1 min-h-0">
          {/* Optional left rail */}
          {hasRail && (
            <div className="w-[180px] border-r border-ink-100 overflow-y-auto shrink-0">
              {rail}
            </div>
          )}

          {/* Main content area */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Header */}
            <div className="px-6 pt-5 pb-4 border-b border-ink-100 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-ink-500 tracking-wide uppercase">
                  {breadcrumb.join(' \u00B7 ')}
                </p>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-ink-50 text-ink-400 transition-colors"
                  aria-label="Close drawer"
                >
                  <X size={18} />
                </button>
              </div>
              <h2 className="font-display text-2xl text-navy">{title}</h2>
              {(legalRef || whyLink) && (
                <div className="flex items-center gap-3 mt-2">
                  {legalRef && (
                    <span className="text-xs text-ink-400">{legalRef}</span>
                  )}
                  {whyLink && (
                    <button
                      onClick={whyLink}
                      className="text-xs text-brand-teal underline hover:no-underline"
                    >
                      Why this?
                    </button>
                  )}
                </div>
              )}
              {step && (
                <div className="mt-3">
                  <StepBar current={step.current} total={step.total} />
                </div>
              )}
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-ink-100 shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  {footer.tertiaryLink && (
                    <button
                      onClick={footer.tertiaryLink.onClick}
                      className="text-sm text-brand-teal underline hover:no-underline"
                    >
                      {footer.tertiaryLink.label}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {footer.secondaryLabel && footer.onSecondary && (
                    <button
                      onClick={footer.onSecondary}
                      className="px-4 py-2 text-sm font-medium text-ink-600 rounded-lg border border-ink-200 hover:bg-ink-50 transition-colors"
                    >
                      {footer.secondaryLabel}
                    </button>
                  )}
                  <button
                    onClick={footer.onPrimary}
                    disabled={footer.primaryDisabled}
                    className="px-5 py-2 text-sm font-medium text-white bg-navy rounded-lg hover:bg-navy-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {footer.primaryLabel}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
