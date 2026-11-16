/**
 * VANTA AI — Environment Configuration & Fail-Closed Secret Management
 * Ensures production never uses fallback development secrets or automatic demo logins.
 */

import crypto from 'node:crypto';

export const SUPPORTED_GEMINI_MODELS = [
  'gemini-4-hydrogen',
  'gemini-4-argon',
  'gemini-4-carbon',
  'gemini-3.1-flash-lite',
] as const;

export type SupportedGeminiModelId = (typeof SUPPORTED_GEMINI_MODELS)[number];
export const DEFAULT_GEMINI_MODEL_ID: SupportedGeminiModelId = 'gemini-4-hydrogen';

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
  geminiModelValid: boolean;
  geminiTimeoutMs: number;
  geminiMaxRetries: number;
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

export function isSupportedGeminiModel(modelId: string): modelId is SupportedGeminiModelId {
  return (SUPPORTED_GEMINI_MODELS as readonly string[]).includes(modelId);
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

  const requestedModel = (env.VANTA_GEMINI_MODEL || DEFAULT_GEMINI_MODEL_ID).trim();
  const geminiModelValid = isSupportedGeminiModel(requestedModel);

  const rawTimeout = Number(env.VANTA_GEMINI_TIMEOUT_MS);
  const geminiTimeoutMs = Number.isFinite(rawTimeout) && rawTimeout >= 500
    ? Math.min(30_000, Math.round(rawTimeout))
    : 15_000;

  const rawRetries = Number(env.VANTA_GEMINI_MAX_RETRIES);
  const geminiMaxRetries = Number.isFinite(rawRetries) && rawRetries >= 0
    ? Math.min(2, Math.floor(rawRetries))
    : 1;

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
    geminiModelId: requestedModel,
    geminiModelValid,
    geminiTimeoutMs,
    geminiMaxRetries,
    cookieSameSite,
    cookieSecure,
    trustProxyHops: Math.max(0, Number(env.VANTA_TRUST_PROXY_HOPS || 1)),
    dbPath: (env.VANTA_DB_PATH || '').trim(),
  };
}
