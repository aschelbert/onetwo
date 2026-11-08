/**
 * Building setup, the model: what a document reading returns, how the
 * readings of several documents merge into items to review, and how much of
 * setup is done. Pure functions only, so it can be tested without stores.
 *
 * A reading (`ReadResult`) is what the read-setup-document edge function
 * returns for one file. `buildItems` merges every reading into one list of
 * items keyed by what they describe (a fact such as the late fee, a unit, a
 * board member, a policy, a vendor, a budget line, a reserve component).
 * When two documents give different values for the same field, the item
 * carries a conflict for a person to settle. Nothing is saved until an item
 * is accepted (`useSetupStore`), and accepting writes through the app's own
 * stores (`applySetup`).
 */

export type DocType =
  | 'bylaws' | 'declaration' | 'rules' | 'budget' | 'financial_statement' | 'bank_statement'
  | 'reserve_study' | 'insurance' | 'contract' | 'owner_list' | 'minutes' | 'other';

export type Confidence = 'high' | 'low';
interface SourceBits { page: number | null; quote: string; confidence: Confidence }

export const FACT_KEYS = [
  'building_name', 'street', 'city', 'state', 'zip', 'year_built', 'total_units', 'floors', 'building_type',
  'fiscal_year_end', 'assessment_due_day', 'late_fee', 'grace_period_days', 'board_quorum', 'owner_quorum_pct',
  'owner_vote_threshold_pct', 'owner_meeting_notice', 'annual_meeting_month', 'board_size', 'board_term_years',
  'assessment_cap_pct', 'board_spending_limit', 'monthly_assessment_total', 'management_company',
  'operating_balance', 'reserve_balance', 'balance_as_of', 'pet_rule', 'rental_rule', 'fine_amount',
] as const;
export type FactKey = typeof FACT_KEYS[number];

export interface FactRow extends SourceBits { key: FactKey; value: string; number: number | null }
export interface UnitRow extends SourceBits { unit: string; owner: string; email: string | null; phone: string | null; mailingAddress: string | null; ownershipPct: number | null; monthlyFee: number | null }
export interface BoardRow extends SourceBits { name: string; role: string; email: string | null; phone: string | null; termEnds: string | null }
export interface InsuranceRow extends SourceBits { type: string; carrier: string; policyNumber: string | null; coverage: string | null; premium: number | null; expires: string | null }
export interface VendorRow extends SourceBits { name: string; service: string; contact: string | null; phone: string | null; email: string | null; contractEnds: string | null; annualCost: number | null }
export interface BudgetRow extends SourceBits { category: string; annualAmount: number }
/** A clause of the bylaws or rules: board duties, an officer's duties, what owners must do, or a rule for residents. */
export type ClauseTopic = 'board' | 'officer' | 'owners' | 'rules';
export interface ClauseRow extends SourceBits { topic: ClauseTopic; role: string | null; ref: string; heading: string; text: string }
export interface ReserveRow extends SourceBits { component: string; estimatedCost: number | null; usefulLifeYears: number | null; remainingLifeYears: number | null }

export interface ReadResult {
  docType: DocType;
  title: string;
  pageCount: number | null;
  summary: string;
  facts: FactRow[];
  units: UnitRow[];
  board: BoardRow[];
  insurance: InsuranceRow[];
  vendors: VendorRow[];
  budget: BudgetRow[];
  reserves: ReserveRow[];
  /** Clauses (bylaws, declaration, rules); absent for spreadsheets. */
  clauses?: ClauseRow[];
}

/** reading: being opened; read: items found to review; filed: kept in Building › Documents with nothing found; error: couldn't be opened. */
export type DocStatus = 'reading' | 'read' | 'filed' | 'error';
export interface SetupDoc {
  id: string;
  name: string;
  size: number;
  mediaType: string;
  status: DocStatus;
  error?: string;
  addedAt: string;
  result?: ReadResult;
  /** What the document is (guessed from the name for filed documents; the person can change it). */
  docType?: DocType;
  /** A line about what happened (for filed documents). */
  note?: string;
  /** Text pasted in rather than a file. */
  pasted?: boolean;
  /** Filed in Building › Documents (the legal document id). */
  filedAs?: string;
}

export type Section = 'profile' | 'rules' | 'units' | 'board' | 'duties' | 'obligations' | 'houserules' | 'insurance' | 'vendors' | 'budget' | 'reserves' | 'accounts';
export const SECTIONS: { id: Section; label: string }[] = [
  { id: 'profile', label: 'Building profile' },
  { id: 'units', label: 'Units and ownership' },
  { id: 'board', label: 'Board and officers' },
  { id: 'duties', label: 'Board and officer duties' },
  { id: 'obligations', label: 'Owner obligations' },
  { id: 'houserules', label: 'Rules for residents' },
  { id: 'rules', label: 'Rules and money' },
  { id: 'accounts', label: 'Bank balances' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'vendors', label: 'Vendors and contracts' },
  { id: 'budget', label: 'Budget' },
  { id: 'reserves', label: 'Reserves' },
];

export const FACT_LABEL: Record<FactKey, string> = {
  building_name: 'Building name', street: 'Street address', city: 'City', state: 'State', zip: 'ZIP code',
  year_built: 'Year built', total_units: 'Number of units', floors: 'Floors', building_type: 'Building type',
  fiscal_year_end: 'Fiscal year ends', assessment_due_day: 'Assessment due day', late_fee: 'Late fee',
  grace_period_days: 'Grace period', board_quorum: 'Board quorum', owner_quorum_pct: 'Owner meeting quorum',
  owner_vote_threshold_pct: 'Owner vote to pass', owner_meeting_notice: 'Owner meeting notice',
  annual_meeting_month: 'Annual meeting', board_size: 'Board size', board_term_years: 'Board terms',
  assessment_cap_pct: 'Assessment increase cap', board_spending_limit: 'Board spending limit',
  monthly_assessment_total: 'Monthly assessments, all units', management_company: 'Management company',
  operating_balance: 'Operating account balance', reserve_balance: 'Reserve account balance', balance_as_of: 'Balances as of',
  pet_rule: 'Pets', rental_rule: 'Rentals', fine_amount: 'Fine for a rules violation',
};

const FACT_SECTION: Record<FactKey, Section> = {
  building_name: 'profile', street: 'profile', city: 'profile', state: 'profile', zip: 'profile', year_built: 'profile',
  total_units: 'profile', floors: 'profile', building_type: 'profile', fiscal_year_end: 'profile', management_company: 'profile',
  assessment_due_day: 'rules', late_fee: 'rules', grace_period_days: 'rules', board_quorum: 'rules', owner_quorum_pct: 'rules',
  owner_vote_threshold_pct: 'rules', owner_meeting_notice: 'rules', annual_meeting_month: 'rules', board_size: 'rules',
  board_term_years: 'rules', assessment_cap_pct: 'rules', board_spending_limit: 'rules', monthly_assessment_total: 'rules',
  pet_rule: 'rules', rental_rule: 'rules', fine_amount: 'rules',
  operating_balance: 'accounts', reserve_balance: 'accounts', balance_as_of: 'accounts',
};

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  bylaws: 'Bylaws', declaration: 'Declaration', rules: 'Rules and regulations', budget: 'Budget',
  financial_statement: 'Financial statement', bank_statement: 'Bank statement', reserve_study: 'Reserve study',
  insurance: 'Insurance', contract: 'Contract', owner_list: 'Owner list', minutes: 'Meeting minutes', other: 'Other document',
};

/**
 * What to upload. Spreadsheets (`imports`) become items to review; the rest
 * are filed in Building › Documents and their settings asked in Fill the gaps.
 */
export const DOC_KINDS: { id: string; label: string; types: DocType[]; imports: boolean; fills: string[] }[] = [
  { id: 'governing', label: 'Declaration and bylaws (PDF)', types: ['bylaws', 'declaration'], imports: true, fills: ['Board and officer duties', 'Owner obligations', 'Rules for residents', 'Quorum and notice rules', 'Assessment due day', 'Late fees', 'Unit ownership table'] },
  { id: 'owners', label: 'Owner list (Excel, CSV or PDF)', types: ['owner_list'], imports: true, fills: ['Units', 'Owners and contacts', 'Ownership %', 'Monthly assessments', 'Invites'] },
  { id: 'budget', label: "This year's budget (Excel, CSV or PDF)", types: ['budget'], imports: true, fills: ['Budget lines by category'] },
  { id: 'minutes', label: 'Minutes of the last annual meeting', types: ['minutes'], imports: true, fills: ['Board and officers'] },
  { id: 'rules', label: 'Rules and regulations', types: ['rules'], imports: true, fills: ['Rules for residents', 'Fines', 'Late fees'] },
  { id: 'insurance', label: 'Insurance declarations pages', types: ['insurance'], imports: true, fills: ['Carrier and policy number', 'Limits', 'Renewal date'] },
  { id: 'reserves', label: 'Reserve study', types: ['reserve_study'], imports: true, fills: ['Reserve components', 'Useful life and cost'] },
  { id: 'statements', label: 'Bank or year-end statements', types: ['financial_statement', 'bank_statement'], imports: true, fills: ['Opening balances'] },
  { id: 'contracts', label: 'Management and vendor contracts', types: ['contract'], imports: false, fills: ['Kept in Building › Documents'] },
];

// ── Items ──────────────────────────────────────────────────────────

export interface Source { docId: string; docName: string; page: number | null; quote: string; confidence: Confidence }
export type FieldScalar = string | number;
export interface FieldValue { value: FieldScalar; display: string; sources: Source[] }

export interface Item {
  key: string;
  section: Section;
  label: string;
  /** Distinct values per field, in the order first seen. */
  fields: Record<string, FieldValue[]>;
  /** Fields where documents disagree. */
  conflicts: string[];
  lowConfidence: boolean;
}

export const FIELD_LABEL: Record<string, string> = {
  value: 'Value', owner: 'Owner', email: 'Email', phone: 'Phone', mailingAddress: 'Mailing address', ownershipPct: 'Ownership',
  monthlyFee: 'Monthly assessment', role: 'Office', termEnds: 'Term ends', carrier: 'Carrier', policyNumber: 'Policy number',
  coverage: 'Coverage', premium: 'Premium', expires: 'Expires', service: 'Service', contact: 'Contact', contractEnds: 'Contract ends',
  annualCost: 'Annual cost', annualAmount: 'Annual amount', estimatedCost: 'Replacement cost', usefulLifeYears: 'Useful life',
  remainingLifeYears: 'Years left', text: 'Clause', ref: 'Section',
};

const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
function displayOf(field: string, v: FieldScalar): string {
  if (typeof v === 'string') return v;
  if (field === 'ownershipPct') return `${v}%`;
  if (['monthlyFee', 'premium', 'annualCost', 'annualAmount', 'estimatedCost'].includes(field)) return money(v);
  if (field === 'usefulLifeYears' || field === 'remainingLifeYears') return `${v} years`;
  return String(v);
}
const norm = (v: FieldScalar) => (typeof v === 'number' ? String(Math.round(v * 100) / 100) : v.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.,;]+$/, ''));
const keyPart = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** Unit numbers compare without "Unit", spaces or a leading # ("Unit #1A" = "1a"). */
export const unitKey = (s: string) => s.trim().toLowerCase().replace(/^unit\s*/, '').replace(/^#/, '').replace(/\s+/g, '');

function addValue(item: Item, field: string, v: FieldScalar | null | undefined, src: Source, display?: string) {
  if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) return;
  const list = item.fields[field] ?? (item.fields[field] = []);
  const hit = list.find(x => norm(x.value) === norm(v));
  if (hit) hit.sources.push(src);
  else list.push({ value: v, display: display || displayOf(field, v), sources: [src] });
  if (src.confidence === 'low') item.lowConfidence = true;
}

/** Every reading merged into items to review, in section order. */
export function buildItems(docs: SetupDoc[]): Item[] {
  const map = new Map<string, Item>();
  const get = (key: string, section: Section, label: string) => {
    let it = map.get(key);
    if (!it) { it = { key, section, label, fields: {}, conflicts: [], lowConfidence: false }; map.set(key, it); }
    return it;
  };
  for (const d of docs) {
    const r = d.result;
    if (d.status !== 'read' || !r) continue;
    const src = (row: SourceBits): Source => ({ docId: d.id, docName: r.title || d.name, page: row.page, quote: row.quote, confidence: row.confidence });
    for (const f of r.facts ?? []) {
      if (!FACT_LABEL[f.key]) continue;
      // Compare by the number when there is one, but show the words ("10% after 15 days", not "10").
      addValue(get(`fact:${f.key}`, FACT_SECTION[f.key], FACT_LABEL[f.key]), 'value', f.number ?? f.value, src(f), f.value);
    }
    for (const u of r.units ?? []) {
      if (!u.unit?.trim()) continue;
      const it = get(`unit:${unitKey(u.unit)}`, 'units', `Unit ${u.unit.replace(/^unit\s*/i, '').trim()}`);
      const s = src(u);
      addValue(it, 'owner', u.owner, s); addValue(it, 'email', u.email, s); addValue(it, 'phone', u.phone, s);
      addValue(it, 'mailingAddress', u.mailingAddress, s); addValue(it, 'ownershipPct', u.ownershipPct, s); addValue(it, 'monthlyFee', u.monthlyFee, s);
    }
    for (const b of r.board ?? []) {
      if (!b.name?.trim()) continue;
      const it = get(`board:${keyPart(b.name)}`, 'board', b.name.trim());
      const s = src(b);
      addValue(it, 'role', b.role, s); addValue(it, 'email', b.email, s); addValue(it, 'phone', b.phone, s); addValue(it, 'termEnds', b.termEnds, s);
    }
    for (const p of r.insurance ?? []) {
      if (!p.type?.trim()) continue;
      const it = get(`ins:${keyPart(p.type)}`, 'insurance', p.type.trim());
      const s = src(p);
      addValue(it, 'carrier', p.carrier, s); addValue(it, 'policyNumber', p.policyNumber, s); addValue(it, 'coverage', p.coverage, s);
      addValue(it, 'premium', p.premium, s); addValue(it, 'expires', p.expires, s);
    }
    for (const v of r.vendors ?? []) {
      if (!v.name?.trim()) continue;
      const it = get(`vendor:${keyPart(v.name)}`, 'vendors', v.name.trim());
      const s = src(v);
      addValue(it, 'service', v.service, s); addValue(it, 'contact', v.contact, s); addValue(it, 'phone', v.phone, s);
      addValue(it, 'email', v.email, s); addValue(it, 'contractEnds', v.contractEnds, s); addValue(it, 'annualCost', v.annualCost, s);
    }
    for (const l of r.budget ?? []) {
      if (!l.category?.trim()) continue;
      addValue(get(`budget:${keyPart(l.category)}`, 'budget', l.category.trim()), 'annualAmount', l.annualAmount, src(l));
    }
    for (const c of r.clauses ?? []) {
      const section: Section = c.topic === 'owners' ? 'obligations' : c.topic === 'rules' ? 'houserules' : 'duties';
      const label = c.role && c.heading.toLowerCase().replace(/-/g, ' ') === c.role.toLowerCase() ? `${c.role} duties` : `${c.role ? `${c.role} · ` : ''}${c.heading}`;
      const it = get(`clause:${c.topic}:${keyPart(`${c.role ?? ''} ${c.heading}`)}`, section, label);
      const s = src(c);
      addValue(it, 'text', c.text, s);
      if (c.ref) addValue(it, 'ref', c.ref, s);
      if (c.role) addValue(it, 'role', c.role, s);
    }
    for (const x of r.reserves ?? []) {
      if (!x.component?.trim()) continue;
      const it = get(`reserve:${keyPart(x.component)}`, 'reserves', x.component.trim());
      const s = src(x);
      addValue(it, 'estimatedCost', x.estimatedCost, s); addValue(it, 'usefulLifeYears', x.usefulLifeYears, s); addValue(it, 'remainingLifeYears', x.remainingLifeYears, s);
    }
  }
  const order = new Map(SECTIONS.map((s, i) => [s.id, i]));
  const items = [...map.values()].filter(it => Object.keys(it.fields).length > 0);
  for (const it of items) it.conflicts = Object.entries(it.fields).filter(([, vals]) => vals.length > 1).map(([f]) => f);
  return items.sort((a, b) => (order.get(a.section)! - order.get(b.section)!) || (a.section === 'units' ? a.label.localeCompare(b.label, undefined, { numeric: true }) : 0));
}

// ── Decisions ──────────────────────────────────────────────────────

export interface Decision { status: 'accepted' | 'skipped'; picks?: Record<string, number>; edits?: Record<string, FieldScalar>; savedTo?: string; at: string }

/** The value an item resolves to: the picked value where documents disagree, else the only one. */
export function resolve(item: Item, picks?: Record<string, number>, edits?: Record<string, FieldScalar>): Record<string, FieldScalar> {
  const out: Record<string, FieldScalar> = {};
  for (const [f, vals] of Object.entries(item.fields)) out[f] = edits?.[f] ?? vals[Math.min(picks?.[f] ?? 0, vals.length - 1)].value;
  return out;
}

/** An item that can go in with the bulk accept: one value per field and nothing read with low confidence. */
export const isClear = (it: Item) => it.conflicts.length === 0 && !it.lowConfidence;

/** One line that says what an item holds. */
export function itemSummary(it: Item, picks?: Record<string, number>): string {
  const v = (f: string) => { const vals = it.fields[f]; return vals ? vals[Math.min(picks?.[f] ?? 0, vals.length - 1)].display : null; };
  switch (it.section) {
    case 'units': return [v('owner'), v('ownershipPct'), v('monthlyFee') && `${v('monthlyFee')} a month`].filter(Boolean).join(' · ');
    case 'board': return [v('role'), v('email'), v('termEnds') && `term ends ${v('termEnds')}`].filter(Boolean).join(' · ');
    case 'insurance': return [v('carrier'), v('coverage'), v('expires') && `expires ${v('expires')}`].filter(Boolean).join(' · ');
    case 'vendors': return [v('service'), v('contact'), v('contractEnds') && `contract ends ${v('contractEnds')}`].filter(Boolean).join(' · ');
    case 'budget': return `${v('annualAmount')} a year`;
    case 'duties':
    case 'obligations':
    case 'houserules': { const t = v('text') ?? ''; return `${v('ref') ? `${v('ref')} · ` : ''}${t.length > 240 ? `${t.slice(0, 239)}…` : t}`; }
    case 'reserves': return [v('estimatedCost'), v('usefulLifeYears') && `${v('usefulLifeYears')} life`, v('remainingLifeYears') && `${v('remainingLifeYears')} left`].filter(Boolean).join(' · ');
    default: return v('value') ?? '';
  }
}

// ── Progress ───────────────────────────────────────────────────────

export interface Essentials { profile: boolean; units: boolean; board: boolean; assessment: boolean }

/** The four things a building needs before it goes live. */
export function essentials(s: { name: string; street: string; unitCount: number; boardCount: number; assessedUnits: number }): Essentials {
  return {
    profile: !!s.name.trim() && !!s.street.trim(),
    units: s.unitCount > 0,
    board: s.boardCount > 0,
    assessment: s.unitCount > 0 && s.assessedUnits === s.unitCount,
  };
}

export type StepId = 'documents' | 'review' | 'gaps' | 'invite' | 'live';
export const STEPS: { id: StepId; label: string }[] = [
  { id: 'documents', label: 'Documents' },
  { id: 'review', label: 'Review what we found' },
  { id: 'gaps', label: 'Fill the gaps' },
  { id: 'invite', label: 'Invite people' },
  { id: 'live', label: 'Go live' },
];

/** Overall progress: documents read, items decided, essentials in place. */
export function progress(docs: SetupDoc[], items: Item[], decided: number, ess: Essentials): number {
  const docsPart = docs.length === 0 ? 0 : docs.filter(d => d.status !== 'reading').length / docs.length;
  const reviewPart = items.length === 0 ? (docs.length ? 1 : 0) : decided / items.length;
  const essPart = Object.values(ess).filter(Boolean).length / 4;
  return Math.round((docsPart * 0.2 + reviewPart * 0.4 + essPart * 0.4) * 100);
}

// ── What a document holds, and where it goes ──────────────────────

/** Where accepted items land in the app (the confirmation after Accept links here). */
export const DESTINATIONS: { match: RegExp; path: string }[] = [
  { match: /^Building profile/, path: '/building' },
  { match: /^Building › Directory/, path: '/building?tab=directory' },
  { match: /^Funds › Accounts and ledger · billing rules/, path: '/funds?tab=settings' },
  { match: /^Funds › opening balance/, path: '/funds?tab=settings&section=ledger' },
  { match: /^Building › Obligations · duties and roles/, path: '/building?tab=obligations&section=duties' },
  { match: /^Building › Documents · insurance/, path: '/building?tab=documents&section=certificates' },
  { match: /^Building › Contracts/, path: '/building?tab=contracts' },
  { match: /^Funds › Planning · budget/, path: '/funds?tab=planning&section=budget' },
  { match: /^Funds › Planning · reserves/, path: '/funds?tab=planning&section=reserves' },
];
export const pathFor = (savedTo?: string) => (savedTo ? DESTINATIONS.find(d => d.match.test(savedTo))?.path : undefined);

/** Where each review section's items go, said once at the top of the section. */
export const SECTION_GOES: Record<Section, string> = {
  profile: 'Building profile',
  units: 'Building › Directory · units',
  board: 'Building › Directory · board',
  duties: 'Building › Obligations · duties and roles',
  obligations: 'Building › Obligations · duties and roles',
  houserules: 'Building › Obligations · duties and roles',
  rules: 'Funds › Accounts and ledger · billing rules, and Building › Obligations · duties and roles',
  accounts: 'Funds › opening balance',
  insurance: 'Building › Documents · insurance',
  vendors: 'Building › Contracts',
  budget: 'Funds › Planning · budget',
  reserves: 'Funds › Planning · reserves',
};

const MONEY_FACTS: FactKey[] = ['late_fee', 'grace_period_days', 'assessment_due_day'];
const RULE_FACTS: FactKey[] = ['pet_rule', 'rental_rule', 'fine_amount'];
const BALANCE_FACTS: FactKey[] = ['operating_balance', 'reserve_balance', 'balance_as_of'];

export interface Coverage { kind: string; label: string; count: number; unit: string; pages: string; goes: string }

const pageSpan = (rows: { page: number | null }[]) => {
  const ps = [...new Set(rows.map(r => r.page).filter((p): p is number => p !== null))].sort((a, b) => a - b);
  if (!ps.length) return '';
  return ps.length === 1 ? `p.${ps[0]}` : ps[ps.length - 1] - ps[0] === ps.length - 1 ? `pp.${ps[0]}–${ps[ps.length - 1]}` : `pp.${ps.slice(0, 4).join(', ')}${ps.length > 4 ? '…' : ''}`;
};

/**
 * Which of the documents setup asks for this one actually contains, judged by
 * what was read from it, not by its name. Bylaws often hold an ownership
 * table (the owner list), use restrictions (the rules) and the officers.
 */
export function coverage(r: ReadResult): Coverage[] {
  const clauses = r.clauses ?? [];
  const governing = [...r.facts.filter(f => !RULE_FACTS.includes(f.key) && !BALANCE_FACTS.includes(f.key)), ...clauses.filter(c => c.topic !== 'rules')];
  const rules = [...r.facts.filter(f => RULE_FACTS.includes(f.key)), ...clauses.filter(c => c.topic === 'rules')];
  const balances = r.facts.filter(f => BALANCE_FACTS.includes(f.key));
  const out: Coverage[] = [];
  const add = (kind: string, rows: { page: number | null }[], unit: string, goes: string) => {
    if (rows.length) out.push({ kind, label: DOC_KINDS.find(k => k.id === kind)?.label.replace(/ \(.*\)$/, '') ?? kind, count: rows.length, unit, pages: pageSpan(rows), goes });
  };
  add('governing', governing, governing.length === 1 ? 'setting or clause' : 'settings and clauses', r.facts.some(f => MONEY_FACTS.includes(f.key)) ? 'Billing rules · Duties and roles' : 'Duties and roles');
  add('owners', r.units, r.units.length === 1 ? 'unit' : 'units', 'Building › Directory');
  add('minutes', r.board, r.board.length === 1 ? 'board member' : 'board members', 'Building › Directory');
  add('rules', rules, rules.length === 1 ? 'rule' : 'rules', 'Duties and roles · Rules for residents');
  add('budget', r.budget, r.budget.length === 1 ? 'budget line' : 'budget lines', 'Funds › Planning');
  add('insurance', r.insurance, r.insurance.length === 1 ? 'policy' : 'policies', 'Building › Documents');
  add('reserves', r.reserves, r.reserves.length === 1 ? 'reserve item' : 'reserve items', 'Funds › Planning');
  add('statements', balances, 'balances', 'Funds › opening balance');
  return out;
}
