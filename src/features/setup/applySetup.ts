/**
 * Building setup, writing: an accepted item goes into the building's own
 * records through the stores' existing actions (which also save to the
 * database), so nothing about setup is a separate copy. Also files each
 * read document in Building › Documents and fills the gaps step's answers.
 */
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { priorMonthEnd } from '@/lib/ledger';
import { DOC_CATALOGUE, entryFor, pathOf, placeFile, sameDocument, setFilePlaces, unplaceFile } from '@/features/building/documentCatalogue';
import { resolve, unitKey, type DocType, type FieldScalar, type Item, type SetupDoc, DOC_TYPE_LABEL } from './setupModel';

const num = (v: FieldScalar | undefined): number | null => {
  if (v === undefined) return null;
  if (typeof v === 'number') return v;
  const m = /-?[\d,]*\.?\d+/.exec(v);
  return m ? Number(m[0].replace(/,/g, '')) : null;
};
const text = (v: FieldScalar | undefined) => (v === undefined ? '' : String(v));

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
/** "December 31", "12/31", "2026-12-31" → "12-31". */
export function monthDay(v: string): string | null {
  const iso = /^\d{4}-(\d{2})-(\d{2})$/.exec(v.trim());
  if (iso) return `${iso[1]}-${iso[2]}`;
  const slash = /^(\d{1,2})\/(\d{1,2})/.exec(v.trim());
  if (slash) return `${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;
  const words = v.toLowerCase();
  const mi = MONTHS.findIndex(m => words.includes(m));
  if (mi < 0) return null;
  const day = /\b(\d{1,2})\b/.exec(words)?.[1] ?? String(new Date(2001, mi + 1, 0).getDate());
  return `${String(mi + 1).padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Write an accepted item into the building. Returns where it went, for the
 * confirmation line ("Saved to Funds › Budget").
 */
export function applyItem(item: Item, picks?: Record<string, number>, edits?: Record<string, FieldScalar>): string {
  const b = useBuildingStore.getState();
  const f = useFinancialStore.getState();
  const v = resolve(item, picks, edits);
  const key = item.key.split(':')[1];

  switch (item.section) {
    case 'profile':
    case 'rules':
    case 'accounts': {
      const value = v.value;
      switch (key) {
        case 'building_name': b.updateName(text(value)); return 'Building profile';
        case 'street': b.updateAddress({ street: text(value) }); return 'Building profile';
        case 'city': b.updateAddress({ city: text(value) }); return 'Building profile';
        case 'state': b.updateAddress({ state: text(value) }); return 'Building profile';
        case 'zip': b.updateAddress({ zip: text(value) }); return 'Building profile';
        case 'year_built': b.updateDetails({ yearBuilt: text(num(value) ?? value) }); return 'Building profile';
        case 'total_units': { const n = num(value); if (n) b.updateDetails({ totalUnits: n }); return 'Building profile'; }
        case 'floors': { const n = num(value); if (n) b.updateDetails({ floors: n }); return 'Building profile'; }
        case 'building_type': b.updateDetails({ type: text(value) }); return 'Building profile';
        case 'fiscal_year_end': { const md = monthDay(text(value)); if (md) b.updateDetails({ fiscalYearEnd: md }); return 'Building profile'; }
        case 'management_company': b.updateManagement({ company: text(value) }); return 'Building › Directory · management';
        case 'late_fee': { const n = num(value); if (n !== null) f.setLateFeeSettings(true, n, f.lateFeeGraceDays); return 'Funds › Accounts and ledger · billing rules'; }
        case 'grace_period_days': { const n = num(value); if (n !== null) f.setLateFeeSettings(f.lateFeeEnabled, f.lateFeeAmount, n); return 'Funds › Accounts and ledger · billing rules'; }
        case 'assessment_due_day': { const n = num(value); if (n && n >= 1 && n <= 28) f.setHoaDueDay(n); return 'Funds › Accounts and ledger · billing rules'; }
        case 'owner_quorum_pct': { const n = num(value); if (n !== null) b.updateBylawsConfig({ quorumPct: n }); return governanceClause(item, 'board', picks, edits); }
        case 'owner_vote_threshold_pct': { const n = num(value); if (n !== null) b.updateBylawsConfig({ ownerVoteThreshold: n }); return governanceClause(item, 'board', picks, edits); }
        case 'assessment_cap_pct': { const n = num(value); if (n !== null) b.updateBylawsConfig({ assessmentCapPct: n }); return governanceClause(item, 'board', picks, edits); }
        case 'board_spending_limit': { const n = num(value); if (n !== null) b.updateBylawsConfig({ boardSpendingLimit: n }); return governanceClause(item, 'board', picks, edits); }
        case 'operating_balance': { const n = num(value); if (n) postOpening('operating', n); return 'Funds › opening balance'; }
        case 'reserve_balance': { const n = num(value); if (n) postOpening('reserve', n); return 'Funds › opening balance'; }
        // The date the balances are from: the Opening balances card reads it from the accepted item.
        case 'balance_as_of': return 'Funds › opening balance';
        // Rules for residents and the rest of the governance settings: shared clauses on Duties and roles.
        case 'pet_rule': case 'rental_rule': case 'fine_amount': return governanceClause(item, 'rules', picks, edits);
        default: return governanceClause(item, 'board', picks, edits);
      }
    }
    case 'units': {
      const existing = f.units.find(u => unitKey(u.number) === key);
      const patch = {
        ...(v.owner !== undefined ? { owner: text(v.owner) } : {}),
        ...(v.email !== undefined ? { email: text(v.email) } : {}),
        ...(v.phone !== undefined ? { phone: text(v.phone) } : {}),
        ...(num(v.ownershipPct) !== null ? { votingPct: num(v.ownershipPct)! } : {}),
        ...(num(v.monthlyFee) !== null ? { monthlyFee: num(v.monthlyFee)! } : {}),
        // What the owner owed (or had paid ahead) on the list's date; the Opening balances card posts it.
        ...(num(v.openingBalance) !== null ? { balance: num(v.openingBalance)! } : {}),
      };
      if (existing) f.updateUnit(existing.number, patch);
      else f.addUnit({ number: item.label.replace(/^Unit\s+/, ''), owner: '', email: '', phone: '', monthlyFee: 0, votingPct: 0, status: 'ACTIVE', balance: 0, moveIn: null, sqft: 0, bedrooms: 0, parking: null, ...patch });
      return 'Building › Directory · units';
    }
    case 'board': {
      const existing = b.board.find(m => m.name.trim().toLowerCase() === item.label.trim().toLowerCase());
      const m = { name: item.label, role: text(v.role) || 'Director', email: text(v.email), phone: text(v.phone), term: text(v.termEnds) };
      if (existing) b.updateBoardMember(existing.id, m); else b.addBoardMember(m);
      return 'Building › Directory · board';
    }
    case 'insurance': {
      const p = { type: item.label, carrier: text(v.carrier), coverage: text(v.coverage), premium: num(v.premium) !== null ? `$${num(v.premium)!.toLocaleString('en-US')}` : '', expires: text(v.expires), policyNum: text(v.policyNumber) };
      const existing = b.insurance.find(x => x.type.trim().toLowerCase() === item.label.trim().toLowerCase());
      if (existing) b.updateInsurance(existing.id, p); else b.addInsurance(p);
      return 'Building › Documents · insurance';
    }
    case 'vendors': {
      const vd = { name: item.label, service: text(v.service), contact: text(v.contact), phone: text(v.phone), email: text(v.email), contract: text(v.contractEnds), status: 'active' as const };
      const existing = b.vendors.find(x => x.name.trim().toLowerCase() === item.label.trim().toLowerCase());
      if (existing) b.updateVendor(existing.id, vd); else b.addVendor(vd);
      return 'Building › Contracts · vendors';
    }
    case 'budget': {
      const amount = num(v.annualAmount) ?? 0;
      const existing = f.budgetCategories.find(c => c.name.trim().toLowerCase() === item.label.trim().toLowerCase());
      if (existing) f.updateBudgetCategory(existing.id, { budgeted: amount }); else f.addBudgetCategory(item.label, amount);
      return 'Funds › Planning · budget';
    }
    case 'duties':
    case 'obligations':
    case 'houserules': {
      const topic = item.key.split(':')[1] as 'board' | 'officer' | 'owners' | 'rules';
      const src = item.fields.text?.[0]?.sources[0];
      const heading = item.label.replace(/^.+? · /, '').replace(/ duties$/, '') || item.label;
      b.upsertGoverningClause({ topic, role: v.role !== undefined ? text(v.role) : null, ref: text(v.ref), heading, text: text(v.text), source: src ? `${src.docName}${src.page ? ` p.${src.page}` : ''}` : '' });
      return 'Building › Obligations · duties and roles';
    }
    case 'reserves': {
      const r = { name: item.label, estimatedCost: num(v.estimatedCost) ?? 0, currentFunding: 0, usefulLife: num(v.usefulLifeYears) ?? 0, lastReplaced: '', yearsRemaining: num(v.remainingLifeYears) ?? 0, isContingency: false };
      const existing = f.reserveItems.find(x => x.name.trim().toLowerCase() === item.label.trim().toLowerCase());
      if (existing) f.updateReserveItem(existing.id, r); else f.addReserveItem(r);
      return 'Funds › Planning · reserves';
    }
  }
  return 'Saved';
}

/** A governance setting or rule read from the bylaws, kept as a shared clause so the board and owners see it under Duties and roles. */
function governanceClause(item: Item, topic: 'board' | 'rules', picks?: Record<string, number>, edits?: Record<string, FieldScalar>): string {
  const vals = item.fields.value ?? [];
  const picked = vals[Math.min(picks?.value ?? 0, Math.max(0, vals.length - 1))];
  const chosen = picked && edits?.value !== undefined ? { ...picked, display: String(edits.value) } : picked;
  const src = chosen?.sources[0];
  useBuildingStore.getState().upsertGoverningClause({
    topic, role: null, ref: src?.page ? `p.${src.page}` : '', heading: item.label,
    text: [chosen?.display, src?.quote && src.quote !== chosen?.display ? `“${src.quote.replace(/^Row \d+: /, '')}”` : ''].filter(Boolean).join(' · '),
    source: src ? `${src.docName}${src.page ? ` p.${src.page}` : ''}` : '',
  });
  return 'Building › Obligations · duties and roles';
}

/**
 * An opening cash balance read from a statement: into the operating (1010 → 3010)
 * or reserve (1020 → 3020) fund, as an opening line the Opening balances card
 * shows and can re-enter. Replaces an earlier line for the same account.
 */
export function postOpening(fund: 'operating' | 'reserve', amount: number, date?: string) {
  const f = useFinancialStore.getState();
  const asOf = date ?? priorMonthEnd(new Date().toISOString().slice(0, 10));
  const sourceId = `opening:cash:${fund}`;
  for (const e of f.generalLedger) if (e.status !== 'void' && e.sourceId === sourceId && f.canPostOn(e.date)) f.voidEntry(e.id, 'Opening balance re-entered');
  if (fund === 'operating') f.glPost(f.canPostOn(asOf) ? asOf : new Date().toISOString().slice(0, 10), 'Opening balance · operating account', '1010', '3010', amount, 'manual', sourceId);
  else f.glPost(f.canPostOn(asOf) ? asOf : new Date().toISOString().slice(0, 10), 'Opening balance · reserve account', '1020', '3020', amount, 'manual', sourceId);
}

/** The catalogue entry each document kind files under, when it has one. */
const TYPE_ENTRY: Partial<Record<DocType, string>> = { bylaws: 'bylaws', declaration: 'declaration', rules: 'rules', reserve_study: 'reserve-study' };
const titleOf = (doc: SetupDoc) => doc.name.replace(/\.[a-z0-9]+$/i, '').replace(/_+/g, ' ').trim();
const sizeOf = (doc: SetupDoc) => doc.size > 1024 * 1024 ? `${(doc.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(doc.size / 1024))} KB`;

/**
 * The name a setup document is filed under: the catalogue document its file
 * name says it is ("1302 R St NW_Bylaws" → Bylaws), else the one its kind
 * belongs to, else its kind and title.
 */
export function setupDocName(doc: SetupDoc, type: DocType): string {
  const entry = entryFor(titleOf(doc)) ?? DOC_CATALOGUE.find(e => e.key === TYPE_ENTRY[type]);
  return entry?.label ?? `${DOC_TYPE_LABEL[type] ?? 'Document'} · ${titleOf(doc)}`;
}

const yearOf = (name: string) => /\b(19|20)\d{2}\b/.exec(name)?.[0];
const fileOf = (doc: SetupDoc) => ({ name: doc.name, size: sizeOf(doc), type: doc.mediaType || 'application/pdf', fileId: doc.id, path: pathOf(doc.id), ...(doc.historical ? { period: doc.period ?? yearOf(doc.name) } : {}) });

/** The documents a setup document is filed under: the ones the person chose, else its catalogue name. */
export const coversOf = (doc: SetupDoc, type: DocType = doc.docType ?? 'other') => (doc.covers?.length ? doc.covers : [setupDocName(doc, type)]);

/**
 * File a document in Building › Documents under its catalogue name (or the
 * documents the person said it is). A building that already has that
 * document gets this file as its current version, the old one kept as an
 * earlier version; a past version is added as history. Adding the same file
 * again changes nothing. Returns the first document's id.
 */
export function fileSetupDocument(doc: SetupDoc & { docType: DocType }): string | null {
  return placeFile(coversOf(doc, doc.docType), fileOf(doc), { past: doc.historical, version: yearOf(doc.name) })[0] ?? null;
}

/** File one setup document under exactly these documents (one upload for bylaws that also hold the rules). */
export function placeSetupDocument(doc: SetupDoc, covers: string[], historical = !!doc.historical): { filedAs?: string; covers: string[] } {
  const names = [...new Set(covers)].filter(Boolean);
  if (!names.length) { unfileSetupDocument(doc); return { filedAs: undefined, covers: [] }; }
  const file = fileOf({ ...doc, historical });
  // A change between current and past re-files it, so the files it replaced are restored or archived to match.
  if (historical !== !!doc.historical) unplaceFile(file, [], false);
  const ids = setFilePlaces(names, file, { past: historical, version: yearOf(doc.name) });
  return { filedAs: ids[0], covers: names };
}

/** Change what a document is: its catalogue name follows the new kind. Returns where it is filed. */
export function retypeSetupDocument(doc: SetupDoc, type: DocType, from: DocType = doc.docType ?? 'other'): { filedAs?: string; covers: string[] } {
  const before = setupDocName(doc, from), after = setupDocName(doc, type);
  const covers = [...new Set(coversOf(doc, from).map(n => (n === before ? after : n)))];
  if (!doc.filedAs) return { filedAs: undefined, covers };
  return placeSetupDocument(doc, covers);
}

/** Take a removed setup document's file back out of Building › Documents (what it replaced becomes current again). */
export function unfileSetupDocument(doc: SetupDoc) {
  unplaceFile({ fileId: doc.id, name: doc.name });
}

/**
 * Other documents this one's text suggests it also is: bylaws with a rules
 * article, a pets or rentals clause, late-fee rules, a reserve schedule. The
 * person confirms each one; none is filed on a guess.
 */
export function suggestedCovers(doc: SetupDoc): { name: string; why: string }[] {
  const r = doc.result;
  if (!r || doc.historical) return [];
  const have = coversOf(doc);
  const out: { name: string; why: string }[] = [];
  const page = (rows: { page: number | null }[]) => { const p = rows.map(x => x.page).filter((n): n is number => n !== null); return p.length ? ` · p.${Math.min(...p)}` : ''; };
  const add = (key: string, why: string) => {
    const e = DOC_CATALOGUE.find(x => x.key === key);
    if (e && !have.some(n => sameDocument(n, e.label)) && !out.some(o => o.name === e.label)) out.push({ name: e.label, why });
  };
  const rules = [...r.facts.filter(f => ['pet_rule', 'rental_rule', 'fine_amount'].includes(f.key)), ...(r.clauses ?? []).filter(c => c.topic === 'rules')];
  if (rules.length) add('rules', `${rules.length} ${rules.length === 1 ? 'rule' : 'rules'} for residents${page(rules)}`);
  const pets = r.facts.filter(f => f.key === 'pet_rule');
  if (pets.length) add('pets', `a pets clause${page(pets)}`);
  const rentals = r.facts.filter(f => f.key === 'rental_rule');
  if (rentals.length) add('rentals', `a rentals clause${page(rentals)}`);
  const fees = r.facts.filter(f => ['late_fee', 'grace_period_days'].includes(f.key));
  if (fees.length) add('collections', `late fee and grace period${page(fees)}`);
  if (r.reserves.length) add('reserve-study', `${r.reserves.length} reserve components${page(r.reserves)}`);
  if (r.insurance.length) add('insurance', `${r.insurance.length} insurance ${r.insurance.length === 1 ? 'policy' : 'policies'}${page(r.insurance)}`);
  if (r.budget.length && doc.docType !== 'budget') add('budget', `${r.budget.length} budget lines${page(r.budget)}`);
  return out;
}

/** A starting budget sized to the building: common lines split from the monthly assessments. */
export const BUDGET_TEMPLATE: { name: string; share: number }[] = [
  { name: 'Management and administration', share: 0.12 },
  { name: 'Insurance', share: 0.14 },
  { name: 'Utilities', share: 0.16 },
  { name: 'Repairs and maintenance', share: 0.15 },
  { name: 'Landscaping and snow', share: 0.06 },
  { name: 'Cleaning and janitorial', share: 0.07 },
  { name: 'Professional fees (legal, audit)', share: 0.04 },
  { name: 'Reserve contribution', share: 0.22 },
  { name: 'Contingency', share: 0.04 },
];

/** Fill the budget from the template for an annual total; existing lines with the same name are updated. */
export function applyBudgetTemplate(annualTotal: number) {
  const f = useFinancialStore.getState();
  for (const line of BUDGET_TEMPLATE) {
    const amount = Math.round(annualTotal * line.share);
    const existing = f.budgetCategories.find(c => c.name.toLowerCase() === line.name.toLowerCase());
    if (existing) f.updateBudgetCategory(existing.id, { budgeted: amount }); else f.addBudgetCategory(line.name, amount);
  }
}
