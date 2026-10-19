// Trial countdown bar — renders above TopNav when tenant is in trial.

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

  return (
    <div className="bg-brand-cyan/10 border-b border-brand-cyan/20 px-4 py-1.5 flex items-center justify-center gap-3 text-sm">
      <span className="font-medium text-ink-700">
        Day {dayNumber} of your {totalTrialDays}-day trial
      </span>
      <span className="text-ink-400">·</span>
      <span className="text-ink-500">
        {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining
      </span>
      <a
        href="/subscription"
        className="ml-2 text-xs font-semibold text-accent-600 hover:text-accent-700 underline"
      >
        Add a card
      </a>
    </div>
  );
}
