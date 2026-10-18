/**
 * Month-close logic for Fiscal Lens.
 *
 * closeChecklist() inspects GL entries, units, invoices, work orders,
 * and communications for a given period and returns four steps with
 * done flags and detail strings.
 *
 * buildStatement() generates a treasurer's monthly statement (HTML + plain text).
 */

import type { GLEntry, Unit, UnitInvoice } from '@/types/financial';
import type { WorkOrder } from '@/data/financial';

// ── Types ──────────────────────────────────────────────────────────────────

export interface CloseChecklistStep {
  key: string;
  label: string;
  done: boolean;
  detail: string;
}

export interface CloseChecklistInputs {
  generalLedger: GLEntry[];
  units: Unit[];
  workOrders: WorkOrder[];
  invoices: UnitInvoice[];
  communications: Array<{ type: string; date: string; [k: string]: unknown }>;
  settings: { hoaDueDay: number };
}

export interface StatementFigures {
  collected: number;
  billed: number;
  collectionRate: number;
  expensesPaid: number;
  invoiceCount: number;
  operatingCash: number;
  operatingDelta: number;
  reserves: number;
  reservePct: number;
  reserveAdded: number;
  pastDueUnits: number;
  pastDueTotal: number;
  decisions: string[];
}

export interface StatementResult {
  html: string;
  text: string;
  figures: StatementFigures;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Return 'YYYY-MM' from a date string or Date. */
export function toPeriod(d: string | Date): string {
  const s = typeof d === 'string' ? d : d.toISOString().split('T')[0];
  return s.slice(0, 7);
}

/** Return human month name, e.g. "October 2026". */
export function periodLabel(period: string): string {
  const [y, m] = period.split('-');
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function fmtCurrency(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── closeChecklist ─────────────────────────────────────────────────────────

export function closeChecklist(
  period: string,
  inputs: CloseChecklistInputs,
): CloseChecklistStep[] {
  const { generalLedger, units, workOrders, invoices, communications, settings } = inputs;
  const steps: CloseChecklistStep[] = [];

  // 1. Assessments posted
  const assessmentEntries = generalLedger.filter(
    e => toPeriod(e.date) === period && (e.source === 'assessment' || e.source === 'fee'),
  );
  const periodInvoices = invoices.filter(i => toPeriod(i.createdDate) === period);
  // A unit is billed if it has an assessment GL entry or a unit invoice for the period
  const billedUnits = new Set<string>();
  assessmentEntries.forEach(e => { if (e.sourceId) billedUnits.add(e.sourceId); });
  periodInvoices.forEach(i => billedUnits.add(i.unitNumber));

  const allBilled = units.length > 0 && billedUnits.size >= units.length;
  const totalBilled = assessmentEntries.reduce((s, e) => s + e.amount, 0)
    + periodInvoices.reduce((s, i) => s + i.amount, 0);

  // Find the latest billing date
  const billingDates = [
    ...assessmentEntries.map(e => e.date),
    ...periodInvoices.map(i => i.createdDate),
  ].sort();
  const lastBillingDate = billingDates.length > 0 ? billingDates[billingDates.length - 1] : '';

  steps.push({
    key: 'assessmentsPosted',
    label: 'Assessments posted',
    done: allBilled,
    detail: allBilled
      ? `${billedUnits.size} units billed${lastBillingDate ? ' ' + fmtDate(lastBillingDate) : ''}, ${fmtCurrency(totalBilled)}`
      : `${billedUnits.size} of ${units.length} units billed`,
  });

  // 2. Payments recorded
  const paymentEntries = generalLedger.filter(
    e => toPeriod(e.date) === period && e.source === 'payment',
  );
  const paidUnitIds = new Set<string>();
  paymentEntries.forEach(e => { if (e.sourceId) paidUnitIds.add(e.sourceId); });

  const lateUnits = units.filter(u => u.balance > 0);
  const allPaid = billedUnits.size > 0 && paidUnitIds.size >= billedUnits.size;
  const lateDetails = lateUnits.slice(0, 3).map(u => {
    const daysPastDue = Math.max(
      0,
      Math.floor((Date.now() - new Date(`${period}-${String(settings.hoaDueDay).padStart(2, '0')}`).getTime()) / 86400000),
    );
    return `Unit ${u.number} (${fmtCurrency(u.balance)}, ${daysPastDue}d)`;
  });

  steps.push({
    key: 'paymentsRecorded',
    label: 'Payments recorded',
    done: allPaid,
    detail: allPaid
      ? `${paidUnitIds.size} of ${billedUnits.size} units paid`
      : `${paidUnitIds.size} paid of ${billedUnits.size} billed${lateDetails.length > 0 ? '. Late: ' + lateDetails.join(', ') : ''}`,
  });

  // 3. Bills paid
  const periodWO = workOrders.filter(
    w => w.createdDate && toPeriod(w.createdDate) === period,
  );
  const periodInv = invoices.filter(
    i => toPeriod(i.createdDate) === period && (i.type === 'fee' || i.type === 'amenity_fee'),
  );
  const paidWO = periodWO.filter(w => w.status === 'paid');
  const openWO = periodWO.filter(w => w.status !== 'paid');
  const paidInv = periodInv.filter(i => i.status === 'paid');
  const totalBills = periodWO.length + periodInv.length;
  const totalPaidBills = paidWO.length + paidInv.length;
  const allBillsPaid = totalBills === 0 || totalPaidBills >= totalBills;

  steps.push({
    key: 'billsPaid',
    label: 'Bills paid',
    done: allBillsPaid,
    detail: totalBills === 0
      ? 'No bills for this period'
      : `${totalPaidBills} of ${totalBills} bills paid${openWO.length > 0 ? '. ' + openWO.length + ' WO open' : ''}`,
  });

  // 4. Statement sent
  const statementComm = communications.find(
    c => c.type === 'statement' && toPeriod(c.date) === period,
  );

  steps.push({
    key: 'statementSent',
    label: 'Statement sent',
    done: !!statementComm,
    detail: statementComm ? 'Statement delivered' : 'Statement not yet sent',
  });

  return steps;
}

// ── buildStatement ─────────────────────────────────────────────────────────

export interface BuildStatementInputs {
  generalLedger: GLEntry[];
  units: Unit[];
  workOrders: WorkOrder[];
  invoices: UnitInvoice[];
  reserveItems: Array<{ estimatedCost: number; currentFunding: number }>;
  budgetCategories: Array<{ budgeted: number; expenses: Array<{ amount: number }> }>;
  operatingCash: number;
  prevOperatingCash: number;
  buildingName: string;
  period: string;
  closedBy: string;
  decisions?: string[];
}

export function buildStatement(
  period: string,
  inputs: BuildStatementInputs,
): StatementResult {
  const {
    generalLedger, units, workOrders, invoices, reserveItems,
    budgetCategories, operatingCash, prevOperatingCash,
    buildingName, closedBy, decisions = [],
  } = inputs;

  // Compute figures
  const assessmentEntries = generalLedger.filter(
    e => toPeriod(e.date) === period && (e.source === 'assessment' || e.source === 'fee'),
  );
  const paymentEntries = generalLedger.filter(
    e => toPeriod(e.date) === period && e.source === 'payment',
  );
  const expenseEntries = generalLedger.filter(
    e => toPeriod(e.date) === period && (e.source === 'expense' || e.source === 'case'),
  );

  const billed = assessmentEntries.reduce((s, e) => s + e.amount, 0);
  const collected = paymentEntries.reduce((s, e) => s + e.amount, 0);
  const collectionRate = billed > 0 ? Math.round((collected / billed) * 100) : 100;
  const expensesPaid = expenseEntries.reduce((s, e) => s + e.amount, 0);

  const periodInvoices = invoices.filter(i => toPeriod(i.createdDate) === period);
  const invoiceCount = periodInvoices.length;

  const pastDueUnits = units.filter(u => u.balance > 0);
  const pastDueTotal = pastDueUnits.reduce((s, u) => s + u.balance, 0);

  const totalReserveFunded = reserveItems.reduce((s, i) => s + i.currentFunding, 0);
  const totalReserveNeeded = reserveItems.reduce((s, i) => s + i.estimatedCost, 0);
  const reservePct = totalReserveNeeded > 0
    ? Math.round((totalReserveFunded / totalReserveNeeded) * 100)
    : 100;

  // Reserve contribution for this month
  const reserveTransfers = generalLedger.filter(
    e => toPeriod(e.date) === period && e.source === 'transfer' && (e.debitAcct === '1020' || e.creditAcct === '1020'),
  );
  const reserveAdded = reserveTransfers.reduce((s, e) => s + e.amount, 0);

  const operatingDelta = operatingCash - prevOperatingCash;

  const figures: StatementFigures = {
    collected,
    billed,
    collectionRate,
    expensesPaid,
    invoiceCount,
    operatingCash,
    operatingDelta,
    reserves: totalReserveFunded,
    reservePct,
    reserveAdded,
    pastDueUnits: pastDueUnits.length,
    pastDueTotal,
    decisions,
  };

  const mLabel = periodLabel(period);

  // ── Build plain text statement ──
  const textLines: string[] = [
    `${buildingName} -- Monthly Treasurer's Statement`,
    `Period: ${mLabel}`,
    `Prepared by: ${closedBy}`,
    '',
    '--- Financial Summary ---',
    `Assessments billed: ${fmtCurrency(billed)}`,
    `Payments collected: ${fmtCurrency(collected)}`,
    `Collection rate: ${collectionRate}%`,
    `Expenses paid: ${fmtCurrency(expensesPaid)}`,
    `Invoices processed: ${invoiceCount}`,
    '',
    `Operating cash: ${fmtCurrency(operatingCash)} (${operatingDelta >= 0 ? '+' : ''}${fmtCurrency(operatingDelta)} from prior month)`,
    `Reserves: ${fmtCurrency(totalReserveFunded)} (${reservePct}% funded)`,
    reserveAdded > 0 ? `Reserve contribution this month: ${fmtCurrency(reserveAdded)}` : '',
    '',
    `Past due: ${pastDueUnits.length} unit${pastDueUnits.length !== 1 ? 's' : ''}, ${fmtCurrency(pastDueTotal)} outstanding`,
    '',
  ];

  if (decisions.length > 0) {
    textLines.push('--- Board Decisions ---');
    decisions.forEach(d => textLines.push(`- ${d}`));
    textLines.push('');
  }

  textLines.push(
    '--- Compliance ---',
    'This statement is maintained in accordance with DC Code 42-1903.14,',
    'which requires associations to maintain accurate records of receipts and expenditures.',
    '',
    `Closed: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
  );

  const text = textLines.filter(l => l !== undefined).join('\n');

  // ── Build HTML statement ──
  const html = `
<div style="font-family: system-ui, sans-serif; max-width: 640px; margin: 0 auto;">
  <div style="background: #0d1b2e; color: white; padding: 24px 28px; border-radius: 12px 12px 0 0;">
    <h1 style="margin: 0; font-size: 20px;">${buildingName}</h1>
    <p style="margin: 4px 0 0; opacity: 0.8; font-size: 14px;">Monthly Treasurer's Statement -- ${mLabel}</p>
  </div>
  <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px 28px; border-radius: 0 0 12px 12px;">
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
      <div>
        <p style="margin: 0; font-size: 12px; color: #6b7280;">Collected</p>
        <p style="margin: 2px 0 0; font-size: 20px; font-weight: 700;">${fmtCurrency(collected)}</p>
      </div>
      <div>
        <p style="margin: 0; font-size: 12px; color: #6b7280;">Collection Rate</p>
        <p style="margin: 2px 0 0; font-size: 20px; font-weight: 700;">${collectionRate}%</p>
      </div>
      <div>
        <p style="margin: 0; font-size: 12px; color: #6b7280;">Operating Cash</p>
        <p style="margin: 2px 0 0; font-size: 20px; font-weight: 700;">${fmtCurrency(operatingCash)}</p>
      </div>
      <div>
        <p style="margin: 0; font-size: 12px; color: #6b7280;">Reserves (${reservePct}% funded)</p>
        <p style="margin: 2px 0 0; font-size: 20px; font-weight: 700;">${fmtCurrency(totalReserveFunded)}</p>
      </div>
    </div>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
    <p style="font-size: 14px; color: #374151; line-height: 1.6;">
      In ${mLabel}, the association billed ${fmtCurrency(billed)} in assessments and collected
      ${fmtCurrency(collected)}, yielding a ${collectionRate}% collection rate.
      ${pastDueUnits.length > 0
        ? `${pastDueUnits.length} unit${pastDueUnits.length !== 1 ? 's' : ''} remain past due totaling ${fmtCurrency(pastDueTotal)}.`
        : 'All units are current.'}
      Operating expenses of ${fmtCurrency(expensesPaid)} were paid.
      Operating cash stands at ${fmtCurrency(operatingCash)}
      (${operatingDelta >= 0 ? '+' : ''}${fmtCurrency(operatingDelta)} from prior month).
      ${reserveAdded > 0 ? `${fmtCurrency(reserveAdded)} was added to reserves this month.` : ''}
      The reserve fund is ${reservePct}% funded at ${fmtCurrency(totalReserveFunded)}.
    </p>
    ${decisions.length > 0 ? `
    <h3 style="font-size: 14px; font-weight: 600; margin: 16px 0 8px;">Board Decisions</h3>
    <ul style="font-size: 14px; color: #374151; padding-left: 20px; margin: 0;">
      ${decisions.map(d => `<li>${d}</li>`).join('')}
    </ul>` : ''}
    <p style="font-size: 11px; color: #9ca3af; margin-top: 20px;">
      This statement is maintained in accordance with DC Code 42-1903.14,
      which requires associations to maintain accurate records of receipts and expenditures.
    </p>
    <p style="font-size: 11px; color: #9ca3af; margin-top: 8px;">
      Prepared by ${closedBy} -- Closed ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
    </p>
  </div>
</div>`.trim();

  return { html, text, figures };
}
