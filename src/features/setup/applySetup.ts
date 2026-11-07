/**
 * Building setup, writing: an accepted item goes into the building's own
 * records through the stores' existing actions (which also save to the
 * database), so nothing about setup is a separate copy. Also files each
 * read document in Building › Documents and fills the gaps step's answers.
 */
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
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
        case 'management_company': b.updateManagement({ company: text(value) }); return 'Building › Directory';
        case 'late_fee': { const n = num(value); if (n !== null) f.setLateFeeSettings(true, n, f.lateFeeGraceDays); return 'Funds settings · late fees'; }
        case 'grace_period_days': { const n = num(value); if (n !== null) f.setLateFeeSettings(f.lateFeeEnabled, f.lateFeeAmount, n); return 'Funds settings · late fees'; }
        case 'assessment_due_day': { const n = num(value); if (n && n >= 1 && n <= 28) f.setHoaDueDay(n); return 'Funds settings · due day'; }
        case 'owner_quorum_pct': { const n = num(value); if (n !== null) b.updateBylawsConfig({ quorumPct: n }); return 'Bylaws settings'; }
        case 'owner_vote_threshold_pct': { const n = num(value); if (n !== null) b.updateBylawsConfig({ ownerVoteThreshold: n }); return 'Bylaws settings'; }
        case 'assessment_cap_pct': { const n = num(value); if (n !== null) b.updateBylawsConfig({ assessmentCapPct: n }); return 'Bylaws settings'; }
        case 'board_spending_limit': { const n = num(value); if (n !== null) b.updateBylawsConfig({ boardSpendingLimit: n }); return 'Bylaws settings'; }
        case 'operating_balance': { const n = num(value); if (n) postOpening('operating', n); return 'Funds › opening balance'; }
        case 'reserve_balance': { const n = num(value); if (n) postOpening('reserve', n); return 'Funds › opening balance'; }
        // Kept with setup's record of the building's rules (shown on the go-live step).
        default: return 'Rules on file';
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
      return 'Building › Obligations · insurance';
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

/** Opening balance into the operating (1010 → 3010) or reserve (1020 → 3020) fund. */
export function postOpening(fund: 'operating' | 'reserve', amount: number, date = new Date().toISOString().slice(0, 10)) {
  const f = useFinancialStore.getState();
  if (fund === 'operating') f.glPost(date, 'Opening operating fund balance (setup)', '1010', '3010', amount, 'manual', null);
  else f.glPost(date, 'Opening reserve fund balance (setup)', '1020', '3020', amount, 'transfer', null);
}

const docName = (doc: SetupDoc, type: DocType) => `${DOC_TYPE_LABEL[type] ?? 'Document'} · ${doc.name.replace(/\.[a-z0-9]+$/i, '')}`;

/** File a document in Building › Documents, named by its type so it lands in the right group. Returns the document id. */
export function fileSetupDocument(doc: SetupDoc & { docType: DocType }): string | null {
  const b = useBuildingStore.getState();
  const name = docName(doc, doc.docType);
  const year = /\b(19|20)\d{2}\b/.exec(doc.name)?.[0] ?? String(new Date().getFullYear());
  const size = doc.size > 1024 * 1024 ? `${(doc.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(doc.size / 1024))} KB`;
  b.addLegalDocument({ name, version: year, size, status: 'current' });
  const filed = [...useBuildingStore.getState().legalDocuments].reverse().find(d => d.name === name);
  if (!filed) return null;
  b.addLegalDocAttachment(filed.id, { name: doc.name, size, type: doc.mediaType || 'application/pdf' });
  return filed.id;
}

/** Change what a filed document is (renames it in Building › Documents). */
export function retypeSetupDocument(doc: SetupDoc, type: DocType) {
  if (doc.filedAs) useBuildingStore.getState().updateLegalDocument(doc.filedAs, { name: docName(doc, type) });
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
