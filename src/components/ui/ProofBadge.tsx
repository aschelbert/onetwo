import React from 'react';
import { Paperclip } from 'lucide-react';

interface ProofBadgeProps {
  label?: string;
  onClick?: () => void;
  missing?: boolean;
}

export default function ProofBadge({
  label,
  onClick,
  missing = false,
}: ProofBadgeProps) {
  if (missing) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-red">
        <Paperclip size={14} />
        No proof
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-medium text-brand-teal hover:underline transition-colors"
    >
      <Paperclip size={14} />
      {label || 'Proof attached'}
    </button>
  );
}

export type { ProofBadgeProps };
