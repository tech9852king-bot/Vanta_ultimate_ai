/**
 * VANTA AI — Authentication, Session Signing, Key Rotation, Streaming Tickets & RBAC Guards
 */

import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { canPerformAction, type PermissionAction } from '../core/intelligence.ts';
import type { UserSession, VantaRole } from '../core/types.ts';
import { loadRuntimeConfig, type RuntimeConfig } from './config.ts';

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
  if (!salt || !originalHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const originalBuf = Buffer.from(originalHex, 'hex');
  if (derived.length !== originalBuf.length) return false;
  return crypto.timingSafeEqual(derived, originalBuf);
}

export interface SignedTokenPayload {
  jti: string;
  userId: string;
  tenantId: string;
  role: VantaRole;
  ver?: number;
  iat: number;
  exp: number;
}

function hmacSign(encoded: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
}

function safeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function signSessionToken(
  payload: Omit<SignedTokenPayload, 'jti' | 'iat' | 'exp'> & { jti?: string },
  ttlSeconds = 60 * 60 * 12,
  configOverride?: RuntimeConfig
): string {
  const cfg = configOverride || loadRuntimeConfig();
  const nowSec = Math.floor(Date.now() / 1000);
  const fullPayload: SignedTokenPayload = {
    jti: payload.jti || `ses-${crypto.randomBytes(8).toString('hex')}`,
    userId: payload.userId,
    tenantId: payload.tenantId,
    role: payload.role,
    ver: payload.ver ?? 1,
    iat: nowSec,
    exp: nowSec + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const sig = hmacSign(encoded, cfg.sessionSecretPrimary);
  return `${encoded}.${sig}`;
}

export function verifySessionToken(
  token: string,
  configOverride?: RuntimeConfig
): SignedTokenPayload | null {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const cfg = configOverride || loadRuntimeConfig();
  const expectedPrimary = hmacSign(encoded, cfg.sessionSecretPrimary);
  let signatureValid = safeEqualString(sig, expectedPrimary);

  // Zero-downtime session rotation: accept tokens signed by previous secret during rotation window
  if (!signatureValid && cfg.sessionSecretPrevious) {
    const expectedPrev = hmacSign(encoded, cfg.sessionSecretPrevious);
    signatureValid = safeEqualString(sig, expectedPrev);
  }

  if (!signatureValid) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SignedTokenPayload;
    if (!parsed.jti || !parsed.userId || !parsed.tenantId || !parsed.exp || !parsed.iat) {
      return null;
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (parsed.exp <= nowSec) return null;
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
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Short-lived, single-use SSE streaming tickets (replaces long-lived session tokens in URLs).
 */
export interface StreamTicketRecord {
  userId: string;
  tenantId: string;
  facilityIds: string[];
  origin: string | null;
  expiresAt: number;
}

export class StreamTicketStore {
  private readonly tickets = new Map<string, StreamTicketRecord>();

  issue(params: Omit<StreamTicketRecord, 'expiresAt'>, ttlMs = 30_000): string {
    const now = Date.now();
    for (const [k, v] of this.tickets.entries()) {
      if (v.expiresAt <= now) this.tickets.delete(k);
    }
    const ticket = `stk-${crypto.randomBytes(18).toString('base64url')}`;
    this.tickets.set(ticket, {
      ...params,
      expiresAt: now + ttlMs,
    });
    return ticket;
  }

  consume(ticket: string, requestOrigin: string | null): StreamTicketRecord | null {
    const rec = this.tickets.get(ticket);
    if (!rec) return null;
    // Single-use: delete immediately on read attempt
    this.tickets.delete(ticket);
    if (rec.expiresAt <= Date.now()) return null;
    if (rec.origin && requestOrigin && rec.origin !== requestOrigin) {
      return null;
    }
    return rec;
  }
}

/**
 * Legacy sliding-window helper retained for simple wrappers.
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
  correlationId?: string;
}

export function requirePermission(action: PermissionAction, onDenied?: (req: AuthenticatedRequest) => void) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (req.auth.status && req.auth.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Operator account is suspended.' });
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
