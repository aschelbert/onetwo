import { describe, it, expect } from 'vitest';
import { isSameBuilding, pickMembership } from '@/lib/tenantMembership';

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

  it('falls back to the name when an address is missing', () => {
    expect(isSameBuilding({ name: 'Sunny  Acres', address: {} }, { name: 'sunny acres', address: addr('1 A St') })).toBe(true);
    expect(isSameBuilding({ name: 'Sunny Acres', address: null }, { name: 'Harbor View', address: null })).toBe(false);
  });
});

describe('pickMembership', () => {
  const rows = [
    { id: 'new', tenant: { name: 'New', subdomain: 'harbor', address: null } },
    { id: 'old', tenant: { name: 'Old', subdomain: 'sunny', address: null } },
  ];

  it('returns null with no memberships', () => {
    expect(pickMembership([], 'app.getonetwo.com')).toBeNull();
    expect(pickMembership(null, 'app.getonetwo.com')).toBeNull();
  });

  it("prefers the building whose host we're on", () => {
    expect(pickMembership(rows, 'sunny.getonetwo.com')?.id).toBe('old');
  });

  it('otherwise uses the newest membership', () => {
    expect(pickMembership(rows, 'app.getonetwo.com')?.id).toBe('new');
    expect(pickMembership(rows, 'localhost')?.id).toBe('new');
  });
});
