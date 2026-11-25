import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InsuranceTab, { INSURANCE_LOG } from '@/ux2/building/tabs/InsuranceTab';
import { useBuildingStore } from '@/store/useBuildingStore';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useActionRecordsStore } from '@/store/useActionRecordsStore';
import { usePayrollStore } from '@/store/usePayrollStore';

const TODAY = '2026-11-25';
const policy = (o: object) => ({ id: 'p1', type: 'Master Policy', carrier: 'Harbor Mutual', coverage: '$14,000,000', premium: '$21,400/yr', expires: '2027-09-30', policyNum: 'CPP-1', deductible: '$25,000', attachments: [{ name: 'dec.pdf', size: '1 KB', uploadedAt: '2026-10-01', type: 'application/pdf' }], ...o });
const unit = (number: string, o: object = {}) => ({ number, owner: `Owner ${number}`, email: `${number}@example.com`, monthlyFee: 500, balance: 0, payments: [], lateFees: [], specialAssessments: [], votingPct: 0, status: 'OCCUPIED', ...o });
const doc = (unitNumber: string, expires: string | null) => ({ id: `d${unitNumber}`, unitNumber, uploadedBy: null, uploadedByName: 'Owner', filename: `HO6-${unitNumber}.pdf`, storagePath: '', docType: 'insurance', visibleToOwner: true, createdAt: '2026-06-01T00:00:00Z', details: expires == null ? null : { carrier: 'Lakeside', policyNum: 'H6', expires, confirmedBy: 'Owner', confirmedOn: '2026-06-01' } });
const show = (isBoard = true) => render(<MemoryRouter><InsuranceTab today={TODAY} isBoard={isBoard} /></MemoryRouter>);

describe('Building › Insurance', () => {
  beforeEach(() => {
    cleanup();
    useActionRecordsStore.setState({ records: [] });
    usePayrollStore.setState({ staff: [] } as never);
    useBuildingStore.setState({ insurance: [policy({}), policy({ id: 'p2', type: 'Directors & Officers (D&O)', coverage: '$2,000,000', deductible: '', expires: '2026-09-30', attachments: [] }), policy({ id: 'p3', type: 'Cyber', coverage: '$500,000' })] } as never);
    useFinancialStore.setState({ tenantId: null, units: [unit('101'), unit('102'), unit('103'), unit('104', { email: '' })], unitDocuments: [doc('101', '2027-03-03'), doc('102', '2026-12-10'), doc('104', null)] } as never);
  });

  it('lists each expected coverage, held or not, with every field and a way to edit', () => {
    show();
    const card = document.querySelector('[aria-label="The association\'s policies"]') as HTMLElement;
    expect(within(card).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Coverage', 'Carrier · policy', 'Limit', 'Deductible', 'Premium', 'Expires', 'Certificate', '']);
    // Held: property (as "Master Policy"), D&O, and one the list does not know (Cyber).
    expect([...card.querySelectorAll('[data-policy]')].map(r => r.getAttribute('data-policy'))).toEqual(['p1', 'p2', 'p3']);
    // Not held: general liability and the fidelity bond are expected; workers' comp is not, with no employees.
    const notHeld = [...card.querySelectorAll('[data-not-held]')].map(r => `${r.getAttribute('data-not-held')}:${/not every building/.test(r.textContent ?? '') ? 'optional' : 'expected'}`);
    expect(notHeld).toEqual(['liability:expected', 'fidelity:expected', 'umbrella:optional', 'boiler:optional', 'workers:optional', 'flood:optional']);
    expect(within(card).getByText('2 expected and not held')).toBeTruthy();
    const dno = card.querySelector('[data-policy="p2"]') as HTMLElement;
    expect(dno.textContent).toContain('Lapsed');
    expect(dno.textContent).toContain('Missing');
  });

  it('corrects a policy and lists the change; adds one that was not held', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Directors & Officers (D&O)' }));
    const form = screen.getByRole('form', { name: 'Edit Directors & Officers (D&O)' });
    fireEvent.change(within(form).getByLabelText('Deductible'), { target: { value: '$5,000' } });
    fireEvent.change(within(form).getByLabelText('Expires'), { target: { value: '2027-09-30' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(useBuildingStore.getState().insurance.find(p => p.id === 'p2')).toMatchObject({ deductible: '$5,000', expires: '2027-09-30' });
    const log = useActionRecordsStore.getState().records.find(r => r.kind === INSURANCE_LOG)!.data as { changes: { policy: string; what: string }[] };
    expect(log.changes[0]).toMatchObject({ policy: 'Directors & Officers (D&O)', what: 'deductible to $5,000; expiry from 2026-09-30 to 2027-09-30' });
    fireEvent.click(screen.getByRole('button', { name: 'Add General liability' }));
    const add = screen.getByRole('form', { name: 'Add a policy' });
    expect((within(add).getByLabelText('Coverage') as HTMLInputElement).value).toBe('General liability');
    fireEvent.change(within(add).getByLabelText('Carrier'), { target: { value: 'Granite State' } });
    fireEvent.click(within(add).getByRole('button', { name: 'Add the policy' }));
    expect(useBuildingStore.getState().insurance.some(p => p.type === 'General liability' && p.carrier === 'Granite State')).toBe(true);
    expect(document.querySelector('[data-not-held="liability"]')).toBeNull();
  });

  it("tracks owners' policies by the expiry that was read and confirmed, and lets the board correct one", async () => {
    show();
    const card = document.querySelector('[aria-label="Owners\' own policies"]') as HTMLElement;
    // 101 is current and not listed; 102 expires in 15 days; 103 has none; 104 has a file with no date.
    expect([...card.querySelectorAll('[data-owner-policy]')].map(r => `${r.getAttribute('data-owner-policy')}:${r.getAttribute('data-standing')}`)).toEqual(['102:expiring', '103:none', '104:unknown']);
    expect(within(card).getByRole('button', { name: 'Remind the 2' })).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: 'Enter the details for unit 104' }));
    const form = within(card).getByRole('form', { name: 'Policy details' });
    fireEvent.change(within(form).getByLabelText('Insurance company'), { target: { value: 'Lakeside Indemnity' } });
    fireEvent.change(within(form).getByLabelText('Expires'), { target: { value: '2027-06-30' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save the correction' }));
    await waitFor(() => expect(useFinancialStore.getState().unitDocuments.find(d => d.id === 'd104')!.details).toMatchObject({ carrier: 'Lakeside Indemnity', expires: '2027-06-30' }));
    await waitFor(() => expect(card.querySelector('[data-owner-policy="104"]')).toBeNull());
    // Where the bylaws do not ask owners to carry one, a missing policy is not a problem and nobody is reminded.
    fireEvent.click(within(card).getByRole('switch', { name: 'The bylaws require owners to carry a policy' }));
    expect(within(card).queryByRole('button', { name: /^Remind the/ })).toBeNull();
  });

  it('an owner sees the policies but not other owners\' policies or the edit controls', () => {
    show(false);
    expect(document.querySelector('[aria-label="The association\'s policies"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Owners\' own policies"]')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add a policy' })).toBeNull();
  });

  it('the demo keeps an uploaded policy with its details, so the page can be tried', async () => {
    const f = new File(['x'], 'HO6-103.pdf', { type: 'application/pdf' });
    const ok = await useFinancialStore.getState().uploadDocument('103', f, 'insurance', true, 'u1', 'Owner 103', { carrier: 'Lakeside', policyNum: 'H6-9', expires: '2027-01-01', confirmedBy: 'Owner 103', confirmedOn: TODAY });
    expect(ok).toBe(true);
    expect(useFinancialStore.getState().unitDocuments[0]).toMatchObject({ unitNumber: '103', docType: 'insurance', details: { expires: '2027-01-01' } });
  });
});
