import { describe, it, expect } from 'vitest';
import { isEnvironmentHost, isTenantHost, tenantLoginUrl } from '@/lib/tenantHost';

const tokens = { accessToken: 'at', refreshToken: 'rt' };

describe('tenantHost', () => {
  it('hops from the production root to the building host with the session', () => {
    expect(tenantLoginUrl('condobuilding', tokens, 'app.getonetwo.com')).toBe(
      'https://condobuilding.getonetwo.com/login?sb_access=at&sb_refresh=rt',
    );
    expect(tenantLoginUrl('condobuilding', tokens, 'www.getonetwo.com')).toContain('condobuilding.getonetwo.com');
  });

  it('hops between building hosts in production', () => {
    expect(tenantLoginUrl('condobuilding', tokens, 'building.getonetwo.com')).toContain('https://condobuilding.getonetwo.com/');
  });

  it('stays put when already on the building host', () => {
    expect(tenantLoginUrl('condobuilding', tokens, 'condobuilding.getonetwo.com')).toBeNull();
    expect(tenantLoginUrl('Building', tokens, 'building.getonetwo.com')).toBeNull();
  });

  it('never leaves staging, previews or localhost (their sessions belong to another project)', () => {
    expect(tenantLoginUrl('condobuilding', tokens, 'staging.getonetwo.com')).toBeNull();
    expect(tenantLoginUrl('condobuilding', tokens, 'onetwo-git-staging-getonetwo.vercel.app')).toBeNull();
    expect(tenantLoginUrl('condobuilding', tokens, 'localhost')).toBeNull();
    expect(tenantLoginUrl('condobuilding', tokens, '127.0.0.1')).toBeNull();
  });

  it('does nothing without a subdomain', () => {
    expect(tenantLoginUrl(null, tokens, 'app.getonetwo.com')).toBeNull();
    expect(tenantLoginUrl('', tokens, 'app.getonetwo.com')).toBeNull();
  });

  it('classifies hosts', () => {
    expect(isEnvironmentHost('staging.getonetwo.com')).toBe(true);
    expect(isEnvironmentHost('app.getonetwo.com')).toBe(false);
    expect(isTenantHost('building.getonetwo.com')).toBe(true);
    expect(isTenantHost('staging.getonetwo.com')).toBe(false);
    expect(isTenantHost('app.getonetwo.com')).toBe(false);
  });
});
