/**
 * Building setup, writing: an accepted item goes into the building's own
 * records through the stores' existing actions (which also save to the
 * database), so nothing about setup is a separate copy. Also files each
 * read document in Building › Documents and fills the gaps step's answers.
 */
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { DOC_CATALOGUE, entryFor, fileDocument, sameDocument, unfileDocument } from '@/features/building/documentCatalogue';
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

/** Opening balance into the operating (1010 → 3010) or reserve (1020 → 3020) fund. */
export function postOpening(fund: 'operating' | 'reserve', amount: number, date = new Date().toISOString().slice(0, 10)) {
  const f = useFinancialStore.getState();
  if (fund === 'operating') f.glPost(date, 'Opening operating fund balance (setup)', '1010', '3010', amount, 'manual', null);
  else f.glPost(date, 'Opening reserve fund balance (setup)', '1020', '3020', amount, 'transfer', null);
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

/**
 * File a document in Building › Documents under its catalogue name. A building
 * that already has that document gets this file as a new version of it, so
 * adding the bylaws twice (or again after Start over) leaves one Bylaws.
 * Returns the document id.
 */
export function fileSetupDocument(doc: SetupDoc & { docType: DocType }): string | null {
  const year = /\b(19|20)\d{2}\b/.exec(doc.name)?.[0] ?? String(new Date().getFullYear());
  return fileDocument(setupDocName(doc, doc.docType), { version: year, attachment: { name: doc.name, size: sizeOf(doc), type: doc.mediaType || 'application/pdf' } });
}

/** Change what a filed document is: moves its file to the document it now is. Returns where it is filed. */
export function retypeSetupDocument(doc: SetupDoc, type: DocType): string | undefined {
  if (!doc.filedAs) return undefined;
  const filed = useBuildingStore.getState().legalDocuments.find(d => d.id === doc.filedAs);
  if (!filed) return doc.filedAs;
  const name = setupDocName(doc, type);
  if (sameDocument(filed.name, name)) return filed.id;
  const others = filed.attachments.filter(a => a.name !== doc.name);
  // A document holding only this file, with nothing else under the new name: rename it in place.
  if (!others.length && !useBuildingStore.getState().legalDocuments.some(d => d.id !== filed.id && sameDocument(d.name, name))) {
    useBuildingStore.getState().updateLegalDocument(filed.id, { name });
    return filed.id;
  }
  unfileDocument(filed.id, doc.name);
  return fileSetupDocument({ ...doc, docType: type }) ?? undefined;
}

/** Take a removed setup document's file back out of Building › Documents. */
export function unfileSetupDocument(doc: SetupDoc) {
  if (doc.filedAs) unfileDocument(doc.filedAs, doc.name);
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
