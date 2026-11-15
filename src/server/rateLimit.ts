/**
 * VANTA AI — Layered Multi-Scope Rate Limiter
 * Keys limits by endpoint scope + client IP + tenantId + userId and emits standard RateLimit headers.
 */

import type { NextFunction, Request, Response } from 'express';
import { observability } from './observability.ts';
import type { UserSession } from '../core/types.ts';

export interface ScopedRateLimitOptions {
  scope: string;
  maxRequests: number;
  windowMs: number;
  keyBy?: 'IP' | 'IP_AND_EMAIL' | 'TENANT_USER' | 'TENANT';
  onBlocked?: (info: {
    scope: string;
    key: string;
    ip: string;
    tenantId?: string;
    email?: string;
  }) => void;
}

interface AuthTaggedRequest extends Request {
  auth?: UserSession;
}

export function createScopedRateLimiter(opts: ScopedRateLimitOptions) {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets.entries()) {
      if (v.resetAt <= now) buckets.delete(k);
    }
  }, Math.max(opts.windowMs, 30_000));
  cleanupInterval.unref();

  return (req: AuthTaggedRequest, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const tenantId = req.auth?.tenantId;
    const userId = req.auth?.id;
    const emailFromBody =
      req.body && typeof (req.body as { email?: unknown }).email === 'string'
        ? (req.body as { email: string }).email.trim().toLowerCase()
        : '';

    let subjectKey = ip;
    if (opts.keyBy === 'IP_AND_EMAIL') {
      subjectKey = `${ip}:${emailFromBody || 'anon'}`;
    } else if (opts.keyBy === 'TENANT_USER') {
      subjectKey = tenantId && userId ? `${tenantId}:${userId}` : ip;
    } else if (opts.keyBy === 'TENANT') {
      subjectKey = tenantId || ip;
    }

    const bucketKey = `${opts.scope}:${subjectKey}`;
    const now = Date.now();
    let entry = buckets.get(bucketKey);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(bucketKey, entry);
    }

    entry.count += 1;
    const remaining = Math.max(0, opts.maxRequests - entry.count);
    const resetSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

    res.setHeader('RateLimit-Limit', String(opts.maxRequests));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(resetSeconds));

    if (entry.count > opts.maxRequests) {
      res.setHeader('Retry-After', String(resetSeconds));
      observability.recordRateLimitRejection();
      opts.onBlocked?.({
        scope: opts.scope,
        key: bucketKey,
        ip,
        tenantId,
        email: req.auth?.email || emailFromBody || undefined,
      });
      return res.status(429).json({
        error: `Rate limit exceeded for '${opts.scope}'. Retry after ${resetSeconds}s.`,
        scope: opts.scope,
        retryAfterSeconds: resetSeconds,
      });
    }

    return next();
  };
}
