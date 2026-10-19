import { describe, it, expect } from 'vitest';
import { parseInvoiceText, inferFromVendorHistory } from '@/lib/invoiceInference';
import type { GLEntry, BudgetCategory } from '@/types/financial';

// ── parseInvoiceText ─────────────────────────────────────────────────

describe('parseInvoiceText', () => {
  it('extracts vendor, invoice number, date, and amount from typical invoice', () => {
    const text = `
      Apex Roofing LLC
      Invoice #INV-2045
      Date: 03/15/2026

      Emergency roof repair labor    $800.00
      Materials                      $400.00

      Total: $1,200.00
    `;
    const result = parseInvoiceText(text);
    expect(result.vendor).toBe('Apex Roofing LLC');
    expect(result.invoiceNumber).toBe('INV-2045');
    expect(result.date).toBe('2026-03-15');
    expect(result.amount).toBe(1200.00);
  });

  it('handles ISO date format', () => {
    const text = `
      Quick Fix Plumbing
      Inv: PL-9001
      2026-02-28
      Amount Due: $450.00
    `;
    const result = parseInvoiceText(text);
    expect(result.vendor).toBe('Quick Fix Plumbing');
    expect(result.invoiceNumber).toBe('PL-9001');
    expect(result.date).toBe('2026-02-28');
    expect(result.amount).toBe(450.00);
  });

  it('picks the largest dollar amount when no label is present', () => {
    const text = `
      Green Thumb Landscaping
      Service: $150.00
      Equipment: $200.00
      Tax: $28.00
    `;
    const result = parseInvoiceText(text);
    expect(result.vendor).toBe('Green Thumb Landscaping');
    expect(result.amount).toBe(200.00);
  });

  it('returns nulls for empty text', () => {
    const result = parseInvoiceText('');
    expect(result.vendor).toBeNull();
    expect(result.invoiceNumber).toBeNull();
    expect(result.date).toBeNull();
    expect(result.amount).toBeNull();
  });

  it('returns nulls for whitespace-only text', () => {
    const result = parseInvoiceText('   \n  \n  ');
    expect(result.vendor).toBeNull();
  });

  it('handles "Balance Due" label', () => {
    const text = `
      Metro Gas Company
      Balance Due: $425.00
    `;
    const result = parseInvoiceText(text);
    expect(result.amount).toBe(425.00);
  });

  it('extracts invoice number with # prefix', () => {
    const text = `
      CPA Solutions Inc
      Bill #B-2026-0045
      Total: $350.00
    `;
    const result = parseInvoiceText(text);
    expect(result.invoiceNumber).toBe('B-2026-0045');
  });
});

// ── inferFromVendorHistory ───────────────────────────────────────────

describe('inferFromVendorHistory', () => {
  const mockLedger: GLEntry[] = [
    {
      id: 'GL100', date: '2026-01-15', memo: 'Plumbing repair - Quick Fix Plumbing',
      debitAcct: '5010', creditAcct: '1010', amount: 450,
      source: 'expense', sourceId: 'INV-1001', posted: '2026-01-15T00:00:00Z', status: 'posted',
    },
    {
      id: 'GL101', date: '2026-02-03', memo: 'Emergency roof repair - Apex Roofing',
      debitAcct: '5010', creditAcct: '1010', amount: 1200,
      source: 'expense', sourceId: 'INV-1003', posted: '2026-02-03T00:00:00Z', status: 'posted',
    },
    {
      id: 'GL102', date: '2025-11-10', memo: 'Plumbing fix - Quick Fix Plumbing',
      debitAcct: '5010', creditAcct: '1010', amount: 300,
      source: 'expense', sourceId: 'INV-0901', posted: '2025-11-10T00:00:00Z', status: 'posted',
    },
    {
      id: 'GL103', date: '2025-08-10', memo: 'Toilet repair - Quick Fix Plumbing',
      debitAcct: '5010', creditAcct: '1010', amount: 200,
      source: 'expense', sourceId: 'INV-0801', posted: '2025-08-10T00:00:00Z', status: 'posted',
    },
    {
      id: 'GL200', date: '2026-01-15', memo: 'Payment received - Unit 301',
      debitAcct: '1010', creditAcct: '1110', amount: 750,
      source: 'payment', sourceId: '301', posted: '2026-01-15T00:00:00Z', status: 'posted',
    },
  ];

  const mockCategories: BudgetCategory[] = [
    {
      id: 'cat1', name: 'Maintenance & Repairs', budgeted: 8000, expenses: [
        { id: 'exp1', date: '2026-01-15', description: 'Plumbing repair', amount: 450, vendor: 'Quick Fix Plumbing', invoice: 'INV-1001' },
        { id: 'exp3', date: '2026-02-03', description: 'Roof repair', amount: 1200, vendor: 'Apex Roofing', invoice: 'INV-1003' },
      ],
    },
    {
      id: 'cat2', name: 'Utilities', budgeted: 5000, expenses: [
        { id: 'exp4', date: '2026-01-10', description: 'Electricity', amount: 1250, vendor: 'City Power & Light', invoice: 'INV-2001' },
      ],
    },
  ];

  it('infers GL account and category from vendor name', () => {
    const result = inferFromVendorHistory('Quick Fix Plumbing', mockLedger, mockCategories);
    expect(result.glAccount).toBe('5010');
    expect(result.budgetCategoryId).toBe('cat1');
    expect(result.budgetCategoryName).toBe('Maintenance & Repairs');
  });

  it('returns high confidence when 3+ matches exist', () => {
    const result = inferFromVendorHistory('Quick Fix Plumbing', mockLedger, mockCategories);
    expect(result.confidence).toBe('high');
  });

  it('returns medium confidence when 1-2 matches exist', () => {
    const result = inferFromVendorHistory('Apex Roofing', mockLedger, mockCategories);
    expect(result.confidence).toBe('medium');
  });

  it('returns low confidence for unknown vendor', () => {
    const result = inferFromVendorHistory('Unknown Vendor', mockLedger, mockCategories);
    expect(result.confidence).toBe('low');
    expect(result.glAccount).toBeNull();
    expect(result.budgetCategoryId).toBeNull();
  });

  it('returns low confidence for empty vendor name', () => {
    const result = inferFromVendorHistory('', mockLedger, mockCategories);
    expect(result.confidence).toBe('low');
  });

  it('is case-insensitive', () => {
    const result = inferFromVendorHistory('quick fix plumbing', mockLedger, mockCategories);
    expect(result.glAccount).toBe('5010');
    expect(result.budgetCategoryId).toBe('cat1');
  });
});
