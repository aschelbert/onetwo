import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { unsignedAccounts } from '@/lib/caseTools';
import { todayIso } from '../../runbook/adapters';

/**
 * The small records the case tools keep beside a long-standing action: a
 * month's bank reconciliation, a year's objectives, a write-off request.
 * Each is one action record of its own kind, found by a key (the month, the
 * fiscal year, the action it belongs to).
 */
export type ToolKind = 'reconciliation' | 'statement-packet' | 'write-off' | 'rebuild-check' | 'objectives' | 'budget-spread' | 'allowance' | 'disposal-review' | 'controls' | 'payroll-returns' | 'owner-statements' | 'variance-notes';

const find = (kind: ToolKind, key: string) => useActionRecordsStore.getState().records.find(r => r.kind === kind && (r.data as { key?: string }).key === key);

export function readToolDoc<T>(kind: ToolKind, key: string, blank: T): T {
  const r = find(kind, key);
  return r ? ({ ...blank, ...(r.data as object) } as T) : blank;
}

export function saveToolDoc<T extends object>(kind: ToolKind, key: string, blank: T, changes: Partial<T>, today: string = todayIso()): void {
  const store = useActionRecordsStore.getState();
  const r = find(kind, key);
  if (r) store.patchData(r.id, changes as Record<string, unknown>);
  else store.add({ kind, title: key, unit: '', openedOn: today, dueOn: '', closedOn: '', data: { ...blank, ...changes, key } as Record<string, unknown> });
}

/** Read a tool's record and get a function that saves changes to it. Re-renders when the record changes. */
export function useToolDoc<T extends object>(kind: ToolKind, key: string, blank: T): [T, (changes: Partial<T>) => void] {
  const data = useActionRecordsStore(s => s.records.find(r => r.kind === kind && (r.data as { key?: string }).key === key)?.data);
  const doc = data ? ({ ...blank, ...(data as object) } as T) : blank;
  return [doc, changes => saveToolDoc(kind, key, blank, changes)];
}

/** Open a plain printable page with a title and some HTML. */
export function printPage(title: string, bodyHtml: string): void {
  const w = window.open('', '_blank', 'width=820,height=1000');
  if (!w) return;
  w.document.write('<title>' + esc(title) + '</title><body style="font:14px/1.5 system-ui;max-width:720px;margin:36px auto;padding:0 20px;color:#111">' + bodyHtml + '</body>');
  w.document.close();
  w.focus();
  w.print();
}
export const esc = (s: string) => s.replace(/[&<>]/g, c => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
export const rowsHtml = (rows: [string, string][]) => '<table style="width:100%;border-collapse:collapse">' + rows.map(([a, b]) => '<tr><td style="padding:4px 0;border-bottom:1px solid #ddd">' + esc(a) + '</td><td style="padding:4px 0;border-bottom:1px solid #ddd;text-align:right">' + esc(b) + '</td></tr>').join('') + '</table>';

/**
 * Why the books should not be closed through a date yet: a bank account that
 * has moved has no signed reconciliation for that month. '' when nothing
 * stands in the way, or when the building has not switched the rule on.
 * The rule is on once the building has reconciled anything, unless switched off.
 */
export function closeBlocker(through: string): string {
  const records = useActionRecordsStore.getState().records;
  const recs = records.filter(r => r.kind === 'reconciliation');
  const controls = records.find(r => r.kind === 'controls')?.data as { requireReconciliation?: boolean } | undefined;
  if (!(controls?.requireReconciliation ?? recs.length > 0)) return '';
  const period = through.slice(0, 7);
  const fin = useFinancialStore.getState();
  const banks = fin.chartOfAccounts.filter(a => a.sub === 'bank');
  const active = new Set(fin.generalLedger.filter(e => e.status !== 'void' && e.date <= through).flatMap(e => [e.debitAcct, e.creditAcct]));
  const signed = new Set(recs.map(r => r.data as { acct?: string; period?: string; signedOn?: string }).filter(d => d.period === period && d.signedOn).map(d => d.acct ?? ''));
  const missing = unsignedAccounts(banks, active, signed);
  return missing.length ? `${missing.join(' and ')} ${missing.length === 1 ? 'has' : 'have'} no signed reconciliation for ${period}` : '';
}

/** Close the books through a date, unless a reconciliation is missing; a person can go ahead anyway, and that is recorded. Returns whether they closed. */
export function closeBooksChecked(through: string, by: string): { closed: boolean; overrode: string } {
  const why = closeBlocker(through);
  if (why && !window.confirm(`${why}.\n\nClose the books anyway? This is recorded with your name.`)) return { closed: false, overrode: '' };
  useFinancialStore.getState().closeBooksThrough(through);
  if (why) useActionRecordsStore.getState().add({ kind: 'close-override', title: through, unit: '', openedOn: todayIso(), dueOn: '', closedOn: todayIso(), data: { key: through, by, why } });
  return { closed: true, overrode: why };
}
