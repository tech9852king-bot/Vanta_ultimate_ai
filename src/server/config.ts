/**
 * VANTA AI — Environment Configuration & Fail-Closed Secret Management
 * Ensures production never uses fallback development secrets or automatic demo logins.
 */

import crypto from 'node:crypto';

export interface RuntimeConfig {
  nodeEnv: string;
  isProduction: boolean;
  isTest: boolean;
  port: number;
  sessionSecretPrimary: string;
  sessionSecretPrevious: string | null;
  allowDemoAuth: boolean;
  geminiConfigured: boolean;
  geminiModelId: string;
  cookieSameSite: 'strict' | 'lax' | 'none';
  cookieSecure: boolean;
  trustProxyHops: number;
  dbPath: string;
}

let cachedDevEphemeralSecret: string | null = null;

function resolveEphemeralDevSecret(): string {
  if (!cachedDevEphemeralSecret) {
    // Process-local CSPRNG secret for development when no explicit secret is provided.
    // Never deterministic and never used in production.
    cachedDevEphemeralSecret = crypto.randomBytes(32).toString('hex');
  }
  return cachedDevEphemeralSecret;
}

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const nodeEnv = (env.NODE_ENV || 'development').trim().toLowerCase();
  const isProduction = nodeEnv === 'production';
  const isTest = Boolean(env.NODE_TEST_CONTEXT) || nodeEnv === 'test';

  const explicitSecret = (env.VANTA_SESSION_SECRET || '').trim();
  const previousSecret = (env.VANTA_SESSION_SECRET_PREVIOUS || '').trim() || null;

  if (isProduction) {
    if (!explicitSecret || explicitSecret.length < 32) {
      throw new Error(
        'FATAL SECURITY ERROR: VANTA_SESSION_SECRET must be set to at least 32 characters in production. Refusing to boot fail-open.'
      );
    }
    if (
      explicitSecret.includes('dev-secret') ||
      explicitSecret.includes('VantaDemo') ||
      explicitSecret === env.GEMINI_API_KEY
    ) {
      throw new Error(
        'FATAL SECURITY ERROR: VANTA_SESSION_SECRET in production must not reuse a development placeholder or Gemini API key.'
      );
    }
  }

  const sessionSecretPrimary =
    explicitSecret.length >= 16
      ? explicitSecret
      : (env.VANTA_DEV_SESSION_SECRET || '').trim() || resolveEphemeralDevSecret();

  // Demo users & quick-persona logins are strictly disabled in production unless explicitly opted in
  const allowDemoAuth =
    env.VANTA_ALLOW_DEMO_AUTH === 'true'
      ? true
      : env.VANTA_ALLOW_DEMO_AUTH === 'false'
      ? false
      : !isProduction;

  const geminiKey = (env.GEMINI_API_KEY || '').trim();
  const geminiConfigured = Boolean(geminiKey && geminiKey !== 'MY_GEMINI_API_KEY');

  const rawSameSite = (env.VANTA_COOKIE_SAME_SITE || '').trim().toLowerCase();
  const cookieSameSite: 'strict' | 'lax' | 'none' =
    rawSameSite === 'strict' || rawSameSite === 'none' || rawSameSite === 'lax'
      ? rawSameSite
      : isProduction
      ? 'none'
      : 'lax';

  const cookieSecure = isProduction || cookieSameSite === 'none';

  return {
    nodeEnv,
    isProduction,
    isTest,
    port: Number(env.PORT || 3000),
    sessionSecretPrimary,
    sessionSecretPrevious: previousSecret,
    allowDemoAuth,
    geminiConfigured,
    geminiModelId: 'gemini-4-hydrogen',
    cookieSameSite,
    cookieSecure,
    trustProxyHops: Math.max(0, Number(env.VANTA_TRUST_PROXY_HOPS || 1)),
    dbPath: (env.VANTA_DB_PATH || '').trim(),
  };
}
