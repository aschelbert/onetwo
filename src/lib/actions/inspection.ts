import type { Photo } from '@/lib/services/photos';
import { stepsFrom, type ActionKind } from './types';

export type PointResult = '' | 'fine' | 'watch' | 'work';
export interface InspectionPoint {
  id: string;
  label: string;
  result: PointResult;
  note: string;
  photos: Photo[];
  /** What was decided for a point that needs work. */
  handling: '' | 'repair' | 'defer' | 'project';
  /** The repair opened for it, or why it was put off. */
  handlingNote: string;
  /** Carried from the last inspection, where it was marked to watch. */
  watchedBefore?: string;
}

/** An inspection: who walks it, the checklist point by point, and what happens to each finding. */
export interface InspectionData {
  /** Which checklist it started from. */
  template: string;
  /** The maintenance schedule entry it satisfies, when it came from the schedule. */
  scheduleId: string;
  by: string;
  /** A licensed third party is needed to certify it. */
  thirdParty: boolean;
  bookedFor: string;
  residentsToldOn: string;
  residentsNotAffected: boolean;
  points: InspectionPoint[];
  recommendations: string;
  filedOn: string;
  /** The due date this inspection is for, when the schedule opened it. */
  dueFor?: string;
  /** The move-out it walks, when a move opened it. */
  moveId?: string;
  /** The reserve study it prepares for, when that opened it. */
  studyKey?: string;
  /** Set once a condition survey's ratings are written to the assets. */
  conditionsWritten?: boolean;
}

/** Starting checklists. Roof, parking, front entrance and facade follow the District property-manager guide's own lists. */
export const CHECKLISTS: Record<string, { label: string; points: string[] }> = {
  roof: { label: 'Roof', points: ['Ponding water', 'Debris at drains and scuppers', 'Holes, blisters or splits in the membrane', 'Flashing and parapet caps', 'Rooftop equipment supports', 'Skylights, hatches and penetrations', 'Anything loose that could fall'] },
  parking: { label: 'Parking and garage', points: ['Trash and debris', 'Abandoned vehicles', 'Cracked or alligatored pavement', 'Loose gravel and potholes', 'Lighting', 'Gate and door operation', 'Signs and striping'] },
  entrance: { label: 'Front entrance and lobby', points: ['Trash and cleanliness', 'Cracked windows or glass', 'Trip hazards', 'Door closes and locks', 'Lighting', 'Mailboxes secure'] },
  facade: { label: 'Exterior facade', points: ['Cracked windows', 'Loose or cracked concrete or masonry', 'Failed caulking', 'Signs of water getting in', 'Anything that could fall from the building'] },
  walkthrough: { label: 'General walk-through', points: ['Hallways and stairs', 'Exit signs and emergency lights', 'Fire extinguishers in place and tagged', 'Mechanical rooms', 'Trash and recycling rooms', 'Grounds and walkways', 'Amenity spaces'] },
  test: { label: 'Test or certification', points: ['The test itself: passed or failed', 'Certificate or report in hand', 'Tag or sticker updated', 'Anything the tester flagged'] },
  storm: { label: 'Before a storm or a freeze', points: ['Roof drains, scuppers and gutters clear', 'Sump pump runs', 'Exposed pipes and hose bibs protected', 'Heat on in vacant units and mechanical rooms', 'Loose items on roofs, balconies and grounds secured', 'Emergency lights and the generator', 'Salt, sand and shovels on hand', 'Contractor numbers posted'] },
  condition: { label: 'Condition of every asset', points: [] },
  moveout: { label: 'Move-out', points: ['Elevator pads and cab', 'Hallway walls and floors', 'Loading area and doors', 'Unit entry door and frame', 'Anything left behind'] },
};

export const pointsFor = (template: string): InspectionPoint[] => (CHECKLISTS[template]?.points ?? []).map((label, i) => ({ id: `p${i}`, label, result: '', note: '', photos: [], handling: '', handlingNote: '' }));
export const findings = (d: InspectionData) => d.points.filter(p => p.result === 'work');
export const watched = (d: InspectionData) => d.points.filter(p => p.result === 'watch');

export const INSPECTION: ActionKind<InspectionData> = {
  kind: 'inspection', runbookId: 'inspection', name: 'Inspection',
  trigger: 'An inspection falls due on the schedule, a unit moves out, or the board wants a walk-through', blurb: 'Walk a checklist with notes and photos, then repair, put off or keep watching each thing found.',
  catId: 'maintenance', role: 'Vice President', visibility: 'board',
  stepTitles: [['who', 'Decide who inspects'], ['book', 'Book the date and tell residents'], ['walk', 'Walk the checklist'], ['findings', 'Deal with what was found'], ['file', 'File the report']],
  how: {
    who: 'Ticks itself when the inspector is named',
    book: 'Ticks itself when the date is set and residents are told, or marked as not affected',
    walk: 'Ticks itself when every point on the checklist has a result',
    findings: 'Ticks itself when each point that needs work is repaired, put off or folded into a project',
    file: 'Ticks itself when the report is filed; files it in the property log and rolls the schedule forward',
  },
  blank: () => ({ template: 'walkthrough', scheduleId: '', by: '', thirdParty: false, bookedFor: '', residentsToldOn: '', residentsNotAffected: false, points: pointsFor('walkthrough'), recommendations: '', filedOn: '' }),
  steps: (r) => {
    const d = r.data, left = d.points.filter(p => !p.result).length, work = findings(d), open = work.filter(p => !p.handling).length;
    const walked = d.points.length > 0 && left === 0;
    return stepsFrom(INSPECTION, {
      who: [!!d.by.trim(), d.by ? `${d.by}${d.thirdParty ? ' · certified third party' : ''}` : ''],
      book: [!!d.bookedFor && (!!d.residentsToldOn || d.residentsNotAffected), d.bookedFor ? `${d.bookedFor}${d.residentsToldOn ? ` · residents told ${d.residentsToldOn}` : d.residentsNotAffected ? ' · residents not affected' : ''}` : ''],
      walk: [walked, d.points.length ? `${d.points.length - left} of ${d.points.length} points${work.length ? ` · ${work.length} need work` : ''}${watched(d).length ? ` · ${watched(d).length} to watch` : ''}` : 'No checklist yet'],
      findings: [walked && open === 0, !walked ? '' : work.length ? `${work.length - open} of ${work.length} dealt with` : 'Nothing needs work', walked ? '' : 'the checklist being walked'],
      file: [!!d.filedOn, d.filedOn ? `Filed ${d.filedOn}` : '', walked && open === 0 ? '' : 'the findings being dealt with'],
    });
  },
};
