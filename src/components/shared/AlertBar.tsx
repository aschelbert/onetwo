interface AlertBarProps {
  badge: string;
  message: string;
  linkText?: string;
  onLinkClick?: () => void;
}

export default function AlertBar({ badge, message, linkText, onLinkClick }: AlertBarProps) {
  return (
    <div
      className="rounded-lg px-4 py-3 flex items-center gap-3"
      style={{ background: '#fff0f1', borderLeft: '4px solid #D62839' }}
    >
      <span className="shrink-0 text-xs font-bold text-white bg-brand-red rounded-full px-2.5 py-0.5">
        {badge}
      </span>
      <p className="text-sm text-ink-800 flex-1">{message}</p>
      {linkText && onLinkClick && (
        <button
          onClick={onLinkClick}
          className="text-sm font-medium text-brand-red hover:underline shrink-0"
        >
          {linkText}
        </button>
      )}
    </div>
  );
}
