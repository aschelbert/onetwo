/**
 * The text of a PDF, page by page and line by line, pulled out in the
 * browser with pdf.js (loaded only when a PDF is added). Scanned PDFs with no
 * text layer come back empty.
 *
 * The legacy build is used on purpose: the standard build calls brand-new
 * JavaScript (Map.prototype.getOrInsertComputed, Uint8Array.fromBase64…) that
 * Safari doesn't have yet, so reading failed there. The legacy build carries
 * polyfills for them.
 */
export async function pdfLines(file: File): Promise<string[][]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { default: workerUrl } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const pages: string[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Group text pieces into lines by their baseline, then order each line left to right.
    const rows = new Map<number, { x: number; s: string; w: number }[]>();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 2) * 2;
      const row = rows.get(y) ?? [];
      row.push({ x: item.transform[4], s: item.str, w: item.width });
      rows.set(y, row);
    }
    const lines = [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, parts]) => {
      parts.sort((a, b) => a.x - b.x);
      let line = '';
      let end = -Infinity;
      for (const part of parts) {
        // A wide gap between pieces is a column break: keep it as two spaces so tables stay readable.
        line += line ? (part.x - end > 12 ? '  ' : part.x - end > 1 ? ' ' : '') : '';
        line += part.s;
        end = part.x + part.w;
      }
      return line.trim();
    });
    pages.push(lines.filter(Boolean));
  }
  await task.destroy();
  return pages;
}
