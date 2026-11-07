/**
 * The case dock's memory: which cases you opened most recently, and which you
 * dismissed. Opening an open case makes it your active case, however you then
 * leave it; the dock follows you until the case closes, every step is done,
 * or you dismiss it (opening the case again brings the dock back). It also
 * remembers where you were in each case (step and checklist item), so Back
 * returns you there.
 *
 * `dockFor` is pure so it can be tested without the stores.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CaseTrackerCase, CaseStep } from '@/types/issues';

const MAX_RECENT = 4;

/** Where you were in a case: the step (0-based; `approach` for an additional approach's steps) and the checklist item you acted on last. */
export interface CaseSpot { step: number; approach: number | null; check?: string }

interface CaseDockState {
  recent: string[];
  dismissed: string[];
  spots: Record<string, CaseSpot>;
  touch: (caseId: string) => void;
  dismiss: (caseId: string) => void;
  /** The step you are on in a case; clears the remembered checklist item. */
  remember: (caseId: string, spot: CaseSpot) => void;
  /** The checklist item you just acted on (e.g. an assist that leaves the case). */
  rememberCheck: (caseId: string, check: string) => void;
  reset: () => void;
}

export const useCaseDockStore = create<CaseDockState>()(persist((set) => ({
  recent: [],
  dismissed: [],
  spots: {},
  touch: (caseId) => set(s => ({
    recent: [caseId, ...s.recent.filter(id => id !== caseId)].slice(0, MAX_RECENT),
    dismissed: s.dismissed.filter(id => id !== caseId),
  })),
  dismiss: (caseId) => set(s => ({ dismissed: s.dismissed.includes(caseId) ? s.dismissed : [...s.dismissed, caseId] })),
  remember: (caseId, spot) => set(s => {
    const prev = s.spots[caseId];
    if (prev && prev.step === spot.step && prev.approach === spot.approach && prev.check === spot.check) return s;
    return { spots: { ...s.spots, [caseId]: { step: spot.step, approach: spot.approach, ...(spot.check ? { check: spot.check } : {}) } } };
  }),
  rememberCheck: (caseId, check) => set(s => {
    const prev = s.spots[caseId];
    if (!prev || prev.check === check) return s;
    return { spots: { ...s.spots, [caseId]: { ...prev, check } } };
  }),
  reset: () => set({ recent: [], dismissed: [], spots: {} }),
}), { name: 'onetwo-ux2-case-dock', version: 1 }));

export interface DockedCase {
  c: CaseTrackerCase;
  stepIdx: number;
  step: CaseStep;
  steps: CaseStep[];
  checksDone: number;
  checksTotal: number;
}

/**
 * A case is dockable while it is not closed and has a step left to do. The
 * dock shows the step you were on when it is a main step still to do,
 * otherwise the first step left.
 */
function docked(c: CaseTrackerCase | undefined, spot?: CaseSpot): DockedCase | null {
  if (!c || c.status === 'closed' || !c.steps?.length) return null;
  const first = c.steps.findIndex(s => !s.done);
  if (first < 0) return null;
  const stepIdx = spot && spot.approach == null && c.steps[spot.step] && !c.steps[spot.step].done ? spot.step : first;
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
export function dockFor(cases: CaseTrackerCase[], recent: string[], dismissed: string[], viewingCaseId: string | null, spots: Record<string, CaseSpot> = {}): { active: DockedCase; others: DockedCase[] } | null {
  const list = recent.map(id => docked(cases.find(c => c.id === id), spots[id])).filter((d): d is DockedCase => !!d && !dismissed.includes(d.c.id));
  if (list.length === 0) return null;
  const [active, ...rest] = list;
  if (active.c.id === viewingCaseId) return null;
  return { active, others: rest.filter(d => d.c.id !== viewingCaseId).slice(0, 2) };
}

/** A case's page; with a spot, it opens on that step and brings that checklist item into view. */
export function casePath(id: string, spot?: CaseSpot): string {
  let path = `/issues?view=case:${encodeURIComponent(id)}`;
  if (!spot) return path;
  path += `&step=${spot.step + 1}`;
  if (spot.approach != null) path += `&approach=${spot.approach + 1}`;
  if (spot.check) path += `&check=${encodeURIComponent(spot.check)}`;
  return path;
}

/** The spot a case URL asks for (`step`, `approach` and `check` are 1-based / ids), or null. */
export function spotFromSearch(search: string | URLSearchParams): CaseSpot | null {
  const q = typeof search === 'string' ? new URLSearchParams(search) : search;
  const step = Number(q.get('step'));
  if (!Number.isInteger(step) || step < 1) return null;
  const approach = Number(q.get('approach'));
  const check = q.get('check');
  return { step: step - 1, approach: Number.isInteger(approach) && approach >= 1 ? approach - 1 : null, ...(check ? { check } : {}) };
}
