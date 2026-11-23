/**
 * Building records: the licences, certificates, tests and notices a building
 * has to hold, renew or post. Each kind says what it is, where the rule comes
 * from, how its next date is found and which buildings it applies to; a
 * building's own entries (number, date, expiry, file) are judged against it.
 *
 * The DC kinds follow the District's property-manager curriculum (DCRA study
 * guide, rev. 03/2021) and the regulations it cites. They are reminders of
 * what to keep on file, not legal advice: confirm each with the agency named.
 */
import { toStateCode } from '@/lib/usStates';
import { addMonths } from '@/lib/maintenance';

export interface BuildingRecord {
  id: string;
  /** A catalogue kind id, or 'custom'. */
  kind: string;
  /** The label shown for a custom record. */
  name: string;
  /** Licence, certificate or confirmation number. */
  number: string;
  /** The day it was issued, done, filed or sent. */
  doneOn: string;
  /** When it expires, where it has an expiry. */
  expiresOn: string;
  /** Whether it is posted where it has to be. */
  posted: boolean;
  notes: string;
  file?: { name: string; path: string };
}

export type RecordCycle =
  | { type: 'once' }
  | { type: 'expires' }
  | { type: 'every'; months: number }
  | { type: 'annual'; month: number; day: number; opens?: { month: number; day: number } };

export interface BuildingFacts {
  state: string;
  /** Gross floor area in square feet, when known. */
  grossSqft: number | null;
  hasElevator: boolean;
  hasBoiler: boolean;
}

export type Applies = 'yes' | 'no' | 'check';

export interface RecordKind {
  id: string;
  label: string;
  group: 'Occupancy and licences' | 'Equipment certificates' | 'Fire and life safety' | 'Heating' | 'Energy';
  what: string;
  cite?: string;
  cycle: RecordCycle;
  /** Where it has to be displayed, when it does. */
  postedWhere?: string;
  numberLabel?: string;
  dateLabel: string;
  /** Two-letter states it is specific to; absent means anywhere. */
  states?: string[];
  applies: (b: BuildingFacts) => Applies;
  appliesNote?: string;
}

const always = (): Applies => 'yes';

export const RECORD_KINDS: RecordKind[] = [
  {
    id: 'certificate-of-occupancy', label: 'Certificate of Occupancy', group: 'Occupancy and licences',
    what: 'Certifies that the building\'s use complies with the zoning regulations and building codes. A new one is needed when the ownership, the occupancy load or the use changes.',
    cite: 'DC Construction Codes (12-A DCMR); DC Zoning Regulations', cycle: { type: 'once' }, postedWhere: 'On site',
    numberLabel: 'Certificate number', dateLabel: 'Issued', states: ['DC'], applies: always,
    appliesNote: 'Held for the building as a whole; single units do not need their own.',
  },
  {
    id: 'business-licence', label: 'Basic business licence', group: 'Occupancy and licences',
    what: 'The District licence for operating a housing business. The valid licence is framed and posted in a conspicuous place in the building.',
    cite: '14 DCMR §§ 200.3, 200.6', cycle: { type: 'expires' }, postedWhere: 'Framed, in a conspicuous place',
    numberLabel: 'Licence number', dateLabel: 'Issued', states: ['DC'], applies: () => 'check',
    appliesNote: 'Needed where the association itself rents out a unit or other space. Owners who rent out their own units hold their own licences.',
  },
  {
    id: 'elevator-certificate', label: 'Elevator certificate of inspection', group: 'Equipment certificates',
    what: 'The current inspection certificate for each elevator, from a licensed inspector.',
    cycle: { type: 'expires' }, postedWhere: 'In or near the cab, or on file with the manager as the certificate directs',
    numberLabel: 'Certificate number', dateLabel: 'Inspected', applies: b => (b.hasElevator ? 'yes' : 'no'),
  },
  {
    id: 'boiler-certificate', label: 'Boiler certificate of inspection', group: 'Equipment certificates',
    what: 'The inspection certificate for the boiler or other pressure vessel.',
    cycle: { type: 'expires' }, postedWhere: 'In the boiler room',
    numberLabel: 'Certificate number', dateLabel: 'Inspected', applies: b => (b.hasBoiler ? 'yes' : 'check'),
    appliesNote: 'Applies where the building has a boiler or central plant.',
  },
  {
    id: 'heating-inspection', label: 'Annual heating system inspection', group: 'Heating',
    what: 'Every furnace, boiler and central heating system is inspected between March 1 and September 1 each year and the report is submitted to the District. Heat must then be available from October 15 to May 15.',
    cite: '14 DCMR §§ 501.2, 501.10', cycle: { type: 'annual', month: 9, day: 1, opens: { month: 3, day: 1 } },
    numberLabel: 'Report reference', dateLabel: 'Inspected', states: ['DC'], applies: b => (b.hasBoiler ? 'yes' : 'check'),
    appliesNote: 'Applies where the building, not each owner, supplies the heat.',
  },
  {
    id: 'fire-alarm-test', label: 'Fire alarm and sprinkler test', group: 'Fire and life safety',
    what: 'The yearly test of the fire alarm, sprinkler and standpipe systems by a qualified contractor, with the report kept on file.',
    cycle: { type: 'every', months: 12 }, numberLabel: 'Report reference', dateLabel: 'Tested', applies: always,
  },
  {
    id: 'fire-extinguishers', label: 'Fire extinguisher inspection', group: 'Fire and life safety',
    what: 'Fire extinguishing equipment is kept in operable condition; each extinguisher carries a current inspection tag.',
    cite: '14 DCMR § 901.1', cycle: { type: 'every', months: 12 }, numberLabel: 'Report reference', dateLabel: 'Inspected', applies: always,
  },
  {
    id: 'smoke-detector-test', label: 'Smoke detector inspection and test', group: 'Fire and life safety',
    what: 'The owner keeps each smoke detector in reliable working order and makes periodic inspections and tests to make sure it works.',
    cite: 'DC Code § 6-751.06; 14 DCMR § 904.4', cycle: { type: 'every', months: 12 }, numberLabel: 'Log reference', dateLabel: 'Tested', states: ['DC'], applies: always,
    appliesNote: 'For common areas and any detectors the association maintains. The law says "periodic"; a yearly record is a sensible minimum.',
  },
  {
    id: 'fire-alarm-notice', label: 'Fire alarm instructions to residents', group: 'Fire and life safety',
    what: 'A written notice, posted in the common areas and given to every unit owner or tenant by hand or first-class mail: how the building fire alarm works, whether it is connected to the unit smoke detectors and to the Fire and EMS Department, and that 911 must be called in a fire.',
    cite: 'DC Code § 6-751.11', cycle: { type: 'once' }, postedWhere: 'Conspicuous places in the common areas',
    dateLabel: 'Last given to every unit', states: ['DC'], applies: always,
    appliesNote: 'Give it again when the alarm system changes and to each new owner or tenant.',
  },
  {
    id: 'energy-benchmarking', label: 'Energy and water benchmarking report', group: 'Energy',
    what: 'The building\'s energy and water use for the previous calendar year, reported to the Department of Energy and Environment through ENERGY STAR Portfolio Manager by April 1. It needs twelve months of whole-building data, the gross floor area, operating hours and number of occupants. Fines for missing it run up to $100 a day.',
    cite: 'Clean and Affordable Energy Act of 2008', cycle: { type: 'annual', month: 4, day: 1 },
    numberLabel: 'Portfolio Manager or DC building ID', dateLabel: 'Submitted', states: ['DC'],
    applies: b => (b.grossSqft == null ? 'check' : b.grossSqft >= 50000 ? 'yes' : b.grossSqft >= 10000 ? 'check' : 'no'),
    appliesNote: 'Required for buildings over 50,000 gross square feet, multifamily included. The District has been extending it to smaller buildings, so check DOEE\'s covered building list for yours.',
  },
];

export const recordKind = (id: string) => RECORD_KINDS.find(k => k.id === id);

/** The kinds a building in this state should look at: those that apply, and those it has to check. */
export function kindsFor(b: BuildingFacts): { kind: RecordKind; applies: Applies }[] {
  const code = toStateCode(b.state);
  return RECORD_KINDS
    .filter(k => !k.states || k.states.includes(code))
    .map(kind => ({ kind, applies: kind.applies(b) }))
    .filter(x => x.applies !== 'no');
}

/** "78,500 sq ft" → 78500; null when there is no number in it. */
export function parseSqft(text: string | undefined | null): number | null {
  const n = Number(String(text ?? '').replace(/,/g, '').match(/\d+(\.\d+)?/)?.[0]);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const days = (from: string, to: string) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
const md = (year: number, month: number, day: number) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export type RecordState = 'missing' | 'lapsed' | 'due-soon' | 'current';

export interface RecordStatus {
  state: RecordState;
  /** The entry that counts: the latest one. */
  current?: BuildingRecord;
  /** The next date something is due, when there is one. */
  due?: string;
  daysLeft?: number;
  /** On file but not marked as posted where it has to be. */
  unposted: boolean;
  history: BuildingRecord[];
}

/** Where a kind of record stands today, from the building's entries of that kind. */
export function recordStatus(kind: Pick<RecordKind, 'cycle' | 'postedWhere'>, entries: BuildingRecord[], today: string, warnDays = 60): RecordStatus {
  const history = [...entries].sort((a, b) => (b.doneOn || b.expiresOn || '').localeCompare(a.doneOn || a.expiresOn || ''));
  const current = history[0];
  const unposted = !!kind.postedWhere && !!current && !current.posted;
  const judge = (due: string | undefined, fallback: RecordState): RecordStatus => {
    if (!due || !ISO.test(due)) return { state: fallback, current, unposted, history };
    const d = days(today, due);
    return { state: d < 0 ? 'lapsed' : d <= warnDays ? 'due-soon' : fallback, current, due, daysLeft: d, unposted, history };
  };
  const c = kind.cycle;
  if (c.type === 'annual') {
    const year = Number(today.slice(0, 4));
    const opens = c.opens ? md(year, c.opens.month, c.opens.day) : md(year, 1, 1);
    const doneThisYear = history.some(r => ISO.test(r.doneOn) && r.doneOn >= opens && r.doneOn <= md(year, 12, 31));
    if (doneThisYear) return judge(md(year + 1, c.month, c.day), 'current');
    return judge(md(year, c.month, c.day), current ? 'current' : 'missing');
  }
  if (!current) return { state: 'missing', unposted: false, history };
  if (c.type === 'once') return { state: 'current', current, unposted, history };
  if (c.type === 'every') return judge(ISO.test(current.doneOn) ? addMonths(current.doneOn, c.months) : undefined, 'current');
  return judge(current.expiresOn, 'current');
}
