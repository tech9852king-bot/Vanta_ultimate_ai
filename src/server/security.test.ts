import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { loadRuntimeConfig } from './config.ts';
import { createScopedRateLimiter } from './rateLimit.ts';
import {
  hashPassword,
  parseCookieHeader,
  signSessionToken,
  StreamTicketStore,
  verifyPassword,
  verifySessionToken,
} from './security.ts';

test('password hashing verifies valid password and rejects invalid password', () => {
  const hash = hashPassword('VantaIndustrial#2026');
  assert.equal(verifyPassword('VantaIndustrial#2026', hash), true);
  assert.equal(verifyPassword('wrong-password', hash), false);
});

test('loadRuntimeConfig fails closed in production when session secret is missing or weak', () => {
  assert.throws(
    () => loadRuntimeConfig({ NODE_ENV: 'production' }),
    /FATAL SECURITY ERROR/
  );
  assert.throws(
    () => loadRuntimeConfig({ NODE_ENV: 'production', VANTA_SESSION_SECRET: 'too-short' }),
    /FATAL SECURITY ERROR/
  );
  assert.throws(
    () =>
      loadRuntimeConfig({
        NODE_ENV: 'production',
        VANTA_SESSION_SECRET: 'vanta-dev-secret-do-not-use-in-prod-123456',
      }),
    /FATAL SECURITY ERROR/
  );

  const validProd = loadRuntimeConfig({
    NODE_ENV: 'production',
    VANTA_SESSION_SECRET: 'prod_entropy_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
  });
  assert.equal(validProd.isProduction, true);
  assert.equal(validProd.allowDemoAuth, false);
  assert.equal(validProd.cookieSecure, true);
});

test('HMAC session token signs, verifies, detects tampering, expires, and supports key rotation', () => {
  const oldCfg = loadRuntimeConfig({
    NODE_ENV: 'development',
    VANTA_SESSION_SECRET: 'old-rotation-secret-1111111111111111',
  });
  const rotatedCfg = loadRuntimeConfig({
    NODE_ENV: 'development',
    VANTA_SESSION_SECRET: 'new-rotation-secret-2222222222222222',
    VANTA_SESSION_SECRET_PREVIOUS: 'old-rotation-secret-1111111111111111',
  });

  const token = signSessionToken(
    {
      userId: 'usr-1',
      tenantId: 'tenant-apex',
      role: 'Operations Manager',
    },
    3600,
    oldCfg
  );

  // Accepted under previous key during zero-downtime rotation window
  const verifiedRotated = verifySessionToken(token, rotatedCfg);
  assert.ok(verifiedRotated);
  assert.equal(verifiedRotated.tenantId, 'tenant-apex');
  assert.equal(verifiedRotated.role, 'Operations Manager');
  assert.ok(verifiedRotated.jti.startsWith('ses-'));

  const tampered = token.slice(0, -4) + 'XXXX';
  assert.equal(verifySessionToken(tampered, rotatedCfg), null);

  const expired = signSessionToken(
    { userId: 'usr-1', tenantId: 'tenant-apex', role: 'Viewer' },
    -10,
    rotatedCfg
  );
  assert.equal(verifySessionToken(expired, rotatedCfg), null);
});

test('StreamTicketStore enforces single-use and Origin matching', () => {
  const store = new StreamTicketStore();
  const ticket = store.issue({
    userId: 'usr-1',
    tenantId: 'tenant-apex',
    facilityIds: ['fac-plant-a'],
    origin: 'https://vanta.example.com',
  });

  // Wrong origin rejected AND burns single-use ticket
  assert.equal(store.consume(ticket, 'https://evil.example.com'), null);
  assert.equal(store.consume(ticket, 'https://vanta.example.com'), null);

  const ticket2 = store.issue({
    userId: 'usr-1',
    tenantId: 'tenant-apex',
    facilityIds: ['fac-plant-a'],
    origin: 'https://vanta.example.com',
  });
  const valid = store.consume(ticket2, 'https://vanta.example.com');
  assert.ok(valid);
  assert.equal(valid.tenantId, 'tenant-apex');
  // Second consume rejected
  assert.equal(store.consume(ticket2, 'https://vanta.example.com'), null);
});

test('createScopedRateLimiter enforces ceiling and emits Retry-After / RateLimit headers', async () => {
  const app = express();
  app.use(express.json());
  app.post(
    '/limited',
    createScopedRateLimiter({
      scope: 'test-limit',
      maxRequests: 2,
      windowMs: 60_000,
      keyBy: 'IP',
    }),
    (_req, res) => res.json({ ok: true })
  );

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as { port: number }).port;

  try {
    const r1 = await fetch(`http://127.0.0.1:${port}/limited`, { method: 'POST' });
    const r2 = await fetch(`http://127.0.0.1:${port}/limited`, { method: 'POST' });
    const r3 = await fetch(`http://127.0.0.1:${port}/limited`, { method: 'POST' });

    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(r3.status, 429);
    assert.ok(r3.headers.get('retry-after'));
    assert.equal(r3.headers.get('ratelimit-remaining'), '0');
  } finally {
    server.close();
  }
});

test('parseCookieHeader extracts session cookie cleanly', () => {
  const cookies = parseCookieHeader('foo=bar; vanta_session=abc.123; theme=dark');
  assert.equal(cookies.vanta_session, 'abc.123');
});
