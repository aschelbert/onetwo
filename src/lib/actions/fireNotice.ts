import type { Photo } from '@/lib/services/photos';
import { stepsFrom, type ActionKind } from './types';

/** The fire alarm instructions the District has a building give every resident, in writing, and post. DC Code § 6-751.11. */
export interface FireNoticeData {
  /** 'all' for the building's notice; 'unit' for the copy a new owner or tenant gets. */
  scope: 'all' | 'unit';
  /** Where the pull stations are, in words. */
  pullStations: string;
  linkedToUnits: '' | 'yes' | 'no';
  monitored: '' | 'yes' | 'no';
  /** How to leave the building. */
  evacuation: string;
  contact: string;
  /** Wording added by the board, after the required points. */
  extra: string;
  reviewedOn: string;
  reviewedBy: string;
  method: '' | 'mail' | 'hand';
  /** Units the notice has reached. */
  delivered: string[];
  deliveredOn: string;
  places: { where: string; photos: Photo[] }[];
  postedOn: string;
}

export const answered = (d: FireNoticeData) => !!d.pullStations.trim() && !!d.linkedToUnits && !!d.monitored && !!d.evacuation.trim();

/** The notice itself, written from the answers. The first four paragraphs are the points the law asks for and are always present. */
export function noticeText(d: FireNoticeData, building: { name: string; address: string }): string[] {
  return [
    `${building.name} · ${building.address}`,
    'In a fire, call 911 at once.',
    d.monitored === 'yes'
      ? 'The building fire alarm is monitored and alerts the Fire and EMS Department when it sounds. Call 911 anyway: never assume someone else has.'
      : 'The building fire alarm does not call the fire department. Nobody is alerted unless someone calls 911.',
    `To sound the building alarm: pull down the handle at a pull station. ${d.pullStations.trim()}`,
    d.linkedToUnits === 'yes'
      ? 'The smoke detector in your unit is connected to the building alarm: when it senses smoke, the building alarm sounds.'
      : 'The smoke detector in your unit is separate. It sounds only inside your unit and does not set off the building alarm.',
    `When the building alarm sounds: ${d.evacuation.trim()}`,
    ...(d.extra.trim() ? [d.extra.trim()] : []),
    `Given under DC Code § 6-751.11.${d.contact.trim() ? ` Questions: ${d.contact.trim()}.` : ''}`,
  ];
}

export const FIRE_NOTICE: ActionKind<FireNoticeData> = {
  kind: 'fire-notice', runbookId: 'fire-alarm-notice', name: 'Fire alarm notice',
  trigger: 'No notice on record, a change to the alarm system, or a new owner or tenant', blurb: 'Write, deliver and post the fire alarm instructions every resident must be given.',
  catId: 'legal', role: 'Vice President', visibility: 'board',
  stepTitles: [['questions', 'Answer four questions about the alarm'], ['review', 'Review the notice'], ['deliver', 'Deliver it to every unit'], ['post', 'Post it in the common areas']],
  how: {
    questions: 'Ticks itself when all four questions are answered',
    review: 'Ticks itself when someone confirms the wording',
    deliver: 'Ticks itself when every unit it is for is marked as delivered, by hand or first-class mail',
    post: 'Ticks itself when the posting date is entered; fills in the record under Building › Obligations',
  },
  blank: () => ({ scope: 'all', pullStations: '', linkedToUnits: '', monitored: '', evacuation: 'leave by the stairs, not the elevator, and close doors behind you.', contact: '', extra: '', reviewedOn: '', reviewedBy: '', method: '', delivered: [], deliveredOn: '', places: [], postedOn: '' }),
  steps: (r) => {
    const d = r.data, one = d.scope === 'unit';
    return stepsFrom(FIRE_NOTICE, {
      questions: [answered(d), answered(d) ? `${d.monitored === 'yes' ? 'Monitored' : 'Not monitored'} · ${d.linkedToUnits === 'yes' ? 'linked' : 'not linked'} to unit detectors` : ''],
      review: [!!d.reviewedOn, d.reviewedOn ? `Confirmed ${d.reviewedOn}${d.reviewedBy ? ` by ${d.reviewedBy}` : ''}` : '', !answered(d) ? 'the four answers' : ''],
      deliver: [!!d.deliveredOn, d.deliveredOn ? `${d.delivered.length} unit${d.delivered.length === 1 ? '' : 's'} · ${d.method === 'mail' ? 'first-class mail' : 'by hand'} · ${d.deliveredOn}` : d.delivered.length ? `${d.delivered.length} so far` : '', !d.reviewedOn ? 'the wording being confirmed' : ''],
      post: [one ? !!d.deliveredOn : !!d.postedOn, one ? 'Already posted: this copy is for one unit' : d.postedOn ? `Posted ${d.postedOn} · ${d.places.length} place${d.places.length === 1 ? '' : 's'}` : '', !d.deliveredOn ? 'the notice being delivered' : ''],
    });
  },
};
