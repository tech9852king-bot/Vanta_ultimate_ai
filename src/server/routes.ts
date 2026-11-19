/**
 * VANTA AI — Express API Routes (Phase II Enterprise Hardening)
 * Strictly enforces fail-closed sessions, revocation, single-use SSE tickets,
 * facility-level authorization, layered rate limits, centralized validation, and provenance tracking.
 */

import crypto from 'node:crypto';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import express, { type Response } from 'express';
import {
  canPerformAction,
  computeEnergySummary,
  computeZScoreAnomaly,
  correlateRootCauseEvidence,
  estimateRemainingUsefulLife,
  evaluatePredictiveBacktest,
  resolveCanonicalProvenance,
  simulateTwinCascade,
  validateProvenanceCombination,
  validateWorkOrderTransition,
} from '../core/intelligence.ts';
import type {
  Asset,
  AssetRelationship,
  DigitalTwinSnapshot,
  EnergyRecord,
  EvidenceClassification,
  EvidenceRelationType,
  Incident,
  InfrastructureEvent,
  MaintenanceRecord,
  ProvenanceDataQualityStatus,
  TelemetryPoint,
  UserSession,
  VantaRole,
  WorkOrder,
} from '../core/types.ts';
import {
  runBoundedAgentExecution,
  runVantaBrainQuery,
  runVisionFrameInspection,
  verifyGeminiProviderReadiness,
} from './ai.ts';
import {
  authorizeFacilityScope,
  buildFacilityInClause,
  isFacilityAuthorized,
} from './authz.ts';
import {
  createDatabaseBackup,
  listDatabaseBackups,
  verifyBackupFile,
} from './backup.ts';
import { loadRuntimeConfig, type RuntimeConfig } from './config.ts';
import { VANTA_AGENTS } from './db.ts';
import {
  ingestNormalizedTelemetry,
  probeCameraProviderHealth,
  probeIoTConnectorHealth,
} from './integrations.ts';
import { observability, type CorrelatedRequest } from './observability.ts';
import { createScopedRateLimiter } from './rateLimit.ts';
import {
  type AuthenticatedRequest,
  hashPassword,
  parseCookieHeader,
  requirePermission,
  SESSION_COOKIE_NAME,
  signSessionToken,
  StreamTicketStore,
  verifyPassword,
  verifySessionToken,
} from './security.ts';
import {
  cleanString,
  isValidId,
  validateAssetCreateBody,
  validateBrainQueryBody,
  validateIotIngestBody,
  validateKnowledgeBody,
  validateLoginBody,
  validatePagination,
  validateUploadedImagePayload,
  validateWorkOrderBody,
} from './validation.ts';

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomBytes(4).toString('hex')}`;
}

const ROLE_RANK: Record<VantaRole, number> = {
  Viewer: 1,
  Analyst: 2,
  'Maintenance Engineer': 3,
  'Security Operator': 3,
  'Infrastructure Engineer': 4,
  'Operations Manager': 5,
  'Facility Administrator': 6,
  'Organization Administrator': 7,
  'Platform Administrator': 8,
};

export interface ApiRouterHandle {
  router: express.Router;
  closeAllSseStreams: () => void;
}

export function createApiRouter(
  db: DatabaseSync,
  configOverride?: RuntimeConfig
): express.Router & { closeAllSseStreams?: () => void } {
  const cfg = configOverride || loadRuntimeConfig();
  const router = express.Router() as express.Router & { closeAllSseStreams?: () => void };
  const streamTickets = new StreamTicketStore();
  const sseClients = new Set<{ tenantId: string; facilityIds: string[]; res: Response }>();

  router.closeAllSseStreams = () => {
    for (const client of sseClients) {
      try {
        client.res.end();
      } catch {
        // Ignore already closed stream
      }
    }
    sseClients.clear();
    observability.setActiveSseStreams(0);
  };

  const logAudit = (
    tenantId: string,
    actorEmail: string,
    actorRole: VantaRole,
    action: string,
    resourceType: string,
    resourceId: string,
    outcome: 'SUCCESS' | 'DENIED' | 'ERROR',
    details: string
  ) => {
    db.prepare(`
      INSERT INTO audit_records (id, tenant_id, actor_email, actor_role, action, resource_type, resource_id, outcome, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uid('aud'),
      tenantId,
      actorEmail,
      actorRole,
      action,
      resourceType,
      resourceId,
      outcome,
      details,
      new Date().toISOString()
    );
  };

  const recordProvenance = (params: {
    tenantId: string;
    facilityId: string | null;
    assetId: string | null;
    sourceModule: string;
    sourceRecordId: string;
    dataMode: string;
    evidenceClass?: EvidenceClassification;
    dataQualityStatus?: ProvenanceDataQualityStatus;
    isIndependentlyVerified?: boolean;
    relationshipType?: EvidenceRelationType | null;
    parentEvidenceId?: string | null;
    processingMethod: string;
    modelVersion?: string | null;
    summary: string;
  }) => {
    const resolved = resolveCanonicalProvenance({
      sourceModule: params.sourceModule,
      dataMode: params.dataMode,
      evidenceClass: params.evidenceClass || null,
      processingMethod: params.processingMethod,
      isIndependentlyVerified: params.isIndependentlyVerified,
      dataQualityStatus: params.dataQualityStatus || null,
    });
    const validation = validateProvenanceCombination({
      sourceModule: params.sourceModule,
      dataMode: resolved.dataMode,
      evidenceClass: resolved.evidenceClass,
    });
    if (!validation.valid) {
      throw new Error(validation.reason || 'Invalid provenance combination.');
    }
    const qualityStatus = params.dataQualityStatus || resolved.dataQualityStatus;

    db.prepare(`
      INSERT INTO evidence_provenance (id, tenant_id, facility_id, asset_id, source_module, source_record_id, data_mode, evidence_class, data_quality_status, relationship_type, parent_evidence_id, processing_method, model_version, summary, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uid('prv'),
      params.tenantId,
      params.facilityId,
      params.assetId,
      params.sourceModule,
      params.sourceRecordId,
      resolved.dataMode,
      resolved.evidenceClass,
      qualityStatus,
      params.relationshipType || null,
      params.parentEvidenceId || null,
      params.processingMethod,
      params.modelVersion || null,
      params.summary,
      new Date().toISOString()
    );
  };

  const broadcastTelemetry = (tenantId: string, facilityId: string, payload: unknown) => {
    const line = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of sseClients) {
      if (client.tenantId === tenantId && client.facilityIds.includes(facilityId)) {
        client.res.write(line);
      }
    }
  };

  const issueCookie = (res: Response, token: string) => {
    res.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: cfg.cookieSameSite,
      secure: cfg.cookieSecure,
      maxAge: 12 * 60 * 60 * 1000,
      path: '/',
    });
  };

  // --- Layered Rate Limiters ---
  const loginLimiter = createScopedRateLimiter({
    scope: 'auth-login',
    maxRequests: cfg.isTest ? 40 : 15,
    windowMs: 60_000,
    keyBy: 'IP_AND_EMAIL',
  });
  const registerLimiter = createScopedRateLimiter({
    scope: 'auth-register',
    maxRequests: 8,
    windowMs: 60_000,
    keyBy: 'IP',
  });
  const aiLimiter = createScopedRateLimiter({
    scope: 'ai-inference',
    maxRequests: 35,
    windowMs: 60_000,
    keyBy: 'TENANT_USER',
  });
  const mutationLimiter = createScopedRateLimiter({
    scope: 'state-mutation',
    maxRequests: 100,
    windowMs: 60_000,
    keyBy: 'TENANT_USER',
  });

  // --- Session Hydration Middleware (Bearer Header or HTTP-Only Cookie; NO long-lived URL tokens) ---
  router.use((req: AuthenticatedRequest, _res, next) => {
    const cookies = parseCookieHeader(req.headers.cookie);
    const authHeader = req.headers.authorization;
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const token = bearer || cookies[SESSION_COOKIE_NAME];

    if (token) {
      const payload = verifySessionToken(token, cfg);
      if (payload) {
        // Verify session has not been revoked in SQLite session_records
        const sessionRow = db
          .prepare('SELECT jti, revoked_at, expires_at FROM session_records WHERE jti = ? AND user_id = ?')
          .get(payload.jti, payload.userId) as
          | { jti: string; revoked_at: string | null; expires_at: string }
          | undefined;

        const sessionValid =
          sessionRow &&
          !sessionRow.revoked_at &&
          new Date(sessionRow.expires_at).getTime() > Date.now();

        if (sessionValid) {
          const userRow = db
            .prepare(
              `SELECT u.id, u.tenant_id, u.email, u.full_name, u.role, u.facility_ids_json, u.status, u.token_version, o.name as org_name
               FROM users u JOIN organizations o ON u.tenant_id = o.tenant_id
               WHERE u.id = ? AND u.tenant_id = ?`
            )
            .get(payload.userId, payload.tenantId) as
            | {
                id: string;
                tenant_id: string;
                email: string;
                full_name: string;
                role: VantaRole;
                facility_ids_json: string;
                status: 'ACTIVE' | 'SUSPENDED';
                token_version: number;
                org_name: string;
              }
            | undefined;

          if (
            userRow &&
            userRow.status === 'ACTIVE' &&
            (payload.ver ?? 1) >= (userRow.token_version ?? 1)
          ) {
            req.auth = {
              id: userRow.id,
              tenantId: userRow.tenant_id,
              organizationName: userRow.org_name,
              email: userRow.email,
              fullName: userRow.full_name,
              role: userRow.role,
              facilityIds: JSON.parse(userRow.facility_ids_json) as string[],
              sessionId: payload.jti,
              status: userRow.status,
            };
          }
        }
      }
    }
    next();
  });

  // --- Health & Readiness (Public) ---
  router.get('/health', (_req, res) => {
    const dbCheck = db.prepare('SELECT COUNT(*) as cnt FROM organizations').get() as { cnt: number };
    const migRow = db.prepare('SELECT COUNT(*) as cnt FROM schema_migrations').get() as { cnt: number };
    res.json({
      status: 'OPERATIONAL',
      database: dbCheck.cnt > 0 ? 'CONNECTED_SQLITE_WAL' : 'CONNECTED_EMPTY_DB',
      migrationsApplied: migRow.cnt,
      geminiConfigured: cfg.geminiConfigured,
      geminiModelId: cfg.geminiModelId,
      geminiModelValid: cfg.geminiModelValid,
      geminiTimeoutMs: cfg.geminiTimeoutMs,
      allowDemoAuth: cfg.allowDemoAuth,
      simulationEngine: 'READY',
      observability: observability.getSnapshot(),
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/ready', (_req, res) => {
    try {
      const check = db.prepare('SELECT 1 as ok').get() as { ok: number } | undefined;
      if (check?.ok !== 1) {
        return res.status(503).json({ ready: false, error: 'Database unavailable' });
      }
      return res.json({
        ready: true,
        database: 'WAL_ONLINE',
        geminiConfigured: cfg.geminiConfigured,
        geminiModelValid: cfg.geminiModelValid,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return res.status(503).json({
        ready: false,
        error: err instanceof Error ? err.message : 'Readiness probe failed',
      });
    }
  });

  router.get('/auth/config', (_req, res) => {
    res.json({
      allowDemoAuth: cfg.allowDemoAuth,
      nodeEnv: cfg.nodeEnv,
      geminiConfigured: cfg.geminiConfigured,
    });
  });

  // --- Auth Routes ---
  router.get('/auth/session', (req: AuthenticatedRequest, res) => {
    if (!req.auth) {
      return res.json({ authenticated: false, user: null, token: null });
    }
    const authHeader = req.headers.authorization;
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const cookies = parseCookieHeader(req.headers.cookie);
    const currentToken = bearer || cookies[SESSION_COOKIE_NAME] || null;
    return res.json({ authenticated: true, user: req.auth, token: currentToken });
  });

  router.post('/auth/login', loginLimiter, (req, res) => {
    const validated = validateLoginBody(req.body);
    if (!validated.ok) {
      return res.status(400).json({ error: validated.error, fields: validated.fields });
    }
    const { email, password } = validated.data;

    const row = db
      .prepare(
        `SELECT u.id, u.tenant_id, u.email, u.full_name, u.password_hash, u.role, u.facility_ids_json, u.status, u.token_version, o.name as org_name
         FROM users u JOIN organizations o ON u.tenant_id = o.tenant_id WHERE LOWER(u.email) = LOWER(?)`
      )
      .get(email) as
      | {
          id: string;
          tenant_id: string;
          email: string;
          full_name: string;
          password_hash: string;
          role: VantaRole;
          facility_ids_json: string;
          status: 'ACTIVE' | 'SUSPENDED';
          token_version: number;
          org_name: string;
        }
      | undefined;

    if (!row || !verifyPassword(password, row.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    if (row.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Operator account is suspended.' });
    }

    const jti = `ses-${crypto.randomBytes(8).toString('hex')}`;
    const ttlSec = 12 * 60 * 60;
    const nowIso = new Date().toISOString();
    const expIso = new Date(Date.now() + ttlSec * 1000).toISOString();

    db.prepare(`
      INSERT INTO session_records (jti, user_id, tenant_id, issued_at, expires_at, revoked_at, revoked_reason)
      VALUES (?, ?, ?, ?, ?, NULL, NULL)
    `).run(jti, row.id, row.tenant_id, nowIso, expIso);

    const token = signSessionToken(
      {
        jti,
        userId: row.id,
        tenantId: row.tenant_id,
        role: row.role,
        ver: row.token_version ?? 1,
      },
      ttlSec,
      cfg
    );

    issueCookie(res, token);
    logAudit(row.tenant_id, row.email, row.role, 'USER_LOGIN', 'SESSION', jti, 'SUCCESS', 'Authenticated via scrypt credentials with persisted session record.');

    const user: UserSession = {
      id: row.id,
      tenantId: row.tenant_id,
      organizationName: row.org_name,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
      facilityIds: JSON.parse(row.facility_ids_json) as string[],
      sessionId: jti,
      status: row.status,
    };

    return res.json({ authenticated: true, user, token });
  });

  router.post('/auth/register-organization', registerLimiter, (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const organizationName = cleanString(body.organizationName, 2, 120);
    const fullName = cleanString(body.fullName, 2, 120);
    const email = cleanString(body.email, 5, 160);
    const password = typeof body.password === 'string' ? body.password : '';
    const industry = cleanString(body.industry, 2, 80) || 'Smart Infrastructure';
    const region = cleanString(body.region, 2, 60) || 'US-West';

    if (!organizationName || !fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || password.length < 8) {
      return res.status(400).json({
        error: 'Organization name, full name, valid email, and password (min 8 chars) are required.',
      });
    }

    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const now = new Date().toISOString();
    const orgId = uid('org');
    const tenantId = uid('tenant');
    const siteId = uid('site');
    const facId = uid('fac');
    const zoneId = uid('zn');
    const userId = uid('usr');
    const jti = `ses-${crypto.randomBytes(8).toString('hex')}`;
    const ttlSec = 12 * 60 * 60;
    const expIso = new Date(Date.now() + ttlSec * 1000).toISOString();

    db.exec('BEGIN');
    try {
      db.prepare('INSERT INTO organizations (id, tenant_id, name, industry, region, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        orgId,
        tenantId,
        organizationName,
        industry,
        region,
        now
      );
      db.prepare('INSERT INTO sites (id, tenant_id, name, country, timezone) VALUES (?, ?, ?, ?, ?)').run(
        siteId,
        tenantId,
        `${organizationName} Primary Site`,
        'USA',
        'America/Los_Angeles'
      );
      db.prepare(
        'INSERT INTO facilities (id, tenant_id, site_id, name, sector, code, status, coordinates, area_sqm, criticality) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(facId, tenantId, siteId, `${organizationName} Facility 01`, industry, 'FAC-01', 'NOMINAL', '37.7749° N, 122.4194° W', 10000, 'TIER_1');
      db.prepare(
        'INSERT INTO building_zones (id, tenant_id, facility_id, building_name, floor, zone_name, zone_type, restricted) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(zoneId, tenantId, facId, 'Main Building', 'Level 1', 'Primary Operations Zone', 'PRODUCTION', 0);

      db.prepare(
        'INSERT INTO users (id, tenant_id, email, full_name, password_hash, role, facility_ids_json, status, token_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)'
      ).run(
        userId,
        tenantId,
        email,
        fullName,
        hashPassword(password),
        'Organization Administrator',
        JSON.stringify([facId]),
        'ACTIVE',
        now
      );
      db.prepare(`
        INSERT INTO session_records (jti, user_id, tenant_id, issued_at, expires_at, revoked_at, revoked_reason)
        VALUES (?, ?, ?, ?, ?, NULL, NULL)
      `).run(jti, userId, tenantId, now, expIso);
      db.exec('COMMIT');
    } catch {
      db.exec('ROLLBACK');
      return res.status(500).json({ error: 'Failed to provision organization tenant.' });
    }

    const token = signSessionToken(
      {
        jti,
        userId,
        tenantId,
        role: 'Organization Administrator',
        ver: 1,
      },
      ttlSec,
      cfg
    );

    issueCookie(res, token);
    logAudit(tenantId, email, 'Organization Administrator', 'ORG_PROVISIONED', 'ORGANIZATION', orgId, 'SUCCESS', `Created isolated tenant ${tenantId}`);

    return res.status(201).json({
      authenticated: true,
      user: {
        id: userId,
        tenantId,
        organizationName,
        email,
        fullName,
        role: 'Organization Administrator',
        facilityIds: [facId],
        sessionId: jti,
        status: 'ACTIVE',
      },
      token,
    });
  });

  router.post('/auth/logout', (req: AuthenticatedRequest, res) => {
    if (req.auth) {
      if (req.auth.sessionId) {
        db.prepare('UPDATE session_records SET revoked_at = ?, revoked_reason = ? WHERE jti = ?').run(
          new Date().toISOString(),
          'USER_LOGOUT',
          req.auth.sessionId
        );
      }
      logAudit(req.auth.tenantId, req.auth.email, req.auth.role, 'USER_LOGOUT', 'SESSION', req.auth.sessionId || req.auth.id, 'SUCCESS', 'Operator signed out and session revoked.');
    }
    res.clearCookie(SESSION_COOKIE_NAME, {
      path: '/',
      sameSite: cfg.cookieSameSite,
      secure: cfg.cookieSecure,
    });
    res.json({ ok: true });
  });

  // --- Guard for all authenticated endpoints ---
  const guard = requirePermission('VIEW_PLATFORM', (req) => {
    if (req.auth) {
      logAudit(req.auth.tenantId, req.auth.email, req.auth.role, 'UNAUTHORIZED_ACCESS', 'API', req.path, 'DENIED', 'Permission rejected.');
    }
  });

  router.post('/auth/revoke-all', guard, (req: AuthenticatedRequest, res) => {
    const requestedUserId = typeof (req.body as { userId?: unknown })?.userId === 'string'
      ? (req.body as { userId: string }).userId.trim()
      : req.auth!.id;

    if (requestedUserId !== req.auth!.id && !canPerformAction(req.auth!.role, 'MANAGE_TENANTS_USERS')) {
      return res.status(403).json({ error: 'Only Administrators may revoke another operator’s sessions.' });
    }

    const target = db
      .prepare('SELECT id, email FROM users WHERE id = ? AND tenant_id = ?')
      .get(requestedUserId, req.auth!.tenantId) as { id: string; email: string } | undefined;

    if (!target) {
      return res.status(404).json({ error: 'User not found in tenant scope.' });
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE session_records SET revoked_at = ?, revoked_reason = ? WHERE user_id = ? AND tenant_id = ? AND revoked_at IS NULL').run(
      now,
      'REVOKE_ALL_SESSIONS',
      target.id,
      req.auth!.tenantId
    );
    db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ? AND tenant_id = ?').run(
      target.id,
      req.auth!.tenantId
    );

    if (target.id === req.auth!.id) {
      res.clearCookie(SESSION_COOKIE_NAME, {
        path: '/',
        sameSite: cfg.cookieSameSite,
        secure: cfg.cookieSecure,
      });
    }

    logAudit(req.auth!.tenantId, req.auth!.email, req.auth!.role, 'SESSIONS_REVOKED_ALL', 'USER', target.id, 'SUCCESS', `Revoked all active sessions for ${target.email}`);
    return res.json({ ok: true, revokedUserId: target.id });
  });

  // --- Single-Use SSE Streaming Ticket + Telemetry Stream ---
  router.post('/stream/ticket', guard, (req: AuthenticatedRequest, res) => {
    const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin : null;
    const ticket = streamTickets.issue({
      userId: req.auth!.id,
      tenantId: req.auth!.tenantId,
      facilityIds: req.auth!.facilityIds,
      origin: originHeader,
    });
    return res.json({ ticket, expiresInSeconds: 30 });
  });

  router.get('/stream/telemetry', (req: AuthenticatedRequest, res) => {
    const ticketParam = typeof req.query.ticket === 'string' ? req.query.ticket.trim() : null;
    const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin : null;

    let streamTenantId: string | null = req.auth?.tenantId || null;
    let streamFacilityIds: string[] = req.auth?.facilityIds || [];

    if (!streamTenantId && ticketParam) {
      const consumed = streamTickets.consume(ticketParam, originHeader);
      if (consumed) {
        streamTenantId = consumed.tenantId;
        streamFacilityIds = consumed.facilityIds;
      }
    }

    if (!streamTenantId) {
      return res.status(401).json({ error: 'Valid session cookie or single-use SSE stream ticket required.' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const client = { tenantId: streamTenantId, facilityIds: streamFacilityIds, res };
    sseClients.add(client);
    observability.setActiveSseStreams(sseClients.size);
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', tenantId: streamTenantId, timestamp: new Date().toISOString() })}\n\n`);

    req.on('close', () => {
      sseClients.delete(client);
      observability.setActiveSseStreams(sseClients.size);
    });
  });

  // --- Unified Workspace Bootstrap (Tenant + Facility-Scoped Operational State) ---
  router.get('/workspace', guard, (req: AuthenticatedRequest, res) => {
    const tenantId = req.auth!.tenantId;
    const requestedFacilityId =
      typeof req.query.facilityId === 'string' ? req.query.facilityId.trim() : 'ALL';

    const facilityScope = authorizeFacilityScope(req.auth!, requestedFacilityId);
    if (!facilityScope.allowed) {
      logAudit(
        tenantId,
        req.auth!.email,
        req.auth!.role,
        'FACILITY_SCOPE_DENIED',
        'FACILITY',
        requestedFacilityId,
        'DENIED',
        facilityScope.reason || 'Unauthorized facility requested.'
      );
      return res.status(403).json({ error: facilityScope.reason });
    }

    const effectiveFacs = facilityScope.effectiveFacilityIds;
    const facClause = buildFacilityInClause('facility_id', effectiveFacs);
    const idFacClause = buildFacilityInClause('id', effectiveFacs);
    const assetJoinFacClause = buildFacilityInClause('a.facility_id', effectiveFacs);
    const docFacClause = buildFacilityInClause('facility_id', effectiveFacs, true);
    const { limit } = validatePagination(req.query.limit, req.query.offset);
    const userRank = ROLE_RANK[req.auth!.role] ?? 1;

    const org = db
      .prepare('SELECT id, tenant_id as tenantId, name, industry, region, created_at as createdAt FROM organizations WHERE tenant_id = ?')
      .get(tenantId);
    const sites = db
      .prepare('SELECT id, tenant_id as tenantId, name, country, timezone FROM sites WHERE tenant_id = ?')
      .all(tenantId);
    const facilities = db
      .prepare(
        `SELECT id, tenant_id as tenantId, site_id as siteId, name, sector, code, status, coordinates, area_sqm as areaSqm, criticality
         FROM facilities WHERE tenant_id = ? AND ${idFacClause.clause}`
      )
      .all(tenantId, ...idFacClause.params);
    const zones = db
      .prepare(
        `SELECT id, tenant_id as tenantId, facility_id as facilityId, building_name as buildingName, floor, zone_name as zoneName, zone_type as zoneType, restricted
         FROM building_zones WHERE tenant_id = ? AND ${facClause.clause}`
      )
      .all(tenantId, ...facClause.params);

    const assetsRaw = db
      .prepare(`SELECT * FROM assets WHERE tenant_id = ? AND ${facClause.clause}`)
      .all(tenantId, ...facClause.params) as Array<Record<string, unknown>>;

    const assets: Asset[] = assetsRaw.map((a) => ({
      id: String(a.id),
      tenantId: String(a.tenant_id),
      facilityId: String(a.facility_id),
      zoneId: String(a.zone_id),
      parentAssetId: a.parent_asset_id ? String(a.parent_asset_id) : null,
      code: String(a.code),
      name: String(a.name),
      assetType: a.asset_type as Asset['assetType'],
      manufacturer: String(a.manufacturer),
      model: String(a.model),
      status: a.status as Asset['status'],
      owner: String(a.owner),
      dataMode: a.data_mode as Asset['dataMode'],
      healthScore: Number(a.health_score),
      xPos: Number(a.x_pos),
      yPos: Number(a.y_pos),
      metadata: JSON.parse(String(a.metadata_json || '{}')),
      updatedAt: String(a.updated_at),
    }));

    const relationships = db
      .prepare(
        `SELECT r.id, r.tenant_id as tenantId, r.source_asset_id as sourceAssetId, r.target_asset_id as targetAssetId, r.relationship_type as relationshipType, r.criticality_weight as criticalityWeight
         FROM asset_relationships r
         JOIN assets a ON a.id = r.source_asset_id
         WHERE r.tenant_id = ? AND ${assetJoinFacClause.clause}`
      )
      .all(tenantId, ...assetJoinFacClause.params) as unknown as AssetRelationship[];

    const cameras = db
      .prepare(
        `SELECT id, tenant_id as tenantId, facility_id as facilityId, zone_id as zoneId, asset_id as assetId, name, stream_protocol as streamProtocol, provider_type as providerType, capability_state as capabilityState, resolution, fps, status, mode, model_version as modelVersion, confidence_threshold as confidenceThreshold, sample_image_url as sampleImageUrl, privacy_policy as privacyPolicy, last_error as lastError, stream_health_pct as streamHealthPct, last_frame_at as lastFrameAt
         FROM cameras WHERE tenant_id = ? AND ${facClause.clause}`
      )
      .all(tenantId, ...facClause.params);

    const visionEventsRaw = db
      .prepare(
        `SELECT * FROM vision_events WHERE tenant_id = ? AND ${facClause.clause} ORDER BY created_at DESC LIMIT ?`
      )
      .all(tenantId, ...facClause.params, Math.min(limit, 40)) as Array<Record<string, unknown>>;
    const visionEvents = visionEventsRaw.map((v) => ({
      id: v.id,
      tenantId: v.tenant_id,
      cameraId: v.camera_id,
      facilityId: v.facility_id,
      assetId: v.asset_id,
      eventType: v.event_type,
      severity: v.severity,
      confidence: v.confidence,
      summary: v.summary,
      detections: JSON.parse(String(v.detections_json || '[]')),
      inferenceEngine: v.inference_engine,
      mode: v.mode,
      captureSource: v.capture_source || 'SAMPLE_IMAGE',
      evidenceImageUrl: v.evidence_image_url,
      createdAt: v.created_at,
    }));

    const iotIntegrations = db
      .prepare(
        `SELECT id, tenant_id as tenantId, facility_id as facilityId, name, protocol, endpoint, status, capability_state as capabilityState, lifecycle_stage as lifecycleStage, data_freshness_sec as dataFreshnessSec, retry_status as retryStatus, polling_interval_ms as pollingIntervalMs, device_count as deviceCount, latency_ms as latencyMs, consecutive_failures as consecutiveFailures, last_error as lastError, credential_ref as credentialRef, last_heartbeat_at as lastHeartbeatAt
         FROM iot_integrations WHERE tenant_id = ? AND ${facClause.clause}`
      )
      .all(tenantId, ...facClause.params);

    const telemetry = db
      .prepare(
        `SELECT t.id, t.tenant_id as tenantId, a.facility_id as facilityId, t.asset_id as assetId, t.metric_name as metricName, t.value, t.unit, t.threshold_warn as thresholdWarn, t.threshold_crit as thresholdCrit, t.z_score as zScore, t.is_anomaly as isAnomaly, t.mode, t.timestamp
         FROM telemetry_points t
         JOIN assets a ON a.id = t.asset_id
         WHERE t.tenant_id = ? AND ${assetJoinFacClause.clause}
         ORDER BY t.timestamp DESC LIMIT 120`
      )
      .all(tenantId, ...assetJoinFacClause.params) as Array<Record<string, unknown>>;

    const normalizedTelemetry: TelemetryPoint[] = telemetry.map((t) => ({
      id: String(t.id),
      tenantId: String(t.tenantId),
      facilityId: String(t.facilityId),
      assetId: String(t.assetId),
      metricName: String(t.metricName),
      value: Number(t.value),
      unit: String(t.unit),
      thresholdWarn: Number(t.thresholdWarn),
      thresholdCrit: Number(t.thresholdCrit),
      zScore: Number(t.zScore),
      isAnomaly: Boolean(t.isAnomaly),
      mode: t.mode as TelemetryPoint['mode'],
      timestamp: String(t.timestamp),
    }));

    const events = db
      .prepare(
        `SELECT id, tenant_id as tenantId, facility_id as facilityId, asset_id as assetId, source_module as sourceModule, event_type as eventType, severity, title, description, mode, created_at as createdAt
         FROM events WHERE tenant_id = ? AND ${facClause.clause} ORDER BY created_at DESC LIMIT 40`
      )
      .all(tenantId, ...facClause.params);

    const incidents = db
      .prepare(
        `SELECT id, tenant_id as tenantId, facility_id as facilityId, asset_id as assetId, title, description, severity, status, assigned_to as assignedTo, opened_at as openedAt, resolved_at as resolvedAt
         FROM incidents WHERE tenant_id = ? AND ${facClause.clause} ORDER BY opened_at DESC`
      )
      .all(tenantId, ...facClause.params);

    const maintenanceRecords = db
      .prepare(
        `SELECT id, tenant_id as tenantId, asset_id as assetId, facility_id as facilityId, maintenance_type as maintenanceType, performed_by as performedBy, summary, downtime_minutes as downtimeMinutes, parts_replaced as partsReplaced, performed_at as performedAt
         FROM maintenance_records WHERE tenant_id = ? AND ${facClause.clause} ORDER BY performed_at DESC`
      )
      .all(tenantId, ...facClause.params);

    const workOrders = db
      .prepare(
        `SELECT id, tenant_id as tenantId, facility_id as facilityId, asset_id as assetId, incident_id as incidentId, title, description, priority, status, requested_by as requestedBy, approved_by as approvedBy, safety_interlock_checked as safetyInterlockChecked, execution_notes as executionNotes, executed_by as executedBy, executed_at as executedAt, execution_mode as executionMode, verification_status as verificationStatus, verification_notes as verificationNotes, verified_by as verifiedBy, verified_at as verifiedAt, created_at as createdAt, updated_at as updatedAt
         FROM work_orders WHERE tenant_id = ? AND ${facClause.clause} ORDER BY created_at DESC`
      )
      .all(tenantId, ...facClause.params);

    const energyRecords = db
      .prepare(
        `SELECT id, tenant_id as tenantId, facility_id as facilityId, asset_id as assetId, period_start as periodStart, consumption_kwh as consumptionKwh, peak_demand_kw as peakDemandKw, baseline_kwh as baselineKwh, power_factor as powerFactor, mode, methodology
         FROM energy_records WHERE tenant_id = ? AND ${facClause.clause}`
      )
      .all(tenantId, ...facClause.params) as unknown as EnergyRecord[];

    const energySummary = computeEnergySummary(energyRecords);

    const predictiveAssessments = db
      .prepare(
        `SELECT id, tenant_id as tenantId, asset_id as assetId, facility_id as facilityId, failure_mode as failureMode, risk_score as riskScore, rul_hours as rulHours, uncertainty_hours as uncertaintyHours, methodology, data_source as dataSource, validation_status as validationStatus, model_kind as modelKind, model_version as modelVersion, data_quality_score as dataQualityScore, drift_status as driftStatus, recommended_action as recommendedAction, mode, computed_at as computedAt
         FROM predictive_assessments WHERE tenant_id = ? AND ${facClause.clause} ORDER BY risk_score DESC`
      )
      .all(tenantId, ...facClause.params);

    const rcaRaw = db
      .prepare(
        `SELECT * FROM root_cause_investigations WHERE tenant_id = ? AND ${facClause.clause} ORDER BY created_at DESC`
      )
      .all(tenantId, ...facClause.params) as Array<Record<string, unknown>>;

    const rootCauseInvestigations = rcaRaw.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      incidentId: r.incident_id,
      facilityId: r.facility_id,
      detectedIssue: r.detected_issue,
      supportingEvidence: JSON.parse(String(r.supporting_evidence_json || '[]')),
      relatedAssetIds: JSON.parse(String(r.related_asset_ids_json || '[]')),
      potentialCauses: JSON.parse(String(r.potential_causes_json || '[]')),
      alternativeExplanations: JSON.parse(String(r.alternative_explanations_json || '[]')),
      confidence: r.confidence,
      uncertaintyNotes: r.uncertainty_notes,
      recommendedInvestigation: r.recommended_investigation,
      humanDecision: r.human_decision,
      resolutionRecord: r.resolution_record,
      outcomeVerification: r.outcome_verification,
      status: r.status,
      createdAt: r.created_at,
    }));

    const agentExecutionsRaw = db
      .prepare('SELECT * FROM agent_executions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 25')
      .all(tenantId) as Array<Record<string, unknown>>;

    const agentExecutions = agentExecutionsRaw.map((ex) => ({
      id: ex.id,
      tenantId: ex.tenant_id,
      agentId: ex.agent_id,
      requestedBy: ex.requested_by,
      prompt: ex.prompt,
      status: ex.status,
      stepsTaken: ex.steps_taken,
      toolsInvoked: JSON.parse(String(ex.tools_invoked_json || '[]')),
      evidenceRefs: JSON.parse(String(ex.evidence_refs_json || '[]')),
      outputSummary: ex.output_summary,
      requiresApproval: Boolean(ex.requires_approval),
      idempotencyKey: ex.idempotency_key || null,
      trace: JSON.parse(String(ex.trace_json || '[]')),
      conflictsDetected: JSON.parse(String(ex.conflicts_json || '[]')),
      durationMs: Number(ex.duration_ms || 0),
      createdAt: ex.created_at,
    }));

    const approvals = db
      .prepare(
        `SELECT id, tenant_id as tenantId, facility_id as facilityId, target_type as targetType, target_id as targetId, title, justification, requested_by as requestedBy, risk_level as riskLevel, safety_boundary_check as safetyBoundaryCheck, status, decided_by as decidedBy, decision_notes as decisionNotes, created_at as createdAt, decided_at as decidedAt
         FROM approvals WHERE tenant_id = ? AND ${facClause.clause} ORDER BY created_at DESC`
      )
      .all(tenantId, ...facClause.params);

    const auditRecords = db
      .prepare(
        'SELECT id, tenant_id as tenantId, actor_email as actorEmail, actor_role as actorRole, action, resource_type as resourceType, resource_id as resourceId, outcome, details, created_at as createdAt FROM audit_records WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 50'
      )
      .all(tenantId);

    const allDocs = db
      .prepare(
        `SELECT id, tenant_id as tenantId, facility_id as facilityId, title, category, min_role as minRole, source_ref as sourceRef, version, content, updated_at as updatedAt
         FROM knowledge_documents WHERE tenant_id = ? AND ${docFacClause.clause} ORDER BY updated_at DESC`
      )
      .all(tenantId, ...docFacClause.params) as Array<{ minRole: VantaRole }>;
    const knowledgeDocuments = allDocs.filter((d) => (ROLE_RANK[d.minRole] ?? 1) <= userRank);

    const snapshotsRaw = db
      .prepare(
        `SELECT * FROM digital_twin_snapshots WHERE tenant_id = ? AND ${docFacClause.clause} ORDER BY created_at DESC LIMIT 12`
      )
      .all(tenantId, ...docFacClause.params) as Array<Record<string, unknown>>;
    const twinSnapshots: DigitalTwinSnapshot[] = snapshotsRaw.map((s) => ({
      id: String(s.id),
      tenantId: String(s.tenant_id),
      facilityId: s.facility_id ? String(s.facility_id) : null,
      twinVersion: String(s.twin_version),
      label: String(s.label),
      assetCount: Number(s.asset_count),
      criticalAssetCount: Number(s.critical_asset_count),
      meanHealthScore: Number(s.mean_health_score),
      stateSummary: JSON.parse(String(s.state_summary_json || '[]')),
      createdBy: String(s.created_by),
      createdAt: String(s.created_at),
    }));

    const users = canPerformAction(req.auth!.role, 'MANAGE_TENANTS_USERS')
      ? db
          .prepare(
            'SELECT id, tenant_id as tenantId, email, full_name as fullName, role, facility_ids_json as facilityIdsJson, status, created_at as createdAt FROM users WHERE tenant_id = ?'
          )
          .all(tenantId)
      : [];

    const provenanceRecords = db
      .prepare(
        `SELECT id, source_module as sourceModule, source_record_id as sourceRecordId, asset_id as assetId, facility_id as facilityId, created_at as timestamp, data_mode as dataMode, evidence_class as evidenceClass, data_quality_status as dataQualityStatus, relationship_type as relationshipType, parent_evidence_id as parentEvidenceId, processing_method as processingMethod, model_version as modelVersion, summary
         FROM evidence_provenance WHERE tenant_id = ? AND ${docFacClause.clause} ORDER BY created_at DESC LIMIT 60`
      )
      .all(tenantId, ...docFacClause.params);

    const brainRunsRaw = db
      .prepare(
        `SELECT id, tenant_id, facility_ids_json, actor_email, query, intent, engine_used, model_id, execution_status, provider_status, failure_category, correlation_id, tools_called_json, tool_results_json, omitted_evidence_count, verified_facts_count, rejected_citations_count, latency_ms, created_at
         FROM brain_runs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 20`
      )
      .all(tenantId) as Array<Record<string, unknown>>;

    const brainRuns = brainRunsRaw
      .map((r) => {
        let facIds: string[] = [];
        try {
          facIds = JSON.parse(String(r.facility_ids_json || '[]')) as string[];
        } catch {
          facIds = [];
        }
        return {
          id: String(r.id),
          tenantId: String(r.tenant_id),
          facilityIds: facIds,
          actorEmail: String(r.actor_email),
          query: String(r.query),
          intent: String(r.intent),
          engineUsed: (r.engine_used === 'GEMINI_4_HYDROGEN' ? 'GEMINI_4_HYDROGEN' : 'DETERMINISTIC_CORE_FALLBACK') as
            | 'GEMINI_4_HYDROGEN'
            | 'DETERMINISTIC_CORE_FALLBACK',
          modelId: String(r.model_id || 'deterministic-core-v2'),
          executionStatus: String(r.execution_status || 'DETERMINISTIC_FALLBACK'),
          providerStatus: String(r.provider_status || 'NOT_CONFIGURED'),
          failureCategory: r.failure_category ? String(r.failure_category) : null,
          correlationId: r.correlation_id ? String(r.correlation_id) : null,
          toolsCalled: JSON.parse(String(r.tools_called_json || '[]')) as string[],
          verifiedFactsCount: Number(r.verified_facts_count || 0),
          rejectedCitationsCount: Number(r.rejected_citations_count || 0),
          omittedEvidenceCount: Number(r.omitted_evidence_count || 0),
          latencyMs: Number(r.latency_ms || 0),
          createdAt: String(r.created_at),
        };
      })
      .filter((r) => r.facilityIds.length === 0 || r.facilityIds.some((fid) => effectiveFacs.includes(fid)))
      .slice(0, 15);

    res.json({
      organization: org,
      sites,
      facilities,
      zones,
      assets,
      relationships,
      cameras,
      visionEvents,
      iotIntegrations,
      telemetry: normalizedTelemetry,
      events,
      incidents,
      maintenanceRecords,
      workOrders,
      energyRecords,
      energySummary,
      predictiveAssessments,
      rootCauseInvestigations,
      agents: VANTA_AGENTS,
      agentExecutions,
      approvals,
      auditRecords,
      knowledgeDocuments,
      twinSnapshots,
      provenanceRecords,
      brainRuns,
      users,
    });
  });

  // --- VANTA Brain Query ---
  router.post('/brain/query', requirePermission('QUERY_BRAIN'), aiLimiter, async (req: AuthenticatedRequest, res, next) => {
    try {
      const validated = validateBrainQueryBody(req.body);
      if (!validated.ok) {
        return res.status(400).json({ error: validated.error, fields: validated.fields });
      }
      const { query, facilityId } = validated.data;

      const scope = authorizeFacilityScope(req.auth!, facilityId);
      if (!scope.allowed) {
        logAudit(req.auth!.tenantId, req.auth!.email, req.auth!.role, 'BRAIN_SCOPE_DENIED', 'FACILITY', facilityId || 'ALL', 'DENIED', scope.reason || 'Facility scope rejected.');
        return res.status(403).json({ error: scope.reason });
      }

      const execId = uid('brn');
      const correlationId = (req as CorrelatedRequest).correlationId || uid('cor');
      const reqAbortController = new AbortController();
      const onClientDisconnect = () => {
        if (!res.writableEnded) {
          reqAbortController.abort(new Error('Client HTTP connection closed before VANTA Brain completion'));
        }
      };
      res.on('close', onClientDisconnect);

      const result = await runVantaBrainQuery(db, req.auth!, query, facilityId, {
        executionId: execId,
        correlationId,
        config: cfg,
        signal: reqAbortController.signal,
      }).finally(() => {
        res.off('close', onClientDisconnect);
      });

      db.prepare(`
        INSERT INTO brain_runs (
          id, tenant_id, facility_ids_json, actor_email, query, intent,
          engine_used, model_id, correlation_id, execution_status, provider_status,
          failure_category, tools_called_json, tool_results_json, omitted_evidence_count,
          verified_facts_count, rejected_citations_count, latency_ms, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        result.executionId || execId,
        req.auth!.tenantId,
        JSON.stringify(scope.effectiveFacilityIds),
        req.auth!.email,
        query,
        result.intent || 'GENERAL_STATUS',
        result.engineUsed,
        result.modelId || cfg.geminiModelId,
        result.correlationId || correlationId,
        result.executionStatus || (result.engineUsed === 'GEMINI_4_HYDROGEN' ? 'GEMINI_SUCCESS' : 'DETERMINISTIC_FALLBACK'),
        result.providerStatus || (cfg.geminiConfigured ? 'AVAILABLE' : 'NOT_CONFIGURED'),
        result.failureCategory ?? null,
        JSON.stringify(result.toolsCalled),
        JSON.stringify(result.toolResults || []),
        result.omittedEvidenceCount ?? 0,
        result.verifiedFacts.length,
        result.rejectedCitations?.length || 0,
        result.latencyMs || 0,
        result.createdAt
      );

      try {
        db.exec('PRAGMA wal_checkpoint(PASSIVE);');
      } catch {
        // Ignore passive checkpoint contention
      }

      const auditAction =
        result.executionStatus === 'GEMINI_SUCCESS' ? 'BRAIN_QUERY' : 'BRAIN_QUERY_FALLBACK';

      logAudit(
        req.auth!.tenantId,
        req.auth!.email,
        req.auth!.role,
        auditAction,
        'VANTA_BRAIN',
        result.engineUsed,
        'SUCCESS',
        `Intent: ${result.intent} · Status: ${result.executionStatus} · Provider: ${result.providerStatus}${result.failureCategory ? ` (${result.failureCategory})` : ''} · Verified: ${result.verifiedFacts.length} · Rejected: ${result.rejectedCitations?.length || 0} · Correlation: ${result.correlationId || correlationId}`
      );
      return res.json(result);
    } catch (err) {
      return next(err);
    }
  });

  // --- VANTA Brain Live Provider Verification ---
  router.post(
    '/brain/verify-provider',
    requirePermission('QUERY_BRAIN'),
    aiLimiter,
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const report = await verifyGeminiProviderReadiness(db, req.auth!, { config: cfg });
        logAudit(
          req.auth!.tenantId,
          req.auth!.email,
          req.auth!.role,
          'BRAIN_PROVIDER_VERIFY',
          'VANTA_BRAIN',
          report.modelId || cfg.geminiModelId,
          'SUCCESS',
          `Status: ${report.overallStatus} · Configured: ${report.geminiConfigured} · Steps: ${report.steps.map((s) => `${s.name}=${s.status}(${s.durationMs}ms)`).join(', ')}`
        );
        return res.json(report);
      } catch (err) {
        return next(err);
      }
    }
  );

  // --- Vision Frame Inspection & Uploaded Image Inspection ---
  router.post('/vision/inspect', requirePermission('RUN_VISION_INSPECT'), aiLimiter, async (req: AuthenticatedRequest, res) => {
    const { cameraId, goal } = (req.body || {}) as { cameraId?: string; goal?: string };
    if (!isValidId(cameraId)) {
      return res.status(400).json({ error: 'Valid cameraId is required.' });
    }

    const cam = db
      .prepare('SELECT * FROM cameras WHERE id = ? AND tenant_id = ?')
      .get(cameraId, req.auth!.tenantId) as
      | {
          id: string;
          facility_id: string;
          zone_id: string;
          asset_id: string | null;
          name: string;
          sample_image_url: string;
          confidence_threshold: number;
          mode: 'MEASURED' | 'ESTIMATED' | 'SIMULATED';
          capability_state: 'LIVE' | 'SIMULATED' | 'SAMPLE_IMAGE' | 'OFFLINE' | 'DEGRADED' | 'NOT_CONFIGURED';
          status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
        }
      | undefined;

    if (!cam) {
      return res.status(404).json({ error: 'Camera not found in tenant scope.' });
    }
    if (!isFacilityAuthorized(req.auth!, cam.facility_id)) {
      return res.status(403).json({ error: `Facility access denied for camera '${cam.id}'.` });
    }
    if (cam.capability_state === 'OFFLINE' || cam.capability_state === 'NOT_CONFIGURED' || cam.status === 'OFFLINE') {
      return res.status(409).json({
        error: `Camera '${cam.name}' is ${cam.capability_state || cam.status}; live inspection cannot run until camera feed is online or a frame is uploaded manually.`,
        capabilityState: cam.capability_state,
      });
    }

    const inspection = await runVisionFrameInspection(
      {
        id: cam.id,
        name: cam.name,
        sampleImageUrl: cam.sample_image_url,
        confidenceThreshold: cam.confidence_threshold,
        zoneId: cam.zone_id,
        capabilityState: cam.capability_state,
        status: cam.status,
      },
      goal?.trim() || 'Inspect PPE compliance, safety perimeter clearance, and equipment status'
    );

    const evtId = uid('vis-evt');
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO vision_events (id, tenant_id, camera_id, facility_id, asset_id, event_type, severity, confidence, summary, detections_json, inference_engine, mode, capture_source, evidence_image_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      evtId,
      req.auth!.tenantId,
      cam.id,
      cam.facility_id,
      cam.asset_id,
      'ON_DEMAND_INSPECTION',
      inspection.severity,
      inspection.confidence,
      inspection.summary,
      JSON.stringify(inspection.detections),
      inspection.inferenceEngine,
      cam.mode,
      inspection.captureSource,
      cam.sample_image_url,
      now
    );

    db.prepare('UPDATE cameras SET last_frame_at = ? WHERE id = ?').run(now, cam.id);
    recordProvenance({
      tenantId: req.auth!.tenantId,
      facilityId: cam.facility_id,
      assetId: cam.asset_id,
      sourceModule: 'VISION',
      sourceRecordId: evtId,
      dataMode: cam.mode,
      evidenceClass: cam.mode === 'SIMULATED' ? 'SIMULATED' : 'OBSERVED',
      dataQualityStatus: cam.mode === 'SIMULATED' ? 'SIMULATED_SYNTHETIC' : 'PENDING_VERIFICATION',
      isIndependentlyVerified: false,
      relationshipType:
        inspection.severity === 'CRITICAL' || inspection.severity === 'HIGH' ? 'REQUIRES_REVIEW' : 'SUPPORTS',
      parentEvidenceId: cam.asset_id,
      processingMethod: `${inspection.inferenceEngine} (${inspection.captureSource})`,
      modelVersion: cfg.geminiModelId,
      summary: inspection.summary,
    });
    logAudit(req.auth!.tenantId, req.auth!.email, req.auth!.role, 'VISION_INSPECT', 'CAMERA', cam.id, 'SUCCESS', inspection.summary);

    return res.json({
      id: evtId,
      cameraId: cam.id,
      facilityId: cam.facility_id,
      assetId: cam.asset_id,
      ...inspection,
      mode: cam.mode,
      dataMode: cam.mode,
      evidenceClass: cam.mode === 'SIMULATED' ? 'SIMULATED' : 'OBSERVED',
      dataQualityStatus: cam.mode === 'SIMULATED' ? 'SIMULATED_SYNTHETIC' : 'PENDING_VERIFICATION',
      evidenceImageUrl: cam.sample_image_url,
      createdAt: now,
    });
  });

  router.post('/vision/upload-inspect', requirePermission('RUN_VISION_INSPECT'), aiLimiter, async (req: AuthenticatedRequest, res) => {
    const validated = validateUploadedImagePayload(req.body);
    if (!validated.ok) {
      return res.status(400).json({ error: validated.error, fields: validated.fields });
    }
    const { cameraId, goal, mimeType, base64Data, filename } = validated.data;

    const cam = db
      .prepare('SELECT id, facility_id, zone_id, asset_id, name, confidence_threshold, sample_image_url, capability_state, status FROM cameras WHERE id = ? AND tenant_id = ?')
      .get(cameraId, req.auth!.tenantId) as
      | {
          id: string;
          facility_id: string;
          zone_id: string;
          asset_id: string | null;
          name: string;
          confidence_threshold: number;
          sample_image_url: string;
          capability_state: 'LIVE' | 'SIMULATED' | 'SAMPLE_IMAGE' | 'OFFLINE' | 'DEGRADED' | 'NOT_CONFIGURED';
          status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
        }
      | undefined;

    if (!cam) {
      return res.status(404).json({ error: 'Camera not found in tenant scope.' });
    }
    if (!isFacilityAuthorized(req.auth!, cam.facility_id)) {
      return res.status(403).json({ error: `Facility access denied for camera '${cam.id}'.` });
    }

    const inspection = await runVisionFrameInspection(
      {
        id: cam.id,
        name: cam.name,
        sampleImageUrl: cam.sample_image_url,
        confidenceThreshold: cam.confidence_threshold,
        zoneId: cam.zone_id,
        capabilityState: cam.capability_state,
        status: cam.status,
      },
      goal,
      { mimeType, base64Data }
    );

    const evtId = uid('vis-up');
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO vision_events (id, tenant_id, camera_id, facility_id, asset_id, event_type, severity, confidence, summary, detections_json, inference_engine, mode, capture_source, evidence_image_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OBSERVED', 'UPLOADED_IMAGE', ?, ?)
    `).run(
      evtId,
      req.auth!.tenantId,
      cam.id,
      cam.facility_id,
      cam.asset_id,
      'UPLOADED_FRAME_INSPECTION',
      inspection.severity,
      inspection.confidence,
      inspection.summary,
      JSON.stringify(inspection.detections),
      inspection.inferenceEngine,
      `uploaded://${filename}`,
      now
    );

    recordProvenance({
      tenantId: req.auth!.tenantId,
      facilityId: cam.facility_id,
      assetId: cam.asset_id,
      sourceModule: 'VISION',
      sourceRecordId: evtId,
      dataMode: 'OBSERVED',
      evidenceClass: 'OBSERVED',
      dataQualityStatus: 'PENDING_VERIFICATION',
      isIndependentlyVerified: false,
      relationshipType:
        inspection.severity === 'CRITICAL' || inspection.severity === 'HIGH' ? 'REQUIRES_REVIEW' : 'SUPPORTS',
      parentEvidenceId: cam.asset_id,
      processingMethod: `${inspection.inferenceEngine} (UPLOADED_IMAGE: ${filename})`,
      modelVersion: cfg.geminiModelId,
      summary: inspection.summary,
    });
    logAudit(req.auth!.tenantId, req.auth!.email, req.auth!.role, 'VISION_UPLOAD_INSPECT', 'CAMERA', cam.id, 'SUCCESS', `Inspected uploaded frame '${filename}'`);

    return res.status(201).json({
      id: evtId,
      cameraId: cam.id,
      facilityId: cam.facility_id,
      assetId: cam.asset_id,
      ...inspection,
      mode: 'OBSERVED',
      dataMode: 'OBSERVED',
      evidenceClass: 'OBSERVED',
      dataQualityStatus: 'PENDING_VERIFICATION',
      captureSource: 'UPLOADED_IMAGE',
      cameraCapabilityState: cam.capability_state,
      cameraStatus: cam.status,
      createdAt: now,
    });
  });

  router.post('/cameras/:id/health-check', guard, (req: AuthenticatedRequest, res) => {
    const result = probeCameraProviderHealth(db, req.auth!, String(req.params.id));
    if ('error' in result) {
      return res.status(result.statusCode).json({ error: result.error });
    }
    logAudit(req.auth!.tenantId, req.auth!.email, req.auth!.role, 'CAMERA_HEALTH_PROBE', 'CAMERA', result.cameraId, 'SUCCESS', `State=${result.capabilityState} (${result.streamHealthPct}%)`);
    return res.json(result);
  });

  // --- IoT Connectors, Normalized Telemetry Ingestion & Simulation ---
  router.post('/iot/connectors/:id/health-check', guard, (req: AuthenticatedRequest, res) => {
    const result = probeIoTConnectorHealth(db, req.auth!, String(req.params.id));
    if ('error' in result) {
      return res.status(result.statusCode).json({ error: result.error });
    }
    logAudit(
      req.auth!.tenantId,
      req.auth!.email,
      req.auth!.role,
      'IOT_CONNECTOR_PROBE',
      'IOT_CONNECTOR',
      result.connectorId,
      result.status === 'OFFLINE' || result.status === 'NOT_CONFIGURED' ? 'ERROR' : 'SUCCESS',
      `Protocol=${result.protocol} State=${result.status}`
    );
    return res.json(result);
  });

  router.post('/iot/ingest', requirePermission('MANAGE_ASSETS_IOT'), mutationLimiter, (req: AuthenticatedRequest, res) => {
    const validated = validateIotIngestBody(req.body);
    if (!validated.ok) {
      return res.status(400).json({ error: validated.error, fields: validated.fields });
    }
    const result = ingestNormalizedTelemetry(db, req.auth!, validated.data);
    if ('error' in result) {
      return res.status(result.statusCode).json({ error: result.error });
    }
    recordProvenance({
      tenantId: req.auth!.tenantId,
      facilityId: result.facilityId,
      assetId: validated.data.assetId,
      sourceModule: 'IOT',
      sourceRecordId: result.telemetryId,
      dataMode: result.mode,
      evidenceClass: result.mode === 'SIMULATED' ? 'SIMULATED' : 'MEASURED',
      dataQualityStatus: result.dataQualityStatus,
      relationshipType: result.isAnomaly ? 'REQUIRES_REVIEW' : 'SUPPORTS',
      parentEvidenceId: validated.data.assetId,
      processingMethod: 'Normalized Gateway Ingestion + Z-Score Check',
      summary: `${validated.data.metricName}=${validated.data.value} ${validated.data.unit} (z=${result.zScore})`,
    });
    broadcastTelemetry(req.auth!.tenantId, result.facilityId, {
      type: 'TELEMETRY_UPDATE',
      assetId: validated.data.assetId,
      value: validated.data.value,
      unit: validated.data.unit,
      mode: result.mode,
      timestamp: new Date().toISOString(),
    });
    return res.status(201).json(result);
  });

  router.post('/iot/simulate', requirePermission('TRIGGER_SIMULATION'), mutationLimiter, (req: AuthenticatedRequest, res) => {
    const { assetId, scenario } = (req.body || {}) as {
      assetId?: string;
      scenario?: 'NOMINAL_SAMPLE' | 'THERMAL_SPIKE' | 'VIBRATION_FAULT';
    };
    if (!isValidId(assetId)) {
      return res.status(400).json({ error: 'Valid assetId is required.' });
    }
    if (scenario && !['NOMINAL_SAMPLE', 'THERMAL_SPIKE', 'VIBRATION_FAULT'].includes(scenario)) {
      return res.status(400).json({ error: 'Invalid simulation scenario.' });
    }

    const asset = db
      .prepare('SELECT * FROM assets WHERE id = ? AND tenant_id = ?')
      .get(assetId, req.auth!.tenantId) as
      | { id: string; facility_id: string; name: string; health_score: number }
      | undefined;

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found in tenant scope.' });
    }
    if (!isFacilityAuthorized(req.auth!, asset.facility_id)) {
      return res.status(403).json({ error: `Facility access denied for asset '${asset.id}'.` });
    }

    const historyRows = db
      .prepare('SELECT value, metric_name, unit, threshold_warn, threshold_crit FROM telemetry_points WHERE tenant_id = ? AND asset_id = ? ORDER BY timestamp DESC LIMIT 10')
      .all(req.auth!.tenantId, assetId) as Array<{
      value: number;
      metric_name: string;
      unit: string;
      threshold_warn: number;
      threshold_crit: number;
    }>;

    const template = historyRows[0] || {
      value: 45,
      metric_name: 'Operating Temperature',
      unit: '°C',
      threshold_warn: 70,
      threshold_crit: 85,
    };

    const baseline = historyRows.map((r) => r.value);
    const nominalHistory = historyRows.filter((r) => r.value < r.threshold_warn).map((r) => r.value);
    const nominalMean =
      nominalHistory.length > 0
        ? nominalHistory.reduce((acc, v) => acc + v, 0) / nominalHistory.length
        : template.threshold_warn * 0.72;

    let nextValue = template.value;
    if (scenario === 'THERMAL_SPIKE') {
      nextValue = Number((template.threshold_crit + 3.4).toFixed(1));
    } else if (scenario === 'VIBRATION_FAULT') {
      nextValue = Number((template.threshold_crit * 1.15).toFixed(2));
    } else {
      nextValue = Number((nominalMean + (Math.random() - 0.5) * 0.08).toFixed(2));
    }

    const effectiveBaseline = scenario === 'NOMINAL_SAMPLE' && nominalHistory.length > 0 ? nominalHistory : baseline;
    const anomaly = computeZScoreAnomaly(effectiveBaseline, nextValue, template.threshold_warn, template.threshold_crit);
    const now = new Date().toISOString();
    const telId = uid('tel-sim');

    db.prepare(`
      INSERT INTO telemetry_points (id, tenant_id, facility_id, asset_id, metric_name, value, unit, threshold_warn, threshold_crit, z_score, is_anomaly, mode, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SIMULATED', ?)
    `).run(
      telId,
      req.auth!.tenantId,
      asset.facility_id,
      asset.id,
      template.metric_name,
      nextValue,
      template.unit,
      template.threshold_warn,
      template.threshold_crit,
      anomaly.zScore,
      anomaly.isAnomaly ? 1 : 0,
      now
    );

    const newStatus = anomaly.severity === 'CRITICAL' ? 'CRITICAL' : anomaly.isAnomaly ? 'WARNING' : 'NOMINAL';
    const newHealth =
      anomaly.severity === 'CRITICAL'
        ? Math.max(38, asset.health_score - 18)
        : anomaly.isAnomaly
        ? Math.max(60, asset.health_score - 8)
        : Math.min(96, asset.health_score + 2);
    db.prepare('UPDATE assets SET status = ?, health_score = ?, updated_at = ? WHERE id = ?').run(newStatus, newHealth, now, asset.id);

    const rul = estimateRemainingUsefulLife({
      assetName: asset.name,
      currentValue: nextValue,
      nominalValue: template.threshold_warn * 0.68,
      criticalThreshold: template.threshold_crit,
      recentSlopePerHour: anomaly.isAnomaly ? 0.35 : 0.01,
      hoursSinceLastMaintenance: 960,
      maintenanceIntervalHours: 1440,
    });

    db.prepare(
      "DELETE FROM predictive_assessments WHERE tenant_id = ? AND asset_id = ? AND validation_status = 'SIMULATED_BASELINE'"
    ).run(req.auth!.tenantId, asset.id);

    const predId = uid('prd-sim');
    db.prepare(`
      INSERT INTO predictive_assessments (id, tenant_id, asset_id, facility_id, failure_mode, risk_score, rul_hours, uncertainty_hours, methodology, data_source, validation_status, model_kind, model_version, data_quality_score, drift_status, recommended_action, mode, computed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SIMULATED_BASELINE', ?, ?, ?, ?, ?, 'SIMULATED', ?)
    `).run(
      predId,
      req.auth!.tenantId,
      asset.id,
      asset.facility_id,
      rul.failureMode,
      rul.riskScore,
      rul.rulHours,
      rul.uncertaintyHours,
      rul.methodology,
      `${template.metric_name} (SIMULATED scenario: ${scenario || 'NOMINAL_SAMPLE'})`,
      rul.modelKind,
      rul.modelVersion,
      72,
      anomaly.isAnomaly ? 'ELEVATED_DRIFT' : 'NOMINAL',
      rul.recommendedAction,
      now
    );

    if (anomaly.isAnomaly) {
      db.prepare(`
        INSERT INTO events (id, tenant_id, facility_id, asset_id, source_module, event_type, severity, title, description, mode, created_at)
        VALUES (?, ?, ?, ?, 'IOT', 'SIMULATED_EXCURSION', ?, ?, ?, 'SIMULATED', ?)
      `).run(
        uid('evt-sim'),
        req.auth!.tenantId,
        asset.facility_id,
        asset.id,
        anomaly.severity,
        `[SIMULATED] ${asset.name} ${template.metric_name} = ${nextValue} ${template.unit}`,
        `Simulated telemetry spike (z=${anomaly.zScore}) triggered predictive RUL reassessment (${rul.rulHours}±${rul.uncertaintyHours}h).`,
        now
      );
    }

    recordProvenance({
      tenantId: req.auth!.tenantId,
      facilityId: asset.facility_id,
      assetId: asset.id,
      sourceModule: 'IOT',
      sourceRecordId: telId,
      dataMode: 'SIMULATED',
      processingMethod: `Scenario Injection (${scenario || 'NOMINAL_SAMPLE'}) + Z-Score + Headroom RUL`,
      modelVersion: rul.modelVersion,
      summary: `${template.metric_name}=${nextValue} ${template.unit} (SIMULATED)`,
    });

    logAudit(req.auth!.tenantId, req.auth!.email, req.auth!.role, 'IOT_SIMULATION', 'ASSET', asset.id, 'SUCCESS', `Scenario ${scenario || 'NOMINAL_SAMPLE'} -> ${nextValue} ${template.unit}`);
    broadcastTelemetry(req.auth!.tenantId, asset.facility_id, {
      type: 'TELEMETRY_UPDATE',
      assetId: asset.id,
      value: nextValue,
      unit: template.unit,
      mode: 'SIMULATED',
      timestamp: now,
    });

    return res.json({
      telemetryId: telId,
      assetId: asset.id,
      value: nextValue,
      unit: template.unit,
      anomaly,
      predictive: rul,
      mode: 'SIMULATED',
    });
  });

  // --- Digital Twin Snapshots & Cascade What-If Simulation ---
  router.get('/twin/snapshots', guard, (req: AuthenticatedRequest, res) => {
    const scope = authorizeFacilityScope(req.auth!, typeof req.query.facilityId === 'string' ? req.query.facilityId : undefined);
    if (!scope.allowed) return res.status(403).json({ error: scope.reason });
    const facIn = buildFacilityInClause('facility_id', scope.effectiveFacilityIds, true);
    const rows = db
      .prepare(`SELECT * FROM digital_twin_snapshots WHERE tenant_id = ? AND ${facIn.clause} ORDER BY created_at DESC LIMIT 20`)
      .all(req.auth!.tenantId, ...facIn.params) as Array<Record<string, unknown>>;

    return res.json({
      snapshots: rows.map((s) => ({
        id: String(s.id),
        tenantId: String(s.tenant_id),
        facilityId: s.facility_id ? String(s.facility_id) : null,
        twinVersion: String(s.twin_version),
        label: String(s.label),
        assetCount: Number(s.asset_count),
        criticalAssetCount: Number(s.critical_asset_count),
        meanHealthScore: Number(s.mean_health_score),
        stateSummary: JSON.parse(String(s.state_summary_json || '[]')),
        createdBy: String(s.created_by),
        createdAt: String(s.created_at),
      })),
    });
  });

  router.post('/twin/snapshots', requirePermission('TRIGGER_SIMULATION'), mutationLimiter, (req: AuthenticatedRequest, res) => {
    const body = (req.body || {}) as { facilityId?: string; label?: string };
    const scope = authorizeFacilityScope(req.auth!, body.facilityId);
    if (!scope.allowed) return res.status(403).json({ error: scope.reason });

    const facIn = buildFacilityInClause('facility_id', scope.effectiveFacilityIds);
    const assetRows = db
      .prepare(`SELECT id, code, status, health_score, data_mode FROM assets WHERE tenant_id = ? AND ${facIn.clause}`)
      .all(req.auth!.tenantId, ...facIn.params) as Array<{
      id: string;
      code: string;
      status: Asset['status'];
      health_score: number;
      data_mode: Asset['dataMode'];
    }>;

    const count = assetRows.length;
    const criticalCount = assetRows.filter((a) => a.status === 'CRITICAL' || a.status === 'WARNING').length;
    const meanHealth = count > 0 ? Math.round(assetRows.reduce((acc, a) => acc + Number(a.health_score), 0) / count) : 0;

    const existingCount = (db
      .prepare('SELECT COUNT(*) as cnt FROM digital_twin_snapshots WHERE tenant_id = ?')
      .get(req.auth!.tenantId) as { cnt: number }).cnt;
    const snapId = uid('twin');
    const now = new Date().toISOString();
    const twinVersion = `twin-v${existingCount + 1}.0`;
    const label = cleanString(body.label, 2, 120) || `Twin Checkpoint (${scope.effectiveFacilityIds.length} facility scope)`;
    const stateSummary = assetRows.map((a) => ({
      assetId: a.id,
      code: a.code,
      status: a.status,
      healthScore: Number(a.health_score),
      dataMode: a.data_mode,
    }));

    db.prepare(`
      INSERT INTO digital_twin_snapshots (id, tenant_id, facility_id, twin_version, label, asset_count, critical_asset_count, mean_health_score, state_summary_json, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      snapId,
      req.auth!.tenantId,
      body.facilityId && body.facilityId !== 'ALL' ? body.facilityId : null,
      twinVersion,
      label,
      count,
      criticalCount,
      meanHealth,
      JSON.stringify(stateSummary),
      req.auth!.email,
      now
    );

    logAudit(req.auth!.tenantId, req.auth!.email, req.auth!.role, 'TWIN_SNAPSHOT_CAPTURED', 'DIGITAL_TWIN', snapId, 'SUCCESS', `${twinVersion}: ${label}`);
    return res.status(201).json({
      id: snapId,
      tenantId: req.auth!.tenantId,
      facilityId: body.facilityId && body.facilityId !== 'ALL' ? body.facilityId : null,
      twinVersion,
      label,
      assetCount: count,
      criticalAssetCount: criticalCount,
      meanHealthScore: meanHealth,
      stateSummary,
      createdBy: req.auth!.email,
      createdAt: now,
    });
  });

  router.post('/twin/simulate-scenario', guard, (req: AuthenticatedRequest, res) => {
    const body = (req.body || {}) as {
      seedAssetId?: string;
      scenarioType?: 'ASSET_OFFLINE' | 'COOLING_DEGRADATION' | 'POWER_LOSS';
    };
    if (!isValidId(body.seedAssetId)) {
      return res.status(400).json({ error: 'Valid seedAssetId is required.' });
    }
    const scenarioType =
      body.scenarioType === 'POWER_LOSS' || body.scenarioType === 'COOLING_DEGRADATION'
        ? body.scenarioType
        : 'ASSET_OFFLINE';

    const seed = db
      .prepare('SELECT id, facility_id FROM assets WHERE id = ? AND tenant_id = ?')
      .get(body.seedAssetId, req.auth!.tenantId) as { id: string; facility_id: string } | undefined;

    if (!seed) return res.status(404).json({ error: 'Seed asset not found in tenant scope.' });
    if (!isFacilityAuthorized(req.auth!, seed.facility_id)) {
      return res.status(403).json({ error: `Facility access denied for asset '${seed.id}'.` });
    }

    const scope = authorizeFacilityScope(req.auth!);
    const facIn = buildFacilityInClause('facility_id', scope.effectiveFacilityIds);
    const assetsRaw = db
      .prepare(`SELECT * FROM assets WHERE tenant_id = ? AND ${facIn.clause}`)
      .all(req.auth!.tenantId, ...facIn.params) as Array<Record<string, unknown>>;

    const assets: Asset[] = assetsRaw.map((a) => ({
      id: String(a.id),
      tenantId: String(a.tenant_id),
      facilityId: String(a.facility_id),
      zoneId: String(a.zone_id),
      parentAssetId: null,
      code: String(a.code),
      name: String(a.name),
      assetType: a.asset_type as Asset['assetType'],
      manufacturer: String(a.manufacturer),
      model: String(a.model),
      status: a.status as Asset['status'],
      owner: String(a.owner),
      dataMode: a.data_mode as Asset['dataMode'],
      healthScore: Number(a.health_score),
      xPos: Number(a.x_pos),
      yPos: Number(a.y_pos),
      metadata: {},
      updatedAt: String(a.updated_at),
    }));
    const rels = db
      .prepare('SELECT id, tenant_id as tenantId, source_asset_id as sourceAssetId, target_asset_id as targetAssetId, relationship_type as relationshipType, criticality_weight as criticalityWeight FROM asset_relationships WHERE tenant_id = ?')
      .all(req.auth!.tenantId) as unknown as AssetRelationship[];

    const result = simulateTwinCascade(seed.id, scenarioType, assets, rels);
    return res.json(result);
  });

  // --- Predictive Backtest & Drift Evaluation ---
  router.get('/predictive/backtest', guard, (req: AuthenticatedRequest, res) => {
    const assetId = typeof req.query.assetId === 'string' ? req.query.assetId.trim() : '';
    if (!isValidId(assetId)) {
      return res.status(400).json({ error: 'Valid assetId query parameter is required.' });
    }
    const asset = db
      .prepare('SELECT id, facility_id FROM assets WHERE id = ? AND tenant_id = ?')
      .get(assetId, req.auth!.tenantId) as { id: string; facility_id: string } | undefined;

    if (!asset) return res.status(404).json({ error: 'Asset not found in tenant scope.' });
    if (!isFacilityAuthorized(req.auth!, asset.facility_id)) {
      return res.status(403).json({ error: `Facility access denied for asset '${asset.id}'.` });
    }

    const rows = db
      .prepare(
        `SELECT id, tenant_id as tenantId, facility_id as facilityId, asset_id as assetId, metric_name as metricName, value, unit, threshold_warn as thresholdWarn, threshold_crit as thresholdCrit, z_score as zScore, is_anomaly as isAnomaly, mode, timestamp
         FROM telemetry_points WHERE tenant_id = ? AND asset_id = ? ORDER BY timestamp ASC LIMIT 100`
      )
      .all(req.auth!.tenantId, asset.id) as Array<Record<string, unknown>>;

    const points: TelemetryPoint[] = rows.map((t) => ({
      id: String(t.id),
      tenantId: String(t.tenantId),
      facilityId: String(t.facilityId),
      assetId: String(t.assetId),
      metricName: String(t.metricName),
      value: Number(t.value),
      unit: String(t.unit),
      thresholdWarn: Number(t.thresholdWarn),
      thresholdCrit: Number(t.thresholdCrit),
      zScore: Number(t.zScore),
      isAnomaly: Boolean(t.isAnomaly),
      mode: t.mode as TelemetryPoint['mode'],
      timestamp: String(t.timestamp),
    }));

    return res.json(evaluatePredictiveBacktest(asset.id, points));
  });

  // --- Root Cause Investigation Generator & Human Resolution ---
  router.post('/rca/correlate', requirePermission('CREATE_INCIDENT'), mutationLimiter, (req: AuthenticatedRequest, res) => {
    const { incidentId } = (req.body || {}) as { incidentId?: string };
    if (!isValidId(incidentId)) return res.status(400).json({ error: 'Valid incidentId is required.' });

    const tenantId = req.auth!.tenantId;
    const inc = db
      .prepare('SELECT id, tenant_id as tenantId, facility_id as facilityId, asset_id as assetId, title, description, severity, status, assigned_to as assignedTo, opened_at as openedAt, resolved_at as resolvedAt FROM incidents WHERE id = ? AND tenant_id = ?')
      .get(incidentId, tenantId) as Incident | undefined;
    if (!inc) return res.status(404).json({ error: 'Incident not found.' });
    if (!isFacilityAuthorized(req.auth!, inc.facilityId)) {
      return res.status(403).json({ error: `Facility access denied for incident '${inc.id}'.` });
    }

    const scope = authorizeFacilityScope(req.auth!);
    const facIn = buildFacilityInClause('facility_id', scope.effectiveFacilityIds);
    const assets = (db.prepare(`SELECT * FROM assets WHERE tenant_id = ? AND ${facIn.clause}`).all(tenantId, ...facIn.params) as Array<Record<string, unknown>>).map((a) => ({
      id: String(a.id),
      tenantId: String(a.tenant_id),
      facilityId: String(a.facility_id),
      zoneId: String(a.zone_id),
      parentAssetId: null,
      code: String(a.code),
      name: String(a.name),
      assetType: a.asset_type as Asset['assetType'],
      manufacturer: String(a.manufacturer),
      model: String(a.model),
      status: a.status as Asset['status'],
      owner: String(a.owner),
      dataMode: a.data_mode as Asset['dataMode'],
      healthScore: Number(a.health_score),
      xPos: Number(a.x_pos),
      yPos: Number(a.y_pos),
      metadata: {},
      updatedAt: String(a.updated_at),
    }));
    const rels = db.prepare('SELECT id, tenant_id as tenantId, source_asset_id as sourceAssetId, target_asset_id as targetAssetId, relationship_type as relationshipType, criticality_weight as criticalityWeight FROM asset_relationships WHERE tenant_id = ?').all(tenantId) as unknown as AssetRelationship[];
    const tel = (db.prepare(`SELECT id, tenant_id as tenantId, facility_id as facilityId, asset_id as assetId, metric_name as metricName, value, unit, threshold_warn as thresholdWarn, threshold_crit as thresholdCrit, z_score as zScore, is_anomaly as isAnomaly, mode, timestamp FROM telemetry_points WHERE tenant_id = ? AND ${facIn.clause}`).all(tenantId, ...facIn.params) as Array<Record<string, unknown>>).map((t) => ({
      ...(t as unknown as TelemetryPoint),
      isAnomaly: Boolean(t.isAnomaly),
    }));
    const evts = db.prepare(`SELECT id, tenant_id as tenantId, facility_id as facilityId, asset_id as assetId, source_module as sourceModule, event_type as eventType, severity, title, description, mode, created_at as createdAt FROM events WHERE tenant_id = ? AND ${facIn.clause}`).all(tenantId, ...facIn.params) as unknown as InfrastructureEvent[];
    const maint = db.prepare(`SELECT id, tenant_id as tenantId, asset_id as assetId, facility_id as facilityId, maintenance_type as maintenanceType, performed_by as performedBy, summary, downtime_minutes as downtimeMinutes, parts_replaced as partsReplaced, performed_at as performedAt FROM maintenance_records WHERE tenant_id = ? AND ${facIn.clause}`).all(tenantId, ...facIn.params) as unknown as MaintenanceRecord[];

    const result = correlateRootCauseEvidence(inc, assets, rels, tel, evts, maint);
    const rcaId = uid('rca');
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO root_cause_investigations (id, tenant_id, incident_id, facility_id, detected_issue, supporting_evidence_json, related_asset_ids_json, potential_causes_json, alternative_explanations_json, confidence, uncertainty_notes, recommended_investigation, human_decision, resolution_record, outcome_verification, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 'OPEN', ?)
    `).run(
      rcaId,
      tenantId,
      inc.id,
      inc.facilityId,
      inc.title,
      JSON.stringify(result.potentialCauses.map((c, idx) => ({ sourceType: 'CORRELATION', recordId: `edge-${idx + 1}`, summary: c.mechanism }))),
      JSON.stringify(result.relatedAssetIds),
      JSON.stringify(result.potentialCauses),
      JSON.stringify(result.alternativeExplanations),
      result.confidence,
      result.uncertaintyNotes,
      'Verify top-ranked upstream dependency asset on site and inspect physical interlock logs.',
      now
    );

    recordProvenance({
      tenantId,
      facilityId: inc.facilityId,
      assetId: inc.assetId,
      sourceModule: 'RCA',
      sourceRecordId: rcaId,
      dataMode: 'INFERRED',
      evidenceClass: 'INFERRED',
      dataQualityStatus: 'PENDING_VERIFICATION',
      isIndependentlyVerified: false,
      relationshipType: 'CORRELATES_WITH',
      parentEvidenceId: inc.id,
      processingMethod: 'Temporal Precedence & Asset Dependency Graph Correlation (Not Proof of Physical Causation)',
      summary: `${inc.title}: ${result.potentialCauses[0]?.cause || 'Root-cause correlation generated'} (confidence ${Math.round(result.confidence * 100)}%)`,
    });

    logAudit(tenantId, req.auth!.email, req.auth!.role, 'RCA_GENERATED', 'ROOT_CAUSE', rcaId, 'SUCCESS', `Correlated incident ${inc.id}`);
    return res.status(201).json({ id: rcaId, ...result });
  });

  router.patch('/rca/:id/resolve', requirePermission('APPROVE_CONSEQUENTIAL_ACTION'), mutationLimiter, (req: AuthenticatedRequest, res) => {
    const { humanDecision, resolutionRecord, outcomeVerification } = (req.body || {}) as {
      humanDecision?: string;
      resolutionRecord?: string;
      outcomeVerification?: string;
    };
    const dec = cleanString(humanDecision, 3, 500);
    const rec = cleanString(resolutionRecord, 3, 500);
    if (!dec || !rec) {
      return res.status(400).json({ error: 'Human decision and resolution record (min 3 chars) are required.' });
    }
    const existing = db
      .prepare('SELECT id, facility_id FROM root_cause_investigations WHERE id = ? AND tenant_id = ?')
      .get(req.params.id, req.auth!.tenantId) as { id: string; facility_id: string } | undefined;
    if (!existing) return res.status(404).json({ error: 'Investigation not found.' });
    if (!isFacilityAuthorized(req.auth!, existing.facility_id)) {
      return res.status(403).json({ error: 'Facility access denied for this RCA investigation.' });
    }

    const rcaStatus = outcomeVerification?.trim() ? 'VERIFIED' : 'REVIEWED';
    db.prepare(`
      UPDATE root_cause_investigations
      SET human_decision = ?, resolution_record = ?, outcome_verification = ?, status = ?
      WHERE id = ? AND tenant_id = ?
    `).run(
      dec,
      rec,
      cleanString(outcomeVerification, 3, 400) || 'Verified operational stability post-mitigation.',
      rcaStatus,
      req.params.id,
      req.auth!.tenantId
    );

    if (rcaStatus === 'VERIFIED') {
      db.prepare(`
        UPDATE evidence_provenance
        SET data_quality_status = 'VERIFIED'
        WHERE tenant_id = ? AND source_module IN ('RCA', 'ROOT_CAUSE') AND source_record_id = ?
      `).run(req.auth!.tenantId, req.params.id);
    }

    logAudit(req.auth!.tenantId, req.auth!.email, req.auth!.role, 'RCA_RESOLVED', 'ROOT_CAUSE', String(req.params.id), 'SUCCESS', dec);
    return res.json({ ok: true, status: rcaStatus });
  });

  // --- Human-in-the-Loop Approvals & Work Orders ---
  router.post('/work-orders', requirePermission('CREATE_WORK_ORDER'), mutationLimiter, (req: AuthenticatedRequest, res) => {
    const validated = validateWorkOrderBody(req.body);
    if (!validated.ok) {
      return res.status(400).json({ error: validated.error, fields: validated.fields });
    }
    const { facilityId, assetId, title, description, priority } = validated.data;

    if (!isFacilityAuthorized(req.auth!, facilityId)) {
      return res.status(403).json({ error: `Facility access denied for facility '${facilityId}'.` });
    }

    const asset = db
      .prepare('SELECT id, facility_id FROM assets WHERE id = ? AND tenant_id = ?')
      .get(assetId, req.auth!.tenantId) as { id: string; facility_id: string } | undefined;
    if (!asset) return res.status(404).json({ error: 'Asset not found in tenant scope.' });
    if (asset.facility_id !== facilityId) {
      return res.status(400).json({ error: 'Asset does not belong to the specified facility.' });
    }

    const woId = uid('wo');
    const aprId = uid('apr');
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO work_orders (id, tenant_id, facility_id, asset_id, incident_id, title, description, priority, status, requested_by, approved_by, safety_interlock_checked, created_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 'PENDING_APPROVAL', ?, NULL, 1, ?, ?)
    `).run(woId, req.auth!.tenantId, facilityId, assetId, title, description, priority, req.auth!.email, now, now);

    db.prepare(`
      INSERT INTO approvals (id, tenant_id, facility_id, target_type, target_id, title, justification, requested_by, risk_level, safety_boundary_check, status, decided_by, decision_notes, created_at, decided_at)
      VALUES (?, ?, ?, 'WORK_ORDER', ?, ?, ?, ?, ?, 'PASSED — Requires certified human approval prior to physical lockout.', 'PENDING', NULL, NULL, ?, NULL)
    `).run(aprId, req.auth!.tenantId, facilityId, woId, `Authorize ${woId}: ${title}`, description, req.auth!.email, priority, now);

    logAudit(req.auth!.tenantId, req.auth!.email, req.auth!.role, 'WORK_ORDER_CREATED', 'WORK_ORDER', woId, 'SUCCESS', title);
    return res.status(201).json({ workOrderId: woId, approvalId: aprId });
  });

  router.post('/approvals/:id/decide', requirePermission('APPROVE_CONSEQUENTIAL_ACTION'), mutationLimiter, (req: AuthenticatedRequest, res) => {
    const { decision, notes } = (req.body || {}) as { decision?: 'APPROVED' | 'REJECTED'; notes?: string };
    if (decision !== 'APPROVED' && decision !== 'REJECTED') {
      return res.status(400).json({ error: 'Decision must be APPROVED or REJECTED.' });
    }
    const apr = db
      .prepare('SELECT * FROM approvals WHERE id = ? AND tenant_id = ?')
      .get(req.params.id, req.auth!.tenantId) as
      | { id: string; facility_id: string; target_type: string; target_id: string; status: string }
      | undefined;

    if (!apr) return res.status(404).json({ error: 'Approval item not found.' });
    if (!isFacilityAuthorized(req.auth!, apr.facility_id)) {
      return res.status(403).json({ error: `Facility access denied for approval '${apr.id}'.` });
    }
    if (apr.status !== 'PENDING') return res.status(400).json({ error: 'Approval item has already been decided.' });

    const now = new Date().toISOString();
    db.prepare('UPDATE approvals SET status = ?, decided_by = ?, decision_notes = ?, decided_at = ? WHERE id = ?').run(
      decision,
      req.auth!.email,
      cleanString(notes, 1, 500) || `${decision} by ${req.auth!.fullName}`,
      now,
      apr.id
    );

    if (apr.target_type === 'WORK_ORDER') {
      db.prepare('UPDATE work_orders SET status = ?, approved_by = ?, updated_at = ? WHERE id = ? AND tenant_id = ?').run(
        decision === 'APPROVED' ? 'APPROVED' : 'REJECTED',
        req.auth!.email,
        now,
        apr.target_id,
        req.auth!.tenantId
      );
    }

    logAudit(req.auth!.tenantId, req.auth!.email, req.auth!.role, `APPROVAL_${decision}`, apr.target_type, apr.target_id, 'SUCCESS', notes?.trim() || decision);
    return res.json({ ok: true, status: decision });
  });

  // --- Closed-Loop EXECUTE -> VERIFICATION_PENDING -> VERIFY State Machine for Work Orders ---
  router.post('/work-orders/:id/execute', requirePermission('CREATE_WORK_ORDER'), mutationLimiter, (req: AuthenticatedRequest, res) => {
    const executionNotes = cleanString((req.body as { executionNotes?: unknown })?.executionNotes, 5, 1000);
    if (!executionNotes) {
      return res.status(400).json({ error: 'Execution notes (min 5 chars) documenting field isolation & work dispatch are required.' });
    }

    const wo = db
      .prepare('SELECT id, facility_id, asset_id, title, status FROM work_orders WHERE id = ? AND tenant_id = ?')
      .get(req.params.id, req.auth!.tenantId) as
      | { id: string; facility_id: string; asset_id: string; title: string; status: string }
      | undefined;

    if (!wo) return res.status(404).json({ error: 'Work order not found.' });
    if (!isFacilityAuthorized(req.auth!, wo.facility_id)) {
      return res.status(403).json({ error: `Facility access denied for work order '${wo.id}'.` });
    }
    const transition = validateWorkOrderTransition(wo.status as WorkOrder['status'], 'IN_PROGRESS', {
      hasExecutionRecord: true,
    });
    if (!transition.allowed) {
      return res.status(409).json({
        error:
          transition.reason ||
          `Work order '${wo.id}' cannot be executed while in status '${wo.status}'. Human approval (APPROVED) is mandatory first.`,
      });
    }

    const now = new Date().toISOString();
    const updateRes = db.prepare(`
      UPDATE work_orders
      SET status = 'IN_PROGRESS',
          execution_notes = ?,
          executed_by = ?,
          executed_at = ?,
          execution_mode = 'FIELD_DISPATCH_RECORDED',
          updated_at = ?
      WHERE id = ? AND tenant_id = ? AND status = 'APPROVED'
    `).run(executionNotes, req.auth!.email, now, now, wo.id, req.auth!.tenantId);

    if (updateRes.changes === 0) {
      return res.status(409).json({ error: 'Concurrent state transition detected; work order is no longer in APPROVED status.' });
    }

    recordProvenance({
      tenantId: req.auth!.tenantId,
      facilityId: wo.facility_id,
      assetId: wo.asset_id,
      sourceModule: 'WORKFLOW',
      sourceRecordId: wo.id,
      dataMode: 'SYSTEM_RECORDED',
      evidenceClass: 'SYSTEM_RECORDED',
      dataQualityStatus: 'VALIDATED',
      isIndependentlyVerified: false,
      relationshipType: 'DERIVED_FROM',
      parentEvidenceId: wo.id,
      processingMethod: 'Field Execution Dispatch Recorded (Workflow Record Only — Not Direct Equipment Control)',
      summary: `${wo.title} — Field execution started by ${req.auth!.email}: ${executionNotes}`,
    });
    logAudit(req.auth!.tenantId, req.auth!.email, req.auth!.role, 'WORK_ORDER_EXECUTED', 'WORK_ORDER', wo.id, 'SUCCESS', executionNotes);
    return res.json({
      ok: true,
      status: 'IN_PROGRESS',
      executionMode: 'FIELD_DISPATCH_RECORDED',
      executedAt: now,
    });
  });

  router.post('/work-orders/:id/request-verification', requirePermission('CREATE_WORK_ORDER'), mutationLimiter, (req: AuthenticatedRequest, res) => {
    const notes = cleanString((req.body as { notes?: unknown })?.notes, 3, 1000);
    const wo = db
      .prepare('SELECT id, facility_id, asset_id, title, status, executed_at, execution_notes FROM work_orders WHERE id = ? AND tenant_id = ?')
      .get(req.params.id, req.auth!.tenantId) as
      | { id: string; facility_id: string; asset_id: string; title: string; status: string; executed_at: string | null; execution_notes: string | null }
      | undefined;

    if (!wo) return res.status(404).json({ error: 'Work order not found.' });
    if (!isFacilityAuthorized(req.auth!, wo.facility_id)) {
      return res.status(403).json({ error: `Facility access denied for work order '${wo.id}'.` });
    }
    const transition = validateWorkOrderTransition(
      wo.status as WorkOrder['status'],
      'VERIFICATION_PENDING',
      { hasExecutionRecord: Boolean(wo.executed_at) }
    );
    if (!transition.allowed) {
      return res.status(409).json({
        error:
          transition.reason ||
          `Work order '${wo.id}' must be IN_PROGRESS with recorded field execution before entering VERIFICATION_PENDING (current: ${wo.status}).`,
      });
    }

    const now = new Date().toISOString();
    const updatedNotes = notes ? `${wo.execution_notes || ''} | Field work completed: ${notes}`.trim() : wo.execution_notes;
    const upd = db.prepare(`
      UPDATE work_orders
      SET status = 'VERIFICATION_PENDING',
          verification_status = 'PENDING',
          execution_notes = ?,
          updated_at = ?
      WHERE id = ? AND tenant_id = ? AND status = 'IN_PROGRESS'
    `).run(updatedNotes, now, wo.id, req.auth!.tenantId);

    if (upd.changes === 0) {
      return res.status(409).json({ error: 'Work order state changed concurrently.' });
    }

    logAudit(req.auth!.tenantId, req.auth!.email, req.auth!.role, 'WORK_ORDER_VERIFICATION_REQUESTED', 'WORK_ORDER', wo.id, 'SUCCESS', notes || 'Submitted for post-action verification');
    return res.json({ ok: true, status: 'VERIFICATION_PENDING' });
  });

  router.post('/work-orders/:id/verify', requirePermission('CREATE_WORK_ORDER'), mutationLimiter, (req: AuthenticatedRequest, res) => {
    const body = (req.body || {}) as {
      verificationStatus?: unknown;
      verificationNotes?: unknown;
      downtimeMinutes?: unknown;
      partsReplaced?: unknown;
    };
    const verificationStatus =
      body.verificationStatus === 'VERIFIED' || body.verificationStatus === 'PARTIAL' || body.verificationStatus === 'UNRESOLVED'
        ? body.verificationStatus
        : null;
    const verificationNotes = cleanString(body.verificationNotes, 5, 1000);
    if (!verificationStatus || !verificationNotes) {
      return res.status(400).json({
        error: 'verificationStatus (VERIFIED | PARTIAL | UNRESOLVED) and verificationNotes (min 5 chars) are required.',
      });
    }
    const rawDowntime = Number(body.downtimeMinutes);
    const downtimeMinutes = Number.isFinite(rawDowntime) && rawDowntime >= 0 ? Math.min(10080, Math.round(rawDowntime)) : 30;
    const partsReplaced = cleanString(body.partsReplaced, 1, 200) || 'None';

    const wo = db
      .prepare('SELECT id, facility_id, asset_id, title, status, executed_by, executed_at FROM work_orders WHERE id = ? AND tenant_id = ?')
      .get(req.params.id, req.auth!.tenantId) as
      | {
          id: string;
          facility_id: string;
          asset_id: string;
          title: string;
          status: string;
          executed_by: string | null;
          executed_at: string | null;
        }
      | undefined;

    if (!wo) return res.status(404).json({ error: 'Work order not found.' });
    if (!isFacilityAuthorized(req.auth!, wo.facility_id)) {
      return res.status(403).json({ error: `Facility access denied for work order '${wo.id}'.` });
    }

    // Priority Zero 4.1 & Part 14: PARTIAL and UNRESOLVED outcomes must NOT silently become COMPLETED
    const nextStatus: WorkOrder['status'] =
      verificationStatus === 'VERIFIED'
        ? 'COMPLETED'
        : verificationStatus === 'PARTIAL'
        ? 'NEEDS_FOLLOW_UP'
        : 'UNRESOLVED';

    const transition = validateWorkOrderTransition(wo.status as WorkOrder['status'], nextStatus, {
      hasExecutionRecord: Boolean(wo.executed_at),
      verificationStatus,
    });
    if (!transition.allowed) {
      return res.status(409).json({
        error:
          transition.reason ||
          `Work order '${wo.id}' must complete field execution before outcome verification (current: ${wo.status}).`,
      });
    }

    const now = new Date().toISOString();
    const maintId = uid('mnt');
    db.exec('BEGIN');
    try {
      const upd = db.prepare(`
        UPDATE work_orders
        SET status = ?,
            verification_status = ?,
            verification_notes = ?,
            verified_by = ?,
            verified_at = ?,
            updated_at = ?
        WHERE id = ? AND tenant_id = ?
          AND status IN ('IN_PROGRESS', 'VERIFICATION_PENDING')
          AND executed_at IS NOT NULL
      `).run(nextStatus, verificationStatus, verificationNotes, req.auth!.email, now, now, wo.id, req.auth!.tenantId);

      if (upd.changes === 0) {
        db.exec('ROLLBACK');
        return res.status(409).json({
          error: `Work order '${wo.id}' was already verified or modified concurrently.`,
        });
      }

      db.prepare(`
        INSERT INTO maintenance_records (id, tenant_id, asset_id, facility_id, work_order_id, maintenance_type, performed_by, summary, downtime_minutes, parts_replaced, performed_at)
        VALUES (?, ?, ?, ?, ?, 'CORRECTIVE', ?, ?, ?, ?, ?)
      `).run(
        maintId,
        req.auth!.tenantId,
        wo.asset_id,
        wo.facility_id,
        wo.id,
        wo.executed_by || req.auth!.email,
        `${wo.title} — Outcome [${verificationStatus} -> ${nextStatus}]: ${verificationNotes}`,
        downtimeMinutes,
        partsReplaced,
        now
      );

      // Priority Zero 4.3: Do NOT arbitrarily increment asset health_score by a constant (+12).
      // Asset health must remain derived from actual telemetry, sensor readings, and validated assessments.
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE') || msg.includes('idx_maint_work_order_unique')) {
        return res.status(409).json({ error: 'Duplicate maintenance verification record prevented by idempotency constraint.' });
      }
      throw err;
    }

    recordProvenance({
      tenantId: req.auth!.tenantId,
      facilityId: wo.facility_id,
      assetId: wo.asset_id,
      sourceModule: 'WORKFLOW',
      sourceRecordId: wo.id,
      dataMode: 'HUMAN_REPORTED',
      evidenceClass: 'HUMAN_REPORTED',
      dataQualityStatus: verificationStatus === 'VERIFIED' ? 'VERIFIED' : 'PENDING_VERIFICATION',
      isIndependentlyVerified: verificationStatus === 'VERIFIED',
      relationshipType: verificationStatus === 'VERIFIED' ? 'VERIFIES' : 'REQUIRES_REVIEW',
      parentEvidenceId: wo.id,
      processingMethod: `Human Post-Action Verification (${verificationStatus} -> ${nextStatus})`,
      summary: `${wo.title}: ${verificationNotes}`,
    });
    logAudit(
      req.auth!.tenantId,
      req.auth!.email,
      req.auth!.role,
      'WORK_ORDER_VERIFIED',
      'WORK_ORDER',
      wo.id,
      'SUCCESS',
      `Outcome=${verificationStatus}, Status=${nextStatus}`
    );
    return res.json({
      ok: true,
      status: nextStatus,
      verificationStatus,
      maintenanceRecordId: maintId,
    });
  });

  router.post('/work-orders/:id/cancel', requirePermission('CREATE_WORK_ORDER'), mutationLimiter, (req: AuthenticatedRequest, res) => {
    const reason = cleanString((req.body as { reason?: unknown })?.reason, 3, 500) || 'Cancelled by authorized operator.';
    const wo = db
      .prepare('SELECT id, facility_id, status FROM work_orders WHERE id = ? AND tenant_id = ?')
      .get(req.params.id, req.auth!.tenantId) as { id: string; facility_id: string; status: string } | undefined;

    if (!wo) return res.status(404).json({ error: 'Work order not found.' });
    if (!isFacilityAuthorized(req.auth!, wo.facility_id)) {
      return res.status(403).json({ error: `Facility access denied for work order '${wo.id}'.` });
    }
    const cancelTransition = validateWorkOrderTransition(wo.status as WorkOrder['status'], 'CANCELLED');
    if (!cancelTransition.allowed) {
      return res.status(409).json({
        error:
          cancelTransition.reason ||
          `Work order '${wo.id}' in status '${wo.status}' cannot be cancelled after execution has started.`,
      });
    }

    const now = new Date().toISOString();
    db.exec('BEGIN');
    try {
      db.prepare(`
        UPDATE work_orders
        SET status = 'CANCELLED', updated_at = ?
        WHERE id = ? AND tenant_id = ?
      `).run(now, wo.id, req.auth!.tenantId);

      db.prepare(`
        UPDATE approvals
        SET status = 'REJECTED', decided_by = ?, decision_notes = ?, decided_at = ?
        WHERE target_type = 'WORK_ORDER' AND target_id = ? AND tenant_id = ? AND status = 'PENDING'
      `).run(req.auth!.email, `Work order cancelled: ${reason}`, now, wo.id, req.auth!.tenantId);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    logAudit(req.auth!.tenantId, req.auth!.email, req.auth!.role, 'WORK_ORDER_CANCELLED', 'WORK_ORDER', wo.id, 'SUCCESS', reason);
    return res.json({ ok: true, status: 'CANCELLED' });
  });

  // --- Incident Logging & Lifecycle Progression ---
  router.post('/incidents', requirePermission('CREATE_INCIDENT'), mutationLimiter, (req: AuthenticatedRequest, res) => {
    const body = (req.body || {}) as {
      facilityId?: unknown;
      assetId?: unknown;
      title?: unknown;
      description?: unknown;
      severity?: unknown;
    };
    const facilityId = isValidId(body.facilityId) ? String(body.facilityId).trim() : '';
    const assetId = body.assetId && isValidId(body.assetId) ? String(body.assetId).trim() : null;
    const title = cleanString(body.title, 3, 180);
    const description = cleanString(body.description, 5, 1500);
    const rawSeverity = typeof body.severity === 'string' ? body.severity.toUpperCase() : 'MEDIUM';
    const severity = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].includes(rawSeverity) ? rawSeverity : 'MEDIUM';

    if (!facilityId || !title || !description) {
      return res.status(400).json({ error: 'Valid facilityId, title (min 3 chars), and description (min 5 chars) are required.' });
    }
    if (!isFacilityAuthorized(req.auth!, facilityId)) {
      return res.status(403).json({ error: `Facility access denied for facility '${facilityId}'.` });
    }
    if (assetId) {
      const asset = db.prepare('SELECT id, facility_id FROM assets WHERE id = ? AND tenant_id = ?').get(assetId, req.auth!.tenantId) as { id: string; facility_id: string } | undefined;
      if (!asset || asset.facility_id !== facilityId) {
        return res.status(400).json({ error: 'Specified asset not found in target facility.' });
      }
    }

    const id = uid('inc');
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO incidents (id, tenant_id, facility_id, asset_id, title, description, severity, status, assigned_to, opened_at, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, NULL)
    `).run(id, req.auth!.tenantId, facilityId, assetId, title, description, severity, req.auth!.email, now);

    recordProvenance({
      tenantId: req.auth!.tenantId,
      facilityId,
      assetId,
      sourceModule: 'INCIDENTS',
      sourceRecordId: id,
      dataMode: 'HUMAN_REPORTED',
      evidenceClass: 'HUMAN_REPORTED',
      dataQualityStatus: 'PENDING_VERIFICATION',
      isIndependentlyVerified: false,
      relationshipType: 'REQUIRES_REVIEW',
      parentEvidenceId: assetId,
      processingMethod: 'Operator Incident Escalation (Human-Reported Operational Observation)',
      summary: `[${severity}] ${title}`,
    });
    logAudit(req.auth!.tenantId, req.auth!.email, req.auth!.role, 'INCIDENT_CREATED', 'INCIDENT', id, 'SUCCESS', title);
    return res.status(201).json({ id });
  });

  router.patch('/incidents/:id', requirePermission('CREATE_INCIDENT'), mutationLimiter, (req: AuthenticatedRequest, res) => {
    const rawStatus = typeof (req.body as { status?: unknown })?.status === 'string'
      ? (req.body as { status: string }).status.toUpperCase()
      : '';
    if (!['OPEN', 'INVESTIGATING', 'MITIGATED', 'RESOLVED'].includes(rawStatus)) {
      return res.status(400).json({ error: 'Status must be OPEN, INVESTIGATING, MITIGATED, or RESOLVED.' });
    }
    const inc = db
      .prepare('SELECT id, facility_id, title FROM incidents WHERE id = ? AND tenant_id = ?')
      .get(req.params.id, req.auth!.tenantId) as { id: string; facility_id: string; title: string } | undefined;
    if (!inc) return res.status(404).json({ error: 'Incident not found.' });
    if (!isFacilityAuthorized(req.auth!, inc.facility_id)) {
      return res.status(403).json({ error: `Facility access denied for incident '${inc.id}'.` });
    }
    const now = new Date().toISOString();
    db.prepare('UPDATE incidents SET status = ?, resolved_at = ? WHERE id = ? AND tenant_id = ?').run(
      rawStatus,
      rawStatus === 'RESOLVED' ? now : null,
      inc.id,
      req.auth!.tenantId
    );
    db.prepare(`
      UPDATE evidence_provenance
      SET data_quality_status = ?
      WHERE tenant_id = ? AND source_module = 'INCIDENTS' AND source_record_id = ?
    `).run(rawStatus === 'RESOLVED' ? 'VERIFIED' : 'PENDING_VERIFICATION', req.auth!.tenantId, inc.id);
    logAudit(req.auth!.tenantId, req.auth!.email, req.auth!.role, 'INCIDENT_STATUS_UPDATED', 'INCIDENT', inc.id, 'SUCCESS', `Status -> ${rawStatus}`);
    return res.json({ ok: true, status: rawStatus });
  });

  // --- Multi-Agent Orchestrator Execution (Idempotent, Traced, Conflict-Checked) ---
  router.post('/agents/execute', requirePermission('QUERY_BRAIN'), aiLimiter, async (req: AuthenticatedRequest, res) => {
    const body = (req.body || {}) as {
      agentId?: unknown;
      prompt?: unknown;
      idempotencyKey?: unknown;
      requestedTools?: unknown;
    };
    const agentId = cleanString(body.agentId, 2, 80);
    const prompt = cleanString(body.prompt, 3, 1200);
    if (!agentId || !prompt) {
      return res.status(400).json({ error: 'agentId and prompt (3-1200 chars) are required.' });
    }

    const idempotencyKey =
      typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
        ? body.idempotencyKey.trim().slice(0, 80)
        : undefined;
    const requestedTools = Array.isArray(body.requestedTools)
      ? body.requestedTools.filter((t): t is string => typeof t === 'string')
      : undefined;

    const execResult = await runBoundedAgentExecution(db, req.auth!, agentId, prompt, {
      idempotencyKey,
      requestedTools,
    });

    if (execResult.deduplicated && execResult.existingExecutionId) {
      return res.json({
        id: execResult.existingExecutionId,
        agentId,
        ...execResult,
        createdAt: new Date().toISOString(),
      });
    }

    const id = uid('agx');
    const now = new Date().toISOString();
    const effectiveKey =
      idempotencyKey ||
      `auto-${crypto.createHash('sha256').update(`${req.auth!.tenantId}:${req.auth!.id}:${agentId}:${prompt.toLowerCase()}`).digest('hex').slice(0, 16)}`;

    try {
      db.prepare(`
        INSERT INTO agent_executions (id, tenant_id, agent_id, requested_by, prompt, status, steps_taken, tools_invoked_json, evidence_refs_json, output_summary, requires_approval, idempotency_key, trace_json, conflicts_json, duration_ms, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        req.auth!.tenantId,
        agentId,
        req.auth!.email,
        prompt,
        execResult.status,
        execResult.stepsTaken,
        JSON.stringify(execResult.toolsInvoked),
        JSON.stringify(execResult.evidenceRefs),
        execResult.outputSummary,
        execResult.requiresApproval ? 1 : 0,
        effectiveKey,
        JSON.stringify(execResult.trace),
        JSON.stringify(execResult.conflictsDetected),
        execResult.durationMs,
        now
      );
    } catch {
      // Handle race condition on unique idempotency index gracefully
    }

    if (execResult.requiresApproval && req.auth!.facilityIds.length > 0) {
      const targetFac = req.auth!.facilityIds[0];
      db.prepare(`
        INSERT INTO approvals (id, tenant_id, facility_id, target_type, target_id, title, justification, requested_by, risk_level, safety_boundary_check, status, decided_by, decision_notes, created_at, decided_at)
        VALUES (?, ?, ?, 'AGENT_RECOMMENDATION', ?, ?, ?, ?, 'MEDIUM', 'PASSED — Bounded agent output queued for human review.', 'PENDING', NULL, NULL, ?, NULL)
      `).run(uid('apr'), req.auth!.tenantId, targetFac, id, `Review Agent Output (${agentId})`, execResult.outputSummary, req.auth!.email, now);
    }

    logAudit(
      req.auth!.tenantId,
      req.auth!.email,
      req.auth!.role,
      'AGENT_EXECUTION',
      'AGENT',
      agentId,
      execResult.status === 'BLOCKED_SAFETY' || execResult.status === 'FAILED' ? 'DENIED' : 'SUCCESS',
      execResult.outputSummary.slice(0, 140)
    );

    return res.json({ id, agentId, ...execResult, idempotencyKey: effectiveKey, createdAt: now });
  });

  // --- Asset Registration ---
  router.post('/assets', requirePermission('MANAGE_ASSETS_IOT'), mutationLimiter, (req: AuthenticatedRequest, res) => {
    const validated = validateAssetCreateBody(req.body);
    if (!validated.ok) {
      return res.status(400).json({ error: validated.error, fields: validated.fields });
    }
    const { facilityId, zoneId, code, name, assetType, manufacturer, model, owner } = validated.data;

    if (!isFacilityAuthorized(req.auth!, facilityId)) {
      return res.status(403).json({ error: `Facility access denied for facility '${facilityId}'.` });
    }

    const fac = db
      .prepare('SELECT id FROM facilities WHERE id = ? AND tenant_id = ?')
      .get(facilityId, req.auth!.tenantId);
    if (!fac) return res.status(404).json({ error: 'Facility not found in tenant scope.' });

    const id = uid('ast');
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO assets (id, tenant_id, facility_id, zone_id, parent_asset_id, code, name, asset_type, manufacturer, model, status, owner, data_mode, health_score, x_pos, y_pos, metadata_json, updated_at)
      VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'NOMINAL', ?, 'SIMULATED', 95, 50, 50, '{}', ?)
    `).run(
      id,
      req.auth!.tenantId,
      facilityId,
      zoneId,
      code,
      name,
      assetType,
      manufacturer,
      model,
      owner || req.auth!.fullName,
      now
    );
    logAudit(req.auth!.tenantId, req.auth!.email, req.auth!.role, 'ASSET_CREATED', 'ASSET', id, 'SUCCESS', `${code} — ${name}`);
    return res.status(201).json({ id });
  });

  // --- Knowledge Document Ingestion ---
  router.post('/knowledge', requirePermission('MANAGE_ASSETS_IOT'), mutationLimiter, (req: AuthenticatedRequest, res) => {
    const validated = validateKnowledgeBody(req.body);
    if (!validated.ok) {
      return res.status(400).json({ error: validated.error, fields: validated.fields });
    }
    const { facilityId, title, category, minRole, sourceRef, content } = validated.data;

    if (facilityId && !isFacilityAuthorized(req.auth!, facilityId)) {
      return res.status(403).json({ error: `Facility access denied for facility '${facilityId}'.` });
    }

    const id = uid('doc');
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO knowledge_documents (id, tenant_id, facility_id, title, category, min_role, source_ref, version, content, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'v1.0', ?, ?)
    `).run(
      id,
      req.auth!.tenantId,
      facilityId,
      title,
      category,
      minRole,
      sourceRef,
      content,
      now
    );
    logAudit(req.auth!.tenantId, req.auth!.email, req.auth!.role, 'KNOWLEDGE_CREATED', 'DOCUMENT', id, 'SUCCESS', title);
    return res.status(201).json({ id });
  });

  // --- Admin Database Backup & Integrity Endpoints ---
  router.get('/admin/backups', requirePermission('MANAGE_BACKUPS'), (_req, res) => {
    return res.json({ backups: listDatabaseBackups() });
  });

  router.post('/admin/backups', requirePermission('MANAGE_BACKUPS'), (req: AuthenticatedRequest, res) => {
    const rawLabel = typeof (req.body as { label?: unknown })?.label === 'string'
      ? (req.body as { label: string }).label
      : 'manual';
    const backup = createDatabaseBackup(db, undefined, rawLabel);
    logAudit(req.auth!.tenantId, req.auth!.email, req.auth!.role, 'DB_BACKUP_CREATED', 'BACKUP', backup.filename, 'SUCCESS', `SHA256=${backup.sha256.slice(0, 16)}... (${backup.sizeBytes} bytes)`);
    return res.status(201).json(backup);
  });

  router.post('/admin/backups/verify', requirePermission('MANAGE_BACKUPS'), (req: AuthenticatedRequest, res) => {
    const filename = typeof (req.body as { filename?: unknown })?.filename === 'string'
      ? path.basename((req.body as { filename: string }).filename.trim())
      : '';
    if (!filename || !filename.endsWith('.db')) {
      return res.status(400).json({ error: 'Valid backup .db filename is required.' });
    }
    const targetPath = path.resolve(process.cwd(), '.vanta-data', 'backups', filename);
    try {
      const result = verifyBackupFile(targetPath);
      return res.json({ filename, ...result });
    } catch (err) {
      return res.status(404).json({ error: err instanceof Error ? err.message : 'Backup verification failed.' });
    }
  });

  // --- Router-Level Error Boundary (Prevents Stack Trace / Secret Leakage) ---
  router.use(
    (
      _err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const correlationId = (_req as CorrelatedRequest).correlationId || 'unknown';
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Internal server error encountered while processing request.',
          correlationId,
        });
      }
    }
  );

  return router;
}
