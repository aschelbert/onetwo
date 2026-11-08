/**
 * Building setup, importing spreadsheets without any outside service: an
 * owner list, a board roster or a budget exported to CSV or Excel is turned
 * into the same reading the review step shows, by finding the header row and
 * matching its column names. Every item cites the row it came from.
 *
 * Pure functions: rows in, a `ReadResult` (or a reason it couldn't be read) out.
 */
import type { BoardRow, BudgetRow, DocType, ReadResult, UnitRow } from './setupModel';

export type Cell = string | number | boolean | Date | null | undefined;

/** Header names people use, normalised (lower case, letters and digits only; "%" reads as "pct"). */
const COLUMNS: Record<string, string[]> = {
  unit: ['unit', 'unitnumber', 'unitno', 'unitnum', 'unitid', 'apt', 'apartment', 'suite', 'lot', 'condo', 'condounit'],
  owner: ['owner', 'owners', 'ownername', 'ownernames', 'name', 'names', 'homeowner', 'unitowner', 'resident', 'fullname'],
  email: ['email', 'emailaddress', 'emails', 'ownerEmail'.toLowerCase()],
  phone: ['phone', 'phonenumber', 'telephone', 'tel', 'mobile', 'cell', 'cellphone'],
  mailing: ['mailingaddress', 'mailing', 'mailaddress', 'address', 'owneraddress'],
  ownership: ['ownership', 'ownershippct', 'ownershippercent', 'ownershippercentage', 'pct', 'percent', 'percentage', 'interest', 'percentinterest', 'percentageinterest', 'undividedinterest', 'share', 'votingpct', 'votingpercent', 'vote', 'votes'],
  monthly: ['monthly', 'monthlyassessment', 'assessment', 'monthlydues', 'dues', 'fee', 'fees', 'monthlyfee', 'hoafee', 'condofee', 'regularassessment'],
  balance: ['balance', 'balancedue', 'balanceowed', 'amountowed', 'owed', 'owes', 'pastdue', 'arrears', 'outstanding', 'outstandingbalance', 'openbalance', 'openingbalance', 'currentbalance', 'delinquent', 'delinquency'],
  role: ['role', 'office', 'title', 'position', 'boardrole', 'officer'],
  term: ['term', 'termends', 'termend', 'termexpires', 'termexpiration', 'termthrough'],
  category: ['category', 'line', 'lineitem', 'item', 'account', 'accountname', 'description', 'expense', 'budgetline', 'budgetcategory'],
  annual: ['annual', 'annualamount', 'annualbudget', 'budget', 'budgeted', 'amount', 'total', 'yearly', 'year', 'proposed', 'proposedbudget'],
  monthlyAmount: ['monthlyamount', 'permonth', 'monthlybudget'],
};

const norm = (s: string) => s.toLowerCase().replace(/%/g, 'pct').replace(/#/g, 'no').replace(/[^a-z0-9]/g, '');
const text = (c: Cell) => (c === null || c === undefined ? '' : c instanceof Date ? c.toISOString().slice(0, 10) : String(c).trim());

/** A money or percentage cell as a number ("$1,250.00" → 1250, "3.85%" → 3.85), or null. */
export function toNumber(c: Cell): number | null {
  if (typeof c === 'number') return Number.isFinite(c) ? c : null;
  let s = text(c).replace(/[$,\s%]/g, '');
  // Accountants write a credit as "(450.00)" or "450.00 CR".
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (/cr$/i.test(s)) { negative = true; s = s.replace(/cr$/i, ''); }
  if (!s || !/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return negative ? -n : n;
}

function columnOf(header: string): string | null {
  const h = norm(header);
  if (!h) return null;
  for (const [col, names] of Object.entries(COLUMNS)) if (names.includes(h)) return col;
  // Longer headings that contain a known name ("Unit Owner Email" → email; "Percentage of Common Interest" → ownership).
  const contains: [string, string][] = [['balance', 'balance'], ['owed', 'balance'], ['arrear', 'balance'], ['pastdue', 'balance'], ['email', 'email'], ['phone', 'phone'], ['mailing', 'mailing'], ['interest', 'ownership'], ['ownership', 'ownership'], ['pct', 'ownership'], ['assessment', 'monthly'], ['dues', 'monthly'], ['term', 'term'], ['unit', 'unit'], ['owner', 'owner'], ['office', 'role'], ['category', 'category'], ['annual', 'annual'], ['budget', 'annual'], ['proposed', 'annual'], ['amount', 'annual']];
  for (const [part, col] of contains) if (h.includes(part)) return col;
  return null;
}

/** The header row: within the first ten rows, the one naming the most known columns (at least two). */
function findHeader(rows: Cell[][]): { at: number; cols: Record<string, number> } | null {
  let best: { at: number; cols: Record<string, number> } | null = null;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cols: Record<string, number> = {};
    rows[i].forEach((c, j) => { const col = columnOf(text(c)); if (col && cols[col] === undefined) cols[col] = j; });
    if (Object.keys(cols).length >= 2 && (!best || Object.keys(cols).length > Object.keys(best.cols).length)) best = { at: i, cols };
  }
  return best;
}

const empty = (docType: DocType, title: string): ReadResult => ({ docType, title, pageCount: null, summary: '', facts: [], units: [], board: [], insurance: [], vendors: [], budget: [], reserves: [] });

/**
 * Read one sheet. An owner list needs a unit column; a board roster a name
 * and an office; a budget a line name and an amount.
 */
export function readSheet(rows: Cell[][], title: string): ReadResult | { error: string } {
  const head = findHeader(rows);
  if (!head) return { error: 'No column headings found. The first rows should name the columns (for example Unit, Owner, Email).' };
  const { at, cols } = head;
  const body = rows.slice(at + 1).map((r, i) => ({ r, line: at + i + 2 })).filter(({ r }) => r.some(c => text(c)));
  const quote = (r: Cell[]) => r.map(text).filter(Boolean).join(' · ').slice(0, 160);
  const get = (r: Cell[], col: string) => (cols[col] === undefined ? '' : text(r[cols[col]]));

  if (cols.unit !== undefined) {
    const out = empty('owner_list', title);
    for (const { r, line } of body) {
      const unit = get(r, 'unit');
      if (!unit || /^total/i.test(unit)) continue;
      const monthly = cols.monthly === undefined ? null : toNumber(r[cols.monthly]);
      const pct = cols.ownership === undefined ? null : toNumber(r[cols.ownership]);
      const balance = cols.balance === undefined ? null : toNumber(r[cols.balance]);
      const row: UnitRow = {
        unit, owner: get(r, 'owner'), email: get(r, 'email') || null, phone: get(r, 'phone') || null, mailingAddress: get(r, 'mailing') || null,
        ownershipPct: pct, monthlyFee: monthly, openingBalance: balance, page: null, quote: `Row ${line}: ${quote(r)}`,
        confidence: (cols.ownership !== undefined && get(r, 'ownership') && pct === null) || (cols.monthly !== undefined && get(r, 'monthly') && monthly === null) ? 'low' : 'high',
      };
      out.units.push(row);
    }
    // Interests written as fractions (0.0385) become percentages (3.85).
    const total = out.units.reduce((t, u) => t + (u.ownershipPct ?? 0), 0);
    if (total > 0 && total <= 1.5) out.units.forEach(u => { if (u.ownershipPct !== null) u.ownershipPct = Math.round(u.ownershipPct * 1_000_000) / 10_000; });
    if (!out.units.length) return { error: 'The unit column is empty.' };
    out.summary = `${out.units.length} units`;
    return out;
  }

  if (cols.owner !== undefined && cols.role !== undefined) {
    const out = empty('minutes', title);
    for (const { r, line } of body) {
      const name = get(r, 'owner');
      if (!name) continue;
      const row: BoardRow = { name, role: get(r, 'role') || 'Director', email: get(r, 'email') || null, phone: get(r, 'phone') || null, termEnds: get(r, 'term') || null, page: null, quote: `Row ${line}: ${quote(r)}`, confidence: 'high' };
      out.board.push(row);
    }
    out.summary = `${out.board.length} board members`;
    return out.board.length ? out : { error: 'The name column is empty.' };
  }

  if (cols.category !== undefined && (cols.annual !== undefined || cols.monthlyAmount !== undefined || cols.monthly !== undefined)) {
    const out = empty('budget', title);
    for (const { r, line } of body) {
      const category = get(r, 'category');
      if (!category || /^(total|subtotal|net)\b/i.test(category)) continue;
      const annual = cols.annual !== undefined ? toNumber(r[cols.annual]) : null;
      const monthly = cols.monthlyAmount !== undefined ? toNumber(r[cols.monthlyAmount]) : cols.monthly !== undefined ? toNumber(r[cols.monthly]) : null;
      const amount = annual ?? (monthly !== null ? monthly * 12 : null);
      if (amount === null) continue;
      const row: BudgetRow = { category, annualAmount: Math.round(amount * 100) / 100, page: null, quote: `Row ${line}: ${quote(r)}`, confidence: annual === null ? 'low' : 'high' };
      out.budget.push(row);
    }
    out.summary = `${out.budget.length} budget lines`;
    return out.budget.length ? out : { error: 'No budget lines with amounts were found.' };
  }

  return { error: 'This sheet has no Unit column (owner list), Name and Office columns (board), or Line and Amount columns (budget).' };
}

/** Split a CSV file into rows (quoted fields, commas and newlines inside quotes). */
export function parseCsv(src: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',' || ch === '\t' || ch === ';') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** Several sheets (an Excel workbook) merged into one reading; sheets that aren't lists are ignored. */
export function readSheets(sheets: { name: string; rows: Cell[][] }[], title: string): ReadResult | { error: string } {
  const results = sheets.map(s => readSheet(s.rows, title));
  const ok = results.filter((r): r is ReadResult => !('error' in r));
  if (!ok.length) return results[0] ?? { error: 'The file is empty.' };
  const out = { ...ok[0], units: ok.flatMap(r => r.units), board: ok.flatMap(r => r.board), budget: ok.flatMap(r => r.budget) };
  out.summary = ok.map(r => r.summary).join(' · ');
  return out;
}
