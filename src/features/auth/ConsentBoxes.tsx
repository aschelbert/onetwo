import type { Consent } from '@/lib/consent';

/**
 * The three consent checkboxes shown wherever someone gives us their email.
 * All start unticked. Terms and Privacy are required; product communications
 * is optional and separate, as our email provider's sending policy requires.
 */
export default function ConsentBoxes({ value, onChange, idPrefix }: {
  value: Consent;
  onChange: (next: Consent) => void;
  /** Keeps ids unique when more than one form is on the page. */
  idPrefix: string;
}) {
  const row = 'flex items-start gap-2.5 text-sm text-ink-700';
  const box = 'mt-0.5 h-4 w-4 flex-none';
  const link = 'font-medium text-accent-600 underline hover:text-accent-700';
  return (
    <fieldset className="space-y-2.5 rounded-lg border border-ink-200 px-3 py-3">
      <legend className="sr-only">Agreements</legend>
      <label htmlFor={`${idPrefix}-terms`} className={row}>
        <input id={`${idPrefix}-terms`} type="checkbox" className={box} checked={value.terms}
          onChange={e => onChange({ ...value, terms: e.target.checked })} />
        <span>I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer" className={link}>Terms of Service</a>. *</span>
      </label>
      <label htmlFor={`${idPrefix}-privacy`} className={row}>
        <input id={`${idPrefix}-privacy`} type="checkbox" className={box} checked={value.privacy}
          onChange={e => onChange({ ...value, privacy: e.target.checked })} />
        <span>I have read and agree to the <a href="/privacy" target="_blank" rel="noopener noreferrer" className={link}>Privacy Policy</a>. *</span>
      </label>
      <label htmlFor={`${idPrefix}-marketing`} className={row}>
        <input id={`${idPrefix}-marketing`} type="checkbox" className={box} checked={value.marketing}
          onChange={e => onChange({ ...value, marketing: e.target.checked })} />
        <span>
          Email me ONE two product news, tips and offers. Optional; you can unsubscribe at any time.
          <span className="mt-0.5 block text-xs text-ink-500">Emails about your account and building, such as invoices, notices and password resets, are sent either way.</span>
        </span>
      </label>
    </fieldset>
  );
}
