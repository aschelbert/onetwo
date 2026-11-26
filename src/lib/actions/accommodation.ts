import { daysTo, plusDays, stepsFrom, type ActionKind } from './types';

/**
 * A request for a reasonable accommodation or modification because of a
 * disability (Fair Housing Act, 42 U.S.C. § 3604(f)(3); 24 C.F.R. §§ 100.203,
 * 100.204). The record is private to the board: it carries no unit number of
 * its own, its title is a reference with no name in it, and what the resident
 * sees is kept in a separate record (`AccommodationAsk`).
 *
 * The rules here are process, not rulings: no form is required, only what is
 * needed is asked for, the board decides quickly, and a denial is held for
 * the association's lawyer. The guidance in this area changes, so the app
 * does not state fixed rules about particular requests.
 */
export type RequestKind = '' | 'accommodation' | 'modification';
export const KIND_LABEL: Record<Exclude<RequestKind, ''>, string> = { accommodation: 'A change to a rule or service', modification: 'A physical change' };
export const KIND_NOTE: Record<Exclude<RequestKind, ''>, string> = {
  accommodation: 'An assistance animal where pets are not allowed, a nearer parking space, notices in large print, a different way to pay. The association bears any cost and charges no fee.',
  modification: 'A ramp, a grab bar, an automatic door. The person asking usually pays; the board can ask for a licensed contractor and any permit. It still has to be allowed where it is reasonable.',
};

export type How = 'app' | 'email' | 'letter' | 'phone' | 'in person';
export type Need = '' | 'apparent' | 'known' | 'ask';
export const NEED_LABEL: Record<Exclude<Need, ''>, string> = { apparent: 'The need is apparent', known: 'The board already knows of it', ask: 'It is not apparent: ask for something that shows it' };

export type Decision = '' | 'grant' | 'alternative' | 'deny';
export const DECISION_LABEL: Record<Exclude<Decision, ''>, string> = { grant: 'Granted as asked', alternative: 'Granted, as something different agreed with them', deny: 'Denied' };

/** The grounds a denial may rest on. Each still needs the board's own reasons, and the lawyer's review. */
export const DENY_GROUNDS: { id: string; label: string }[] = [
  { id: 'not-disability', label: 'The request is not for, or on behalf of, a person with a disability' },
  { id: 'no-need', label: 'The change is not needed because of the disability' },
  { id: 'burden', label: 'It would be an undue cost and burden for the association' },
  { id: 'fundamental', label: 'It would change what the association fundamentally does' },
  { id: 'threat', label: 'It would be a direct threat to others that nothing else would remove' },
];

export interface AccommodationData {
  what: string;
  kind: RequestKind;
  /** The unit, kept in the data and not on the record, so the record is not readable by the unit. */
  unit: string;
  requester: string;
  /** Who asked on their behalf, when someone did. */
  onBehalfBy: string;
  how: How;
  receivedOn: string;
  /** The resident-facing record this came from, when it was made in the app. */
  askId: string;

  need: Need;
  askedOn: string;
  infoReceivedOn: string;
  /** What was provided, in a line: "a letter from her physical therapist". Never the condition itself. */
  infoNote: string;

  decision: Decision;
  decidedOn: string;
  conditions: string;
  denyGround: string;
  denyWhy: string;
  /** Before a denial: something else was discussed with them that might meet the need. */
  alternativeDiscussed: boolean;
  lawyerOn: string;
  lawyerBy: string;

  toldOn: string;
  toldHow: string;

  inPlaceOn: string;
  /** What staff are told so they can act on it, with no reason given: "space 14 is unit 304's". */
  staffNote: string;
  /** For a physical change: the permit or architectural request it went on to, in words. */
  followOn: string;
}

/** The board's own target for deciding, in days; the law gives no number. */
export const DEFAULT_TARGET_DAYS = 10;
export const dueFor = (receivedOn: string, targetDays: number) => plusDays(receivedOn, Math.max(1, targetDays));

/** Where the clock stands: days since it arrived, until the board has decided. */
export function clock(d: Pick<AccommodationData, 'receivedOn' | 'decidedOn'>, targetDays: number, today: string): { day: number; over: boolean; line: string } | null {
  if (!d.receivedOn) return null;
  const day = Math.max(0, daysTo(d.receivedOn, d.decidedOn || today));
  if (d.decidedOn) return { day, over: day > targetDays, line: `Decided in ${day} day${day === 1 ? '' : 's'}` };
  return { day, over: day > targetDays, line: day > targetDays ? `Day ${day}: past the board's ${targetDays}` : `Day ${day} of the board's ${targetDays}` };
}

/** What a denial still lacks before it can be recorded; '' when it is complete. */
export function denialHold(d: AccommodationData): string {
  if (d.decision !== 'deny') return '';
  if (!d.denyGround) return 'the ground it rests on';
  if (!d.denyWhy.trim()) return "the board's reasons, in its own words";
  if (!d.alternativeDiscussed) return 'something else being discussed with them first';
  if (!d.lawyerOn) return "the lawyer's review";
  return '';
}

/** The letter that tells them the decision. Says what was decided and any conditions; never the reason the request was made. */
export function decisionLetter(d: AccommodationData, building: string, signedBy: string): string {
  const head = `${d.decidedOn}\n\n${d.requester}${d.unit ? `\nUnit ${d.unit}` : ''}\n\nRe: your request of ${d.receivedOn}\n\n`;
  const asked = `You asked: ${d.what.trim()}\n\n`;
  const body = d.decision === 'grant' ? `The board has granted your request as asked.${d.conditions.trim() ? ` ${d.conditions.trim()}.` : ''}`
    : d.decision === 'alternative' ? `The board has agreed the following with you: ${d.conditions.trim()}.`
    : `The board is not able to grant this request. ${d.denyWhy.trim()}${/[.!?]$/.test(d.denyWhy.trim()) ? '' : '.'} If your circumstances change, or there is something else that would meet your need, please tell us and the board will look at it again.`;
  const fee = d.decision !== 'deny' && d.kind === 'accommodation' ? '\n\nThere is no fee or deposit for this.' : '';
  return `${head}${asked}${body}${fee}\n\nThis is kept private: it is not shared with other owners.\n\n${signedBy}\nfor the board of ${building}`;
}

export const ACCOMMODATION: ActionKind<AccommodationData> = {
  kind: 'accommodation', runbookId: 'accommodation-request', name: 'Accommodation request',
  trigger: 'A resident asks for a change because of a disability, in the app or any other way', blurb: 'Handle a request for an accommodation or a physical change: privately, quickly, and with the reasons on record.',
  catId: 'governance', role: 'President', visibility: 'board',
  stepTitles: [['log', 'Log the request as it came'], ['ask', 'Ask only for what is needed'], ['decide', 'Decide'], ['tell', 'Tell them in writing'], ['place', 'Put it in place']],
  how: {
    log: 'Ticks itself when what was asked, who asked and the date it arrived are entered',
    ask: 'Ticks itself when the need is apparent or known, or when what was asked for has arrived',
    decide: "Ticks itself when the decision and its date are recorded; a denial is held for its reasons and the lawyer's review",
    tell: 'Ticks itself when the date they were told is entered',
    place: 'Ticks itself when the change is in place, or at once for a denial',
  },
  blank: () => ({
    what: '', kind: '', unit: '', requester: '', onBehalfBy: '', how: 'email', receivedOn: '', askId: '',
    need: '', askedOn: '', infoReceivedOn: '', infoNote: '',
    decision: '', decidedOn: '', conditions: '', denyGround: '', denyWhy: '', alternativeDiscussed: false, lawyerOn: '', lawyerBy: '',
    toldOn: '', toldHow: '', inPlaceOn: '', staffNote: '', followOn: '',
  }),
  steps: (r) => {
    const d = r.data;
    const logged = !!d.what.trim() && !!d.kind && !!d.requester.trim() && !!d.receivedOn;
    const shown = d.need === 'apparent' || d.need === 'known' || (d.need === 'ask' && !!d.infoReceivedOn);
    const hold = denialHold(d);
    const decided = !!d.decision && !!d.decidedOn && !hold && (d.decision !== 'alternative' || !!d.conditions.trim());
    return stepsFrom(ACCOMMODATION, {
      log: [logged, logged ? `${d.receivedOn} · ${d.how === 'app' ? 'in the app' : `by ${d.how}`}${d.onBehalfBy ? ` · asked by ${d.onBehalfBy}` : ''} · ${KIND_LABEL[d.kind as Exclude<RequestKind, ''>].toLowerCase()}` : ''],
      ask: [shown, d.need === 'ask' ? (d.infoReceivedOn ? `Asked ${d.askedOn || 'for it'}, received ${d.infoReceivedOn}` : d.askedOn ? `Asked ${d.askedOn}: waiting for it` : 'Not asked for yet') : d.need ? NEED_LABEL[d.need] : '', logged ? '' : 'the request being logged'],
      decide: [decided, decided ? `${DECISION_LABEL[d.decision as Exclude<Decision, ''>]} · ${d.decidedOn}` : d.decision === 'deny' && hold ? `A denial waits on ${hold}` : '', shown ? (d.decision === 'deny' ? hold : '') : 'what shows the need'],
      tell: [!!d.toldOn, d.toldOn ? `Told ${d.toldOn}${d.toldHow ? ` · ${d.toldHow}` : ''}` : '', decided ? '' : 'the decision'],
      place: [(d.decision === 'deny' && !!d.toldOn) || !!d.inPlaceOn, d.decision === 'deny' ? (d.toldOn ? 'Nothing to put in place' : '') : d.inPlaceOn ? `In place ${d.inPlaceOn}` : '', d.toldOn ? '' : 'them being told'],
    });
  },
};

// ── What the person who asked sees ───────────────────────────────────────────
/**
 * The resident's own record of a request made in the app: their words, and
 * where it stands. It carries the unit number so the people in that unit can
 * read it; nothing the board wrote is here until the decision has been sent.
 */
export interface AccommodationAsk {
  what: string;
  kind: RequestKind;
  by: string;
  /** The account that made it. */
  byUser: string;
  onBehalfOf: string;
  askedOn: string;
  stage: 'received' | 'more-needed' | 'deciding' | 'decided' | 'in-place';
  /** Filled in once they have been told. */
  decision: Decision;
  decidedOn: string;
  conditions: string;
  /** The board's private record, once it has picked the request up. */
  recordId: string;
}
export const ASK_KIND = 'accommodation-ask';
export const STAGE_LABEL: Record<AccommodationAsk['stage'], string> = { received: 'Received', 'more-needed': 'The board has asked you for something', deciding: 'With the board', decided: 'Decided', 'in-place': 'In place' };

/** Where a request stands as the person who asked may see it. The decision shows only once they have been told. */
export function askView(d: AccommodationData): Pick<AccommodationAsk, 'stage' | 'decision' | 'decidedOn' | 'conditions'> {
  const told = !!d.toldOn;
  const stage: AccommodationAsk['stage'] = told ? (d.inPlaceOn ? 'in-place' : 'decided') : d.need === 'ask' && !d.infoReceivedOn && !!d.askedOn ? 'more-needed' : d.need ? 'deciding' : 'received';
  return { stage, decision: told ? d.decision : '', decidedOn: told ? d.decidedOn : '', conditions: told && d.decision !== 'deny' ? d.conditions : '' };
}
