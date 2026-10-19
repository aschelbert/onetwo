/**
 * Invoice text parsing and vendor history inference for the Pay Bill drawer.
 *
 * parseInvoiceText -- extracts vendor, invoice number, date, and amount from
 * pasted or OCR'd invoice text using regex heuristics.
 *
 * inferFromVendorHistory -- given a vendor name and the general ledger, looks
 * up the most recent GL entry for that vendor and returns the budget category
 * and GL account number used.
 */

import type { GLEntry, BudgetCategory } from '@/types/financial';

// ── parseInvoiceText ─────────────────────────────────────────────────────

export interface ParsedInvoice {
  vendor: string | null;
  invoiceNumber: string | null;
  date: string | null;
  amount: number | null;
}

/**
 * Attempt to extract invoice fields from raw text (pasted or OCR output).
 * Returns partial results -- callers should allow manual override.
 */
export function parseInvoiceText(text: string): ParsedInvoice {
  const result: ParsedInvoice = {
    vendor: null,
    invoiceNumber: null,
    date: null,
    amount: null,
  };

  if (!text || !text.trim()) return result;

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // ── Vendor: first non-empty line that isn't a date or number ──
  for (const line of lines) {
    // Skip lines that are obviously dates, amounts, or invoice numbers
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(line)) continue;
    if (/^\$[\d,.]+$/.test(line)) continue;
    if (/^(invoice|inv|bill|receipt|statement)[\s#:]/i.test(line)) continue;
    if (line.length < 2 || line.length > 100) continue;
    // Accept alphabetic-heavy lines as vendor name
    if (/[a-zA-Z]{2,}/.test(line)) {
      result.vendor = line;
      break;
    }
  }

  // ── Invoice number: look for "Invoice #NNN", "INV-NNN", "Inv: NNN" etc. ──
  const invoicePatterns = [
    /(?:invoice|inv|bill)\s*(?:#|no\.?|number|num)?\s*[:\s]?\s*([A-Z0-9][\w-]{1,20})/i,
    /(?:#)\s*([A-Z0-9][\w-]{2,20})/i,
  ];
  for (const pattern of invoicePatterns) {
    const match = text.match(pattern);
    if (match) {
      result.invoiceNumber = match[1];
      break;
    }
  }

  // ── Date: look for common date formats ──
  const datePatterns = [
    // MM/DD/YYYY or MM-DD-YYYY
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
    // YYYY-MM-DD (ISO)
    /(\d{4})-(\d{2})-(\d{2})/,
    // Month DD, YYYY
    /(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s*(\d{4})/i,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        const dateStr = match[0];
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          result.date = parsed.toISOString().split('T')[0];
          break;
        }
      } catch {
        // skip invalid date
      }
    }
  }

  // ── Amount: look for dollar amounts ──
  const amountPatterns = [
    // "Total: $1,234.56" or "Amount Due: $1234.56"
    /(?:total|amount\s*due|balance\s*due|grand\s*total|due)\s*[:\s]?\s*\$?([\d,]+\.?\d{0,2})/i,
    // Standalone "$1,234.56" -- pick the largest
    /\$([\d,]+\.\d{2})/g,
  ];

  // Try labeled patterns first
  for (const pattern of [amountPatterns[0]]) {
    const match = text.match(pattern);
    if (match) {
      const cleaned = match[1].replace(/,/g, '');
      const num = parseFloat(cleaned);
      if (num > 0 && num < 10_000_000) {
        result.amount = Math.round(num * 100) / 100;
        break;
      }
    }
  }

  // Fallback: find all dollar amounts and pick the largest
  if (result.amount === null) {
    const dollarMatches = [...text.matchAll(/\$([\d,]+\.\d{2})/g)];
    if (dollarMatches.length > 0) {
      const amounts = dollarMatches
        .map(m => parseFloat(m[1].replace(/,/g, '')))
        .filter(n => n > 0 && n < 10_000_000);
      if (amounts.length > 0) {
        result.amount = Math.round(Math.max(...amounts) * 100) / 100;
      }
    }
  }

  return result;
}

// ── inferFromVendorHistory ───────────────────────────────────────────────

export interface VendorInference {
  glAccount: string | null;
  budgetCategoryId: string | null;
  budgetCategoryName: string | null;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Given a vendor name, search the general ledger for the most recent expense
 * entry with that vendor in the memo, and return the GL account + budget
 * category used.
 */
export function inferFromVendorHistory(
  vendorName: string,
  generalLedger: GLEntry[],
  budgetCategories: BudgetCategory[],
): VendorInference {
  const result: VendorInference = {
    glAccount: null,
    budgetCategoryId: null,
    budgetCategoryName: null,
    confidence: 'low',
  };

  if (!vendorName || !vendorName.trim()) return result;

  const needle = vendorName.toLowerCase().trim();

  // Find GL entries whose memo contains the vendor name (expense or case entries)
  const vendorEntries = generalLedger
    .filter(e =>
      (e.source === 'expense' || e.source === 'case') &&
      e.memo.toLowerCase().includes(needle),
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  if (vendorEntries.length === 0) return result;

  const mostRecent = vendorEntries[0];
  result.glAccount = mostRecent.debitAcct;

  // Try to match GL account to a budget category
  for (const cat of budgetCategories) {
    const hasVendorExpense = cat.expenses.some(
      exp => exp.vendor.toLowerCase().includes(needle),
    );
    if (hasVendorExpense) {
      result.budgetCategoryId = cat.id;
      result.budgetCategoryName = cat.name;
      break;
    }
  }

  // Confidence based on how many matching entries
  if (vendorEntries.length >= 3) {
    result.confidence = 'high';
  } else if (vendorEntries.length >= 1) {
    result.confidence = 'medium';
  }

  return result;
}
