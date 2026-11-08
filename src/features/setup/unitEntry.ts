/**
 * Adding units by hand during setup: a range ("101" to "112"), or pasted
 * lines with the unit, owner, email, ownership % and monthly assessment in
 * any order. A pasted block with a heading row is read by its headings
 * instead (the same matching as spreadsheet import).
 */
import { parseCsv, readSheet, toNumber } from './importSpreadsheet';

export interface UnitDraft { number: string; owner: string; email: string; votingPct: number | null; monthlyFee: number | null }

/** "101".."112", "1A".."1D", "A-1".."A-6": the numbers between two unit numbers that share a prefix and suffix. Null when they don't. */
export function unitRange(first: string, last: string, max = 500): string[] | null {
  const a = /^(\D*?)(\d+)(\D*)$/.exec(first.trim());
  const b = /^(\D*?)(\d+)(\D*)$/.exec(last.trim());
  if (a && b && a[1].toLowerCase() === b[1].toLowerCase() && a[3].toLowerCase() === b[3].toLowerCase()) {
    const from = Number(a[2]); const to = Number(b[2]);
    if (to < from || to - from + 1 > max) return null;
    const width = a[2].length === b[2].length && a[2].startsWith('0') ? a[2].length : 0;
    return Array.from({ length: to - from + 1 }, (_, i) => `${a[1]}${String(from + i).padStart(width, '0')}${a[3]}`.toUpperCase());
  }
  // Letters at the end: "1A".."1F".
  const la = /^(.*?)([A-Za-z])$/.exec(first.trim());
  const lb = /^(.*?)([A-Za-z])$/.exec(last.trim());
  if (la && lb && la[1] === lb[1]) {
    const s = la[2].toUpperCase().charCodeAt(0); const e = lb[2].toUpperCase().charCodeAt(0);
    if (e < s) return null;
    return Array.from({ length: e - s + 1 }, (_, i) => `${la[1]}${String.fromCharCode(s + i)}`.toUpperCase());
  }
  return null;
}

const EMAIL = /[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]+/;
const UNIT = /^#?([A-Za-z]{0,2}-?\d{1,5}[A-Za-z]?|\d{1,4}-[A-Za-z0-9]{1,3})$/;

/** Read pasted unit lines. Returns drafts plus the lines that had no unit number. */
export function parseUnitLines(text: string): { units: UnitDraft[]; skipped: string[] } {
  // With a heading row ("Unit, Owner, Email, %, Monthly"), match the columns.
  const rows = parseCsv(text.replace(/\t/g, ','));
  const sheet = readSheet(rows, 'Pasted units');
  if (!('error' in sheet) && sheet.units.length) {
    return {
      units: sheet.units.map(u => ({ number: u.unit.replace(/^unit\s*/i, '').toUpperCase(), owner: u.owner, email: u.email ?? '', votingPct: u.ownershipPct, monthlyFee: u.monthlyFee })),
      skipped: [],
    };
  }
  const units: UnitDraft[] = [];
  const skipped: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const email = EMAIL.exec(line)?.[0] ?? '';
    const parts = line.replace(email, ' ').split(/\s*[,;\t|]\s*|\s{2,}/).map(p => p.trim()).filter(Boolean);
    let number = '';
    let pct: number | null = null;
    let fee: number | null = null;
    const owner: string[] = [];
    for (const p of parts) {
      const unitWord = /^unit\s*#?\s*(\S+)$/i.exec(p);
      if (!number && (unitWord || UNIT.test(p))) { number = (unitWord ? unitWord[1] : p).replace(/^#/, '').toUpperCase(); continue; }
      if (/%$/.test(p) && toNumber(p) !== null) { pct = toNumber(p); continue; }
      if (/^\$/.test(p) && toNumber(p) !== null) { fee = toNumber(p); continue; }
      const n = toNumber(p);
      if (n !== null) {
        // A bare number: a fraction or small decimal is the ownership share, a larger one the monthly amount.
        if (pct === null && (n < 1 || (/\.\d{2,}/.test(p) && n <= 100 && fee !== null))) { pct = n < 1 ? Math.round(n * 1_000_000) / 10_000 : n; continue; }
        if (fee === null) { fee = n; continue; }
        if (pct === null && n <= 100) { pct = n; continue; }
      }
      owner.push(p);
    }
    if (!number) { skipped.push(line); continue; }
    units.push({ number, owner: owner.join(' '), email: email.toLowerCase(), votingPct: pct, monthlyFee: fee });
  }
  return { units, skipped };
}
