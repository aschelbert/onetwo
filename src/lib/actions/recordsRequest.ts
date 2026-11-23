import { stepsFrom, type ActionKind } from './types';

/** An owner asks to see the association's books and records. */
export interface RecordsRequestData {
  requester: string;
  askedOn: string;
  inWriting: boolean;
  /** Whether the person asking is an owner of record (or their authorised agent). */
  ownerOfRecord: '' | 'yes' | 'no';
  purpose: string;
  items: RequestedItem[];
  how: '' | 'copies' | 'inspect';
  sentOn: string;
  /** What the owner was told about anything held back. */
  withheldNote: string;
  filedOn: string;
}
export interface RequestedItem { id: string; what: string; share: '' | 'full' | 'redacted' | 'later' | 'no'; reason: string }

/** What an association usually holds back, shown beside the choices. The secretary decides. */
export const USUALLY_WITHHELD = [
  "Other owners' balances, payment plans and contact details",
  "Advice from the association's lawyer, and anything about pending or likely litigation",
  'Staff personnel and wage records',
  'Bids, before the contract is awarded',
  'Contracts still being negotiated',
];

export const SHARE_LABEL: Record<RequestedItem['share'], string> = { '': 'Not decided', full: 'In full', redacted: "With other owners' details removed", later: 'Later, on a date', no: 'Withheld' };
export const withheld = (d: RecordsRequestData) => d.items.filter(i => i.share === 'no' || i.share === 'later' || i.share === 'redacted');
const decided = (d: RecordsRequestData) => d.items.length > 0 && d.items.every(i => i.share && (i.share === 'full' || i.reason.trim()));

export const RECORDS_REQUEST: ActionKind<RecordsRequestData> = {
  kind: 'records-request', runbookId: 'records-request', name: 'Records request',
  trigger: 'An owner asks to see the books or records', blurb: 'Answer an owner who asks to see the books: what is shared, what is held back and why, by the deadline.',
  catId: 'governance', role: 'Secretary', visibility: 'board',
  stepTitles: [['log', 'Log the request and check standing'], ['choose', 'Choose what to share'], ['send', 'Send it, or offer a time to inspect'], ['file', 'File what was sent and withheld']],
  how: {
    log: 'Ticks itself when who asked, when, and whether they are an owner of record are entered',
    choose: 'Ticks itself when every item asked for has a decision, with a reason for anything not shared in full',
    send: 'Ticks itself when the date it was sent or offered is entered',
    file: 'Ticks itself when the request is filed, which closes it',
  },
  blank: () => ({ requester: '', askedOn: '', inWriting: true, ownerOfRecord: '', purpose: '', items: [], how: '', sentOn: '', withheldNote: '', filedOn: '' }),
  steps: (r) => {
    const d = r.data, logged = !!d.requester.trim() && !!d.askedOn && !!d.ownerOfRecord;
    const held = withheld(d).length;
    return stepsFrom(RECORDS_REQUEST, {
      log: [logged, logged ? `${d.requester} · asked ${d.askedOn}${d.inWriting ? ' in writing' : ''} · ${d.ownerOfRecord === 'yes' ? 'owner of record' : 'not an owner of record'}` : ''],
      choose: [decided(d), d.items.length ? `${d.items.length} item${d.items.length === 1 ? '' : 's'} · ${held} not shared in full` : '', !logged ? 'the request being logged' : ''],
      send: [!!d.sentOn, d.sentOn ? `${d.how === 'inspect' ? 'Inspection offered' : 'Copies sent'} ${d.sentOn}` : '', !decided(d) ? 'a decision on every item' : ''],
      file: [!!d.filedOn, d.filedOn ? `Filed ${d.filedOn}` : '', !d.sentOn ? 'the reply going out' : ''],
    });
  },
};
