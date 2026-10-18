import React from 'react';

interface InlineFieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}

export default function InlineField({
  label,
  htmlFor,
  error,
  children,
}: InlineFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium text-ink-600 uppercase tracking-wide"
      >
        {label}
      </label>
      {children}
      {error && (
        <p className="text-xs text-brand-red" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export type { InlineFieldProps };
