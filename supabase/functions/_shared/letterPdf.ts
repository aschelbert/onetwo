// supabase/functions/_shared/letterPdf.ts
// Renders a notice as a US-Letter PDF for LetterStream: return address and
// recipient block positioned for a #10 window envelope, then the dated letter.

import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

export interface LetterInput {
  subject: string;
  body: string;
  sender: { name: string; line1: string; line2?: string; city: string; state: string; zip: string };
  recipient: { name: string; line1: string; line2?: string; city: string; state: string; zip: string };
  date?: Date;
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

export async function renderLetterPdf(input: LetterInput): Promise<{ bytes: Uint8Array; pageCount: number }> {
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
