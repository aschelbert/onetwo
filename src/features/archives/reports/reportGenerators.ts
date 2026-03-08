import type { ReportType } from '@/lib/services/reports';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useComplianceStore } from '@/store/useComplianceStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useMeetingsStore } from '@/store/useMeetingsStore';
import { usePropertyLogStore } from '@/store/usePropertyLogStore';
import { buildBoardPacketSnapshot } from '@/features/dashboard/tabs/ReportsTab';
import type { ReportConfig } from '@/lib/services/reports';

// ── Snapshot generators by report type ──

function buildCaseSnapshot(type: ReportType, periodStart?: string, periodEnd?: string): Record<string, any> {
  const fin = useFinancialStore.getState();
  const start = periodStart || `${new Date().getFullYear()}-01-01`;
  const end = periodEnd || new Date().toISOString().split('T')[0];
  const snapshot: Record<string, any> = { reportType: type, period: { start, end } };

  if (type === 'reconciliation') {
    const bankAccounts = fin.chartOfAccounts.filter(a => a.num.startsWith('10'));
    snapshot.accounts = bankAccounts.map(acct => {
      const entries = fin.generalLedger.filter(e => e.status === 'posted' && (e.debitAcct === acct.num || e.creditAcct === acct.num));
      return { num: acct.num, name: acct.name, balance: Math.abs(fin.acctBalance(acct.num)), lastEntry: entries.length > 0 ? entries[entries.length - 1].date : null, reconciled: entries.length > 0 };
    });
  }

  if (type === 'budget_variance') {
    snapshot.rows = fin.getBudgetVariance();
  }

  if (type === 'collections_delinquency') {
    const metrics = fin.getIncomeMetrics();
    const aging = fin.getDelinquencyAging();
    snapshot.metrics = metrics;
    snapshot.aging = { current: aging.current.length, days30: aging.days30.length, days60: aging.days60.length, days90plus: aging.days90plus.length };
    snapshot.delinquentUnits = fin.units.filter(u => u.balance > 0).map(u => ({ number: u.number, owner: u.owner, monthlyFee: u.monthlyFee, balance: u.balance }));
  }

  if (type === 'reserve_balances') {
    snapshot.items = fin.reserveItems.map(item => ({
      name: item.name, currentFunding: item.currentFunding, estimatedCost: item.estimatedCost,
      pctFunded: item.estimatedCost > 0 ? Math.round((item.currentFunding / item.estimatedCost) * 100) : 0,
      annualNeeded: item.yearsRemaining > 0 ? Math.round((item.estimatedCost - item.currentFunding) / item.yearsRemaining) : 0,
    }));
    snapshot.annualContribution = fin.annualReserveContribution;
  }

  if (type === 'year_end_projections') {
    const monthsElapsed = new Date().getMonth() + 1;
    const factor = monthsElapsed > 0 ? 12 / monthsElapsed : 1;
    snapshot.categories = fin.budgetCategories.map(cat => {
      const ytd = fin.getCategorySpent(cat);
      const projected = Math.round(ytd * factor);
      return { name: cat.name, ytd, projected, budgeted: cat.budgeted, variance: cat.budgeted - projected };
    });
    snapshot.monthsElapsed = monthsElapsed;
  }

  return snapshot;
}

function buildFinancialSnapshot(type: ReportType, periodStart?: string, periodEnd?: string): Record<string, any> {
  const fin = useFinancialStore.getState();
  const building = useBuildingStore.getState();
  const start = periodStart || `${new Date().getFullYear()}-01-01`;
  const end = periodEnd || `${new Date().getFullYear()}-12-31`;
  const snapshot: Record<string, any> = { reportType: type, period: { start, end } };

  if (type === 'balance_sheet') {
    snapshot.data = fin.getBalanceSheet();
  }

  if (type === 'income_statement') {
    snapshot.data = fin.getIncomeStatement(start, end);
  }

  if (type === 'budget_vs_actual') {
    snapshot.rows = fin.getBudgetVariance();
  }

  if (type === 'form_1120h') {
    const pnl = fin.getIncomeStatement(start, end);
    const exemptIncome = pnl.totalIncome;
    const nonExemptIncome = 0;
    const totalIncome = exemptIncome + nonExemptIncome;
    const deductions = pnl.totalExpenses;
    const taxableIncome = Math.max(0, nonExemptIncome - (deductions * (nonExemptIncome / (totalIncome || 1))));
    snapshot.data = {
      buildingName: building.name, address: building.address,
      entityType: building.details.entityType || 'incorporated',
      exemptIncome, nonExemptIncome, taxableIncome,
      taxOwed: Math.round(taxableIncome * 0.30),
    };
  }

  if (type === 'local_tax_forms') {
    const pnl = fin.getIncomeStatement(start, end);
    snapshot.data = {
      buildingName: building.name, state: building.address.state,
      entityType: building.details.entityType || 'incorporated',
      income: pnl.income, expenses: pnl.expenses,
      totalIncome: pnl.totalIncome, totalExpenses: pnl.totalExpenses, netIncome: pnl.netIncome,
    };
  }

  return snapshot;
}

function buildBoardSnapshot(type: ReportType, periodStart?: string, periodEnd?: string): Record<string, any> {
  const fin = useFinancialStore.getState();
  const comp = useComplianceStore.getState();
  const issues = useIssuesStore.getState();
  const { meetings } = useMeetingsStore.getState();
  const building = useBuildingStore.getState();
  const propertyLog = usePropertyLogStore.getState();

  // Board reports use the existing config-based snapshot builder
  const allSections = [
    { id: 'financial', label: 'Financial Summary', enabled: true },
    { id: 'compliance', label: 'Compliance Status', enabled: true },
    { id: 'maintenance', label: 'Maintenance & Work Orders', enabled: true },
    { id: 'issues', label: 'Open Issues & Cases', enabled: true },
    { id: 'meetings', label: 'Meeting Minutes', enabled: true },
    { id: 'delinquency', label: 'Delinquency Report', enabled: true },
    { id: 'vendor', label: 'Vendor Activity', enabled: true },
    { id: 'property_log', label: 'Property Log', enabled: true },
  ];

  let sections = allSections;
  if (type === 'monthly_summary') sections = allSections.filter(s => ['financial', 'issues', 'meetings'].includes(s.id));
  if (type === 'compliance_report') sections = allSections.filter(s => ['compliance'].includes(s.id));
  if (type === 'financial_snapshot') sections = allSections.filter(s => ['financial', 'delinquency'].includes(s.id));

  const config = { id: '', name: '', type, category: 'board_governance' as const, sections, schedule: 'manual' as const, lastGenerated: '', createdBy: '' } satisfies ReportConfig;
  return buildBoardPacketSnapshot(config, { fin, comp, issues, meetings, building, propertyLog });
}

function buildSalesPackageSnapshot(type: ReportType, unitNumber?: string, periodStart?: string, periodEnd?: string): Record<string, any> {
  const fin = useFinancialStore.getState();
  const building = useBuildingStore.getState();
  const start = periodStart || `${new Date().getFullYear()}-01-01`;
  const end = periodEnd || `${new Date().getFullYear()}-12-31`;
  const snapshot: Record<string, any> = { reportType: type, period: { start, end } };

  if (type === 'resale_certificate') {
    const unit = fin.units.find(u => u.number === unitNumber);
    const bs = fin.getBalanceSheet();
    const metrics = fin.getIncomeMetrics();
    snapshot.data = {
      buildingName: building.name, address: building.address,
      unit: unit ? { number: unit.number, owner: unit.owner, monthlyFee: unit.monthlyFee, balance: unit.balance } : null,
      association: {
        totalUnits: fin.units.length, monthlyRevenue: fin.units.reduce((s, u) => s + u.monthlyFee, 0),
        reserveBalance: bs.assets.reserves, collectionRate: metrics.collectionRate,
        management: building.management,
      },
      pendingLitigation: false,
      specialAssessments: [],
      generatedDate: new Date().toISOString().split('T')[0],
    };
  }

  if (type === 'budget_summary') {
    const bv = fin.getBudgetVariance();
    const totalBudgeted = bv.reduce((s, r) => s + r.budgeted, 0);
    const totalActual = bv.reduce((s, r) => s + r.actual, 0);
    snapshot.data = {
      buildingName: building.name, fiscalYear: start.slice(0, 4),
      categories: bv, totalBudgeted, totalActual,
      unitCount: fin.units.length,
      avgMonthlyFee: fin.units.length > 0 ? Math.round(fin.units.reduce((s, u) => s + u.monthlyFee, 0) / fin.units.length) : 0,
    };
  }

  if (type === 'reserve_study_summary') {
    snapshot.data = {
      buildingName: building.name,
      items: fin.reserveItems.map(item => ({
        name: item.name, currentFunding: item.currentFunding, estimatedCost: item.estimatedCost,
        pctFunded: item.estimatedCost > 0 ? Math.round((item.currentFunding / item.estimatedCost) * 100) : 0,
        yearsRemaining: item.yearsRemaining,
      })),
      totalFunding: fin.reserveItems.reduce((s, i) => s + i.currentFunding, 0),
      totalRequired: fin.reserveItems.reduce((s, i) => s + i.estimatedCost, 0),
      annualContribution: fin.annualReserveContribution,
    };
  }

  if (type === 'insurance_certificate') {
    snapshot.data = {
      buildingName: building.name, address: building.address,
      policies: building.insurance.map(p => ({
        type: p.type, carrier: p.carrier, policyNum: p.policyNum,
        coverage: p.coverage, premium: p.premium, expires: p.expires,
        active: new Date(p.expires) > new Date(),
      })),
    };
  }

  if (type === 'association_info_sheet') {
    snapshot.data = {
      buildingName: building.name, address: building.address, details: building.details,
      management: building.management,
      board: building.board.map(b => ({ name: b.name, role: b.role, email: b.email })),
      legalCounsel: building.legalCounsel.map(l => ({ firm: l.firm, attorney: l.attorney, email: l.email, phone: l.phone })),
      unitCount: fin.units.length,
      amenities: building.details.amenities || [],
    };
  }

  return snapshot;
}

// ── Main generator function ──

interface GenerateOpts {
  unitNumber?: string;
  periodStart?: string;
  periodEnd?: string;
}

export function generateReportSnapshot(type: ReportType, opts?: GenerateOpts): Record<string, any> {
  const { unitNumber, periodStart, periodEnd } = opts || {};
  // Case Analysis
  if (['reconciliation', 'budget_variance', 'collections_delinquency', 'reserve_balances', 'year_end_projections'].includes(type)) {
    return buildCaseSnapshot(type, periodStart, periodEnd);
  }
  // Financial Statements
  if (['balance_sheet', 'income_statement', 'budget_vs_actual', 'form_1120h', 'local_tax_forms'].includes(type)) {
    return buildFinancialSnapshot(type, periodStart, periodEnd);
  }
  // Board & Governance
  if (['board_packet', 'monthly_summary', 'compliance_report', 'financial_snapshot'].includes(type)) {
    return buildBoardSnapshot(type, periodStart, periodEnd);
  }
  // Sales Package
  if (['resale_certificate', 'budget_summary', 'reserve_study_summary', 'insurance_certificate', 'association_info_sheet'].includes(type)) {
    return buildSalesPackageSnapshot(type, unitNumber, periodStart, periodEnd);
  }
  return {};
}
