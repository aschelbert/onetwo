/**
 * Printed mail goes through the building's own account with a mail vendor
 * (DocuPost, or LetterStream in Partnership mode). The app never charges a
 * card for postage: a letter is refused outright when no account is
 * connected, and once sent it is "submitted" (DocuPost, paid from the
 * balance) or "awaiting payment" (LetterStream) rather than "charged".
 * Settings saved by the old Stripe card-on-file and LetterStream-only
 * versions migrate to the new shape.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { MAIL_NOT_CONNECTED, useMailStore } from '@/store/useMailStore';
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
  useMailStore.getState().updateMailingSettings({ mailConnected: false, mailProvider: '', mailCredentialMasked: '', mailStatus: '' });
  useIssuesStore.setState({ cases: [] } as never);
});

describe('useMailStore', () => {
  it('refuses to send a letter when the building has no mail account connected', async () => {
    await expect(useMailStore.getState().sendNotice(notice)).rejects.toThrow(MAIL_NOT_CONNECTED);
    const rec = useMailStore.getState().mailRecords[0];
    expect(rec.status).toBe('failed');
    expect(rec.statusHistory.map(h => h.status)).toEqual(['draft', 'approved', 'failed']);
  });

  it('submits into the connected DocuPost account, paid from its balance, and never passes through a card charge', async () => {
    await useMailStore.getState().connectMailProvider('docupost', { apiKey: 'dp-token-ending-ABCD' });
    const s = useMailStore.getState().mailingSettings;
    expect(s.mailConnected).toBe(true);
    expect(s.mailProvider).toBe('docupost');
    expect(s.mailCredentialMasked).toBe('••••ABCD');

    const rec = await useMailStore.getState().sendNotice(notice);
    expect(rec.status).toBe('submitted');
    expect(rec.mailProvider).toBe('docupost');
    expect(rec.statusHistory.map(h => h.status)).not.toContain('charging');
    expect(rec.letterstreamJobId).toMatch(/^dp_demo_/);
    expect(rec.letterstreamPortalUrl).toContain('docupost.com');
    expect(rec).not.toHaveProperty('stripePaymentIntentId');
    // DocuPost's estimate, not LetterStream's: certified is about $11.73 there.
    expect(rec.cost.baseCostCents).toBe(1173);
  });

  it('a LetterStream account waits for payment in the account instead', async () => {
    await useMailStore.getState().connectMailProvider('letterstream', { apiId: 'LS-ACCOUNT-9876', apiKey: 'secret-key' });
    const s = useMailStore.getState().mailingSettings;
    expect(s.mailProvider).toBe('letterstream');
    expect(s.mailCredentialMasked).toBe('••••9876');
    const rec = await useMailStore.getState().sendNotice(notice);
    expect(rec.status).toBe('awaiting-payment');
    expect(rec.letterstreamJobId).toMatch(/^ls_demo_/);
    expect(rec.letterstreamPortalUrl).toContain('letterstream.com');
    expect(rec.cost.baseCostCents).toBe(834);
  });

  it('disconnecting clears the connection and blocks further letters', async () => {
    await useMailStore.getState().connectMailProvider('docupost', { apiKey: 'k' });
    await useMailStore.getState().disconnectMailProvider();
    expect(useMailStore.getState().mailingSettings.mailConnected).toBe(false);
    expect(useMailStore.getState().mailingSettings.mailProvider).toBe('');
    await expect(useMailStore.getState().sendNotice(notice)).rejects.toThrow(MAIL_NOT_CONNECTED);
  });

  it('migrates settings persisted by the Stripe card-on-file version', () => {
    const migrate = useMailStore.persist.getOptions().migrate!;
    const migrated = migrate({
      mailingSettings: { enabled: true, stripePaymentMethodId: 'pm_1', stripeCustomerId: 'cus_1', cardLast4: '4242', cardBrand: 'Visa', senderName: 'Castle Condos HOA', glAccountPostage: '6900' },
      mailRecords: [{ id: 'mr_1', status: 'charging', statusHistory: [], cost: { totalCents: 0 } }],
    }, 2) as { mailingSettings: MailingSettings; mailRecords: { status: string }[] };
    expect(migrated.mailingSettings).not.toHaveProperty('cardLast4');
    expect(migrated.mailingSettings).not.toHaveProperty('stripePaymentMethodId');
    expect(migrated.mailingSettings.mailConnected).toBe(false);
    expect(migrated.mailingSettings.senderName).toBe('Castle Condos HOA');
    expect(migrated.mailRecords[0].status).toBe('failed');
  });

  it('migrates a LetterStream-only (v3) connection into the vendor-neutral shape', () => {
    const migrate = useMailStore.persist.getOptions().migrate!;
    const migrated = migrate({
      mailingSettings: { enabled: true, letterstreamConnected: true, letterstreamApiIdMasked: '••••9876', letterstreamConnectedAt: '2026-11-10T00:00:00Z', letterstreamStatus: 'verified', letterstreamPortalUrl: 'https://secure.letterstream.com/', senderName: 'Castle Condos HOA' },
      mailRecords: [],
    }, 3) as { mailingSettings: MailingSettings };
    expect(migrated.mailingSettings).not.toHaveProperty('letterstreamConnected');
    expect(migrated.mailingSettings.mailConnected).toBe(true);
    expect(migrated.mailingSettings.mailProvider).toBe('letterstream');
    expect(migrated.mailingSettings.mailCredentialMasked).toBe('••••9876');
    expect(migrated.mailingSettings.mailStatus).toBe('verified');
  });
});
