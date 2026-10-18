import React from 'react';

interface SegmentedControlProps<T extends string = string> {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}

export default function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  size = 'md',
}: SegmentedControlProps<T>) {
  const padding = size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm';

  return (
    <div
      className="inline-flex rounded-lg border border-ink-200 bg-ink-50 p-0.5"
      role="tablist"
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(opt.value)}
            className={`
              ${padding} rounded-md font-medium transition-colors
              ${
                isActive
                  ? 'bg-white text-navy shadow-sm'
                  : 'text-ink-500 hover:text-ink-700'
              }
            `}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export type { SegmentedControlProps };
