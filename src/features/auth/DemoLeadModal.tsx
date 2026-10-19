import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import { supabase, logDbError } from '@/lib/supabase';

type MemberSegment = 'board_member' | 'owner' | 'property_manager' | 'other';

interface DemoLeadModalProps {
  onClose: (email?: string) => void;
}

const SEGMENTS: { value: MemberSegment; label: string }[] = [
  { value: 'board_member', label: 'Board member' },
  { value: 'owner', label: 'Owner' },
  { value: 'property_manager', label: 'Property manager' },
  { value: 'other', label: 'Other' },
];

function wasAlreadyShown(): boolean {
  try { return localStorage.getItem('onetwo-demo-lead-shown') === '1'; } catch { return false; }
}

function markShown(): void {
  try { localStorage.setItem('onetwo-demo-lead-shown', '1'); } catch { /* ignore */ }
}

export default function DemoLeadModal({ onClose }: DemoLeadModalProps) {
  const [email, setEmail] = useState('');
  const [buildingName, setBuildingName] = useState('');
  const [unitCount, setUnitCount] = useState<number | ''>('');
  const [segment, setSegment] = useState<MemberSegment>('board_member');

  const handleContinue = () => {
    markShown();
    if (email.trim() && supabase) {
      // Map 'owner' -> 'resident' for the DB enum
      const memberType = segment === 'owner' ? 'resident' : segment;
      supabase.rpc('submit_demo_lead', {
        p_name: '',
        p_email: email.trim().toLowerCase(),
        p_condo_name: buildingName.trim() || '',
        p_unit_count: typeof unitCount === 'number' ? unitCount : null,
        p_member_type: memberType,
        p_subscription_interest: 'facilities',
        p_source: 'bar',
      }).then(
        ({ error }) => { if (error) logDbError('submit_demo_lead', error); },
        (err: unknown) => logDbError('submit_demo_lead', err),
      );
    }
    onClose(email.trim() || undefined);
  };

  const handleSkip = () => {
    markShown();
    onClose();
  };

  return (
    <Modal
      title="Before you go, who are you?"
      subtitle="One question, then straight to signup."
      onClose={handleSkip}
      footer={
        <div className="flex gap-3 w-full">
          <button
            onClick={handleSkip}
            className="flex-1 py-2.5 border border-ink-200 text-ink-700 rounded-lg text-sm font-semibold hover:bg-ink-50"
          >
            Skip
          </button>
          <button
            onClick={handleContinue}
            className="flex-1 py-2.5 bg-ink-900 text-white rounded-lg text-sm font-semibold hover:bg-ink-800"
          >
            Continue to signup
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 border border-ink-200 rounded-xl text-sm"
            placeholder="you@example.com"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">
            Building name <span className="text-ink-300 font-normal">(optional)</span>
          </label>
          <input
            value={buildingName}
            onChange={(e) => setBuildingName(e.target.value)}
            className="w-full px-4 py-3 border border-ink-200 rounded-xl text-sm"
            placeholder="e.g., Sunny Acres Condominium"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">
            Unit count <span className="text-ink-300 font-normal">(optional)</span>
          </label>
          <input
            type="number"
            min={1}
            value={unitCount}
            onChange={(e) => setUnitCount(e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
            className="w-full px-4 py-3 border border-ink-200 rounded-xl text-sm"
            placeholder="e.g., 50"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-2">I am a...</label>
          <div className="flex flex-wrap gap-2">
            {SEGMENTS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSegment(s.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  segment === s.value
                    ? 'bg-accent-50 border-accent-400 text-accent-700'
                    : 'bg-white border-ink-200 text-ink-600 hover:border-ink-300'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export { wasAlreadyShown };
