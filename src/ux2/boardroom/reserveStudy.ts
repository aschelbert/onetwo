/**
 * The reserve study runbook, wired: a professional study lasts a set number
 * of years (Funds › Planning › Reserves, three by default), and the next
 * one is due that long after the last. Its case opens 90 days before, with
 * the reserve playbook (the case wizard's own situation), or at once when
 * no study is on record. The last study's date is the setting, or failing
 * that the newest file named "reserve study" under Building › Documents.
 * The app ticks the commissioning step once a newer study is recorded and
 * the disclosure step once a notice about the reserves goes out. One open
 * case at a time; a reserve case from the Home obligation or the wizard
 * counts instead.
 *
 * The database opens the same case every morning (run_reserve_study,
 * migration 063); the app fills in the playbook and ticks it.
 */
import { useIssuesStore } from '@/store/useIssuesStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { addDays } from '@/lib/billingCycle';
import type { CaseTrackerCase } from '@/types/issues';
import { ISO_DATE, todayIso } from '../runbook/adapters';

export const RESERVE_STUDY_ID = 'reserve-study';
export const RESERVE_STUDY_SIT = 'reserve-management';
/** Days before the next study is due that its case opens. */
export const RESERVE_LEAD_DAYS = 90;
export const reserveSourceId = (key: string) => `${RESERVE_STUDY_ID}:${key}`;

export const everyYears = (n: number | undefined | null) => { const v = Math.round(Number(n)); return Number.isFinite(v) && v >= 1 && v <= 10 ? v : 3; };

export function addYears(date: string, years: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y + years, m - 1, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** The newest upload on a document named for the reserve study. */
export function studyDocumentDate(): string | null {
  const docs = useBuildingStore.getState().legalDocuments.filter(d => /reserve study/i.test(d.name));
  const dates = docs.flatMap(d => d.attachments.map(a => (a.uploadedAt || '').slice(0, 10))).filter(x => ISO_DATE.test(x)).sort();
  return dates[dates.length - 1] ?? null;
}

/** When the last study was done: the setting, or the newest reserve study file. */
export function lastStudyDate(): string | null {
  const set = useFinancialStore.getState().reserveStudyDate;
  return set && ISO_DATE.test(set) ? set : studyDocumentDate();
}

/** When the next study is due, and the key the case carries ('first' when no study is on record). */
export function nextStudy(today: string): { due: string; key: string; last: string | null; years: number } {
  const years = everyYears(useFinancialStore.getState().reserveStudyEveryYears);
  const last = lastStudyDate();
  return last ? { due: addYears(last, years), key: addYears(last, years), last, years } : { due: addDays(today, RESERVE_LEAD_DAYS), key: 'first', last: null, years };
}

/** A case already on the reserve study: the runbook's own (one at a time), the Home obligation's (f2), or one opened by hand on the wizard. */
export function openReserveCase(cases: CaseTrackerCase[], key: string): CaseTrackerCase | undefined {
  return cases.find(c => (c.source === 'runbook' && (c.sourceId === reserveSourceId(key) || (c.status !== 'closed' && !!c.sourceId?.startsWith(`${RESERVE_STUDY_ID}:`))))
    || (c.status !== 'closed' && ((c.source === 'obligation' && c.sourceId === 'f2') || (c.sitId === RESERVE_STUDY_SIT && c.source !== 'runbook'))));
}

const tick = (c: CaseTrackerCase, re: RegExp) => { const i = (c.steps ?? []).findIndex(s => re.test(s.s)); if (i >= 0 && !c.steps![i].done) useIssuesStore.getState().completeStep(c.id, i); };

/** Tick what the app can see: a newer study recorded, the reserves disclosed. */
export function syncReserveCase(c: CaseTrackerCase): void {
  if (c.status === 'closed' || !c.steps || c.source !== 'runbook' || !c.sourceId?.startsWith(`${RESERVE_STUDY_ID}:`)) return;
  const key = c.sourceId.slice(RESERVE_STUDY_ID.length + 1);
  const last = lastStudyDate();
  // A study dated after the case opened, or, for a case keyed by a due date, after the study that set it.
  const since = key === 'first' ? c.created.slice(0, 10) : addYears(key, -everyYears(useFinancialStore.getState().reserveStudyEveryYears));
  if (last && last > since) tick(c, /^commission or update professional reserve study/i);
  const opened = c.created.slice(0, 10);
  const comp = useComplianceStore.getState();
  if (comp.announcements.some(a => /reserve/i.test(a.title) && a.postedDate.slice(0, 10) >= opened) || comp.communications.some(x => /reserve/i.test(x.subject) && x.status === 'sent' && x.date.slice(0, 10) >= opened)) tick(c, /^disclose reserve health/i);
}

export interface ReserveRun { caseId: string | null; opened: boolean; key: string; due: string }

export function runReserveStudy(today: string = todayIso()): ReserveRun {
  const fin = useFinancialStore.getState();
  const { due, key, last, years } = nextStudy(today);
  for (const c of useIssuesStore.getState().cases) if (c.status !== 'closed' && c.source === 'runbook' && c.sourceId?.startsWith(`${RESERVE_STUDY_ID}:`)) syncReserveCase(c);
  const existing = openReserveCase(useIssuesStore.getState().cases, key);
  if (existing) return { caseId: existing.id, opened: false, key, due };
  if (fin.runbooksOff.includes(RESERVE_STUDY_ID)) return { caseId: null, opened: false, key, due };
  if (last && today < addDays(due, -RESERVE_LEAD_DAYS)) return { caseId: null, opened: false, key, due };
  const id = useIssuesStore.getState().createCase({
    catId: 'financial',
    sitId: RESERVE_STUDY_SIT,
    approach: 'pre',
    title: `Reserve study update · due ${due}`,
    unit: '',
    owner: 'Treasurer',
    priority: 'high',
    notes: `Opened by the Reserve study update runbook on ${today}: ${last ? `the last study was ${last}, and one lasts ${years} year${years === 1 ? '' : 's'} here, so the next is due ${due}` : `no reserve study is on record, so one should be commissioned by ${due}`}. Record the new study's date under Funds › Planning › Reserves when it arrives; the funding plan and next year's reserve line follow from it.`,
    assignedRole: 'Treasurer',
    dueDate: due,
    source: 'runbook',
    sourceId: reserveSourceId(key),
  });
  const created = useIssuesStore.getState().cases.find(c => c.id === id);
  if (created) syncReserveCase(created);
  return { caseId: id, opened: true, key, due };
}
