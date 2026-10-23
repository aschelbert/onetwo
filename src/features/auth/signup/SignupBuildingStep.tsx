// Step 2: Building name, address typeahead, units
// Matches signup-reference.html step 2

import { useState, useEffect, useRef } from 'react';
import type { SignupState, AddressResult } from './useSignupState';
import { supabase, isBackendEnabled } from '@/lib/supabase';

interface Props {
  state: SignupState;
  set: <K extends keyof SignupState>(key: K, value: SignupState[K]) => void;
  canAdvance: boolean;
  onNext: () => void;
}

export default function SignupBuildingStep({ state, set, canAdvance, onNext }: Props) {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Title */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 32, fontWeight: 600, letterSpacing: '-0.01em', margin: 0 }}>
          Tell us about your building
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.5, color: '#4b5a6b', margin: 0 }}>
          Twenty-one days free. No card. Anyone can start a building: a board member, an owner, a manager.
        </p>
      </div>

      {/* Building name */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#2b3a4b' }}>Building or association name</label>
        <input
          value={state.buildingName}
          onChange={e => set('buildingName', e.target.value)}
          placeholder="1302 R Street Condominium"
          autoFocus
          style={{
            fontFamily: 'inherit', fontSize: 16, padding: '12px 14px',
            border: '1.5px solid #c9d2dc', borderRadius: 10, background: '#ffffff',
            color: '#0D1B2E', width: '100%', boxSizing: 'border-box', minHeight: 48,
          }}
        />
      </div>

      {/* Street address */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#2b3a4b' }}>Street address</label>
        <div style={{ position: 'relative' }}>
          <input
            value={state.addressQuery}
            onChange={e => set('addressQuery', e.target.value)}
            placeholder="1302 R St NW, Washington, DC 20009"
            autoComplete="street-address"
            style={{
              fontFamily: 'inherit', fontSize: 16, padding: '12px 14px',
              border: '1.5px solid #c9d2dc', borderRadius: 10, background: '#ffffff',
              color: '#0D1B2E', width: '100%', boxSizing: 'border-box', minHeight: 48,
            }}
          />
          {state.addressLoading && (
            <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
              <div className="w-4 h-4 border-2 border-ink-200 border-t-ink-600 rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Address verification feedback */}
        {state.addressResult && !state.addressLoading && (
          <>
            {state.addressResult.status === 'verified' && !addressClaimed && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                borderRadius: 10, padding: '8px 12px', marginTop: 2,
                color: '#155E75', background: '#ecfeff', border: '1px solid #a5f3fc',
              }}>
                <span style={{ fontWeight: 700 }}>Verified</span>
                <span>
                  {state.addressResult.fullAddress}
                  {state.addressResult.ward && `, Ward ${state.addressResult.ward}`}
                  {state.addressResult.ssl && `. ${state.addressResult.ssl}`}
                </span>
              </div>
            )}
            {state.addressResult.status === 'verified' && addressClaimed && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                borderRadius: 10, padding: '8px 12px', marginTop: 2,
                color: '#D62839', background: '#fff0f1', border: '1px solid #fecdd3',
              }}>
                <span style={{ fontWeight: 700 }}>Already on ONE two</span>
                <span>
                  {addressClaimed} already uses ONE two.{' '}
                  <a href="/login?invite=1" style={{ color: '#D62839' }}>Ask your board for an invite.</a>
                </span>
              </div>
            )}
            {state.addressResult.status === 'not_condo' && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                borderRadius: 10, padding: '8px 12px', marginTop: 2,
                color: '#9a3412', background: '#fff7ed', border: '1px solid #fed7aa',
              }}>
                <span style={{ fontWeight: 700 }}>On record, not as a condominium</span>
                <span>You can continue; we will check it with you.</span>
              </div>
            )}
            {state.addressResult.status === 'not_found' && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                borderRadius: 10, padding: '8px 12px', marginTop: 2,
                color: '#9a3412', background: '#fff7ed', border: '1px solid #fed7aa',
              }}>
                <span style={{ fontWeight: 700 }}>Not found</span>
                <span>We could not find this address in the DC address registry. Check the spelling, or continue and we will verify it by hand.</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Units */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 200 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#2b3a4b' }}>How many units?</label>
        <input
          inputMode="numeric"
          value={state.totalUnits}
          onChange={e => {
            const v = e.target.value === '' ? '' : parseInt(e.target.value) || 0;
            set('totalUnits', v as any);
          }}
          placeholder="12"
          style={{
            fontFamily: 'inherit', fontSize: 16, padding: '12px 14px',
            border: '1.5px solid #c9d2dc', borderRadius: 10, background: '#ffffff',
            color: '#0D1B2E', width: '100%', boxSizing: 'border-box', minHeight: 48,
          }}
        />
      </div>

      {/* Continue */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onNext}
          disabled={!canAdvance}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            minHeight: 48, padding: '0 22px', borderRadius: 10, fontWeight: 600, fontSize: 16,
            border: 0, cursor: canAdvance ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
            background: canAdvance ? '#D62839' : '#e3e8ee',
            color: canAdvance ? '#ffffff' : '#8fa0b3',
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
