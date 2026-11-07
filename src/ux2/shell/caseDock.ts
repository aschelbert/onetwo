/**
 * The case dock's memory: which cases you opened most recently, and which you
 * dismissed. Opening an open case makes it your active case, however you then
 * leave it; the dock follows you until the case closes, every step is done,
 * or you dismiss it (opening the case again brings the dock back).
 *
 * `dockFor` is pure so it can be tested without the stores.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CaseTrackerCase, CaseStep } from '@/types/issues';

const MAX_RECENT = 4;

interface CaseDockState {
  recent: string[];
  dismissed: string[];
  touch: (caseId: string) => void;
  dismiss: (caseId: string) => void;
  reset: () => void;
}

export const useCaseDockStore = create<CaseDockState>()(persist((set) => ({
  recent: [],
  dismissed: [],
  touch: (caseId) => set(s => ({
    recent: [caseId, ...s.recent.filter(id => id !== caseId)].slice(0, MAX_RECENT),
    dismissed: s.dismissed.filter(id => id !== caseId),
  })),
  dismiss: (caseId) => set(s => ({ dismissed: s.dismissed.includes(caseId) ? s.dismissed : [...s.dismissed, caseId] })),
  reset: () => set({ recent: [], dismissed: [] }),
}), { name: 'onetwo-ux2-case-dock', version: 1 }));

export interface DockedCase {
  c: CaseTrackerCase;
  stepIdx: number;
  step: CaseStep;
  steps: CaseStep[];
  checksDone: number;
  checksTotal: number;
}

/** A case is dockable while it is not closed and has a step left to do. */
function docked(c: CaseTrackerCase | undefined): DockedCase | null {
  if (!c || c.status === 'closed' || !c.steps?.length) return null;
  const stepIdx = c.steps.findIndex(s => !s.done);
  if (stepIdx < 0) return null;
  const step = c.steps[stepIdx];
  const checks = step.checks ?? [];
  return { c, stepIdx, step, steps: c.steps, checksDone: checks.filter(k => k.checked).length, checksTotal: checks.length };
}

/** The case id a URL is showing, from `?view=case:<id>` on /boardroom or /issues. */
export function caseIdFromLocation(pathname: string, search: string): string | null {
  if (!pathname.startsWith('/boardroom') && !pathname.startsWith('/issues')) return null;
  const view = new URLSearchParams(search).get('view');
  return view && view.startsWith('case:') ? decodeURIComponent(view.slice(5)) : null;
}

/**
 * What the dock shows: the most recent dockable case you have not dismissed,
 * unless you are on that case's own page, plus up to two other open cases.
 */
export function dockFor(cases: CaseTrackerCase[], recent: string[], dismissed: string[], viewingCaseId: string | null): { active: DockedCase; others: DockedCase[] } | null {
  const list = recent.map(id => docked(cases.find(c => c.id === id))).filter((d): d is DockedCase => !!d && !dismissed.includes(d.c.id));
  if (list.length === 0) return null;
  const [active, ...rest] = list;
  if (active.c.id === viewingCaseId) return null;
  return { active, others: rest.filter(d => d.c.id !== viewingCaseId).slice(0, 2) };
}

export const casePath = (id: string) => `/issues?view=case:${encodeURIComponent(id)}`;
