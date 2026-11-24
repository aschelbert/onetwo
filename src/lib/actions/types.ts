/**
 * Record-backed actions.
 *
 * An action of this kind is a record (what it is about, and everything
 * entered while working it) plus a fixed list of steps. Whether a step is
 * done is read from the record, never ticked by hand: enter the date the
 * notice went out and the "send the notice" step is done. The Board Room
 * opens one action per open record and shows its steps with the work for each
 * (src/ux2/boardroom/action).
 *
 * A kind lives in one file: the shape of its data, a blank record, and the
 * function that says where each step stands.
 */
export interface ActionRecord<D = Record<string, unknown>> {
  id: string;
  kind: string;
  title: string;
  /** The unit it concerns, when it concerns one. */
  unit: string;
  openedOn: string;
  /** The date the whole action is due, when it has one. */
  dueOn: string;
  closedOn: string;
  data: D;
}

export interface ActionStep {
  key: string;
  title: string;
  done: boolean;
  /** Why the step cannot be finished yet, when something outside it is missing. */
  waitsOn: string;
  /** What the record shows for the step, in a line. */
  summary: string;
}

export interface ActionKind<D = Record<string, unknown>> {
  kind: string;
  /** Runbook id: the action's source id is `<runbookId>:<record id>`. */
  runbookId: string;
  name: string;
  /** What starts one, for the Runbooks list. */
  trigger: string;
  /** What it is for, in a line, where a person picks one to start. */
  blurb: string;
  catId: string;
  role: string;
  visibility: 'owners' | 'board';
  /** Step keys and titles, in order. */
  stepTitles: [key: string, title: string][];
  /** How the app knows each step is done. */
  how: Record<string, string>;
  blank: () => D;
  steps: (r: ActionRecord<D>) => ActionStep[];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const isIso = (s: string | undefined | null): s is string => !!s && ISO.test(s);
export const plusDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const daysTo = (from: string, to: string) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
export const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** Build a kind's step list from `[key, done, summary, waitsOn?]` rows, in the order of its titles. */
export function stepsFrom(def: Pick<ActionKind, 'stepTitles'>, rows: Record<string, [done: boolean, summary?: string, waitsOn?: string]>): ActionStep[] {
  return def.stepTitles.map(([key, title]) => {
    const [done, summary = '', waitsOn = ''] = rows[key] ?? [false];
    return { key, title, done, summary, waitsOn: done ? '' : waitsOn };
  });
}

export const permitHold = (p: { answered: boolean; answers: string[]; number: string; finalInspectionOn: string }) => ({
  needed: p.answered && p.answers.length > 0,
  start: p.answered && p.answers.length > 0 && !p.number.trim() ? 'the permit being on file' : '',
  pay: p.answered && p.answers.length > 0 && !p.finalInspectionOn ? "the permit's final inspection" : '',
});
