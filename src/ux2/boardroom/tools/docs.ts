import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { todayIso } from '../../runbook/adapters';

/**
 * The small records the case tools keep beside a long-standing action: a
 * month's bank reconciliation, a year's objectives, a write-off request.
 * Each is one action record of its own kind, found by a key (the month, the
 * fiscal year, the action it belongs to).
 */
export type ToolKind = 'reconciliation' | 'statement-packet' | 'write-off' | 'rebuild-check' | 'objectives' | 'budget-spread' | 'allowance' | 'disposal-review';

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
