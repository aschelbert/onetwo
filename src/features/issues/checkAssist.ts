/**
 * Every case checklist item gets something to act on.
 *
 * A checklist item used to be a label and a checkbox: "Itemize operating
 * expenses by category" with no way to see the expenses. `resolveCheck` reads
 * the label in the context of its situation and step and returns one or two
 * assists:
 *
 *  - panel     the information to review, inline under the item (live store
 *              data: budget lines, a unit's ledger, the fee schedule, policies,
 *              vendors, governing documents, the board, meetings...), or one of
 *              the step tools that already existed (the budget drafter, the
 *              reserve study, contract renewals, the bylaws review)
 *  - tool      something the case workspace does in place: send a letter or
 *              notice, record a vote, attach proof, create a work order or an
 *              invoice, schedule a meeting, add a note
 *  - route     the module and tab where the work happens; the case dock follows
 *  - external  the official place for work done outside the app (DC Code, the
 *              courts, DOB, DLCP, DISB, the Recorder of Deeds)
 *
 * The first matching rule wins; rules run from specific to general. Items no
 * rule recognises fall back to "Add a note" and "Attach proof", and the audit
 * test (`checkAssist.test.ts`) counts those so the fallback stays rare.
 */

export type PanelId =
  | 'budget-drafter' | 'reserve-study' | 'contract-renewals' | 'bylaws-review'
  | 'budget-lines' | 'financials' | 'unit-ledger' | 'delinquency' | 'fees' | 'units'
  | 'insurance' | 'vendors' | 'documents' | 'owner' | 'board' | 'counsel'
  | 'meetings' | 'assets' | 'filings';

export type ToolId = 'send-comm' | 'board-vote' | 'owner-vote' | 'upload-doc' | 'create-wo' | 'create-invoice' | 'create-meeting' | 'note';

export type Assist =
  | { kind: 'panel'; panel: PanelId; label: string }
  | { kind: 'tool'; tool: ToolId; label: string }
  | { kind: 'route'; path: string; label: string }
  | { kind: 'external'; href: string; label: string };

export interface CheckContext {
  catId: string;
  sitId: string;
  /** The step's title, for rules that depend on what the step is about. */
  step: string;
  /** The case has a unit (collections, violations, damage). */
  hasUnit: boolean;
}

export interface Resolution {
  assists: Assist[];
  /** True when no rule recognised the item and it got the generic note and proof. */
  fallback: boolean;
  rule: string;
}

// ── Destinations ────────────────────────────────────────────────────────────
export const ROUTES = {
  budget: '/funds?tab=planning&section=budget',
  draft: '/funds?tab=planning&section=draft',
  reserves: '/funds?tab=planning&section=reserves',
  ledger: '/funds?tab=income&section=ledger',
  behind: '/funds?tab=income&section=behind',
  invoices: '/funds?tab=income&section=invoices',
  bills: '/funds?tab=expenses&section=bills',
  decisions: '/funds?tab=expenses&section=decisions',
  workorders: '/funds?tab=expenses&section=workorders',
  statements: '/funds?tab=statements',
  fees: '/funds?tab=settings&section=fees',
  documents: '/building?tab=documents',
  insurance: '/building?tab=overview&section=insurance',
  assets: '/building?tab=overview&section=assets',
  obligations: '/building?tab=obligations',
  filings: '/building?tab=obligations&section=filings',
  contracts: '/building?tab=contracts',
  directory: '/building?tab=directory',
  archive: '/building?tab=archive',
  meetings: '/community?tab=meetings',
  votes: '/community?tab=votes',
  notices: '/community?tab=notices',
  log: '/community?tab=log',
  amenities: '/community?tab=amenities',
  requests: '/community?tab=requests',
  outbox: '/boardroom?tab=outbox',
} as const;

const EXT = {
  dcCode: 'https://code.dccouncil.gov/us/dc/council/code/',
  courts: 'https://www.dccourts.gov/superior-court/civil-division/small-claims',
  multiDoor: 'https://www.dccourts.gov/superior-court/multi-door-dispute-resolution-division',
  dob: 'https://dob.dc.gov/',
  dlcp: 'https://dlcp.dc.gov/',
  disb: 'https://disb.dc.gov/',
  recorder: 'https://otr.cfo.dc.gov/page/recorder-deeds',
  health: 'https://dchealth.dc.gov/',
  mpd: 'https://mpdc.dc.gov/',
  ohr: 'https://ohr.dc.gov/',
  mytax: 'https://mytax.dc.gov/',
} as const;

// ── Assist builders ─────────────────────────────────────────────────────────
const panel = (p: PanelId, label: string): Assist => ({ kind: 'panel', panel: p, label });
const tool = (t: ToolId, label: string): Assist => ({ kind: 'tool', tool: t, label });
const route = (path: string, label: string): Assist => ({ kind: 'route', path, label });
const ext = (href: string, label: string): Assist => ({ kind: 'external', href, label });

const P = {
  drafter: panel('budget-drafter', 'Open the budget drafter'),
  budget: panel('budget-lines', 'Review budget lines by category'),
  reserveStudy: panel('reserve-study', 'Review the reserve study'),
  contracts: panel('contract-renewals', 'Review contracts and renewals'),
  bylaws: panel('bylaws-review', 'Check the bylaws limits'),
  financials: panel('financials', 'Review the financial statements'),
  ledger: panel('unit-ledger', "Review the unit's ledger"),
  delinquency: panel('delinquency', 'Review who is behind'),
  fees: panel('fees', 'Review the fee schedule'),
  units: panel('units', 'Review per-unit shares'),
  insurance: panel('insurance', 'Review insurance policies'),
  vendors: panel('vendors', 'Review vendors and contracts'),
  documents: panel('documents', 'Review the governing documents'),
  owner: panel('owner', 'Review the owner and unit'),
  board: panel('board', 'Review the board and quorum'),
  counsel: panel('counsel', 'Review legal counsel'),
  meetings: panel('meetings', 'Review meetings and minutes'),
  assets: panel('assets', 'Review building assets'),
  filings: panel('filings', 'Review filings and deadlines'),
};
const T = {
  send: tool('send-comm', 'Draft and send it'),
  boardVote: tool('board-vote', 'Record the board vote'),
  ownerVote: tool('owner-vote', 'Record the owner vote'),
  upload: tool('upload-doc', 'Attach it to the case'),
  wo: tool('create-wo', 'Create a work order'),
  invoice: tool('create-invoice', 'Create an invoice'),
  meeting: tool('create-meeting', 'Schedule or link a meeting'),
  note: tool('note', 'Add a note'),
};

type Rule = { name: string; re: RegExp; assists: Assist[] | ((ctx: CheckContext) => Assist[]) };

const budgetSit = (c: CheckContext) => c.sitId === 'annual-budgeting';
/** Situations where money goes to a vendor, not from an owner. */
const VENDOR_SITS = ['vendor-management', 'common-area-repairs', 'capital-projects', 'emergency-situations', 'structural-safety', 'inspection-scheduling', 'preventative-maintenance'];

/** Ordered: the first match wins. */
const RULES: Rule[] = [
  // ── Budget drafting and reserves ─────────────────────────────────────────
  { name: 'budget-draft', re: /itemi[sz]e operating|operating expenses by category|draft(ing)? (the |a )?(proposed )?budget|proposed budget|line[- ]item budget|budget line/i,
    assists: c => budgetSit(c) ? [P.drafter, route(ROUTES.budget, 'Open Funds › Planning')] : [P.budget, route(ROUTES.budget, 'Open Funds › Planning')] },
  { name: 'contingency', re: /contingenc/i, assists: c => budgetSit(c) ? [P.drafter] : [P.budget, P.reserveStudy] },
  { name: 'delinquent-amount', re: /delinquent .*amount|amount .*delinquen/i, assists: [P.ledger, route(ROUTES.ledger, 'Open Funds › Income')] },
  { name: 'per-unit', re: /per[- ]unit|each unit'?s (share|amount)|allocat\w* (by|per|across|among) (unit|owner|percentage)|percentage interest|assessment amount|calculate .*assessment|unit share/i,
    assists: c => budgetSit(c) ? [P.drafter, P.units] : [P.units, T.invoice] },
  { name: 'reserves', re: /\breserves?\b|\bstudy\b|contribution|percent funded|funding (gap|plan|level|rate)|components?\b|replacement (cost|schedule|year)|useful life|capital (plan|projects?)/i,
    assists: [P.reserveStudy, route(ROUTES.reserves, 'Open Funds › Planning › Reserves')] },
  { name: 'budget', re: /budget|operating (cost|expense|fund)|expense (categor|line|trend)|cost (assumption|estimate|increase)|inflation|dues|assessment (increase|level)|rate (change|increase)/i,
    assists: c => budgetSit(c) ? [P.drafter, P.budget] : [P.budget, route(ROUTES.budget, 'Open Funds › Planning')] },
  { name: 'financials', re: /financial statement|balance sheet|income statement|profit|p&l|variance|budget vs\.? actual|\bactuals\b|year[- ]end|ytd|run[- ]rate|reconcil|bank (statement|account)|general ledger|prior year|financial (report|record|condition|position|health)|cash (flow|position)|revenue|financial audit|\baudit (vs|report|firm|engagement)|audit vs|cpa|accountant|compilation|review engagement|tax return|1120|1099/i,
    assists: [P.financials, route(ROUTES.statements, 'Open Funds › Statements & taxes')] },

  // ── Money owed by a unit ─────────────────────────────────────────────────
  { name: 'payment-plan', re: /payment plan|installment|instalment|payment arrangement|partial payment/i, assists: [P.ledger, T.invoice] },
  { name: 'lien-amount', re: /lien amount|itemi[sz]e (the )?lien|payoff|super[- ]priority|six months? of assessments/i, assists: [P.ledger, P.fees] },
  { name: 'charge-unit', re: /invoice|bill (the )?(owner|unit)|charge (the )?(owner|unit|back)|chargeback|back[- ]?charge|add .* to (the )?(assessment |unit )?(ledger|account|balance)|added to (the )?balance|assess (the )?(owner|cost)|recover (the )?cost|reimburse/i,
    assists: [T.invoice, P.ledger] },
  { name: 'ledger', re: /ledger|balance|past[- ]due|delinquen|arrear|amount (owed|due)|outstanding|payment history|late fee|interest (charge|accru)|statement of account|credits?\b|unpaid|collection (rate|trend)|receivable|aging/i,
    assists: c => c.hasUnit ? [P.ledger, route(ROUTES.ledger, 'Open Funds › Income')] : [P.delinquency, route(ROUTES.behind, 'Open Funds › Income › Behind')] },
  { name: 'fees', re: /fine\b|fines\b|fee schedule|processing fee|resale fee|transfer fee|fee (amount|per)|penalt/i,
    assists: [P.fees, route(ROUTES.fees, 'Open the fee schedule')] },
  { name: 'payment', re: /payment|deposit|refund|collect (the )?(fee|payment|deposit)|escrow|special assessment/i,
    assists: c => VENDOR_SITS.includes(c.sitId) ? [P.vendors, route(ROUTES.bills, 'Open Funds › Expenses › Bills')] : c.hasUnit ? [P.ledger, T.invoice] : [P.units, T.invoice] },

  { name: 'animal', re: /pet\b|pets\b|animal|dog|cat\b|esa\b|service animal|leash|bark|waste/i, assists: [P.documents, T.send] },

  { name: 'lender', re: /mortgage|servicer|lender|deed of trust|title company/i, assists: [P.owner, T.send] },

  // ── Insurance ────────────────────────────────────────────────────────────
  { name: 'vendor-insurance', re: /additional insured|workers'? comp|certificate of insurance|\bcoi\b|(contractor|vendor)('s)? (insurance|certificate)|bonded|bond(ing)? (certificate|proof)/i,
    assists: [P.vendors, tool('upload-doc', 'Attach the certificate')] },
  { name: 'disb', re: /disb|insurance commissioner|bad faith/i, assists: [P.insurance, ext(EXT.disb, 'DC Insurance (DISB)')] },
  { name: 'insurance', re: /insur|carrier|policy (language|provision)|policy (number|limit)|coverage|deductible|adjuster|claim|ho-?6|d&o|\bgl\b|umbrella|fidelity|bond(ing| claim)?\b|certificate of insurance|\bcoi\b|subrogat|loss (detail|notice|report)|proof of loss/i,
    assists: [P.insurance, route(ROUTES.insurance, 'Open Building › Insurance')] },

  // ── Votes, meetings, minutes ─────────────────────────────────────────────
  { name: 'owner-vote', re: /owner vote|ballot|owners? (approval|ratification|consent)|ratif|proxy|proxies|election|candidate|nominat|tally|recount|inspector of election|vote count|percentage of owners|2\/3|two[- ]thirds|majority of owners|written consent/i,
    assists: [T.ownerVote, route(ROUTES.votes, 'Open Community › Votes')] },
  { name: 'quorum', re: /quorum/i, assists: [P.board, P.meetings] },
  { name: 'mediation', re: /mediat|arbitrat|dispute resolution|direct resolution|settle/i, assists: [P.counsel, ext(EXT.multiDoor, 'DC Multi-Door Dispute Resolution')] },
  { name: 'board-vote', re: /board (vote|approval|resolution|authori[sz]ation|decision)|(by|via|attach|adopt\w*|copy of|obtain) (a |the )?(board )?resolution|resolution (authori|register|adopt)|motion|second\b|\bapprov(e|al)\b|vote\b|recus|abstain/i,
    assists: [T.boardVote, P.board] },
  { name: 'minutes', re: /minutes|record (it |this |the )?(in|into) (the )?(minutes|record)|meeting record/i, assists: [P.meetings, route(ROUTES.meetings, 'Open Community › Meetings')] },
  // ── Letters, notices, communications ─────────────────────────────────────
  { name: 'notice-rules', re: /notice (requirement|period|content)|requirements? for (the )?notice|notice requirements?/i, assists: [P.documents, ext(EXT.dcCode, 'DC Code')] },
  { name: 'notify-insurer', re: /notify (the )?(gl |d&o |insurance )?(carrier|insurer|broker)/i, assists: [P.insurance, T.note] },
  { name: 'send', re: /notice|letter|notify|inform|send|mail|e-?mail|written (warning|decision|response|confirmation|request|explanation)|in writing|deliver|distribut|post (it|notices?|in|on|a)|announce|communicat|respond|reply|demand|warning|explain|advise|remind|invite|publish|update (owners|residents|the community)|acknowledge/i,
    assists: [T.send, route(ROUTES.outbox, 'Open Board Room › Outbox')] },

  { name: 'meeting', re: /meeting|agenda|hearing|open session|executive session|present (to|at|the)|presentation|town hall|schedule (a |the )?(call|session|walkthrough|walk-through)/i,
    assists: [T.meeting, P.meetings] },

  // ── Governing documents and the law ──────────────────────────────────────
  { name: 'statute', re: /dc code|§|statute|the law\b|ordinance|regulation|fair housing|\bada\b|reasonable accommodation/i,
    assists: [P.documents, ext(EXT.dcCode, 'DC Code')] },
  { name: 'contract-terms', re: /contract (provision|term|clause|language)|indemnif|termination provision/i, assists: c => VENDOR_SITS.includes(c.sitId) ? [P.vendors, P.contracts] : [P.documents, T.send] },
  { name: 'governing', re: /\bcite\b|citing|bylaw|cc&r|ccr|declaration|governing doc|rules?\b|polic(y|ies)|provision|article|amend|covenant|architectural (standard|guideline|review)|guideline|standards?\b|authority|rulemaking|restriction|use restriction|appeal (body|right|process)|due process|procedure/i,
    assists: c => c.sitId === 'annual-budgeting' || /cap|limit/i.test(c.step) ? [P.bylaws, P.documents] : [P.documents, route(ROUTES.documents, 'Open Building › Documents')] },
  { name: 'records', re: /records? request|request(ed)? records|archive|prior (board )?(resolution|decision|case|instance|violation)|history|precedent|previous (instance|violation|decision)/i,
    assists: [route(ROUTES.archive, 'Open Building › Archive'), P.documents] },

  // ── Vendors, bids, work ──────────────────────────────────────────────────
  { name: 'vendor', re: /vendor|contractor|w-?9|bids?\b|proposal|quote|estimate|contract|scope of work|reference|licen[cs]e|warranty|lien waiver|punch list|change order|retainage|termination|performance|milestone|engineer|architect|consultant|professional|specialist|inspector\b|exterminator|plumber|electrician|roofer|abatement|mitigation company|restoration company/i,
    assists: [P.vendors, route(ROUTES.contracts, 'Open Building › Contracts')] },
  { name: 'work', re: /work order|repair|fix\b|remediat|replace|maintenance|service (call|request|contract)|seasonal service|dispatch|shut off|shutoff|board up|secure the|clean[- ]?up|dry\b|dried|exterminat|patch|seal\b|restore/i,
    assists: [T.wo, route(ROUTES.workorders, 'Open Funds › Work orders')] },

  // ── The building, inspections, filings ───────────────────────────────────
  { name: 'availability', re: /available (for|to) (inspection|review|owners)|owners? (may|can|to) inspect|make .* available/i, assists: [T.send, P.documents] },
  { name: 'dob', re: /\bdob\b|building permit|permit\b|citation|code (violation|compliance)|department of buildings|condemn|unsafe/i,
    assists: [P.assets, ext(EXT.dob, 'DC Department of Buildings')] },
  { name: 'resale-certificate', re: /mytax|certificate of resale|resale certificate|certificate request/i, assists: [ext(EXT.mytax, 'MyTax.DC.gov'), T.upload] },
  { name: 'filing', re: /filing|biennial|annual report|registration|dlcp|dcra|corporate|good standing|registered agent|articles of incorporation|record(ing)? (the |a )?(lien|amendment|document)|recorder of deeds|recording (cover|fee)/i,
    assists: c => /recorder|record(ing)? (the |a )?(lien|amendment|document)|recording/i.test(c.step + ' ') ? [P.filings, ext(EXT.recorder, 'DC Recorder of Deeds')] : [P.filings, ext(EXT.dlcp, 'DC Licensing (DLCP)')] },
  // Before inspections, which also match "fire": a fire drill or exit is an evacuation item.
  { name: 'evacuation', re: /evacuat|assembly (point|area)|muster|egress|exit (route|sign|map|plan)|escape route|emergency (exit|route|plan|preparedness|procedure)|fire (drill|exit|escape)|shelter[- ]in[- ]place|stairwell/i,
    assists: [panel('documents', 'Review the floor plans on file'), tool('send-comm', 'Post the routes to residents')] },
  { name: 'inspection', re: /inspect|elevator|boiler|fire|sprinkler|alarm|backflow|extinguisher|structural|facade|fa[cç]ade|roof|hvac|plumbing|electrical|equipment|asset|mold|asbestos|lead\b|radon|water (damage|intrusion|leak)|leak|crack|foundation|balcon|garage|pool|safety (equipment|hazard|issue)|hazard|condition (assessment|report)|poor condition/i,
    assists: [P.assets, route(ROUTES.obligations, 'Open Building › Obligations')] },

  // ── People ───────────────────────────────────────────────────────────────
  { name: 'court', re: /court|small claims|lawsuit|litigation|complaint|judg(e)?ment|sue\b|summons|subpoena|discovery|deposition|trial|foreclos|garnish|eviction/i,
    assists: [P.counsel, ext(EXT.courts, 'DC Superior Court')] },
  { name: 'counsel', re: /attorney|counsel|legal|lawyer|law firm|privilege/i, assists: [P.counsel, route(ROUTES.directory, 'Open Building › Directory')] },
  { name: 'police', re: /police|law enforcement|mpd|911|crime|theft|break-?in|trespass|patrol/i, assists: [ext(EXT.mpd, 'DC Police (MPD)'), route(ROUTES.log, 'Log it in the property log')] },
  { name: 'health', re: /health department|dc health|pest|rodent|bed ?bug|infest|covid|disease|outbreak|sanit|quarantine|vaccin|contagio/i,
    assists: [ext(EXT.health, 'DC Health'), T.send] },
  { name: 'discrimination', re: /discriminat|human rights|ohr\b|protected class/i, assists: [P.documents, ext(EXT.ohr, 'DC Office of Human Rights')] },
  { name: 'board', re: /board member|officer|president|treasurer|secretary|director|conflict of interest|disclos|independen|related part|fiduciary|term (limit|expir)/i,
    assists: [P.board, route(ROUTES.directory, 'Open Building › Directory')] },
  { name: 'owner', re: /owner|resident|tenant|occupant|neighbor|unit\b|units\b|household|contact|emergency contact|mortgage|lender|buyer|seller|title company|purchaser|realtor|agent|landlord|lessee|move[- ]?(in|out)|mover/i,
    assists: c => c.hasUnit ? [P.owner, route(ROUTES.directory, 'Open Building › Directory')] : [route(ROUTES.directory, 'Open Building › Directory'), P.owner] },
  { name: 'amenity', re: /amenit|gym|fitness|clubhouse|party room|community room|reservation|booking|rooftop|courtyard/i, assists: [route(ROUTES.amenities, 'Open Community › Amenities')] },
  { name: 'access', re: /access (control|card|fob|system)|key\b|keys\b|lock|camera|cctv|surveillance|intercom|gate|door/i, assists: [P.assets, route(ROUTES.log, 'Log it in the property log')] },

  // ── Evidence and record-keeping ──────────────────────────────────────────
  { name: 'evidence', re: /photo|document|evidence|witness|statement|record\b|records\b|recording|log\b|logs\b|timeline|gather|collect|attach|upload|copy|copies|receipt|proof|keep (a )?record|file (the |a |it)|signed|signature|sign\b|form\b|checklist|report\b|date[- ]?stamp|chronolog/i,
    assists: [T.upload, T.note] },
];

/** The assists for one checklist item. Never empty. */
export function resolveCheck(label: string, ctx: CheckContext): Resolution {
  const text = label.replace(/\s+—\s+(generate or upload|attach.*)$/i, '');
  const match = (t: string) => RULES.find(r => r.re.test(t));
  // The item first; an item that is a detail of its step ("State 30-day cure period" under
  // "Send formal demand letter") takes the step's assists.
  const byLabel = match(text);
  const r = byLabel ?? match(ctx.step);
  if (r) {
    const assists = typeof r.assists === 'function' ? r.assists(ctx) : r.assists;
    return { assists, fallback: false, rule: byLabel ? r.name : `step:${r.name}` };
  }
  return { assists: [T.note, T.upload], fallback: true, rule: 'fallback' };
}
