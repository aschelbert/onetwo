import { stepsFrom, usd, type ActionKind } from './types';

export interface Bid {
  id: string;
  vendor: string;
  /** The price as bid, for the year or the job. */
  amount: number;
  /** What it would cost to add back anything the bid leaves out of the scope. */
  addBack: number;
  insuranceOk: boolean;
  licenceOk: boolean;
  warranty: string;
  references: string;
}

/** A request for proposals: the scope every bidder prices, who was asked, what came back, and the award. */
export interface BidRequestData {
  /** The scope of work, by the headings a request for proposals carries. */
  scope: { what: string; how: string; frequency: string; hours: string; crew: string; insurance: string; warranty: string; term: string };
  bidsDueOn: string;
  /** The budget line or the estimate the bids are judged against. */
  budget: number;
  minBids: number;
  invited: { vendor: string; sentOn: string }[];
  /** Questions from bidders and the answers given to all of them. */
  questions: string;
  bids: Bid[];
  recommendedBidId: string;
  reason: string;
  awardedOn: string;
  vote: string;
  contractEndsOn: string;
  contractSignedOn: string;
  /** A capital project this request is for, when it is. */
  projectId: string;
}

/** What a bid really costs once anything it left out is added back. */
export const trueCost = (b: Pick<Bid, 'amount' | 'addBack'>) => b.amount + (b.addBack || 0);
export const recommended = (d: BidRequestData) => d.bids.find(b => b.id === d.recommendedBidId);
/** The lowest like-for-like bid. */
export const lowest = (bids: Bid[]) => [...bids].sort((a, b) => trueCost(a) - trueCost(b))[0];

export const BID_REQUEST: ActionKind<BidRequestData> = {
  kind: 'bid-request', runbookId: 'bid-request', name: 'Request for proposals',
  trigger: 'A contract is ending, or a job needs quotes', blurb: 'Write one scope of work, ask vendors to bid on it, compare like for like, and award.',
  catId: 'maintenance', role: 'Vice President', visibility: 'board',
  stepTitles: [['scope', 'Write the scope of work'], ['invite', 'Invite bidders, answer questions'], ['compare', 'Compare like for like'], ['award', 'Board awards'], ['contract', 'Sign the contract']],
  how: {
    scope: 'Ticks itself when the scope says what is wanted and when bids are due',
    invite: 'Ticks itself when enough vendors have been invited',
    compare: 'Ticks itself when enough bids are in and one is recommended',
    award: "Ticks itself when the board's award date is entered",
    contract: "Ticks itself when the contract date is entered; held until the winner's insurance certificate is on file. Files the contract under Building › Contracts",
  },
  blank: () => ({ scope: { what: '', how: '', frequency: '', hours: '', crew: '', insurance: 'General liability and workers’ compensation; the association named as additional insured', warranty: '', term: '' }, bidsDueOn: '', budget: 0, minBids: 3, invited: [], questions: '', bids: [], recommendedBidId: '', reason: '', awardedOn: '', vote: '', contractEndsOn: '', contractSignedOn: '', projectId: '' }),
  steps: (r) => {
    const d = r.data, pick = recommended(d);
    return stepsFrom(BID_REQUEST, {
      scope: [!!d.scope.what.trim() && !!d.bidsDueOn, d.scope.what.trim() ? `Bids due ${d.bidsDueOn || 'not set'}` : ''],
      invite: [d.invited.length >= d.minBids, `${d.invited.length} invited${d.questions.trim() ? ' · questions answered to all' : ''}`],
      compare: [d.bids.length >= d.minBids && !!pick, `${d.bids.length} of ${d.minBids} bids${pick ? ` · ${pick.vendor} recommended at ${usd(trueCost(pick))}` : ''}`],
      award: [!!d.awardedOn, d.awardedOn ? `Awarded ${d.awardedOn}${d.vote ? ` · ${d.vote}` : ''}` : '', pick ? '' : 'a bid being recommended'],
      contract: [!!d.contractSignedOn, d.contractSignedOn ? `Signed ${d.contractSignedOn}` : '', pick && !pick.insuranceOk ? `${pick.vendor}'s insurance certificate` : !d.awardedOn ? "the board's award" : ''],
    });
  },
};
