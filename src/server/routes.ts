/**
 * VANTA AI — Express API Routes
 * Strictly enforces authentication, tenant isolation, RBAC, audit logging, and truthfulness states.
 */

import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import express, { type Response } from 'express';
import {
  canPerformAction,
  computeEnergySummary,
  computeZScoreAnomaly,
  correlateRootCauseEvidence,
  estimateRemainingUsefulLife,
} from '../core/intelligence';
import type {
  Asset,
  AssetRelationship,
  EnergyRecord,
  Incident,
  InfrastructureEvent,
  MaintenanceRecord,
  TelemetryPoint,
  UserSession,
  VantaRole,
} from '../core/types';
import { runBoundedAgentExecution, runVantaBrainQuery, runVisionFrameInspection } from './ai';
import { VANTA_AGENTS } from './db';
import {
  type AuthenticatedRequest,
  hashPassword,
  parseCookieHeader,
  requirePermission,
  SESSION_COOKIE_NAME,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from './security';

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

export function createApiRouter(db: DatabaseSync) {
  const router = express.Router();
  const sseClients = new Set<{ tenantId: string; res: Response }>();

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

  const broadcastTelemetry = (tenantId: string, payload: unknown) => {
    const line = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of sseClients) {
      if (client.tenantId === tenantId) {
        client.res.write(line);
      }
    }
  };

  // --- Session Hydration Middleware ---
  router.use((req: AuthenticatedRequest, _res, next) => {
    const cookies = parseCookieHeader(req.headers.cookie);
    const authHeader = req.headers.authorization;
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const token = bearer || cookies[SESSION_COOKIE_NAME];

    if (token) {
      const payload = verifySessionToken(token);
      if (payload) {
        const userRow = db
          .prepare(
            `SELECT u.id, u.tenant_id, u.email, u.full_name, u.role, u.facility_ids_json, o.name as org_name
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
              org_name: string;
            }
          | undefined;

        if (userRow) {
          req.auth = {
            id: userRow.id,
            tenantId: userRow.tenant_id,
            organizationName: userRow.org_name,
            email: userRow.email,
            fullName: userRow.full_name,
            role: userRow.role,
            facilityIds: JSON.parse(userRow.facility_ids_json) as string[],
          };
        }
      }
    }
    next();
  });

  // --- Health (Public) ---
  router.get('/health', (_req, res) => {
    const dbCheck = db.prepare('SELECT COUNT(*) as cnt FROM organizations').get() as { cnt: number };
    const geminiConfigured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
    res.json({
      status: 'OPERATIONAL',
      database: dbCheck.cnt > 0 ? 'CONNECTED_SQLITE_WAL' : 'EMPTY',
      geminiConfigured,
      simulationEngine: 'READY',
      timestamp: new Date().toISOString(),
    });
  });

  // --- Auth Routes ---
  router.get('/auth/session', (req: AuthenticatedRequest, res) => {
    if (!req.auth) {
      return res.json({ authenticated: false, user: null });
    }
    return res.json({ authenticated: true, user: req.auth });
  });

  router.post('/auth/login', (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const row = db
      .prepare(
        `SELECT u.id, u.tenant_id, u.email, u.full_name, u.password_hash, u.role, u.facility_ids_json, o.name as org_name
         FROM users u JOIN organizations o ON u.tenant_id = o.tenant_id WHERE LOWER(u.email) = LOWER(?)`
      )
      .get(email.trim()) as
      | {
          id: string;
          tenant_id: string;
          email: string;
          full_name: string;
          password_hash: string;
          role: VantaRole;
          facility_ids_json: string;
          org_name: string;
        }
      | undefined;

    if (!row || !verifyPassword(password, row.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const token = signSessionToken({
      userId: row.id,
      tenantId: row.tenant_id,
      role: row.role,
    });

    res.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 12 * 60 * 60 * 1000,
      path: '/',
    });

    logAudit(row.tenant_id, row.email, row.role, 'USER_LOGIN', 'SESSION', row.id, 'SUCCESS', 'Authenticated via scrypt credentials.');

    const user: UserSession = {
      id: row.id,
      tenantId: row.tenant_id,
      organizationName: row.org_name,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
      facilityIds: JSON.parse(row.facility_ids_json) as string[],
    };

    return res.json({ authenticated: true, user, token });
  });

  router.post('/auth/register-organization', (req, res) => {
    const { organizationName, industry, region, fullName, email, password } = req.body as {
      organizationName?: string;
      industry?: string;
      region?: string;
      fullName?: string;
      email?: string;
      password?: string;
    };

    if (!organizationName?.trim() || !fullName?.trim() || !email?.trim() || !password || password.length < 8) {
      return res.status(400).json({
        error: 'Organization name, full name, valid email, and password (min 8 chars) are required.',
      });
    }

    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email.trim());
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
    const sector = industry?.trim() || 'Smart Infrastructure';

    db.exec('BEGIN');
    try {
      db.prepare('INSERT INTO organizations (id, tenant_id, name, industry, region, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        orgId,
        tenantId,
        organizationName.trim(),
        sector,
        region?.trim() || 'US-West',
        now
      );
      db.prepare('INSERT INTO sites (id, tenant_id, name, country, timezone) VALUES (?, ?, ?, ?, ?)').run(
        siteId,
        tenantId,
        `${organizationName.trim()} Primary Site`,
        'USA',
        'America/Los_Angeles'
      );
      db.prepare(
        'INSERT INTO facilities (id, tenant_id, site_id, name, sector, code, status, coordinates, area_sqm, criticality) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(facId, tenantId, siteId, `${organizationName.trim()} Facility 01`, sector, 'FAC-01', 'NOMINAL', '37.7749° N, 122.4194° W', 10000, 'TIER_1');
      db.prepare(
        'INSERT INTO building_zones (id, tenant_id, facility_id, building_name, floor, zone_name, zone_type, restricted) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(zoneId, tenantId, facId, 'Main Building', 'Level 1', 'Primary Operations Zone', 'PRODUCTION', 0);

      db.prepare(
        'INSERT INTO users (id, tenant_id, email, full_name, password_hash, role, facility_ids_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        userId,
        tenantId,
        email.trim(),
        fullName.trim(),
        hashPassword(password),
        'Organization Administrator',
        JSON.stringify([facId]),
        now
      );
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      return res.status(500).json({ error: 'Failed to provision organization tenant.' });
    }

    const token = signSessionToken({
      userId,
      tenantId,
      role: 'Organization Administrator',
    });

    res.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 12 * 60 * 60 * 1000,
      path: '/',
    });

    logAudit(tenantId, email.trim(), 'Organization Administrator', 'ORG_PROVISIONED', 'ORGANIZATION', orgId, 'SUCCESS', `Created isolated tenant ${tenantId}`);

    return res.status(201).json({
      authenticated: true,
      user: {
        id: userId,
        tenantId,
        organizationName: organizationName.trim(),
        email: email.trim(),
        fullName: fullName.trim(),
        role: 'Organization Administrator',
        facilityIds: [facId],
      },
      token,
    });
  });

  router.post('/auth/logout', (req: AuthenticatedRequest, res) => {
    if (req.auth) {
      logAudit(req.auth.tenantId, req.auth.email, req.auth.role, 'USER_LOGOUT', 'SESSION', req.auth.id, 'SUCCESS', 'Operator signed out.');
    }
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
  });

  // --- All routes below require authenticated session ---
  const guard = requirePermission('VIEW_PLATFORM', (req) => {
    if (req.auth) {
      logAudit(req.auth.tenantId, req.auth.email, req.auth.role, 'UNAUTHORIZED_ACCESS', 'API', req.path, 'DENIED', 'Permission rejected.');
    }
  });

  // --- SSE Telemetry Stream ---
  router.get('/stream/telemetry', guard, (req: AuthenticatedRequest, res) => {
    const tenantId = req.auth!.tenantId;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const client = { tenantId, res };
    sseClients.add(client);
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', tenantId, timestamp: new Date().toISOString() })}\n\n`);

    req.on('close', () => {
      sseClients.delete(client);
    });
  });

  // --- Unified Workspace Bootstrap (All Tenant-Isolated Operational State) ---
  router.get('/workspace', guard, (req: AuthenticatedRequest, res) => {
    const tenantId = req.auth!.tenantId;
    const facilityId = typeof req.query.facilityId === 'string' && req.query.facilityId !== 'ALL' ? req.query.facilityId : null;
    const userRank = ROLE_RANK[req.auth!.role] ?? 1;

    const org = db.prepare('SELECT id, tenant_id as tenantId, name, industry, region, created_at as createdAt FROM organizations WHERE tenant_id = ?').get(tenantId);
    const sites = db.prepare('SELECT id, tenant_id as tenantId, name, country, timezone FROM sites WHERE tenant_id = ?').all(tenantId);
    const facilities = db.prepare('SELECT id, tenant_id as tenantId, site_id as siteId, name, sector, code, status, coordinates, area_sqm as areaSqm, criticality FROM facilities WHERE tenant_id = ?').all(tenantId);
    const zones = db.prepare('SELECT id, tenant_id as tenantId, facility_id as facilityId, building_name as buildingName, floor, zone_name as zoneName, zone_type as zoneType, restricted FROM building_zones WHERE tenant_id = ?').all(tenantId);

    const assetsRaw = (facilityId
      ? db.prepare('SELECT * FROM assets WHERE tenant_id = ? AND facility_id = ?').all(tenantId, facilityId)
      : db.prepare('SELECT * FROM assets WHERE tenant_id = ?').all(tenantId)) as Array<Record<string, unknown>>;

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

    const relationships = db.prepare('SELECT id, tenant_id as tenantId, source_asset_id as sourceAssetId, target_asset_id as targetAssetId, relationship_type as relationshipType, criticality_weight as criticalityWeight FROM asset_relationships WHERE tenant_id = ?').all(tenantId) as unknown as AssetRelationship[];

    const cameras = (facilityId
      ? db.prepare('SELECT id, tenant_id as tenantId, facility_id as facilityId, zone_id as zoneId, asset_id as assetId, name, stream_protocol as streamProtocol, resolution, fps, status, mode, model_version as modelVersion, confidence_threshold as confidenceThreshold, sample_image_url as sampleImageUrl, privacy_policy as privacyPolicy, last_frame_at as lastFrameAt FROM cameras WHERE tenant_id = ? AND facility_id = ?').all(tenantId, facilityId)
      : db.prepare('SELECT id, tenant_id as tenantId, facility_id as facilityId, zone_id as zoneId, asset_id as assetId, name, stream_protocol as streamProtocol, resolution, fps, status, mode, model_version as modelVersion, confidence_threshold as confidenceThreshold, sample_image_url as sampleImageUrl, privacy_policy as privacyPolicy, last_frame_at as lastFrameAt FROM cameras WHERE tenant_id = ?').all(tenantId));

    const visionEventsRaw = db.prepare('SELECT * FROM vision_events WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 25').all(tenantId) as Array<Record<string, unknown>>;
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
      evidenceImageUrl: v.evidence_image_url,
      createdAt: v.created_at,
    }));

    const iotIntegrations = db.prepare('SELECT id, tenant_id as tenantId, facility_id as facilityId, name, protocol, endpoint, status, capability_state as capabilityState, polling_interval_ms as pollingIntervalMs, device_count as deviceCount, last_heartbeat_at as lastHeartbeatAt FROM iot_integrations WHERE tenant_id = ?').all(tenantId);

    const telemetry = db.prepare('SELECT id, tenant_id as tenantId, asset_id as assetId, metric_name as metricName, value, unit, threshold_warn as thresholdWarn, threshold_crit as thresholdCrit, z_score as zScore, is_anomaly as isAnomaly, mode, timestamp FROM telemetry_points WHERE tenant_id = ? ORDER BY timestamp DESC LIMIT 120').all(tenantId) as Array<Record<string, unknown>>;
    const normalizedTelemetry: TelemetryPoint[] = telemetry.map((t) => ({
      id: String(t.id),
      tenantId: String(t.tenantId),
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

    const events = db.prepare('SELECT id, tenant_id as tenantId, facility_id as facilityId, asset_id as assetId, source_module as sourceModule, event_type as eventType, severity, title, description, mode, created_at as createdAt FROM events WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 40').all(tenantId);
    const incidents = (facilityId
      ? db.prepare('SELECT id, tenant_id as tenantId, facility_id as facilityId, asset_id as assetId, title, description, severity, status, assigned_to as assignedTo, opened_at as openedAt, resolved_at as resolvedAt FROM incidents WHERE tenant_id = ? AND facility_id = ? ORDER BY opened_at DESC').all(tenantId, facilityId)
      : db.prepare('SELECT id, tenant_id as tenantId, facility_id as facilityId, asset_id as assetId, title, description, severity, status, assigned_to as assignedTo, opened_at as openedAt, resolved_at as resolvedAt FROM incidents WHERE tenant_id = ? ORDER BY opened_at DESC').all(tenantId));

    const maintenanceRecords = db.prepare('SELECT id, tenant_id as tenantId, asset_id as assetId, facility_id as facilityId, maintenance_type as maintenanceType, performed_by as performedBy, summary, downtime_minutes as downtimeMinutes, parts_replaced as partsReplaced, performed_at as performedAt FROM maintenance_records WHERE tenant_id = ? ORDER BY performed_at DESC').all(tenantId);
    const workOrders = db.prepare('SELECT id, tenant_id as tenantId, facility_id as facilityId, asset_id as assetId, incident_id as incidentId, title, description, priority, status, requested_by as requestedBy, approved_by as approvedBy, safety_interlock_checked as safetyInterlockChecked, created_at as createdAt, updated_at as updatedAt FROM work_orders WHERE tenant_id = ? ORDER BY created_at DESC').all(tenantId);

    const energyRecords = (facilityId
      ? db.prepare('SELECT id, tenant_id as tenantId, facility_id as facilityId, asset_id as assetId, period_start as periodStart, consumption_kwh as consumptionKwh, peak_demand_kw as peakDemandKw, baseline_kwh as baselineKwh, power_factor as powerFactor, mode, methodology FROM energy_records WHERE tenant_id = ? AND facility_id = ?').all(tenantId, facilityId)
      : db.prepare('SELECT id, tenant_id as tenantId, facility_id as facilityId, asset_id as assetId, period_start as periodStart, consumption_kwh as consumptionKwh, peak_demand_kw as peakDemandKw, baseline_kwh as baselineKwh, power_factor as powerFactor, mode, methodology FROM energy_records WHERE tenant_id = ?').all(tenantId)) as unknown as EnergyRecord[];

    const energySummary = computeEnergySummary(energyRecords);
    const predictiveAssessments = db.prepare('SELECT id, tenant_id as tenantId, asset_id as assetId, facility_id as facilityId, failure_mode as failureMode, risk_score as riskScore, rul_hours as rulHours, uncertainty_hours as uncertaintyHours, methodology, data_source as dataSource, validation_status as validationStatus, recommended_action as recommendedAction, mode, computed_at as computedAt FROM predictive_assessments WHERE tenant_id = ? ORDER BY risk_score DESC').all(tenantId);

    const rcaRaw = db.prepare('SELECT * FROM root_cause_investigations WHERE tenant_id = ? ORDER BY created_at DESC').all(tenantId) as Array<Record<string, unknown>>;
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

    const agentExecutionsRaw = db.prepare('SELECT * FROM agent_executions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 25').all(tenantId) as Array<Record<string, unknown>>;
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
      createdAt: ex.created_at,
    }));

    const approvals = db.prepare('SELECT id, tenant_id as tenantId, facility_id as facilityId, target_type as targetType, target_id as targetId, title, justification, requested_by as requestedBy, risk_level as riskLevel, safety_boundary_check as safetyBoundaryCheck, status, decided_by as decidedBy, decision_notes as decisionNotes, created_at as createdAt, decided_at as decidedAt FROM approvals WHERE tenant_id = ? ORDER BY created_at DESC').all(tenantId);

    const auditRecords = db.prepare('SELECT id, tenant_id as tenantId, actor_email as actorEmail, actor_role as actorRole, action, resource_type as resourceType, resource_id as resourceId, outcome, details, created_at as createdAt FROM audit_records WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 50').all(tenantId);

    const allDocs = db.prepare('SELECT id, tenant_id as tenantId, facility_id as facilityId, title, category, min_role as minRole, source_ref as sourceRef, version, content, updated_at as updatedAt FROM knowledge_documents WHERE tenant_id = ? ORDER BY updated_at DESC').all(tenantId) as Array<{ minRole: VantaRole }>;
    const knowledgeDocuments = allDocs.filter((d) => (ROLE_RANK[d.minRole] ?? 1) <= userRank);

    const users = canPerformAction(req.auth!.role, 'MANAGE_TENANTS_USERS')
      ? db.prepare('SELECT id, tenant_id as tenantId, email, full_name as fullName, role, facility_ids_json as facilityIdsJson, created_at as createdAt FROM users WHERE tenant_id = ?').all(tenantId)
      : [];

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
      users,
    });
  });

  // --- VANTA Brain Query ---
  router.post('/brain/query', requirePermission('QUERY_BRAIN'), async (req: AuthenticatedRequest, res) => {
    const { query, facilityId } = req.body as { query?: string; facilityId?: string };
    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'Analysis prompt is required.' });
    }
    const result = await runVantaBrainQuery(db, req.auth!, query.trim(), facilityId === 'ALL' ? undefined : facilityId);
    logAudit(
      req.auth!.tenantId,
      req.auth!.email,
      req.auth!.role,
      'BRAIN_QUERY',
      'VANTA_BRAIN',
      result.engineUsed,
      'SUCCESS',
      `Query: "${query.trim().slice(0, 80)}" · Tools: ${result.toolsCalled.join(', ')}`
    );
    return res.json(result);
  });

  // --- Vision Frame Inspection ---
  router.post('/vision/inspect', requirePermission('RUN_VISION_INSPECT'), async (req: AuthenticatedRequest, res) => {
    const { cameraId, goal } = req.body as { cameraId?: string; goal?: string };
    if (!cameraId) {
      return res.status(400).json({ error: 'cameraId is required.' });
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
        }
      | undefined;

    if (!cam) {
      return res.status(404).json({ error: 'Camera not found in tenant scope.' });
    }

    const inspection = await runVisionFrameInspection(
      {
        id: cam.id,
        name: cam.name,
        sampleImageUrl: cam.sample_image_url,
        confidenceThreshold: cam.confidence_threshold,
        zoneId: cam.zone_id,
      },
      goal?.trim() || 'Inspect PPE compliance, safety perimeter clearance, and equipment status'
    );

    const evtId = uid('vis-evt');
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO vision_events (id, tenant_id, camera_id, facility_id, asset_id, event_type, severity, confidence, summary, detections_json, inference_engine, mode, evidence_image_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      cam.sample_image_url,
      now
    );

    db.prepare('UPDATE cameras SET last_frame_at = ? WHERE id = ?').run(now, cam.id);
    logAudit(req.auth!.tenantId, req.auth!.email, req.auth!.role, 'VISION_INSPECT', 'CAMERA', cam.id, 'SUCCESS', inspection.summary);

    return res.json({
      id: evtId,
      cameraId: cam.id,
      facilityId: cam.facility_id,
      assetId: cam.asset_id,
      ...inspection,
      mode: cam.mode,
      evidenceImageUrl: cam.sample_image_url,
      createdAt: now,
    });
  });

  // --- IoT Simulation Injection (Explicitly SIMULATED Mode) ---
  router.post('/iot/simulate', requirePermission('TRIGGER_SIMULATION'), (req: AuthenticatedRequest, res) => {
    const { assetId, scenario } = req.body as { assetId?: string; scenario?: 'NOMINAL_SAMPLE' | 'THERMAL_SPIKE' | 'VIBRATION_FAULT' };
    if (!assetId) {
      return res.status(400).json({ error: 'assetId is required.' });
    }
    const asset = db
      .prepare('SELECT * FROM assets WHERE id = ? AND tenant_id = ?')
      .get(assetId, req.auth!.tenantId) as
      | { id: string; facility_id: string; name: string; health_score: number }
      | undefined;

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found in tenant scope.' });
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

    let nextValue = template.value;
    if (scenario === 'THERMAL_SPIKE') {
      nextValue = Number((template.threshold_crit + 3.4).toFixed(1));
    } else if (scenario === 'VIBRATION_FAULT') {
      nextValue = Number((template.threshold_crit * 1.15).toFixed(2));
    } else {
      nextValue = Number((template.threshold_warn * 0.72 + (Math.random() - 0.5) * 1.4).toFixed(2));
    }

    const baseline = historyRows.map((r) => r.value);
    const anomaly = computeZScoreAnomaly(baseline, nextValue, template.threshold_warn, template.threshold_crit);
    const now = new Date().toISOString();
    const telId = uid('tel-sim');

    db.prepare(`
      INSERT INTO telemetry_points (id, tenant_id, asset_id, metric_name, value, unit, threshold_warn, threshold_crit, z_score, is_anomaly, mode, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SIMULATED', ?)
    `).run(
      telId,
      req.auth!.tenantId,
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
    const newHealth = anomaly.severity === 'CRITICAL' ? Math.max(38, asset.health_score - 18) : anomaly.isAnomaly ? Math.max(60, asset.health_score - 8) : Math.min(96, asset.health_score + 2);
    db.prepare('UPDATE assets SET status = ?, health_score = ?, updated_at = ? WHERE id = ?').run(newStatus, newHealth, now, asset.id);

    // Recompute Predictive RUL for this asset
    const rul = estimateRemainingUsefulLife({
      assetName: asset.name,
      currentValue: nextValue,
      nominalValue: template.threshold_warn * 0.68,
      criticalThreshold: template.threshold_crit,
      recentSlopePerHour: anomaly.isAnomaly ? 0.35 : 0.01,
      hoursSinceLastMaintenance: 960,
      maintenanceIntervalHours: 1440,
    });

    const predId = uid('prd-sim');
    db.prepare(`
      INSERT INTO predictive_assessments (id, tenant_id, asset_id, facility_id, failure_mode, risk_score, rul_hours, uncertainty_hours, methodology, data_source, validation_status, recommended_action, mode, computed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SIMULATED_BASELINE', ?, 'SIMULATED', ?)
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

    logAudit(req.auth!.tenantId, req.auth!.email, req.auth!.role, 'IOT_SIMULATION', 'ASSET', asset.id, 'SUCCESS', `Scenario ${scenario || 'NOMINAL_SAMPLE'} -> ${nextValue} ${template.unit}`);
    broadcastTelemetry(req.auth!.tenantId, { type: 'TELEMETRY_UPDATE', assetId: asset.id, value: nextValue, unit: template.unit, mode: 'SIMULATED', timestamp: now });

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

  // --- Root Cause Investigation Generator & Human Resolution ---
  router.post('/rca/correlate', requirePermission('CREATE_INCIDENT'), (req: AuthenticatedRequest, res) => {
    const { incidentId } = req.body as { incidentId?: string };
    if (!incidentId) return res.status(400).json({ error: 'incidentId is required.' });

    const tenantId = req.auth!.tenantId;
    const inc = db.prepare('SELECT id, tenant_id as tenantId, facility_id as facilityId, asset_id as assetId, title, description, severity, status, assigned_to as assignedTo, opened_at as openedAt, resolved_at as resolvedAt FROM incidents WHERE id = ? AND tenant_id = ?').get(incidentId, tenantId) as Incident | undefined;
    if (!inc) return res.status(404).json({ error: 'Incident not found.' });

    const assets = (db.prepare('SELECT * FROM assets WHERE tenant_id = ?').all(tenantId) as Array<Record<string, unknown>>).map((a) => ({
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
    const tel = (db.prepare('SELECT id, tenant_id as tenantId, asset_id as assetId, metric_name as metricName, value, unit, threshold_warn as thresholdWarn, threshold_crit as thresholdCrit, z_score as zScore, is_anomaly as isAnomaly, mode, timestamp FROM telemetry_points WHERE tenant_id = ?').all(tenantId) as Array<Record<string, unknown>>).map((t) => ({
      ...(t as unknown as TelemetryPoint),
      isAnomaly: Boolean(t.isAnomaly),
    }));
    const evts = db.prepare('SELECT id, tenant_id as tenantId, facility_id as facilityId, asset_id as assetId, source_module as sourceModule, event_type as eventType, severity, title, description, mode, created_at as createdAt FROM events WHERE tenant_id = ?').all(tenantId) as unknown as InfrastructureEvent[];
    const maint = db.prepare('SELECT id, tenant_id as tenantId, asset_id as assetId, facility_id as facilityId, maintenance_type as maintenanceType, performed_by as performedBy, summary, downtime_minutes as downtimeMinutes, parts_replaced as partsReplaced, performed_at as performedAt FROM maintenance_records WHERE tenant_id = ?').all(tenantId) as unknown as MaintenanceRecord[];

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

    logAudit(tenantId, req.auth!.email, req.auth!.role, 'RCA_GENERATED', 'ROOT_CAUSE', rcaId, 'SUCCESS', `Correlated incident ${inc.id}`);
    return res.status(201).json({ id: rcaId, ...result });
  });

  router.patch('/rca/:id/resolve', requirePermission('APPROVE_CONSEQUENTIAL_ACTION'), (req: AuthenticatedRequest, res) => {
    const { humanDecision, resolutionRecord, outcomeVerification } = req.body as {
      humanDecision?: string;
      resolutionRecord?: string;
      outcomeVerification?: string;
    };
    if (!humanDecision?.trim() || !resolutionRecord?.trim()) {
      return res.status(400).json({ error: 'Human decision and resolution record are required.' });
    }
    const existing = db.prepare('SELECT id FROM root_cause_investigations WHERE id = ? AND tenant_id = ?').get(req.params.id, req.auth!.tenantId);
    if (!existing) return res.status(404).json({ error: 'Investigation not found.' });

    db.prepare(`
      UPDATE root_cause_investigations
      SET human_decision = ?, resolution_record = ?, outcome_verification = ?, status = ?
      WHERE id = ? AND tenant_id = ?
    `).run(
      humanDecision.trim(),
      resolutionRecord.trim(),
      outcomeVerification?.trim() || 'Verified operational stability post-mitigation.',
      outcomeVerification?.trim() ? 'VERIFIED' : 'REVIEWED',
      req.params.id,
      req.auth!.tenantId
    );

    logAudit(req.auth!.tenantId, req.auth!.email, req.auth!.role, 'RCA_RESOLVED', 'ROOT_CAUSE', String(req.params.id), 'SUCCESS', humanDecision.trim());
    return res.json({ ok: true });
  });

  // --- Human-in-the-Loop Approvals & Work Orders ---
  router.post('/work-orders', requirePermission('CREATE_WORK_ORDER'), (req: AuthenticatedRequest, res) => {
    const { facilityId, assetId, title, description, priority } = req.body as {
      facilityId?: string;
      assetId?: string;
      title?: string;
      description?: string;
      priority?: string;
    };
    if (!facilityId || !assetId || !title?.trim()) {
      return res.status(400).json({ error: 'facilityId, assetId, and title are required.' });
    }
    const asset = db.prepare('SELECT id FROM assets WHERE id = ? AND tenant_id = ?').get(assetId, req.auth!.tenantId);
    if (!asset) return res.status(404).json({ error: 'Asset not found in tenant scope.' });

    const woId = uid('wo');
    const aprId = uid('apr');
    const now = new Date().toISOString();
    const prio = (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(priority || '') ? priority : 'MEDIUM') as string;

    db.prepare(`
      INSERT INTO work_orders (id, tenant_id, facility_id, asset_id, incident_id, title, description, priority, status, requested_by, approved_by, safety_interlock_checked, created_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 'PENDING_APPROVAL', ?, NULL, 1, ?, ?)
    `).run(woId, req.auth!.tenantId, facilityId, assetId, title.trim(), description?.trim() || 'Operator-submitted maintenance request.', prio, req.auth!.email, now, now);

    db.prepare(`
      INSERT INTO approvals (id, tenant_id, facility_id, target_type, target_id, title, justification, requested_by, risk_level, safety_boundary_check, status, decided_by, decision_notes, created_at, decided_at)
      VALUES (?, ?, ?, 'WORK_ORDER', ?, ?, ?, ?, ?, 'PASSED — Requires certified human approval prior to physical lockout.', 'PENDING', NULL, NULL, ?, NULL)
    `).run(aprId, req.auth!.tenantId, facilityId, woId, `Authorize ${woId}: ${title.trim()}`, description?.trim() || 'Maintenance work order authorization.', req.auth!.email, prio, now);

    logAudit(req.auth!.tenantId, req.auth!.email, req.auth!.role, 'WORK_ORDER_CREATED', 'WORK_ORDER', woId, 'SUCCESS', title.trim());
    return res.status(201).json({ workOrderId: woId, approvalId: aprId });
  });

  router.post('/approvals/:id/decide', requirePermission('APPROVE_CONSEQUENTIAL_ACTION'), (req: AuthenticatedRequest, res) => {
    const { decision, notes } = req.body as { decision?: 'APPROVED' | 'REJECTED'; notes?: string };
    if (decision !== 'APPROVED' && decision !== 'REJECTED') {
      return res.status(400).json({ error: 'Decision must be APPROVED or REJECTED.' });
    }
    const apr = db.prepare('SELECT * FROM approvals WHERE id = ? AND tenant_id = ?').get(req.params.id, req.auth!.tenantId) as
      | { id: string; target_type: string; target_id: string; status: string }
      | undefined;

    if (!apr) return res.status(404).json({ error: 'Approval item not found.' });
    if (apr.status !== 'PENDING') return res.status(400).json({ error: 'Approval item has already been decided.' });

    const now = new Date().toISOString();
    db.prepare('UPDATE approvals SET status = ?, decided_by = ?, decision_notes = ?, decided_at = ? WHERE id = ?').run(
      decision,
      req.auth!.email,
      notes?.trim() || `${decision} by ${req.auth!.fullName}`,
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

  // --- Multi-Agent Orchestrator Execution ---
  router.post('/agents/execute', requirePermission('QUERY_BRAIN'), async (req: AuthenticatedRequest, res) => {
    const { agentId, prompt } = req.body as { agentId?: string; prompt?: string };
    if (!agentId || !prompt?.trim()) {
      return res.status(400).json({ error: 'agentId and prompt are required.' });
    }
    const execResult = await runBoundedAgentExecution(db, req.auth!, agentId, prompt.trim());
    const id = uid('agx');
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO agent_executions (id, tenant_id, agent_id, requested_by, prompt, status, steps_taken, tools_invoked_json, evidence_refs_json, output_summary, requires_approval, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.auth!.tenantId,
      agentId,
      req.auth!.email,
      prompt.trim(),
      execResult.status,
      execResult.stepsTaken,
      JSON.stringify(execResult.toolsInvoked),
      JSON.stringify(execResult.evidenceRefs),
      execResult.outputSummary,
      execResult.requiresApproval ? 1 : 0,
      now
    );

    if (execResult.requiresApproval) {
      const fac = db.prepare('SELECT id FROM facilities WHERE tenant_id = ? LIMIT 1').get(req.auth!.tenantId) as { id: string } | undefined;
      if (fac) {
        db.prepare(`
          INSERT INTO approvals (id, tenant_id, facility_id, target_type, target_id, title, justification, requested_by, risk_level, safety_boundary_check, status, decided_by, decision_notes, created_at, decided_at)
          VALUES (?, ?, ?, 'AGENT_RECOMMENDATION', ?, ?, ?, ?, 'MEDIUM', 'PASSED — Bounded agent output queued for human review.', 'PENDING', NULL, NULL, ?, NULL)
        `).run(uid('apr'), req.auth!.tenantId, fac.id, id, `Review Agent Output (${agentId})`, execResult.outputSummary, req.auth!.email, now);
      }
    }

    logAudit(
      req.auth!.tenantId,
      req.auth!.email,
      req.auth!.role,
      'AGENT_EXECUTION',
      'AGENT',
      agentId,
      execResult.status === 'BLOCKED_SAFETY' ? 'DENIED' : 'SUCCESS',
      execResult.outputSummary.slice(0, 120)
    );

    return res.json({ id, agentId, ...execResult, createdAt: now });
  });

  // --- Asset Registration ---
  router.post('/assets', requirePermission('MANAGE_ASSETS_IOT'), (req: AuthenticatedRequest, res) => {
    const { facilityId, zoneId, code, name, assetType, manufacturer, model, owner } = req.body as Record<string, string>;
    if (!facilityId || !zoneId || !code?.trim() || !name?.trim()) {
      return res.status(400).json({ error: 'facilityId, zoneId, code, and name are required.' });
    }
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
      code.trim(),
      name.trim(),
      assetType || 'EQUIPMENT',
      manufacturer?.trim() || 'Generic Industrial',
      model?.trim() || 'Series-1',
      owner?.trim() || req.auth!.fullName,
      now
    );
    logAudit(req.auth!.tenantId, req.auth!.email, req.auth!.role, 'ASSET_CREATED', 'ASSET', id, 'SUCCESS', `${code.trim()} — ${name.trim()}`);
    return res.status(201).json({ id });
  });

  // --- Knowledge Document Ingestion ---
  router.post('/knowledge', requirePermission('MANAGE_ASSETS_IOT'), (req: AuthenticatedRequest, res) => {
    const { facilityId, title, category, minRole, sourceRef, content } = req.body as Record<string, string>;
    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({ error: 'Document title and content are required.' });
    }
    const id = uid('doc');
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO knowledge_documents (id, tenant_id, facility_id, title, category, min_role, source_ref, version, content, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'v1.0', ?, ?)
    `).run(
      id,
      req.auth!.tenantId,
      facilityId || null,
      title.trim(),
      category || 'SOP',
      minRole || 'Viewer',
      sourceRef?.trim() || 'Operator Upload',
      content.trim(),
      now
    );
    logAudit(req.auth!.tenantId, req.auth!.email, req.auth!.role, 'KNOWLEDGE_CREATED', 'DOCUMENT', id, 'SUCCESS', title.trim());
    return res.status(201).json({ id });
  });

  return router;
}
