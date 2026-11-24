/**
 * Reading a bank statement export and matching it to the ledger, line by
 * line. A bank's CSV download is the input (every bank offers one); the
 * columns are found by their headings.
 */
export interface BankLine { id: string; date: string; description: string; amount: number }
/** A ledger entry as it moves one bank account: money in is positive, money out negative. */
export interface BookLine { id: string; date: string; memo: string; amount: number }

const r2 = (n: number) => Math.round(n * 100) / 100;

function cells(row: string): string[] {
  const out: string[] = [];
  let cur = '', quoted = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (quoted) { if (ch === '"' && row[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** '10/15/2026', '10/15/26' or '2026-10-15' as an ISO date; '' when it is not a date. */
export function bankDate(raw: string): string {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(s);
  if (!m) return '';
  const y = m[3].length === 2 ? '20' + m[3] : m[3];
  return y + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
}

/** '$1,234.50', '(18.00)' or '-18' as a number; null when it is blank or not a number. */
export function bankAmount(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || s.startsWith('-');
  const n = Number(s.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && /\d/.test(s) ? r2(negative ? -n : n) : null;
}

/**
 * The lines of a bank's CSV export. Looks for a date column, a description
 * column, and either one signed amount column or separate money-out and
 * money-in columns. Rows without a date or an amount are skipped.
 */
export function parseBankCsv(text: string): { lines: BankLine[]; problem: string } {
  const rows = text.split(/\r?\n/).filter(r => r.trim()).map(cells);
  const at = rows.findIndex(r => r.some(c => /date/i.test(c)) && r.some(c => /amount|debit|credit|withdraw|deposit/i.test(c)));
  if (at < 0) return { lines: [], problem: 'No heading row with a date and an amount was found. Download the statement as CSV from the bank and try again.' };
  const head = rows[at].map(c => c.toLowerCase());
  const col = (re: RegExp) => head.findIndex(c => re.test(c));
  const date = col(/date/), desc = col(/desc|memo|payee|detail|name|transaction/), amount = col(/^amount$|amount/);
  const out = col(/debit|withdraw|paid out|money out/), into = col(/credit|deposit|paid in|money in/);
  const lines: BankLine[] = [];
  rows.slice(at + 1).forEach((r, i) => {
    const d = bankDate(r[date] ?? '');
    let a = amount >= 0 && out < 0 && into < 0 ? bankAmount(r[amount] ?? '') : null;
    if (a == null && (out >= 0 || into >= 0)) {
      const o = out >= 0 ? bankAmount(r[out] ?? '') : null, n = into >= 0 ? bankAmount(r[into] ?? '') : null;
      if (o != null || n != null) a = r2(Math.abs(n ?? 0) - Math.abs(o ?? 0));
    }
    if (a == null && amount >= 0) a = bankAmount(r[amount] ?? '');
    if (d && a != null && a !== 0) lines.push({ id: 'l' + i, date: d, description: (desc >= 0 ? r[desc] : '') || '', amount: a });
  });
  return { lines, problem: lines.length ? '' : 'The file has a heading row but no rows with a date and an amount.' };
}

const daysApart = (a: string, b: string) => Math.abs(Math.round((Date.parse(a) - Date.parse(b)) / 86400000));

export interface StatementMatch {
  /** Bank lines paired with the ledger entry they are. */
  matched: { line: BankLine; book: BookLine }[];
  /** On the statement, not in the books: a fee, interest, a deposit nobody recorded. */
  bankOnly: BankLine[];
  /** In the books, not on the statement: checks not cashed and deposits not yet in. */
  bookOnly: BookLine[];
}

/**
 * Pair each bank line with a ledger entry of the same amount, the closest in
 * date first, within `windowDays` (a check can clear weeks after it is
 * written, so the window is wide). Each entry is used once.
 */
export function matchStatement(lines: BankLine[], books: BookLine[], windowDays = 45): StatementMatch {
  const free = new Set(books.map(b => b.id));
  const matched: StatementMatch['matched'] = [];
  const bankOnly: BankLine[] = [];
  for (const line of [...lines].sort((a, b) => a.date.localeCompare(b.date))) {
    const pick = books
      .filter(b => free.has(b.id) && b.amount === line.amount && daysApart(b.date, line.date) <= windowDays)
      .sort((a, b) => daysApart(a.date, line.date) - daysApart(b.date, line.date) || a.date.localeCompare(b.date))[0];
    if (pick) { free.delete(pick.id); matched.push({ line, book: pick }); } else bankOnly.push(line);
  }
  return { matched, bankOnly, bookOnly: books.filter(b => free.has(b.id)) };
}

/** The entries that move one bank account, signed, up to a date. */
export function bookLinesFor(acct: string, entries: { id: string; date: string; memo: string; debitAcct: string; creditAcct: string; amount: number; status: string }[], through: string): BookLine[] {
  return entries
    .filter(e => e.status !== 'void' && e.date <= through && (e.debitAcct === acct || e.creditAcct === acct) && e.debitAcct !== e.creditAcct)
    .map(e => ({ id: e.id, date: e.date, memo: e.memo, amount: r2(e.debitAcct === acct ? e.amount : -e.amount) }));
}
