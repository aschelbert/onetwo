import type { ReactNode } from 'react';

interface ModalProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  onSave?: () => void;
  saveLabel?: string;
  saveColor?: string;
  footer?: ReactNode;
  wide?: boolean;
}

export default function Modal({ title, subtitle, children, onClose, onSave, saveLabel = 'Save', saveColor = 'bg-ink-900 hover:bg-ink-800', footer, wide }: ModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className={`bg-white rounded-xl ${wide ? 'max-w-4xl' : 'max-w-md'} w-full max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="border-b p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl font-bold text-ink-900">{title}</h2>
              {subtitle && <p className="text-sm text-ink-500 mt-1">{subtitle}</p>}
            </div>
            <button onClick={onClose} className="text-ink-300 hover:text-ink-500 text-2xl leading-none">×</button>
          </div>
        </div>
        <div className="p-6">{children}</div>
        {(onSave || footer) && (
          <div className="border-t p-6 flex justify-end space-x-3">
            {footer}
            {!footer && (
              <>
                <button onClick={onClose} className="px-4 py-2 text-ink-700 hover:text-ink-900 font-medium">Cancel</button>
                {onSave && <button onClick={onSave} className={`px-6 py-2 text-white rounded-lg font-medium ${saveColor}`}>{saveLabel}</button>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
