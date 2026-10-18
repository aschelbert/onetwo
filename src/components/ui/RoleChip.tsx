import React from 'react';

interface RoleChipProps {
  label: string;
  tone?: 'default' | 'teal' | 'amber' | 'red';
}

const TONE_STYLES: Record<string, string> = {
  default: 'border-brand-teal text-brand-teal',
  teal: 'border-brand-teal bg-brand-teal-light text-brand-teal',
  amber: 'border-amber-600 bg-amber-50 text-amber-800',
  red: 'border-brand-red bg-red-50 text-brand-red',
};

export default function RoleChip({ label, tone = 'default' }: RoleChipProps) {
  return (
    <span
      className={`
        inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border
        ${TONE_STYLES[tone] || TONE_STYLES.default}
      `}
      data-testid="role-chip"
    >
      {label}
    </span>
  );
}

export type { RoleChipProps };
