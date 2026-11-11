/**
 * The case dock: the case you are working follows you around the app.
 *
 * Open an open case and it becomes your active case, however you then leave
 * it (a step link, the top nav, a Home card). On every other page the dock
 * floats at the bottom: on desktop a bar the width of the page content that
 * expands upward with the step's checklist (tick items here; they record on
 * the case) and your other open cases; on phones and tablets a chip above the
 * bottom bar that opens a sheet with the same content. It goes away when the
 * case closes or every step is done, and Dismiss hides it until you open the
 * case again.
 */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useIssuesStore } from '@/store/useIssuesStore';
import { cn } from '@/lib/formatters';
import { caseIdFromLocation, casePath, dockFor, useCaseDockStore, type DockedCase } from './caseDock';

/** The dock for the current page, or null; the shell uses it to leave room at the bottom. */
export function useCaseDock() {
  const { pathname, search } = useLocation();
  const cases = useIssuesStore(s => s.cases);
  const recent = useCaseDockStore(s => s.recent);
  const dismissed = useCaseDockStore(s => s.dismissed);
  const spots = useCaseDockStore(s => s.spots);
  const touch = useCaseDockStore(s => s.touch);
  const viewing = caseIdFromLocation(pathname, search);
  // Opening a case makes it the active one.
  useEffect(() => {
    if (viewing && cases.some(c => c.id === viewing && c.status !== 'closed')) touch(viewing);
  }, [viewing, cases, touch]);
  return dockFor(cases, recent, dismissed, viewing, spots);
}

function Progress({ d, className }: { d: DockedCase; className?: string }) {
  return (
    <span className={cn('flex items-center gap-1', className)} aria-hidden="true">
      {d.steps.map((s, i) => <span key={s.id ?? i} className={cn('h-1 w-4 rounded-full', s.done ? 'bg-ux2-cyan' : i === d.stepIdx ? 'bg-white' : 'bg-white/25')} />)}
    </span>
  );
}

/** A short id (c8) names the action; a long generated one says nothing, so the title stands alone. */
const tag = (d: DockedCase) => (d.c.id.length <= 8 ? `${d.c.id} · ` : '');
const summary = (d: DockedCase) => `Step ${d.stepIdx + 1} of ${d.steps.length} · ${d.step.s}${d.checksTotal ? ` · ${d.checksDone} of ${d.checksTotal} checks` : ''}`;

/** Checklist and other cases: the expanded content, shared by the desktop panel and the phone sheet. */
function DockBody({ d, others, onGo, light }: { d: DockedCase; others: DockedCase[]; onGo: (path: string) => void; light?: boolean }) {
  const spots = useCaseDockStore(s => s.spots);
  const toggleCheck = useIssuesStore(s => s.toggleCheck);
  const toggleStep = useIssuesStore(s => s.toggleStep);
  const checks = d.step.checks ?? [];
  const label = light ? 'text-ux2-muted' : 'text-white/[0.66]';
  return (
    <div className="grid grid-cols-1 gap-4 min-[1080px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex flex-col gap-2">
        <div className={cn('text-xs font-semibold uppercase tracking-[0.08em]', label)}>{checks.length ? `Checklist · ${d.checksDone} of ${d.checksTotal} · tick it here` : 'This step'}</div>
        {checks.map(k => (
          <label key={k.id} className="flex min-h-[44px] cursor-pointer items-start gap-2.5 rounded-xl border border-ux2-line bg-white px-3 py-2.5 text-sm text-ux2-ink">
            <input type="checkbox" checked={k.checked} onChange={() => toggleCheck(d.c.id, d.stepIdx, k.id)} className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[#0D1B2E]" />
            <span className="min-w-0 flex-1">{k.label}{k.checked && k.checkedDate && <span className="block text-xs text-ux2-sage">Done {k.checkedDate}</span>}</span>
          </label>
        ))}
        {checks.length === 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ux2-line bg-white px-3 py-2.5 text-sm text-ux2-ink">
            <span className="min-w-0 flex-1">{d.step.s}{d.step.t && <span className="block text-xs text-ux2-muted">{d.step.t}</span>}</span>
            <button type="button" onClick={() => toggleStep(d.c.id, d.stepIdx)} className="h-9 rounded-full bg-ux2-navy px-3.5 text-xs font-semibold text-white">Mark step done</button>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div className={cn('text-xs font-semibold uppercase tracking-[0.08em]', label)}>{others.length ? 'Your other open actions' : 'Other actions'}</div>
        {others.map(o => (
          <button key={o.c.id} type="button" onClick={() => onGo(casePath(o.c.id, spots[o.c.id]))} className={cn('flex min-h-[44px] items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px]', light ? 'border border-ux2-line bg-ux2-surface text-ux2-ink' : 'bg-white/[0.08] text-white hover:bg-white/[0.14]')}>
            <span className="min-w-0 flex-1"><b className="font-semibold">{o.c.id} · {o.c.title}</b><span className={cn('block text-xs', label)}>Step {o.stepIdx + 1} of {o.steps.length} · {o.step.s}</span></span>
            <span className={cn('shrink-0 font-semibold', light ? 'text-ux2-teal' : 'text-ux2-cyan')}>Switch</span>
          </button>
        ))}
        {others.length === 0 && <p className={cn('m-0 text-xs', label)}>Open another action and it shows here, so you can switch without going back.</p>}
        <p className={cn('m-0 text-xs leading-relaxed', label)}>The dock goes away when the action closes or its last step is done. Dismiss hides it until you open the action again.</p>
      </div>
    </div>
  );
}

export default function CaseDock() {
  const dock = useCaseDock();
  const dismiss = useCaseDockStore(s => s.dismiss);
  const spots = useCaseDockStore(s => s.spots);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  if (!dock) return null;
  const { active: d, others } = dock;
  const go = (path: string) => { setOpen(false); navigate(path); };
  // Back to where you were: the step you had open and the checklist item you acted on.
  const back = () => go(casePath(d.c.id, spots[d.c.id] ?? { step: d.stepIdx, approach: null }));

  return (
    <>
      {/* Desktop: a bar the width of the page content, floating at the bottom; expands upward. */}
      <section data-widget="case-dock" aria-label="Action dock" className="ux2 pointer-events-none fixed inset-x-0 bottom-6 z-40 hidden min-[1080px]:block">
        <div className="pointer-events-auto mx-auto max-w-[1200px] px-6">
          <div className="overflow-hidden rounded-[22px] bg-ux2-navy text-white shadow-[0_18px_44px_rgba(13,27,46,.28)]">
            {open && <div className="px-5 pb-2 pt-4" id="case-dock-panel"><DockBody d={d} others={others} onGo={go} /></div>}
            <div className={cn('flex flex-wrap items-center gap-3 py-2.5 pl-4 pr-3', open && 'border-t border-white/[0.12]')}>
              <span className="inline-flex shrink-0 items-center rounded-full bg-ux2-cyan px-2.5 py-1.5 text-xs font-semibold text-ux2-navy">On an action</span>
              <button type="button" onClick={back} className="min-w-0 flex-1 truncate text-left text-sm"><b className="font-semibold">{tag(d)}{d.c.title}</b><span className="text-white/[0.72]"> · {summary(d)}</span></button>
              <Progress d={d} />
              <button type="button" onClick={back} className="h-10 shrink-0 rounded-full bg-white px-4 text-[13px] font-semibold text-ux2-navy">Back to the step</button>
              <button type="button" aria-label={open ? 'Collapse the action dock' : 'Expand the action dock'} aria-expanded={open} aria-controls="case-dock-panel" onClick={() => setOpen(o => !o)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/30 hover:bg-white/10">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{open ? <path d="M6 9l6 6 6-6" /> : <path d="M6 15l6-6 6 6" />}</svg>
              </button>
              <button type="button" aria-label="Dismiss the action dock" onClick={() => dismiss(d.c.id)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white/[0.72] hover:bg-white/10 hover:text-white">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Phones and tablets: a chip above the bottom bar that opens a sheet. */}
      <div data-widget="case-dock-chip" className="ux2 fixed inset-x-0 bottom-[84px] z-40 px-4 min-[1080px]:hidden">
        <div className="flex items-center gap-2 rounded-[18px] bg-ux2-navy py-2 pl-3.5 pr-2 text-white shadow-[0_12px_28px_rgba(13,27,46,.22)]">
          <button type="button" aria-label={`${d.c.id}, ${summary(d)}. Open the action dock`} aria-expanded={open} onClick={() => setOpen(true)} className="flex min-h-[44px] min-w-0 flex-1 flex-col justify-center gap-1 text-left">
            <span className="truncate text-[13px] font-semibold">{tag(d)}Step {d.stepIdx + 1} · {d.step.s}</span>
            <span className="flex items-center gap-2"><Progress d={d} />{d.checksTotal > 0 && <span className="text-[11px] text-white/[0.72]">{d.checksDone} of {d.checksTotal} checks</span>}</span>
          </button>
          <button type="button" onClick={back} className="h-9 shrink-0 rounded-full bg-white px-3 text-xs font-semibold text-ux2-navy">Back</button>
        </div>
      </div>
      {open && (
        <div className="ux2 fixed inset-0 z-[60] min-[1080px]:hidden">
          <button type="button" aria-label="Close the action dock" onClick={() => setOpen(false)} className="absolute inset-0 bg-ux2-navy/40" />
          <section role="dialog" aria-modal="true" aria-label={`Action ${d.c.id}`} className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col gap-3.5 overflow-y-auto rounded-t-[28px] bg-white px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-12px_32px_rgba(13,27,46,.18)]">
            <span aria-hidden="true" className="mx-auto h-1 w-10 rounded-full bg-ux2-line-strong" />
            <div className="flex items-start gap-2.5">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ux2-teal">On an action{d.c.id.length <= 8 ? ` · ${d.c.id}` : ''}</div>
                <div className="text-lg font-semibold leading-snug text-ux2-ink">{d.step.s}</div>
                <div className="text-[13px] text-ux2-muted">{d.c.title} · Step {d.stepIdx + 1} of {d.steps.length}{d.step.t ? ` · ${d.step.t}` : ''}</div>
              </div>
              <button type="button" aria-label="Close the action dock" onClick={() => setOpen(false)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-ux2-line bg-ux2-surface text-ux2-ink">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <DockBody d={d} others={others} onGo={go} light />
            <button type="button" onClick={back} className="h-12 rounded-full bg-ux2-navy text-[15px] font-semibold text-white">Back to the step</button>
            <button type="button" onClick={() => { dismiss(d.c.id); setOpen(false); }} className="h-11 rounded-full border border-ux2-line-strong bg-white text-sm font-semibold text-ux2-ink">Dismiss until I open the action again</button>
          </section>
        </div>
      )}
    </>
  );
}
