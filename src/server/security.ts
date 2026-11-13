/**
 * VANTA AI — Authentication, Session Signing, Password Hashing & Rate Limiting
 */

import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { canPerformAction, type PermissionAction } from '../core/intelligence';
import type { UserSession, VantaRole } from '../core/types';

const SESSION_SECRET =
  process.env.VANTA_SESSION_SECRET ||
  crypto.createHash('sha256').update(process.env.GEMINI_API_KEY || 'vanta-local-dev-secret-key').digest('hex');

export const SESSION_COOKIE_NAME = 'vanta_session';

export function hashPassword(password: string, existingSalt?: string): string {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const originalBuf = Buffer.from(originalHex, 'hex');
  if (derived.length !== originalBuf.length) return false;
  return crypto.timingSafeEqual(derived, originalBuf);
}

export interface SignedTokenPayload {
  userId: string;
  tenantId: string;
  role: VantaRole;
  exp: number;
}

export function signSessionToken(payload: Omit<SignedTokenPayload, 'exp'>, ttlSeconds = 60 * 60 * 12): string {
  const fullPayload: SignedTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SignedTokenPayload | null {
  if (!token || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SignedTokenPayload;
    if (!parsed.userId || !parsed.tenantId || !parsed.exp) return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    result[key] = decodeURIComponent(val);
  }
  return result;
}

/**
 * Simple sliding-window in-memory rate limiter for API protection.
 */
export function createRateLimiter(maxRequests = 180, windowMs = 60_000) {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    existing.count += 1;
    if (existing.count > maxRequests) {
      return res.status(429).json({
        error: 'Rate limit exceeded. Retry after window resets.',
        retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
      });
    }
    return next();
  };
}

export interface AuthenticatedRequest extends Request {
  auth?: UserSession;
}

export function requirePermission(action: PermissionAction, onDenied?: (req: AuthenticatedRequest) => void) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!canPerformAction(req.auth.role, action)) {
      onDenied?.(req);
      return res.status(403).json({
        error: `Access denied. Role '${req.auth.role}' is not authorized for '${action}'.`,
      });
    }
    return next();
  };
}
