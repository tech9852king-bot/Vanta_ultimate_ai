/**
 * VANTA AI — Observability, Correlation IDs & Safe Structured Logging
 * Never logs session secrets, passwords, API keys, or industrial gateway credentials.
 */

import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const REDACTED_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'secret',
  'authorization',
  'cookie',
  'apikey',
  'gemini_api_key',
  'vanta_session_secret',
  'credential',
]);

export function sanitizeForLog(input: unknown): unknown {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') {
    if (input.startsWith('Bearer ')) return 'Bearer [REDACTED]';
    return input.length > 300 ? `${input.slice(0, 300)}...` : input;
  }
  if (Array.isArray(input)) {
    return input.slice(0, 20).map(sanitizeForLog);
  }
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      if (REDACTED_KEYS.has(k.toLowerCase())) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = sanitizeForLog(v);
      }
    }
    return out;
  }
  return input;
}

export interface TelemetryMetricsSnapshot {
  startedAt: string;
  uptimeSeconds: number;
  totalRequests: number;
  apiErrors5xx: number;
  apiErrors4xx: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  aiCallsTotal: number;
  aiCallsFailed: number;
  aiAvgLatencyMs: number;
  rateLimitRejections: number;
  activeSseStreams: number;
  memoryRssMb: number;
}

class ObservabilityRegistry {
  private readonly startedAt = Date.now();
  private readonly latencies: number[] = [];
  private readonly aiLatencies: number[] = [];
  private totalRequests = 0;
  private apiErrors5xx = 0;
  private apiErrors4xx = 0;
  private aiCallsTotal = 0;
  private aiCallsFailed = 0;
  private rateLimitRejections = 0;
  private activeSseStreams = 0;

  recordRequest(statusCode: number, durationMs: number): void {
    this.totalRequests += 1;
    if (statusCode >= 500) this.apiErrors5xx += 1;
    else if (statusCode >= 400) this.apiErrors4xx += 1;

    this.latencies.push(durationMs);
    if (this.latencies.length > 500) this.latencies.shift();
  }

  recordAiCall(success: boolean, durationMs: number): void {
    this.aiCallsTotal += 1;
    if (!success) this.aiCallsFailed += 1;
    this.aiLatencies.push(durationMs);
    if (this.aiLatencies.length > 200) this.aiLatencies.shift();
  }

  recordRateLimitRejection(): void {
    this.rateLimitRejections += 1;
  }

  setActiveSseStreams(count: number): void {
    this.activeSseStreams = count;
  }

  getSnapshot(): TelemetryMetricsSnapshot {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const avgLatencyMs =
      sorted.length > 0
        ? Number((sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(1))
        : 0;
    const p95Idx = sorted.length > 0 ? Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95)) : 0;
    const p95LatencyMs = sorted.length > 0 ? Number(sorted[p95Idx].toFixed(1)) : 0;

    const aiAvgLatencyMs =
      this.aiLatencies.length > 0
        ? Number(
            (this.aiLatencies.reduce((a, b) => a + b, 0) / this.aiLatencies.length).toFixed(1)
          )
        : 0;

    return {
      startedAt: new Date(this.startedAt).toISOString(),
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      totalRequests: this.totalRequests,
      apiErrors5xx: this.apiErrors5xx,
      apiErrors4xx: this.apiErrors4xx,
      avgLatencyMs,
      p95LatencyMs,
      aiCallsTotal: this.aiCallsTotal,
      aiCallsFailed: this.aiCallsFailed,
      aiAvgLatencyMs,
      rateLimitRejections: this.rateLimitRejections,
      activeSseStreams: this.activeSseStreams,
      memoryRssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
    };
  }
}

export const observability = new ObservabilityRegistry();

export interface CorrelatedRequest extends Request {
  correlationId?: string;
}

export function correlationMiddleware(req: CorrelatedRequest, res: Response, next: NextFunction) {
  const incoming = req.headers['x-correlation-id'];
  const correlationId =
    typeof incoming === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(incoming)
      ? incoming
      : `req-${crypto.randomBytes(6).toString('hex')}`;

  req.correlationId = correlationId;
  res.setHeader('X-Correlation-Id', correlationId);

  const start = performance.now();
  res.on('finish', () => {
    const urlPath = req.originalUrl || req.path || '';
    if (urlPath.startsWith('/api')) {
      const durationMs = Math.max(0.1, Number((performance.now() - start).toFixed(2)));
      observability.recordRequest(res.statusCode, durationMs);
      if (res.statusCode >= 500 && !process.env.NODE_TEST_CONTEXT) {
        console.error(
          JSON.stringify({
            level: 'error',
            correlationId,
            method: req.method,
            path: urlPath,
            statusCode: res.statusCode,
            durationMs,
          })
        );
      }
    }
  });

  next();
}
