import type { FiduciaryAlert } from '@/types/issues';

interface AlertContext {
  insurance: Array<{ type: string; expires: string }>;
  reservePctFunded: number;
  openCases: Array<{ id: string; title: string; created: string; status: string; steps?: Array<{ done: boolean }> | null }>;
  delinquentUnits: Array<{ number: string; balance: number; daysPastDue: number }>;
  boardVotesWithoutConflictChecks: number;
  bylawsSpendingLimit: number;
  pendingSpendingAboveLimit: number;
}

export function computeFiduciaryAlerts(ctx: AlertContext): FiduciaryAlert[] {
  const alerts: FiduciaryAlert[] = [];
  const now = new Date();
  const in60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  // Duty of Care
  ctx.insurance.forEach(p => {
    const exp = new Date(p.expires);
    if (exp < now) {
      alerts.push({ id: `ins-expired-${p.type}`, duty: 'care', severity: 'critical', title: `${p.type} insurance expired`, description: `Policy expired ${p.expires}. Immediate renewal required.`, actionLabel: 'View Insurance', actionPath: '/building' });
    } else if (exp < in60) {
      alerts.push({ id: `ins-expiring-${p.type}`, duty: 'care', severity: 'critical', title: `${p.type} insurance expiring soon`, description: `Policy expires ${p.expires}. Begin renewal process.`, actionLabel: 'View Insurance', actionPath: '/building' });
    }
  });

  if (ctx.reservePctFunded < 50) {
    alerts.push({ id: 'reserves-critical', duty: 'care', severity: 'critical', title: 'Reserve funding critically low', description: `Reserve fund is only ${ctx.reservePctFunded}% funded. Minimum recommended: 70%.`, actionLabel: 'View Reserves', actionPath: '/financial' });
  } else if (ctx.reservePctFunded < 70) {
    alerts.push({ id: 'reserves-low', duty: 'care', severity: 'warning', title: 'Reserve funding below target', description: `Reserve fund is ${ctx.reservePctFunded}% funded. Target: 70%.`, actionLabel: 'View Reserves', actionPath: '/financial' });
  }

  // Delinquent units > 60 days with no open case
  const overdue60 = ctx.delinquentUnits.filter(u => u.daysPastDue > 60);
  if (overdue60.length > 0) {
    alerts.push({ id: 'delinquent-no-case', duty: 'care', severity: 'warning', title: `${overdue60.length} unit${overdue60.length > 1 ? 's' : ''} 60+ days delinquent`, description: 'Board has a duty to pursue collections for delinquent assessments.', actionLabel: 'View Cases', actionPath: '/boardroom' });
  }

  // Stale cases
  const staleCases = ctx.openCases.filter(c => {
    const created = new Date(c.created);
    const daysSinceCreated = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    return daysSinceCreated > 90;
  });
  if (staleCases.length > 0) {
    alerts.push({ id: 'stale-cases', duty: 'care', severity: 'warning', title: `${staleCases.length} case${staleCases.length > 1 ? 's' : ''} inactive > 90 days`, description: 'Review stale cases for potential closure or escalation.', actionLabel: 'Review Cases', actionPath: '/boardroom' });
  }

  // Duty of Loyalty
  if (ctx.boardVotesWithoutConflictChecks > 0) {
    alerts.push({ id: 'votes-no-coi', duty: 'loyalty', severity: 'critical', title: 'Financial votes without conflict checks', description: `${ctx.boardVotesWithoutConflictChecks} spending vote${ctx.boardVotesWithoutConflictChecks > 1 ? 's' : ''} recorded without conflict-of-interest declarations.`, actionLabel: 'Review Cases', actionPath: '/boardroom' });
  }

  // Duty of Obedience
  if (ctx.pendingSpendingAboveLimit > 0) {
    alerts.push({ id: 'spending-above-authority', duty: 'obedience', severity: 'critical', title: 'Spending exceeds bylaws authority', description: `${ctx.pendingSpendingAboveLimit} pending expenditure${ctx.pendingSpendingAboveLimit > 1 ? 's' : ''} above board spending limit without owner vote.`, actionLabel: 'Review Spending', actionPath: '/financial' });
  }

  return alerts.sort((a, b) => {
    const sevOrder = { critical: 0, warning: 1, info: 2 };
    return sevOrder[a.severity] - sevOrder[b.severity];
  });
}
