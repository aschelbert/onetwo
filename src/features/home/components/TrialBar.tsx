// Trial countdown bar — renders above TopNav when tenant is in trial.
// Matches day-one-reference.html: teal bg, white text, "Add a card" link.

import { useTenantContext } from '@/components/TenantProvider';

export default function TrialBar() {
  const tenant = useTenantContext();
  const { billing } = tenant;

  if (billing.status !== 'in_trial' || !billing.trialEndsAt) return null;

  const endDate = new Date(billing.trialEndsAt);
  const now = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / msPerDay));
  const totalTrialDays = 21; // DEFAULT_TRIAL_DAYS
  const dayNumber = Math.max(1, totalTrialDays - daysLeft + 1);

  const endStr = endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  return (
    <div
      style={{
        background: '#155E75',
        color: '#ffffff',
        minHeight: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '0 24px',
        fontSize: 13,
        flexWrap: 'wrap',
      }}
    >
      <span>
        <strong>Day {dayNumber} of your {totalTrialDays} day trial.</strong>{' '}
        Everything is on. Nothing is billed until {endStr}.
      </span>
      <a
        href="/subscription"
        style={{ color: '#A5F3FC', fontWeight: 600, textDecoration: 'none' }}
      >
        Add a card
      </a>
    </div>
  );
}
