import { describe, it, expect } from 'vitest';
import { isSameBuilding, needsBuildingChoice, pickMembership, subscriptionLabel } from '@/lib/tenantMembership';

const addr = (street: string, zip = '20001') => ({ street, city: 'Washington', state: 'DC', zip });

describe('isSameBuilding', () => {
  it('treats a different name and address as a new building', () => {
    expect(isSameBuilding(
      { name: 'Sunny Acres Condominium', address: addr('100 Main Street NW') },
      { name: 'Harbor View', address: addr('250 K Street NE', '20002') },
    )).toBe(false);
  });

  it('treats the same name at a different address as a new building', () => {
    expect(isSameBuilding(
      { name: 'Park Place', address: addr('100 Main St') },
      { name: 'Park Place', address: addr('900 Oak Ave') },
    )).toBe(false);
  });

  it('matches the same address however it is typed or named', () => {
    expect(isSameBuilding(
      { name: 'Sunny Acres', address: addr('100 Main Street, N.W.', '20001-1234') },
      { name: 'Sunny Acres Condo Association', address: addr('100 main st nw') },
    )).toBe(true);
  });

  it('does not match the same street in a different ZIP', () => {
    expect(isSameBuilding(
      { name: 'A', address: addr('100 Main St', '20001') },
      { name: 'B', address: addr('100 Main St', '90210') },
    )).toBe(false);
  });

  it('needs the name to match too when a ZIP is missing', () => {
    const onFile = { name: 'Condo Building', address: { street: '123', city: '', state: '', zip: '' } };
    expect(isSameBuilding({ name: 'Harbor View', address: addr('123', '20002') }, onFile)).toBe(false);
    expect(isSameBuilding({ name: 'Harbor View', address: { street: '123' } }, onFile)).toBe(false);
    expect(isSameBuilding({ name: 'condo  building', address: { street: '123' } }, onFile)).toBe(true);
  });

  it('falls back to the name when an address is missing', () => {
    expect(isSameBuilding({ name: 'Sunny  Acres', address: {} }, { name: 'sunny acres', address: addr('1 A St') })).toBe(true);
    expect(isSameBuilding({ name: 'Sunny Acres', address: null }, { name: 'Harbor View', address: null })).toBe(false);
  });
});

describe('pickMembership', () => {
  const rows = [
    { tenant_id: 'new', tenant: { name: 'New', subdomain: 'harbor', address: null } },
    { tenant_id: 'old', tenant: { name: 'Old', subdomain: 'sunny', address: null } },
  ];

  it('returns null with no memberships', () => {
    expect(pickMembership([], 'app.getonetwo.com', null)).toBeNull();
    expect(pickMembership(null, 'app.getonetwo.com', null)).toBeNull();
  });

  it("prefers the building whose host we're on, even over a stored choice", () => {
    expect(pickMembership(rows, 'sunny.getonetwo.com', null)?.tenant_id).toBe('old');
    expect(pickMembership(rows, 'sunny.getonetwo.com', 'new')?.tenant_id).toBe('old');
  });

  it('then the building this browser last chose', () => {
    expect(pickMembership(rows, 'localhost', 'old')?.tenant_id).toBe('old');
  });

  it('ignores a stored choice the account does not belong to', () => {
    expect(pickMembership(rows, 'localhost', 'someone-elses')?.tenant_id).toBe('new');
  });

  it('otherwise uses the newest membership', () => {
    expect(pickMembership(rows, 'app.getonetwo.com', null)?.tenant_id).toBe('new');
  });
});

describe('needsBuildingChoice', () => {
  const one = [{ tenant_id: 'a', tenant: { name: 'A', subdomain: 'sunny', address: null } }];
  const two = [...one, { tenant_id: 'b', tenant: { name: 'B', subdomain: 'harbor', address: null } }];

  it('never asks an account with one building', () => {
    expect(needsBuildingChoice(one, 'app.getonetwo.com', null, false)).toBe(false);
    expect(needsBuildingChoice([], 'app.getonetwo.com', null, false)).toBe(false);
  });

  it('asks at the root login when there are several', () => {
    expect(needsBuildingChoice(two, 'app.getonetwo.com', null, false)).toBe(true);
    expect(needsBuildingChoice(two, 'localhost', 'a', false)).toBe(true);
  });

  it("does not ask on a building's own host", () => {
    expect(needsBuildingChoice(two, 'harbor.getonetwo.com', null, false)).toBe(false);
  });

  it('does not ask when a remembered choice still applies', () => {
    expect(needsBuildingChoice(two, 'app.getonetwo.com', 'b', true)).toBe(false);
    expect(needsBuildingChoice(two, 'app.getonetwo.com', 'gone', true)).toBe(true);
  });
});

describe('subscriptionLabel', () => {
  const now = new Date('2026-11-16T12:00:00Z');
  it('counts trial days left', () => {
    expect(subscriptionLabel({ subscription_status: 'trialing', trial_ends_at: '2026-12-04T12:00:00Z' }, now))
      .toEqual({ text: 'Trial, 18 days left', tone: 'trial' });
    expect(subscriptionLabel({ subscription_status: 'trialing', trial_ends_at: '2026-11-17T06:00:00Z' }, now)?.text).toBe('Trial, 1 day left');
    expect(subscriptionLabel({ subscription_status: 'trialing', trial_ends_at: '2026-11-01T00:00:00Z' }, now)?.tone).toBe('bad');
  });
  it('labels the other states, and nothing when unknown', () => {
    expect(subscriptionLabel({ subscription_status: 'active' }, now)).toEqual({ text: 'Active', tone: 'ok' });
    expect(subscriptionLabel({ subscription_status: 'past_due' }, now)?.tone).toBe('bad');
    expect(subscriptionLabel({ subscription_status: null }, now)).toBeNull();
  });
});
