import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import ConsentBoxes from '@/features/auth/ConsentBoxes';
import { NO_CONSENT, POLICY_VERSION, missingConsent, recordConsent, type Consent } from '@/lib/consent';

function Harness({ onState }: { onState: (c: Consent) => void }) {
  const [c, setC] = useState<Consent>(NO_CONSENT);
  onState(c);
  return <ConsentBoxes idPrefix="t" value={c} onChange={setC} />;
}

describe('ConsentBoxes', () => {
  it('shows three separate checkboxes, none ticked by default', () => {
    render(<Harness onState={() => {}} />);
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes).toHaveLength(3);
    expect(boxes.every(b => !b.checked)).toBe(true);
    expect(screen.getByRole('link', { name: 'Terms of Service' }).getAttribute('href')).toBe('/terms');
    expect(screen.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe('/privacy');
  });

  it('keeps product emails independent of accepting the privacy policy', () => {
    let state: Consent = NO_CONSENT;
    render(<Harness onState={c => { state = c; }} />);
    fireEvent.click(screen.getByLabelText(/I agree to the Terms of Service/));
    fireEvent.click(screen.getByLabelText(/Privacy Policy/));
    expect(state).toEqual({ terms: true, privacy: true, marketing: false });
    fireEvent.click(screen.getByLabelText(/product news, tips and offers/));
    expect(state.marketing).toBe(true);
  });
});

describe('missingConsent', () => {
  it('requires Terms and Privacy but not product emails', () => {
    expect(missingConsent(NO_CONSENT)).toMatch(/Terms of Service and the Privacy Policy/);
    expect(missingConsent({ terms: true, privacy: false, marketing: true })).toMatch(/Privacy Policy/);
    expect(missingConsent({ terms: false, privacy: true, marketing: false })).toMatch(/Terms of Service/);
    expect(missingConsent({ terms: true, privacy: true, marketing: false })).toBeNull();
  });
});

describe('recordConsent', () => {
  it('sends exactly what was ticked, with the policy version', async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ok = await recordConsent({ rpc } as any, 'signup', ' Dana@Example.com ', { terms: true, privacy: true, marketing: false });
    expect(ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith('record_consent', {
      p_source: 'signup', p_email: 'Dana@Example.com', p_terms: true, p_privacy: true, p_marketing: false, p_policy_version: POLICY_VERSION,
    });
  });

  it('never throws when the record cannot be stored', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await recordConsent({ rpc: async () => ({ error: { message: 'nope' } }) } as any, 'demo', 'a@b.co', NO_CONSENT)).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await recordConsent({ rpc: async () => { throw new Error('offline'); } } as any, 'demo', 'a@b.co', NO_CONSENT)).toBe(false);
  });
});
