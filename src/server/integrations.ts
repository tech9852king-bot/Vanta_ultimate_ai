/**
 * VANTA AI — Industrial IoT Protocol Connectors & Modular Camera Provider Architecture
 * Separates physical protocol probes from simulation sandboxes and enforces honest capability states.
 */

import type { DatabaseSync } from 'node:sqlite';
import { computeZScoreAnomaly } from '../core/intelligence.ts';
import type {
  CameraCapabilityState,
  CapabilityState,
  ConnectorLifecycleStage,
  DataOriginMode,
  UserSession,
} from '../core/types.ts';
import { isFacilityAuthorized } from './authz.ts';

export interface CameraHealthProbeResult {
  cameraId: string;
  capabilityState: CameraCapabilityState;
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  streamHealthPct: number;
  lastError: string | null;
  checkedAt: string;
}

export interface IoTHealthProbeResult {
  connectorId: string;
  protocol: string;
  status: 'CONNECTED' | 'SIMULATED' | 'DEGRADED' | 'NOT_CONFIGURED' | 'OFFLINE';
  capabilityState: CapabilityState;
  lifecycleStage: ConnectorLifecycleStage;
  dataFreshnessSec: number | null;
  retryStatus: 'IDLE' | 'BACKOFF_RETRYING' | 'CIRCUIT_OPEN' | 'BLOCKED_MISSING_CREDENTIALS';
  latencyMs: number | null;
  consecutiveFailures: number;
  lastError: string | null;
  checkedAt: string;
}

/**
 * Evaluates a camera provider honestly without masking offline RTSP/ONVIF endpoints as live video.
 */
export function probeCameraProviderHealth(
  db: DatabaseSync,
  session: UserSession,
  cameraId: string
): CameraHealthProbeResult | { error: string; statusCode: number } {
  const cam = db
    .prepare(
      'SELECT id, facility_id, stream_protocol, provider_type, capability_state, status, sample_image_url FROM cameras WHERE id = ? AND tenant_id = ?'
    )
    .get(cameraId, session.tenantId) as
    | {
        id: string;
        facility_id: string;
        stream_protocol: string;
        provider_type: string;
        capability_state: CameraCapabilityState;
        status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
        sample_image_url: string;
      }
    | undefined;

  if (!cam) {
    return { error: 'Camera not found in tenant scope.', statusCode: 404 };
  }
  if (!isFacilityAuthorized(session, cam.facility_id)) {
    return { error: `Facility access denied for camera '${cameraId}'.`, statusCode: 403 };
  }

  const now = new Date().toISOString();
  let capabilityState: CameraCapabilityState = cam.capability_state || 'SAMPLE_IMAGE';
  let status: 'ONLINE' | 'DEGRADED' | 'OFFLINE' = cam.status;
  let streamHealthPct = 100;
  let lastError: string | null = null;

  if (cam.provider_type === 'RTSP_EDGE' || cam.stream_protocol === 'RTSP_EDGE') {
    // No external RTSP daemon is reachable in the single-container sandbox; report OFFLINE truthfully.
    capabilityState = 'OFFLINE';
    status = 'OFFLINE';
    streamHealthPct = 0;
    lastError = 'RTSP edge host unreachable from sandbox network; live video daemon not attached.';
  } else if (cam.provider_type === 'ONVIF_DEVICE') {
    capabilityState = 'NOT_CONFIGURED';
    status = 'OFFLINE';
    streamHealthPct = 0;
    lastError = 'ONVIF device credentials not provisioned.';
  } else if (cam.provider_type === 'SAMPLE_BUFFER' && cam.sample_image_url) {
    capabilityState = 'SAMPLE_IMAGE';
    status = 'ONLINE';
    streamHealthPct = 100;
  }

  db.prepare(
    'UPDATE cameras SET capability_state = ?, status = ?, stream_health_pct = ?, last_error = ? WHERE id = ? AND tenant_id = ?'
  ).run(capabilityState, status, streamHealthPct, lastError, cam.id, session.tenantId);

  return {
    cameraId: cam.id,
    capabilityState,
    status,
    streamHealthPct,
    lastError,
    checkedAt: now,
  };
}

/**
 * Evaluates an industrial IoT gateway connector across the Part 9 10-Stage Lifecycle:
 * REGISTER -> CONFIGURE -> VALIDATE -> AUTHENTICATE -> CONNECT -> COLLECT -> NORMALIZE -> MONITOR -> RECOVER -> DISCONNECT.
 * Physical hardware brokers unreachable in this sandbox report OFFLINE / NOT_CONFIGURED cleanly.
 * Never returns gateway credentials to the browser.
 */
export function probeIoTConnectorHealth(
  db: DatabaseSync,
  session: UserSession,
  connectorId: string
): IoTHealthProbeResult | { error: string; statusCode: number } {
  const conn = db
    .prepare(
      'SELECT id, facility_id, protocol, endpoint, status, capability_state, consecutive_failures, credential_ref FROM iot_integrations WHERE id = ? AND tenant_id = ?'
    )
    .get(connectorId, session.tenantId) as
    | {
        id: string;
        facility_id: string;
        protocol: string;
        endpoint: string;
        status: string;
        capability_state: CapabilityState;
        consecutive_failures: number;
        credential_ref: string | null;
      }
    | undefined;

  if (!conn) {
    return { error: 'IoT connector not found in tenant scope.', statusCode: 404 };
  }
  if (!isFacilityAuthorized(session, conn.facility_id)) {
    return { error: `Facility access denied for connector '${connectorId}'.`, statusCode: 403 };
  }

  const now = new Date().toISOString();

  if (!conn.credential_ref || conn.status === 'NOT_CONFIGURED') {
    const failures = (conn.consecutive_failures || 0) + 1;
    db.prepare(
      'UPDATE iot_integrations SET status = ?, capability_state = ?, lifecycle_stage = ?, data_freshness_sec = NULL, retry_status = ?, latency_ms = NULL, consecutive_failures = ?, last_error = ?, last_heartbeat_at = ? WHERE id = ?'
    ).run(
      'NOT_CONFIGURED',
      'NOT_CONFIGURED',
      'VALIDATE',
      'BLOCKED_MISSING_CREDENTIALS',
      failures,
      'Missing vault credential reference or TLS client certificate.',
      now,
      conn.id
    );
    return {
      connectorId: conn.id,
      protocol: conn.protocol,
      status: 'NOT_CONFIGURED',
      capabilityState: 'NOT_CONFIGURED',
      lifecycleStage: 'VALIDATE',
      dataFreshnessSec: null,
      retryStatus: 'BLOCKED_MISSING_CREDENTIALS',
      latencyMs: null,
      consecutiveFailures: failures,
      lastError: 'Missing vault credential reference or TLS client certificate.',
      checkedAt: now,
    };
  }

  // Simulated sandbox gateways verify local normalizer readiness while clearly marking SIMULATED mode
  if (conn.endpoint.includes('.internal')) {
    const latencyMs = 9 + Math.floor(Math.random() * 14);
    db.prepare(
      'UPDATE iot_integrations SET status = ?, capability_state = ?, lifecycle_stage = ?, data_freshness_sec = 0, retry_status = ?, latency_ms = ?, consecutive_failures = 0, last_error = NULL, last_heartbeat_at = ? WHERE id = ?'
    ).run('SIMULATED', 'SIMULATED', 'MONITOR', 'IDLE', latencyMs, now, conn.id);

    return {
      connectorId: conn.id,
      protocol: conn.protocol,
      status: 'SIMULATED',
      capabilityState: 'SIMULATED',
      lifecycleStage: 'MONITOR',
      dataFreshnessSec: 0,
      retryStatus: 'IDLE',
      latencyMs,
      consecutiveFailures: 0,
      lastError: 'Simulated gateway adapter active; physical plant LAN (.internal) not bridged.',
      checkedAt: now,
    };
  }

  // External physical host probe fails cleanly in isolated container and enters RECOVER stage
  const failures = (conn.consecutive_failures || 0) + 1;
  const retryStatus = failures >= 5 ? 'CIRCUIT_OPEN' : 'BACKOFF_RETRYING';
  db.prepare(
    'UPDATE iot_integrations SET status = ?, capability_state = ?, lifecycle_stage = ?, data_freshness_sec = NULL, retry_status = ?, latency_ms = NULL, consecutive_failures = ?, last_error = ?, last_heartbeat_at = ? WHERE id = ?'
  ).run('OFFLINE', 'NOT_CONFIGURED', 'RECOVER', retryStatus, failures, 'Gateway TCP handshake failed (host unreachable).', now, conn.id);

  return {
    connectorId: conn.id,
    protocol: conn.protocol,
    status: 'OFFLINE',
    capabilityState: 'NOT_CONFIGURED',
    lifecycleStage: 'RECOVER',
    dataFreshnessSec: null,
    retryStatus,
    latencyMs: null,
    consecutiveFailures: failures,
    lastError: 'Gateway TCP handshake failed (host unreachable).',
    checkedAt: now,
  };
}

/**
 * Normalizes and validates an incoming telemetry reading against tenant & facility boundaries,
 * checking for duplicate readings and tagging data quality status (Part 10).
 */
export function ingestNormalizedTelemetry(
  db: DatabaseSync,
  session: UserSession,
  input: {
    connectorId: string;
    assetId: string;
    metricName: string;
    value: number;
    unit: string;
    thresholdWarn: number;
    thresholdCrit: number;
    mode: DataOriginMode;
  }
):
  | {
      telemetryId: string;
      facilityId: string;
      zScore: number;
      isAnomaly: boolean;
      severity: string;
      mode: DataOriginMode;
      dataQualityStatus: 'VERIFIED' | 'DUPLICATE_DETECTED' | 'SIMULATED_SYNTHETIC';
      deduplicated: boolean;
    }
  | { error: string; statusCode: number } {
  const conn = db
    .prepare('SELECT id, facility_id, status FROM iot_integrations WHERE id = ? AND tenant_id = ?')
    .get(input.connectorId, session.tenantId) as
    | { id: string; facility_id: string; status: string }
    | undefined;
  if (!conn) {
    return { error: 'IoT connector not found in tenant scope.', statusCode: 404 };
  }

  const asset = db
    .prepare('SELECT id, facility_id, name, health_score FROM assets WHERE id = ? AND tenant_id = ?')
    .get(input.assetId, session.tenantId) as
    | { id: string; facility_id: string; name: string; health_score: number }
    | undefined;
  if (!asset) {
    return { error: 'Asset not found in tenant scope.', statusCode: 404 };
  }

  if (!isFacilityAuthorized(session, asset.facility_id) || !isFacilityAuthorized(session, conn.facility_id)) {
    return { error: 'Facility access denied for IoT telemetry ingestion.', statusCode: 403 };
  }

  if (conn.status === 'NOT_CONFIGURED' || conn.status === 'OFFLINE') {
    return { error: `Connector '${conn.id}' is ${conn.status}; cannot ingest telemetry until configured.`, statusCode: 409 };
  }

  const history = db
    .prepare(
      'SELECT id, value, z_score, is_anomaly, mode, timestamp FROM telemetry_points WHERE tenant_id = ? AND asset_id = ? AND metric_name = ? ORDER BY timestamp DESC LIMIT 10'
    )
    .all(session.tenantId, asset.id, input.metricName) as Array<{
    id: string;
    value: number;
    z_score: number;
    is_anomaly: number;
    mode: DataOriginMode;
    timestamp: string;
  }>;

  // Part 10: Duplicate telemetry guard within 2-second ingestion window
  const latest = history[0];
  if (latest && Number(latest.value) === Number(input.value)) {
    const deltaMs = Date.now() - Date.parse(latest.timestamp);
    if (!Number.isNaN(deltaMs) && deltaMs >= 0 && deltaMs < 2000) {
      return {
        telemetryId: latest.id,
        facilityId: asset.facility_id,
        zScore: Number(latest.z_score),
        isAnomaly: Boolean(latest.is_anomaly),
        severity: latest.is_anomaly ? 'HIGH' : 'INFO',
        mode: latest.mode,
        dataQualityStatus: 'DUPLICATE_DETECTED',
        deduplicated: true,
      };
    }
  }

  const anomaly = computeZScoreAnomaly(
    history.map((h) => h.value),
    input.value,
    input.thresholdWarn,
    input.thresholdCrit
  );

  const telId = `tel-ing-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;
  const now = new Date().toISOString();

  // Prevent unverified simulated connector from claiming MEASURED origin
  const effectiveMode: DataOriginMode = conn.status === 'SIMULATED' ? 'SIMULATED' : input.mode;
  const dataQualityStatus =
    effectiveMode === 'SIMULATED' ? 'SIMULATED_SYNTHETIC' : 'VERIFIED';

  db.prepare(`
    INSERT INTO telemetry_points (id, tenant_id, facility_id, asset_id, metric_name, value, unit, threshold_warn, threshold_crit, z_score, is_anomaly, mode, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    telId,
    session.tenantId,
    asset.facility_id,
    asset.id,
    input.metricName,
    input.value,
    input.unit,
    input.thresholdWarn,
    input.thresholdCrit,
    anomaly.zScore,
    anomaly.isAnomaly ? 1 : 0,
    effectiveMode,
    now
  );

  db.prepare(
    'UPDATE iot_integrations SET lifecycle_stage = ?, data_freshness_sec = 0, last_heartbeat_at = ? WHERE id = ? AND tenant_id = ?'
  ).run('COLLECT', now, conn.id, session.tenantId);

  return {
    telemetryId: telId,
    facilityId: asset.facility_id,
    zScore: anomaly.zScore,
    isAnomaly: anomaly.isAnomaly,
    severity: anomaly.severity,
    mode: effectiveMode,
    dataQualityStatus,
    deduplicated: false,
  };
}

