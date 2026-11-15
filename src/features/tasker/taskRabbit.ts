/**
 * TaskRabbit, as the app sees it.
 *
 * The board books small jobs (a bulb on a high fixture, a wall rack, boxes to
 * storage) through TaskRabbit from inside an action. This file is the only
 * place that knows how TaskRabbit is reached. Today it is a demo client: it
 * answers from local data and lets the board play TaskRabbit's updates
 * (accepted, on the way, checked in, done) by hand, so the whole lifecycle can
 * be walked through before a partner account exists.
 *
 * When the partner API is connected, `searchTaskers` and `requestTask` call it
 * from a server function, and TaskRabbit's status webhooks call
 * `applyUpdate` (lifecycle.ts) with the same `TaskerUpdate` shapes the demo
 * simulator sends. Nothing else in the app changes.
 *
 * Not yet checked against TaskRabbit's partner documentation: category names,
 * the service and trust fee, the time to accept, and the late-cancel rule.
 * Each is marked VERIFY below.
 */

export type TaskerMode = 'demo' | 'live';
export const TASKER_MODE: TaskerMode = 'demo';

/** VERIFY: TaskRabbit's own category list and ids. */
export const TASK_CATEGORIES = [
  { id: 'handyman', label: 'Handyman', note: 'Small repairs, ladder work, bulbs, hardware' },
  { id: 'mounting', label: 'Mounting', note: 'Shelves, racks, signs, mirrors' },
  { id: 'furniture-assembly', label: 'Furniture assembly', note: 'Benches, lobby and deck furniture' },
  { id: 'moving-help', label: 'Moving help', note: 'Boxes to storage, bulk items' },
  { id: 'cleaning', label: 'Cleaning', note: 'One-off deep cleans' },
  { id: 'yard-work', label: 'Yard work', note: 'Planters, leaves, snow' },
  { id: 'painting', label: 'Painting', note: 'Touch-ups, railings, small rooms' },
] as const;
export type TaskCategoryId = typeof TASK_CATEGORIES[number]['id'];

export const TIME_SLOTS = [
  { id: 'morning', label: '8 am–12 pm' },
  { id: 'afternoon', label: '12–4 pm' },
  { id: 'evening', label: '4–8 pm' },
] as const;
export type TimeSlotId = typeof TIME_SLOTS[number]['id'];

/** Hours a Tasker has to accept before the board is asked to choose again. VERIFY. */
export const ACCEPT_HOURS = 2;
/** TaskRabbit bills at least one hour. VERIFY. */
export const MIN_BILLED_HOURS = 1;
/** The per-job limit for Tasker work until the board sets its own (Funds › Settings › Billing rules); above it the board votes on the action first. */
export const DEFAULT_TASKER_LIMIT = 300;

/**
 * Work a Tasker should not do: trades that need a licence, or that the master
 * policy expects a licensed, insured vendor for. A job that reads like these
 * goes to a vendor from Building › Contracts instead.
 */
const LICENSED = /\b(wir(e|ing)|rewir|outlet|breaker|panel|circuit|electrical|electrician|plumb|pipe|leak|water (stain|damage|intrusion)|drain|sewer|water heater|toilet|roof|gas\b|boiler|furnace|hvac|elevator|sprinkler|fire alarm|asbestos|mou?ld|lead paint|structural|facade|fa[cç]ade)/i;
export function needsLicensedTrade(text: string): string | null {
  const m = text.match(LICENSED);
  return m ? m[0].toLowerCase() : null;
}

/** A first guess at the category from the action's words. */
export function guessCategory(text: string): TaskCategoryId {
  const t = text.toLowerCase();
  if (/mount|hang|rack|shel(f|ves)|sign|mirror|tv\b/.test(t)) return 'mounting';
  if (/assembl|bench|furniture|ikea|desk|chair/.test(t)) return 'furniture-assembly';
  if (/box|boxes|move|moving|haul|storage|bulk|carry|lift/.test(t)) return 'moving-help';
  if (/clean|wipe|dust|vacuum|spill/.test(t)) return 'cleaning';
  if (/yard|leaf|leaves|plant|garden|snow|shovel|mulch/.test(t)) return 'yard-work';
  if (/paint|scuff|touch[- ]?up/.test(t)) return 'painting';
  return 'handyman';
}

export interface Tasker {
  id: string;
  name: string;
  initials: string;
  rating: number;
  reviews: number;
  tasks: number;
  /** Dollars per hour. */
  rate: number;
  categories: TaskCategoryId[];
  blurb: string;
}

/** The demo's local Taskers. Live, these come from TaskRabbit's availability search for the building's address. */
const DEMO_TASKERS: Tasker[] = [
  { id: 'tr-andre', name: 'Andre R.', initials: 'AR', rating: 4.9, reviews: 312, tasks: 840, rate: 58, categories: ['handyman', 'mounting', 'furniture-assembly'], blurb: 'Brings a ladder up to 12 ft' },
  { id: 'tr-priya', name: 'Priya N.', initials: 'PN', rating: 4.8, reviews: 96, tasks: 210, rate: 52, categories: ['handyman', 'cleaning', 'painting'], blurb: 'Free from 12:30 pm' },
  { id: 'tr-devon', name: 'Devon W.', initials: 'DW', rating: 5.0, reviews: 41, tasks: 75, rate: 64, categories: ['handyman', 'mounting', 'moving-help'], blurb: 'Has a van for bulky items' },
  { id: 'tr-jia', name: 'Jia L.', initials: 'JL', rating: 4.9, reviews: 158, tasks: 402, rate: 49, categories: ['furniture-assembly', 'moving-help', 'yard-work', 'painting'], blurb: 'Weekends available' },
  { id: 'tr-marcus', name: 'Marcus S.', initials: 'MS', rating: 4.7, reviews: 233, tasks: 615, rate: 45, categories: ['moving-help', 'yard-work', 'cleaning'], blurb: 'Two-person crew on request' },
];

/** Taskers for a category, the ones this building rated well first. */
export function searchTaskers(category: TaskCategoryId, ratedHere: Record<string, number> = {}): Tasker[] {
  return DEMO_TASKERS
    .filter(t => t.categories.includes(category))
    .sort((a, b) => (ratedHere[b.id] ?? 0) - (ratedHere[a.id] ?? 0) || b.rating - a.rating);
}

export function taskerById(id: string): Tasker | undefined {
  return DEMO_TASKERS.find(t => t.id === id);
}

/** Labour only: TaskRabbit adds its service and trust fee on the final bill (VERIFY the rate). */
export function estimateFor(rate: number, hours: number): number {
  return Math.round(rate * Math.max(MIN_BILLED_HOURS, hours));
}

/** What TaskRabbit tells the app about a task. Live, each arrives as a webhook. */
export type TaskerUpdate =
  | { kind: 'accepted' }
  | { kind: 'no-reply' }
  | { kind: 'on-the-way'; eta: string }
  | { kind: 'checked-in' }
  | { kind: 'scope-request'; extraHours: number; parts: number; note: string }
  | { kind: 'done'; hoursWorked: number; note: string; photos: number }
  | { kind: 'tasker-cancelled'; reason: string };
