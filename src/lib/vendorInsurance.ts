/**
 * Vendor certificates of insurance: what coverage a contractor has shown the
 * building, and whether it is still in force. General liability is the one a
 * vendor is expected to have on file before working on the property.
 */
import type { Vendor, VendorCertificate } from '@/store/useBuildingStore';

export const COVERAGES: { id: VendorCertificate['coverage']; label: string }[] = [
  { id: 'general_liability', label: 'General liability' },
  { id: 'workers_comp', label: 'Workers’ compensation' },
  { id: 'umbrella', label: 'Excess / umbrella' },
  { id: 'auto', label: 'Commercial auto' },
  { id: 'professional', label: 'Professional liability' },
];

export const coverageLabel = (id: string) => COVERAGES.find(c => c.id === id)?.label ?? id;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const days = (from: string, to: string) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);

export type CertificateState = 'lapsed' | 'expiring' | 'current';

export function certificateState(c: Pick<VendorCertificate, 'expires'>, today: string, warnDays = 30): CertificateState {
  if (!ISO.test(c.expires || '')) return 'lapsed';
  const d = days(today, c.expires);
  return d < 0 ? 'lapsed' : d <= warnDays ? 'expiring' : 'current';
}

export interface VendorInsuranceStatus {
  /** missing: no general liability certificate at all. */
  state: 'missing' | CertificateState;
  /** The certificate that decides the state (the lapsed or soonest-expiring one). */
  worst?: VendorCertificate;
  daysLeft?: number;
  count: number;
}

/** Where a vendor's insurance stands: missing general liability, something lapsed, something expiring, or all current. */
export function vendorInsuranceStatus(v: Pick<Vendor, 'insurance'>, today: string, warnDays = 30): VendorInsuranceStatus {
  const certs = v.insurance ?? [];
  // A renewed certificate replaces the old one: judge each coverage by its latest expiry.
  const latest = new Map<string, VendorCertificate>();
  for (const c of certs) { const cur = latest.get(c.coverage); if (!cur || (c.expires || '') > (cur.expires || '')) latest.set(c.coverage, c); }
  const live = Array.from(latest.values()).sort((a, b) => (a.expires || '').localeCompare(b.expires || ''));
  if (!latest.has('general_liability')) return { state: 'missing', count: certs.length };
  const worst = live[0];
  const state = certificateState(worst, today, warnDays);
  return { state, worst, daysLeft: ISO.test(worst.expires || '') ? days(today, worst.expires) : undefined, count: certs.length };
}
