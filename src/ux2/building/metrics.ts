/**
 * Building metrics — the numbers on the Building header and tiles, derived
 * the way the production Dashboard derived its building health. Pure
 * functions over a snapshot; the production tabs underneath keep owning
 * every mutation.
 */
import type { Role } from '@/types/auth';
import type { ComplianceItem } from '@/lib/complianceRefresh';
import type { RegulatoryFiling } from '@/store/useComplianceStore';
import type { BoardMember, InsurancePolicy, LegalDocument, Vendor } from '@/store/useBuildingStore';
import type { VendorContract } from '@/lib/services/vendorTracker';
import type { WorkOrder } from '@/data/financial';
import { daysBetween } from '../runbook/model';
import { ISO_DATE } from '../runbook/adapters';

export interface BuildingSnapshot {
  today: string;
  name: string;
  address: { street: string; city: string; state: string; zip: string };
  details: { yearBuilt: string; totalUnits: number; floors: number; fiscalYearEnd: string; entityType: string };
  managementCompany: string;
  counselCount: number;
  board: BoardMember[];
  legalDocuments: LegalDocument[];
  insurance: InsurancePolicy[];
  vendors: Vendor[];
  contracts: VendorContract[];
  workOrders: WorkOrder[];
  obligations: ComplianceItem[];
  completions: Record<string, boolean>;
  filings: RegulatoryFiling[];
}

/** The Dashboard's building health: documents 35, insurance 35, governance 30. Unchanged. */
export function buildingScore(s: BuildingSnapshot) {
  const totalDocs = s.legalDocuments.length;
  const currentDocs = s.legalDocuments.filter(d => d.status === 'current').length;
  const docsWithFiles = s.legalDocuments.filter(d => d.attachments && d.attachments.length > 0).length;
  const legal = totalDocs > 0 ? Math.round((currentDocs / totalDocs) * 60 + (docsWithFiles / totalDocs) * 40) : 0;
  const totalPolicies = s.insurance.length;
  const active = s.insurance.filter(p => p.expires > s.today).length;
  const withDocs = s.insurance.filter(p => p.attachments && p.attachments.length > 0).length;
  const ins = totalPolicies > 0 ? Math.round((active / totalPolicies) * 70 + (withDocs / totalPolicies) * 30) : 0;
  const gov = Math.round(([s.board.length >= 3, !!s.managementCompany, s.counselCount > 0, s.vendors.filter(v => v.status === 'active').length >= 3].filter(Boolean).length / 4) * 100);
  const total = Math.round(legal * 0.35 + ins * 0.35 + gov * 0.3);
  const grade = total >= 90 ? 'A' : total >= 80 ? 'B' : total >= 70 ? 'C' : total >= 60 ? 'D' : 'F';
  const label = total >= 80 ? 'Good' : total >= 60 ? 'Fair' : 'Needs attention';
  return { total, grade, label, legal, insurance: ins, governance: gov };
}

export interface InsuranceStatus {
  id: string;
  type: string;
  carrier: string;
  expires: string;
  daysLeft: number;
  state: 'lapsed' | 'expiring' | 'current';
  hasCertificate: boolean;
}

/** Policies with how long they have left; 60 days is the Dashboard's warning window. */
export function insuranceStatus(s: BuildingSnapshot, warnDays = 60): InsuranceStatus[] {
  return s.insurance
    .filter(p => ISO_DATE.test(p.expires))
    .map(p => {
      const d = daysBetween(s.today, p.expires);
      return { id: p.id, type: p.type, carrier: p.carrier, expires: p.expires, daysLeft: d, state: d < 0 ? 'lapsed' : d <= warnDays ? 'expiring' : 'current', hasCertificate: (p.attachments?.length ?? 0) > 0 } as InsuranceStatus;
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export function documentsSummary(s: BuildingSnapshot) {
  // An archived file is an earlier version; the document is on file when it has a current one.
  const hasCurrent = (d: BuildingSnapshot['legalDocuments'][number]) => (d.attachments ?? []).some(a => !a.archived);
  const withFile = s.legalDocuments.filter(hasCurrent);
  const reviewDue = s.legalDocuments.filter(d => d.status === 'review-due');
  const missingFile = s.legalDocuments.filter(d => !hasCurrent(d));
  const certificates = s.insurance.filter(p => p.attachments && p.attachments.length > 0).length;
  return { total: s.legalDocuments.length, withFile: withFile.length, reviewDue, missingFile, certificates, policies: s.insurance.length };
}

export interface ContractRow {
  vendorId: string;
  vendor: string;
  service: string;
  contract?: VendorContract;
  ends?: string;
  daysLeft?: number;
  state: 'lapsed' | 'ending' | 'active' | 'none' | 'inactive';
  paidThisYear: number;
  needs1099: boolean;
  w9OnFile: boolean;
}

/** One row per vendor: the live contract, when it ends, what was paid this year and whether a 1099 is due. */
export function contractRows(s: BuildingSnapshot, endingDays = 90): ContractRow[] {
  const year = s.today.slice(0, 4);
  return s.vendors.map(v => {
    const live = s.contracts
      .filter(c => c.vendorId === v.id || c.vendorName === v.name)
      .sort((a, b) => (b.endDate || '').localeCompare(a.endDate || ''))[0];
    const paidThisYear = s.workOrders.filter(w => w.vendor === v.name && w.status === 'paid' && w.paidDate && w.paidDate.startsWith(year)).reduce((t, w) => t + w.amount, 0);
    let state: ContractRow['state'] = v.status === 'inactive' ? 'inactive' : 'none';
    let daysLeft: number | undefined;
    if (live && ISO_DATE.test(live.endDate)) {
      daysLeft = daysBetween(s.today, live.endDate);
      state = v.status === 'inactive' ? 'inactive' : daysLeft < 0 && !live.autoRenew ? 'lapsed' : daysLeft <= endingDays && !live.autoRenew ? 'ending' : 'active';
    } else if (live) state = 'active';
    return { vendorId: v.id, vendor: v.name, service: v.service, contract: live, ends: live?.endDate, daysLeft, state, paidThisYear, needs1099: paidThisYear >= 600, w9OnFile: !!v.w9OnFile };
  }).sort((a, b) => order(a.state) - order(b.state) || (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
}

function order(state: ContractRow['state']): number {
  return { lapsed: 0, ending: 1, active: 2, none: 3, inactive: 4 }[state];
}

export function contractsSummary(rows: ContractRow[]) {
  return {
    vendors: rows.filter(r => r.state !== 'inactive').length,
    lapsed: rows.filter(r => r.state === 'lapsed'),
    ending: rows.filter(r => r.state === 'ending'),
    needs1099: rows.filter(r => r.needs1099),
    missingW9: rows.filter(r => r.needs1099 && !r.w9OnFile),
    signed: rows.filter(r => !!r.contract).length,
  };
}

export type ObligationState = 'met' | 'auto' | 'overdue' | 'in-progress' | 'upcoming' | 'ongoing';

export interface ObligationRow {
  id: string;
  task: string;
  role: string;
  due: string;
  dated: boolean;
  daysLeft?: number;
  critical: boolean;
  state: ObligationState;
  scope: 'governance' | 'operations';
  fiduciaryDuty: 'care' | 'loyalty' | 'obedience';
  kind: 'obligation' | 'filing';
  legalRef?: string;
  howToCount: number;
}

/** Every obligation and filing with its state, the way the Governance Calendar judges it. */
export function obligationRows(s: BuildingSnapshot): ObligationRow[] {
  const rows: ObligationRow[] = [];
  for (const i of s.obligations) {
    const dated = ISO_DATE.test(i.due);
    const d = dated ? daysBetween(s.today, i.due) : undefined;
    const done = !!s.completions[i.id];
    const state: ObligationState = i.autoPass ? 'auto' : done ? 'met' : !dated ? 'ongoing' : d! < 0 ? 'overdue' : d! <= 30 ? 'in-progress' : 'upcoming';
    rows.push({ id: i.id, task: i.task, role: i.role, due: i.due, dated, daysLeft: d, critical: !!i.critical, state, scope: i.scope, fiduciaryDuty: i.fiduciaryDuty, kind: 'obligation', legalRef: i.legalRef, howToCount: i.howTo?.length ?? 0 });
  }
  for (const f of s.filings) {
    const d = ISO_DATE.test(f.dueDate) ? daysBetween(s.today, f.dueDate) : undefined;
    const state: ObligationState = f.status === 'filed' ? 'met' : d === undefined ? 'ongoing' : d < 0 ? 'overdue' : d <= 30 ? 'in-progress' : 'upcoming';
    rows.push({ id: f.id, task: f.name, role: f.responsible || 'President', due: f.dueDate, dated: d !== undefined, daysLeft: d, critical: true, state, scope: 'governance', fiduciaryDuty: 'obedience', kind: 'filing', legalRef: f.legalRef, howToCount: 0 });
  }
  const rank: Record<ObligationState, number> = { overdue: 0, 'in-progress': 1, upcoming: 2, ongoing: 3, auto: 4, met: 5 };
  return rows.sort((a, b) => rank[a.state] - rank[b.state] || (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
}

export function obligationsSummary(rows: ObligationRow[]) {
  const by = (st: ObligationState) => rows.filter(r => r.state === st);
  const met = by('met').length + by('auto').length;
  const open = rows.length - met;
  return {
    total: rows.length,
    met,
    auto: by('auto').length,
    overdue: by('overdue'),
    inProgress: by('in-progress'),
    upcoming: by('upcoming'),
    ongoing: by('ongoing').length,
    open,
    /** Board checklist percentage, the Dashboard's compliance score. */
    pct: rows.length > 0 ? Math.round((met / rows.length) * 100) : 0,
  };
}

export interface RoleLoad {
  role: string;
  member?: string;
  obligations: number;
  critical: number;
  ongoing: number;
  dated: number;
  thisMonth: ObligationRow[];
}

/** Who carries what: obligations per officer title, with the member who holds it. */
export function roleLoads(rows: ObligationRow[], board: BoardMember[], today: string): RoleLoad[] {
  const month = today.slice(0, 7);
  const roles = ['President', 'Vice President', 'Treasurer', 'Secretary', 'Member at Large'];
  const extra = Array.from(new Set(rows.map(r => r.role))).filter(r => !roles.includes(r) && r !== 'Board');
  return [...roles, ...extra].map(role => {
    const mine = rows.filter(r => r.role === role && r.state !== 'met' && r.state !== 'auto');
    return {
      role,
      member: board.find(b => b.role === role)?.name,
      obligations: mine.length,
      critical: mine.filter(r => r.critical).length,
      ongoing: mine.filter(r => !r.dated).length,
      dated: mine.filter(r => r.dated).length,
      thisMonth: mine.filter(r => r.dated && (r.due.startsWith(month) || r.state === 'overdue')),
    };
  });
}

/** The three fiduciary duties with how many obligations sit under each. */
export function dutyCounts(rows: ObligationRow[]) {
  return {
    care: rows.filter(r => r.fiduciaryDuty === 'care').length,
    loyalty: rows.filter(r => r.fiduciaryDuty === 'loyalty').length,
    obedience: rows.filter(r => r.fiduciaryDuty === 'obedience').length,
  };
}

/** Role label → app role that holds it, for "is this mine". */
export function officerAppRole(role: string): Role {
  return /manager/i.test(role) ? 'PROPERTY_MANAGER' : 'BOARD_MEMBER';
}
