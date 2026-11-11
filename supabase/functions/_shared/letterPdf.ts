// supabase/functions/_shared/letterPdf.ts
// Renders a notice as a US-Letter PDF for the mail vendor: return address and
// recipient block positioned for a #10 window envelope, then the dated letter.

import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

export interface LetterInput {
  subject: string;
  body: string;
  sender: { name: string; line1: string; line2?: string; city: string; state: string; zip: string };
  recipient: { name: string; line1: string; line2?: string; city: string; state: string; zip: string };
  date?: Date;
}

/**
 * pdf-lib's standard fonts can only encode WinAnsi. Letter bodies come from
 * templates and free-text merge fields, so anything outside that set (arrows,
 * ≥, emoji, non-Latin scripts) is replaced rather than crashing the send.
 */
const REPLACE: Record<string, string> = {
  "\u2192": "->", "\u2190": "<-", "\u2194": "<->", "\u21D2": "=>", "\u2265": ">=", "\u2264": "<=", "\u2260": "!=",
  "\u2212": "-", "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2015": "-", "\u2032": "'", "\u2033": '"',
  "\u00A0": " ", "\u2009": " ", "\u200A": " ", "\u2002": " ", "\u2003": " ", "\u202F": " ", "\u200B": "",
  "\u2713": "x", "\u2714": "x", "\u2717": "x", "\u2718": "x", "\u25CF": "\u2022", "\u25AA": "\u2022", "\u2023": "\u2022",
  "\u2192\uFE0F": "->",
};
// Code points WinAnsi has above 0x7E (the 0x80–0x9F block plus Latin-1 0xA0–0xFF).
const WINANSI_HIGH = new Set([
  0x20AC, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017D,
  0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x017E, 0x0178,
]);
export function toWinAnsi(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0x0A || cp === 0x0D || cp === 0x09) { out += ch; continue; }
    if (cp >= 0x20 && cp <= 0x7E) { out += ch; continue; }
    if (cp >= 0xA0 && cp <= 0xFF) { out += ch; continue; }
    if (WINANSI_HIGH.has(cp)) { out += ch; continue; }
    if (REPLACE[ch] !== undefined) { out += REPLACE[ch]; continue; }
    // Strip accents the font lacks (e.g. ő → o), then drop what is left over (emoji, other scripts).
    const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const bcp = base.codePointAt(0) ?? 0;
    out += base && bcp >= 0x20 && bcp <= 0xFF ? base : "";
  }
  return out;
}

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 72;
const FONT_SIZE = 11;
const LINE = 15;

function wrap(text: string, width: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  for (const para of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (!para.trim()) { out.push(""); continue; }
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next) <= width) { line = next; continue; }
      if (line) out.push(line);
      // A single word wider than the line is broken by character.
      let w = word;
      while (measure(w) > width && w.length > 1) {
        let i = w.length;
        while (i > 1 && measure(w.slice(0, i)) > width) i--;
        out.push(w.slice(0, i));
        w = w.slice(i);
      }
      line = w;
    }
    out.push(line);
  }
  return out;
}

export async function renderLetterPdf(raw: LetterInput): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const clean = (a: LetterInput["sender"]) => ({ ...a, name: toWinAnsi(a.name), line1: toWinAnsi(a.line1), line2: a.line2 ? toWinAnsi(a.line2) : a.line2, city: toWinAnsi(a.city), state: toWinAnsi(a.state), zip: toWinAnsi(a.zip) });
  const input: LetterInput = { ...raw, subject: toWinAnsi(raw.subject), body: toWinAnsi(raw.body), sender: clean(raw.sender), recipient: clean(raw.recipient) };
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const measure = (s: string) => font.widthOfTextAtSize(s, FONT_SIZE);
  const width = PAGE_W - MARGIN * 2;
  const ink = rgb(0.1, 0.1, 0.12);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const draw = (text: string, f = font, size = FONT_SIZE) => {
    if (y < MARGIN) { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; }
    if (text) page.drawText(text, { x: MARGIN, y, size, font: f, color: ink });
    y -= LINE;
  };

  const addr = (a: LetterInput["sender"]) => [a.name, a.line1, a.line2 || "", `${a.city}, ${a.state} ${a.zip}`].filter(Boolean);

  // Return address, top left.
  for (const l of addr(input.sender)) draw(l, font, 10);
  y -= LINE;
  draw((input.date ?? new Date()).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }));
  y -= LINE;
  // Recipient block sits where a #10 window envelope shows it.
  for (const l of addr(input.recipient)) draw(l);
  y -= LINE;
  for (const l of wrap(`RE: ${input.subject}`, width, s => bold.widthOfTextAtSize(s, FONT_SIZE))) draw(l, bold);
  y -= LINE / 2;
  for (const l of wrap(input.body, width, measure)) draw(l);

  const pageCount = doc.getPageCount();
  const pages = doc.getPages();
  if (pageCount > 1) {
    pages.forEach((p, i) => p.drawText(`Page ${i + 1} of ${pageCount}`, { x: PAGE_W - MARGIN - 60, y: MARGIN / 2, size: 8, font, color: rgb(0.5, 0.5, 0.5) }));
  }
  return { bytes: await doc.save(), pageCount };
}
