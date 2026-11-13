import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  parseCookieHeader,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from './security';

test('password hashing verifies valid password and rejects invalid password', () => {
  const hash = hashPassword('VantaIndustrial#2026');
  assert.equal(verifyPassword('VantaIndustrial#2026', hash), true);
  assert.equal(verifyPassword('wrong-password', hash), false);
});

test('HMAC session token signs, verifies, and detects tampering', () => {
  const token = signSessionToken({
    userId: 'usr-1',
    tenantId: 'tenant-apex',
    role: 'Operations Manager',
  });
  const verified = verifySessionToken(token);
  assert.ok(verified);
  assert.equal(verified.tenantId, 'tenant-apex');
  assert.equal(verified.role, 'Operations Manager');

  const tampered = token.slice(0, -4) + 'XXXX';
  assert.equal(verifySessionToken(tampered), null);

  const expired = signSessionToken(
    { userId: 'usr-1', tenantId: 'tenant-apex', role: 'Viewer' },
    -10
  );
  assert.equal(verifySessionToken(expired), null);
});

test('parseCookieHeader extracts session cookie cleanly', () => {
  const cookies = parseCookieHeader('foo=bar; vanta_session=abc.123; theme=dark');
  assert.equal(cookies.vanta_session, 'abc.123');
});
