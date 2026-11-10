/**
 * Printed mail goes through the building's own LetterStream account
 * (Partnership mode). The app never charges a card for postage: a letter is
 * refused outright when the account isn't connected, and once sent it is
 * "awaiting payment" in LetterStream rather than "charged". Settings saved by
 * the old Stripe card-on-file version migrate to the new shape.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { LETTERSTREAM_NOT_CONNECTED, useMailStore } from '@/store/useMailStore';
import { useIssuesStore } from '@/store/useIssuesStore';
import type { MailingSettings } from '@/types/mail';

const notice = {
  caseId: 'case-1',
  tenantId: 'demo',
  templateId: 'tpl-1',
  templateName: 'Demand Letter',
  subject: 'Past-due assessments',
  body: 'Dear Owner, your account is past due.',
  recipient: { name: 'Pat Owner', address: { line1: '1 Main St', city: 'Washington', state: 'DC', zip: '20001' } },
  deliveryMethod: 'certified' as const,
  pageCount: 1,
  includeReturnEnvelope: false,
  emailCopy: false,
  mergeVariables: {},
};

beforeEach(() => {
  useMailStore.setState({ mailRecords: [] });
  useMailStore.getState().updateMailingSettings({ letterstreamConnected: false, letterstreamApiIdMasked: '', letterstreamStatus: '' });
  useIssuesStore.setState({ cases: [] } as never);
});

describe('useMailStore', () => {
  it('refuses to send a letter when the building has no LetterStream account connected', async () => {
    await expect(useMailStore.getState().sendNotice(notice)).rejects.toThrow(LETTERSTREAM_NOT_CONNECTED);
    const rec = useMailStore.getState().mailRecords[0];
    expect(rec.status).toBe('failed');
    expect(rec.statusHistory.map(h => h.status)).toEqual(['draft', 'approved', 'failed']);
  });

  it('submits into the connected LetterStream account and never passes through a card charge', async () => {
    await useMailStore.getState().connectLetterStream('LS-ACCOUNT-9876', 'secret-key');
    const s = useMailStore.getState().mailingSettings;
    expect(s.letterstreamConnected).toBe(true);
    expect(s.letterstreamApiIdMasked).toBe('••••9876');

    const rec = await useMailStore.getState().sendNotice(notice);
    expect(rec.status).toBe('awaiting-payment');
    expect(rec.statusHistory.map(h => h.status)).not.toContain('charging');
    expect(rec.letterstreamJobId).toMatch(/^ls_demo_/);
    expect(rec.letterstreamPortalUrl).toContain('letterstream.com');
    expect(rec).not.toHaveProperty('stripePaymentIntentId');
  });

  it('disconnecting clears the connection and blocks further letters', async () => {
    await useMailStore.getState().connectLetterStream('LS-1', 'k');
    await useMailStore.getState().disconnectLetterStream();
    expect(useMailStore.getState().mailingSettings.letterstreamConnected).toBe(false);
    await expect(useMailStore.getState().sendNotice(notice)).rejects.toThrow(LETTERSTREAM_NOT_CONNECTED);
  });

  it('migrates settings persisted by the Stripe card-on-file version', () => {
    const migrate = useMailStore.persist.getOptions().migrate!;
    const migrated = migrate({
      mailingSettings: { enabled: true, stripePaymentMethodId: 'pm_1', stripeCustomerId: 'cus_1', cardLast4: '4242', cardBrand: 'Visa', senderName: 'Castle Condos HOA', glAccountPostage: '6900' },
      mailRecords: [{ id: 'mr_1', status: 'charging', statusHistory: [], cost: { totalCents: 0 } }],
    }, 2) as { mailingSettings: MailingSettings; mailRecords: { status: string }[] };
    expect(migrated.mailingSettings).not.toHaveProperty('cardLast4');
    expect(migrated.mailingSettings).not.toHaveProperty('stripePaymentMethodId');
    expect(migrated.mailingSettings.letterstreamConnected).toBe(false);
    expect(migrated.mailingSettings.senderName).toBe('Castle Condos HOA');
    expect(migrated.mailRecords[0].status).toBe('failed');
  });
});
