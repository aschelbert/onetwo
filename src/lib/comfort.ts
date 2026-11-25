/**
 * Heat and hot water where the building supplies them: the temperatures the
 * District's housing code asks for, the readings that show they were met, and
 * where things stand today. Pure: rules and readings in, a standing out.
 *
 * Heat (14 DCMR § 501): at least 68°F from 6:30 am to 11 pm and 65°F
 * overnight, from October 1 to May 1. Hot water: sources differ. The
 * Department of Buildings gives 110°F measured in the unit; others quote 120°F
 * at the tap. The app starts from the higher, more protective figure, and the
 * board can change it. The rules are written for landlords and
 * tenants; an association follows them for the systems it runs.
 */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const days = (from: string, to: string) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

export interface ComfortRules {
  /** Whether the building, not each unit, supplies it. Off means the checks do not apply. */
  heat: boolean;
  hotWater: boolean;
  /** The heating season, 'MM-DD' to 'MM-DD', the end not included. */
  seasonStart: string;
  seasonEnd: string;
  dayMin: number;
  nightMin: number;
  /** Daytime runs from this time to this time, 'HH:MM'. */
  dayFrom: string;
  dayTo: string;
  hotWaterMin: number;
  /** How often a reading is taken, in days. */
  heatEvery: number;
  hotWaterEvery: number;
}
export const DEFAULT_RULES: ComfortRules = { heat: true, hotWater: true, seasonStart: '10-01', seasonEnd: '05-01', dayMin: 68, nightMin: 65, dayFrom: '06:30', dayTo: '23:00', hotWaterMin: 120, heatEvery: 7, hotWaterEvery: 30 };
export const rulesFrom = (data: unknown): ComfortRules => ({ ...DEFAULT_RULES, ...((data as Partial<ComfortRules>) ?? {}) });

export type ReadingKind = 'heat' | 'hot-water';
export interface Reading {
  id: string;
  kind: ReadingKind;
  on: string;
  /** 'HH:MM', when it was taken. */
  at: string;
  /** Where: "Third-floor hallway", "Unit 207 bedroom", "Farthest tap, unit 502". */
  where: string;
  temp: number;
  by: string;
  /** The unit it was taken in or for, when it answers a resident. */
  unit: string;
  note: string;
  /** The repair opened because it was under the rule. */
  repairId?: string;
}

/** Whether a date falls in the heating season. The season runs across the new year. */
export function inSeason(date: string, r: Pick<ComfortRules, 'seasonStart' | 'seasonEnd'>): boolean {
  const md = date.slice(5, 10);
  return r.seasonStart <= r.seasonEnd ? md >= r.seasonStart && md < r.seasonEnd : md >= r.seasonStart || md < r.seasonEnd;
}

/** The first day of the season that `date` is in, or of the next one when it is out of season. */
export function seasonStartFor(date: string, r: Pick<ComfortRules, 'seasonStart' | 'seasonEnd'>): string {
  const y = Number(date.slice(0, 4)), md = date.slice(5, 10);
  if (inSeason(date, r)) return `${md >= r.seasonStart ? y : y - 1}-${r.seasonStart}`;
  return `${md < r.seasonStart ? y : y + 1}-${r.seasonStart}`;
}

/** The temperature the rule asks for at a time of day. */
export const heatMinAt = (at: string, r: ComfortRules) => (!/^\d{2}:\d{2}$/.test(at) || (at >= r.dayFrom && at < r.dayTo) ? r.dayMin : r.nightMin);

/** The figure a reading has to meet, and whether it does. */
export function judge(x: Pick<Reading, 'kind' | 'at' | 'temp'>, r: ComfortRules): { min: number; ok: boolean; short: number } {
  const min = x.kind === 'heat' ? heatMinAt(x.at, r) : r.hotWaterMin;
  return { min, ok: x.temp >= min, short: Math.max(0, Math.round((min - x.temp) * 10) / 10) };
}

export type CheckState = 'off' | 'out-of-season' | 'fine' | 'due' | 'overdue' | 'below';
export interface Check {
  kind: ReadingKind;
  state: CheckState;
  last?: Reading;
  /** When the next reading is due, when one is. */
  due: string;
  /** In words, for a row. */
  line: string;
}

const newest = (list: Reading[]) => [...list].sort((a, b) => (b.on + b.at).localeCompare(a.on + a.at))[0];

/**
 * Where a check stands today. The newest reading decides: under the rule is
 * "below" until a later reading meets it. With no reading under the rule, a
 * reading older than its interval is due, and one more than twice as old is
 * overdue. Heat is only checked in season.
 */
export function check(kind: ReadingKind, readings: Reading[], r: ComfortRules, today: string): Check {
  const on = kind === 'heat' ? r.heat : r.hotWater;
  const every = kind === 'heat' ? r.heatEvery : r.hotWaterEvery;
  if (!on) return { kind, state: 'off', due: '', line: 'Each unit supplies its own' };
  const mine = readings.filter(x => x.kind === kind && ISO.test(x.on));
  if (kind === 'heat' && !inSeason(today, r)) return { kind, state: 'out-of-season', last: newest(mine), due: seasonStartFor(today, r), line: `Out of season · readings start ${seasonStartFor(today, r)}` };
  // In season, only this season's readings count.
  const since = kind === 'heat' ? seasonStartFor(today, r) : '';
  const last = newest(mine.filter(x => x.on >= since));
  if (!last) return { kind, state: 'overdue', due: since || today, line: kind === 'heat' ? 'No reading yet this season' : 'No reading on record' };
  const j = judge(last, r);
  const due = addDays(last.on, every), late = days(due, today);
  if (!j.ok) return { kind, state: 'below', last, due: today, line: `${last.temp}°F on ${last.on}, ${j.short}° under the ${j.min}°F asked for` };
  return { kind, state: late > every ? 'overdue' : late >= 0 ? 'due' : 'fine', last, due, line: `${last.temp}°F on ${last.on}${last.at ? ` at ${last.at}` : ''} · next by ${due}` };
}

/** A resident's request that is about heat or hot water, judged from its words. */
export function complaintKind(text: string): ReadingKind | null {
  const t = text.toLowerCase();
  if (/hot water|water (is |was )?(cold|lukewarm|not hot)|no hot/.test(t)) return 'hot-water';
  if (/\b(no heat|heat(ing)? (is |was )?(off|out|not)|radiator|too cold|freezing|cold (in|overnight|apartment|unit|bedroom))\b/.test(t)) return 'heat';
  return null;
}

export interface Complaint { id: string; unit: string; on: string; what: string; kind: ReadingKind }
/** A complaint with the readings taken for its unit since: answered once a reading meets the rule. */
export function answered(c: Complaint, readings: Reading[], r: ComfortRules): { readings: Reading[]; met: Reading | undefined } {
  const mine = readings.filter(x => x.kind === c.kind && x.unit === c.unit && x.on >= c.on).sort((a, b) => (a.on + a.at).localeCompare(b.on + b.at));
  return { readings: mine, met: mine.find(x => judge(x, r).ok) };
}
