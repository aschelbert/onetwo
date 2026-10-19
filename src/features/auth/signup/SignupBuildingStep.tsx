// Step 1: Building name, address typeahead, units, amenity chips

import { useState, useEffect, useRef } from 'react';
import type { BuildingAmenity } from '@/lib/tiers';
import type { SignupState, AddressResult } from './useSignupState';
import { supabase, isBackendEnabled } from '@/lib/supabase';

const AMENITY_OPTIONS: { id: BuildingAmenity; label: string }[] = [
  { id: 'elevator', label: 'Elevator' },
  { id: 'pool', label: 'Pool' },
  { id: 'gym', label: 'Gym' },
  { id: 'sport_court', label: 'Tennis / Sport Court' },
  { id: 'parking_garage', label: 'Parking Garage' },
  { id: 'roof_deck', label: 'Roof Deck' },
];

interface Props {
  state: SignupState;
  set: <K extends keyof SignupState>(key: K, value: SignupState[K]) => void;
  setAmenities: (amenities: BuildingAmenity[]) => void;
  canAdvance: boolean;
  onNext: () => void;
}

export default function SignupBuildingStep({ state, set, setAmenities, canAdvance, onNext }: Props) {
  const [addressClaimed, setAddressClaimed] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Verify address when query changes (debounced)
  useEffect(() => {
    if (!state.addressQuery.trim() || state.addressQuery.length < 5) {
      set('addressResult', null);
      setAddressClaimed(null);
      return;
    }

    set('addressLoading', true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const sbUrl = import.meta.env.VITE_SUPABASE_URL;
        if (!sbUrl) {
          set('addressLoading', false);
          return;
        }

        const res = await fetch(`${sbUrl}/functions/v1/verify-address`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: state.addressQuery }),
        });

        if (!res.ok) {
          set('addressResult', null);
          set('addressLoading', false);
          return;
        }

        const data: AddressResult = await res.json();
        set('addressResult', data);

        // If verified, check if already claimed
        if (data.status === 'verified' && data.marAddressId) {
          const claimRes = await fetch(
            `${sbUrl}/functions/v1/verify-address?marAddressId=${encodeURIComponent(data.marAddressId)}`,
          );
          if (claimRes.ok) {
            const claimData = await claimRes.json();
            setAddressClaimed(claimData.claimed ? claimData.buildingName : null);
          }

          // Auto-fill units if available
          if (data.unitsOnRecord && !state.totalUnits) {
            set('totalUnits', data.unitsOnRecord);
          }
        }
      } catch {
        set('addressResult', null);
      }
      set('addressLoading', false);
    }, 600);

    return () => clearTimeout(debounceRef.current);
  }, [state.addressQuery]);

  const toggleAmenity = (id: BuildingAmenity) => {
    const next = state.amenities.includes(id)
      ? state.amenities.filter(a => a !== id)
      : [...state.amenities, id];
    setAmenities(next);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-ink-700 mb-1">Building / Association Name</label>
        <input
          value={state.buildingName}
          onChange={e => set('buildingName', e.target.value)}
          className="w-full px-4 py-3 border border-ink-200 rounded-xl text-sm"
          placeholder="e.g., Sunny Acres Condominium"
          autoFocus
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-ink-700 mb-1">Street Address</label>
        <div className="relative">
          <input
            value={state.addressQuery}
            onChange={e => set('addressQuery', e.target.value)}
            className="w-full px-4 py-3 border border-ink-200 rounded-xl text-sm"
            placeholder="e.g., 1234 16th St NW"
          />
          {state.addressLoading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-ink-200 border-t-ink-600 rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Address verification feedback */}
        {state.addressResult && !state.addressLoading && (
          <div className="mt-2">
            {state.addressResult.status === 'verified' && (
              <div className="flex items-start gap-2 text-xs">
                <span className="text-sage-600 mt-0.5">&#10003;</span>
                <div>
                  <span className="text-sage-700 font-medium">{state.addressResult.fullAddress}</span>
                  {addressClaimed && (
                    <p className="text-amber-600 mt-0.5">
                      This address is already registered by &quot;{addressClaimed}&quot;.
                      You can still proceed if this is a different association.
                    </p>
                  )}
                </div>
              </div>
            )}
            {state.addressResult.status === 'not_condo' && (
              <p className="text-xs text-amber-600">
                {state.addressResult.fullAddress} was found but doesn&apos;t appear to be a condominium.
                You can still continue if this is correct.
              </p>
            )}
            {state.addressResult.status === 'not_found' && (
              <p className="text-xs text-ink-400">
                Address not found in the DC address database. You can still enter it manually.
              </p>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-ink-700 mb-1">How many units?</label>
        <input
          type="number"
          min={1}
          value={state.totalUnits}
          onChange={e => {
            const v = e.target.value === '' ? '' : parseInt(e.target.value) || 0;
            set('totalUnits', v as any);
          }}
          className="w-full px-4 py-3 border border-ink-200 rounded-xl text-sm"
          placeholder="e.g., 12"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-ink-700 mb-1">Which of these does your building have?</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {AMENITY_OPTIONS.map(a => (
            <button
              key={a.id}
              type="button"
              onClick={() => toggleAmenity(a.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                state.amenities.includes(a.id)
                  ? 'bg-accent-50 border-accent-400 text-accent-700'
                  : 'bg-white border-ink-200 text-ink-600 hover:border-ink-300'
              }`}
            >
              {a.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setAmenities([])}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              state.amenities.length === 0
                ? 'bg-ink-100 border-ink-300 text-ink-700'
                : 'bg-white border-ink-200 text-ink-600 hover:border-ink-300'
            }`}
          >
            None
          </button>
        </div>
      </div>

      <button
        onClick={onNext}
        disabled={!canAdvance}
        className="w-full py-3.5 bg-ink-900 text-white rounded-xl font-semibold text-sm hover:bg-ink-800 disabled:opacity-50"
      >
        Continue
      </button>
    </div>
  );
}
