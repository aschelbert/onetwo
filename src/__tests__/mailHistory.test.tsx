/**
 * Mailing History is the building's record of its letters, with tracking.
 * DocuPost has no status API, so a board member copies the USPS tracking
 * number from DocuPost and marks the outcome; the app then links to USPS.
 * The vendor balance is not reported by either vendor's API, so the settings
 * show the figure the board recorded less estimated postage since, and the
 * last refusal for lack of funds.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import MailHistory from '@/features/building/tabs/MailHistory';
import MailingSettingsTab from '@/features/building/tabs/MailingSettingsTab';
import { useMailStore } from '@/store/useMailStore';
import { useIssuesStore } from '@/store/useIssuesStore';

const notice = {
  caseId: 'case-1', tenantId: 'demo', templateId: 'tpl-1', templateName: 'Demand Letter', subject: 'Past-due assessments',
  body: 'Dear Owner, your account is past due.',
  recipient: { name: 'Pat Owner', address: { line1: '1 Main St', city: 'Washington', state: 'DC', zip: '20001' } },
  deliveryMethod: 'certified' as const, pageCount: 1, includeReturnEnvelope: false, emailCopy: false, mergeVariables: {},
};

beforeEach(async () => {
  useMailStore.setState({ mailRecords: [] });
  useIssuesStore.setState({ cases: [] } as never);
  useMailStore.getState().updateMailingSettings({ mailFundsLowAt: '', mailBalanceCents: null, mailBalanceRecordedAt: '' });
  await useMailStore.getState().connectMailProvider('docupost', { apiKey: 'dp-token-ending-ABCD' });
});

describe('Mailing History', () => {
  it('lists the letter, flags a certified letter with no tracking, and links to USPS once the number is recorded', async () => {
    const rec = await useMailStore.getState().sendNotice(notice);
    render(<MailHistory />);
    expect(screen.getByTestId('mail-untracked').textContent).toMatch(/1 certified letter has no tracking number/);

    fireEvent.click(screen.getByRole('button', { name: /Demand Letter/ }));
    const row = document.querySelector(`[data-mail-record="${rec.id}"]`) as HTMLElement;
    expect(row.textContent).toMatch(/DocuPost has no status API/);
    fireEvent.change(within(row).getByLabelText('USPS tracking number'), { target: { value: '9407 1000 0000 0000 0000 00' } });
    fireEvent.change(within(row).getByLabelText('Where it stands'), { target: { value: 'delivered' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Save tracking' }));

    await waitFor(() => expect(within(row).getByRole('status').textContent).toMatch(/Saved/));
    const link = within(row).getByRole('link', { name: /Track with USPS/ });
    expect(link.getAttribute('href')).toBe('https://tools.usps.com/go/TrackConfirmAction?tLabels=9407100000000000000000');
    expect(useMailStore.getState().mailRecords[0].status).toBe('delivered');
    expect(screen.queryByTestId('mail-untracked')).toBeNull();
  });

  it('refuses something that is not a tracking number and keeps the letter as it was', async () => {
    await useMailStore.getState().sendNotice(notice);
    render(<MailHistory />);
    fireEvent.click(screen.getByRole('button', { name: /Demand Letter/ }));
    fireEvent.change(screen.getByLabelText('USPS tracking number'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save tracking' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/doesn't look like a USPS tracking number/));
    expect(useMailStore.getState().mailRecords[0].trackingNumber).toBeUndefined();
  });
});

describe('Mailing settings · balance', () => {
  it('shows the last refusal for lack of funds and where to add money', () => {
    useMailStore.getState().updateMailingSettings({ mailFundsLowAt: '2026-11-10T15:00:00Z' });
    render(<MailingSettingsTab />);
    const alert = screen.getByTestId('mail-funds-low');
    expect(alert.textContent).toMatch(/DocuPost refused a letter for lack of funds/);
    expect(within(alert).getByRole('link').getAttribute('href')).toContain('docupost.com');
  });

  it('records the balance the board reads off DocuPost and estimates what is left after letters sent since', async () => {
    render(<MailingSettingsTab />);
    const card = screen.getByTestId('mail-balance');
    expect(card.textContent).toMatch(/balance not recorded/);
    fireEvent.click(within(card).getByRole('button', { name: 'Record balance' }));
    fireEvent.change(within(card).getByLabelText(/Balance shown in DocuPost/), { target: { value: '$50.00' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(card.textContent).toMatch(/About \$50\.00 left in DocuPost/));

    await new Promise(res => setTimeout(res, 5));
    await useMailStore.getState().sendNotice(notice);
    await waitFor(() => expect(card.textContent).toMatch(/About \$38\.27 left in DocuPost/));
    expect(card.textContent).toMatch(/1 letter sent since/);
  });

  it('offers only the delivery methods DocuPost really has', () => {
    render(<MailingSettingsTab />);
    const select = screen.getByDisplayValue('Certified Mail') as HTMLSelectElement;
    expect([...select.options].map(o => o.value)).toEqual(['first-class', 'certified', 'certified-electronic-return-receipt']);
  });
});
