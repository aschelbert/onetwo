import { useState } from 'react';
import UnitsManager from './UnitsManager';
import PaymentsManager from './PaymentsManager';

type SubTab = 'roster' | 'payments';

export default function TheUnitsTab() {
  const [sub, setSub] = useState<SubTab>('roster');

  return (
    <div className="space-y-4">
      {/* Sub-tab nav */}
      <div className="flex gap-1 bg-mist-50 rounded-lg p-1 w-fit">
        {([
          { id: 'roster' as SubTab, label: 'Unit Roster' },
          { id: 'payments' as SubTab, label: 'Payments & Collections' },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              sub === t.id
                ? 'bg-white text-ink-900 shadow-sm'
                : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      {sub === 'roster' && <UnitsManager />}
      {sub === 'payments' && <PaymentsManager />}
    </div>
  );
}
