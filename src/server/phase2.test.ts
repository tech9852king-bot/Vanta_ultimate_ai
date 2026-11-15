import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { runBoundedAgentExecution, validateBrainCitations, type EvidenceIndexEntry } from './ai.ts';
import { createDatabaseBackup, restoreDatabaseFromBackup, verifyBackupFile } from './backup.ts';
import { loadRuntimeConfig } from './config.ts';
import { initDatabase } from './db.ts';
import { correlationMiddleware } from './observability.ts';
import { createApiRouter } from './routes.ts';
import { signSessionToken } from './security.ts';

function startPhase2TestServer(allowDemoSeed = true) {
  const cfg = loadRuntimeConfig({
    NODE_ENV: 'development',
    VANTA_SESSION_SECRET: 'test-phase2-secret-material-32bytes-min',
    VANTA_ALLOW_DEMO_AUTH: allowDemoSeed ? 'true' : 'false',
  });
  const db = initDatabase({ dbPath: ':memory:', allowDemoSeed, config: cfg });
  const app = express();
  app.use(correlationMiddleware);
  app.use(express.json({ limit: '4mb' }));
  app.use('/api', createApiRouter(db, cfg));
  const server = http.createServer(app);
  return new Promise<{ server: http.Server; baseUrl: string; db: ReturnType<typeof initDatabase>; cfg: typeof cfg }>(
    (resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve({ server, baseUrl: `http://127.0.0.1:${port}/api`, db, cfg });
      });
    }
  );
}

async function loginAs(baseUrl: string, email: string) {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'VantaDemo!2026' }),
  });
  assert.equal(res.status, 200);
  return (await res.json()) as { token: string; user: { id: string; tenantId: string; facilityIds: string[] } };
}

test('Phase II Security: session revocation (logout + revoke-all), correlation headers, and readiness probe', async () => {
  const { server, baseUrl } = await startPhase2TestServer();
  try {
    const ready = await fetch(`${baseUrl}/ready`);
    assert.equal(ready.status, 200);
    assert.ok(ready.headers.get('x-correlation-id'));
    const readyJson = (await ready.json()) as { ready: boolean };
    assert.equal(readyJson.ready, true);

    const { token } = await loginAs(baseUrl, 'ops.manager@apex-industrial.io');
    const ws1 = await fetch(`${baseUrl}/workspace`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(ws1.status, 200);

    // Logout revokes jti immediately in SQLite session_records
    const logout = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(logout.status, 200);

    const wsAfterLogout = await fetch(`${baseUrl}/workspace`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(wsAfterLogout.status, 401);

    // Second login + revoke-all invalidates all tokens for that user
    const login2 = await loginAs(baseUrl, 'ops.manager@apex-industrial.io');
    const revokeAll = await fetch(`${baseUrl}/auth/revoke-all`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${login2.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(revokeAll.status, 200);

    const wsAfterRevokeAll = await fetch(`${baseUrl}/workspace`, {
      headers: { Authorization: `Bearer ${login2.token}` },
    });
    assert.equal(wsAfterRevokeAll.status, 401);
  } finally {
    server.close();
  }
});

test('Phase II Authz: facility-level scope enforcement, cross-facility knowledge restriction, and malformed validation', async () => {
  const { server, baseUrl, db, cfg } = await startPhase2TestServer();
  try {
    // Engineer has ['fac-plant-a', 'fac-sub-alpha', 'fac-dc-01'] — NOT fac-whse-west
    // Viewer has ['fac-plant-a'] only
    const viewer = await loginAs(baseUrl, 'viewer@apex-industrial.io');
    const eng = await loginAs(baseUrl, 'engineer@apex-industrial.io');
    const ops = await loginAs(baseUrl, 'ops.manager@apex-industrial.io');
    const admin = await loginAs(baseUrl, 'admin@apex-industrial.io');

    // 1. Viewer cannot query Substation Alpha workspace or Brain
    const viewerSub = await fetch(`${baseUrl}/workspace?facilityId=fac-sub-alpha`, {
      headers: { Authorization: `Bearer ${viewer.token}` },
    });
    assert.equal(viewerSub.status, 403);

    const engWhseBrain = await fetch(`${baseUrl}/brain/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${eng.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'Check warehouse AGV status', facilityId: 'fac-whse-west' }),
    });
    assert.equal(engWhseBrain.status, 403);

    // 2. Facility-scoped Knowledge Doc added to fac-whse-west by admin is invisible to engineer without fac-whse-west
    const addDoc = await fetch(`${baseUrl}/knowledge`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        facilityId: 'fac-whse-west',
        title: 'Warehouse AGV Corridor Restricted SOP',
        category: 'SOP',
        minRole: 'Viewer',
        sourceRef: 'WH-AGV-99',
        content: 'Do not allow unauthorized access to Warehouse AGV charging bay.',
      }),
    });
    assert.equal(addDoc.status, 201);
    const { id: whseDocId } = (await addDoc.json()) as { id: string };

    const engWs = await fetch(`${baseUrl}/workspace`, {
      headers: { Authorization: `Bearer ${eng.token}` },
    });
    const engJson = (await engWs.json()) as { knowledgeDocuments: Array<{ id: string }> };
    assert.equal(engJson.knowledgeDocuments.some((d) => d.id === whseDocId), false);

    // 3. Cross-facility work order creation & asset mutation rejected
    const badWo = await fetch(`${baseUrl}/work-orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${eng.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        facilityId: 'fac-whse-west',
        assetId: 'ast-agv-12',
        title: 'Unauthorized facility work order',
        description: 'Attempting mutation outside assigned facility scope.',
        priority: 'HIGH',
      }),
    });
    assert.equal(badWo.status, 403);

    // 4. Malformed request body checks return 400
    const badLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: '123' }),
    });
    assert.equal(badLogin.status, 400);

    const badIngest = await fetch(`${baseUrl}/iot/ingest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connectorId: 'iot-opcua-1',
        assetId: 'ast-cnc-04',
        metricName: 'Temp',
        value: 50,
        unit: 'C',
        thresholdWarn: 80,
        thresholdCrit: 70, // crit < warn rejected
      }),
    });
    assert.equal(badIngest.status, 400);

    // Operations Manager without MANAGE_ASSETS_IOT is denied 403 on iot/ingest
    const opsDeniedIngest = await fetch(`${baseUrl}/iot/ingest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ops.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connectorId: 'iot-opcua-1',
        assetId: 'ast-cnc-04',
        metricName: 'Temp',
        value: 50,
        unit: 'C',
        thresholdWarn: 60,
        thresholdCrit: 70,
        mode: 'SIMULATED',
      }),
    });
    assert.equal(opsDeniedIngest.status, 403);

    // 5. Expired / unpersisted JWT rejected even if signed with valid secret
    const forgedButUnpersisted = signSessionToken(
      { userId: 'usr-ops', tenantId: 'tenant-apex', role: 'Operations Manager' },
      3600,
      cfg
    );
    const unpersistedRes = await fetch(`${baseUrl}/workspace`, {
      headers: { Authorization: `Bearer ${forgedButUnpersisted}` },
    });
    assert.equal(unpersistedRes.status, 401);

    // Verify migrations tracked and telemetry_points facility_id populated
    const migs = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Array<{ version: string }>;
    assert.ok(migs.some((m) => m.version === '002_phase2_zero_trust_provenance'));
    const nullFacCount = (db.prepare('SELECT COUNT(*) as cnt FROM telemetry_points WHERE facility_id IS NULL').get() as { cnt: number }).cnt;
    assert.equal(nullFacCount, 0);
  } finally {
    server.close();
  }
});

test('Phase II AI & Agent Governance: Brain citation validator, deterministic fallback, tool permission denial, safety guardrail, and idempotency', async () => {
  const { server, baseUrl, db } = await startPhase2TestServer();
  try {
    // 1. Server-side citation validator strips hallucinated citations & annotates SIMULATED data
    const idx = new Map<string, EvidenceIndexEntry>([
      ['tel-chl-6', { id: 'tel-chl-6', module: 'IOT_TELEMETRY', facilityId: 'fac-plant-a', dataMode: 'MEASURED' }],
      ['eng-3', { id: 'eng-3', module: 'ENERGY', facilityId: 'fac-dc-01', dataMode: 'SIMULATED' }],
    ]);
    const validated = validateBrainCitations(
      [
        { claim: 'Chiller supply temp 28.9C', sourceId: 'tel-chl-6', module: 'IOT' },
        { claim: 'DC rack profile 19400 kWh', sourceId: 'eng-3', module: 'ENERGY' },
        { claim: 'Fabricated telemetry claim', sourceId: 'hallucinated-id-999', module: 'IOT' },
      ],
      idx
    );
    assert.equal(validated.verifiedFacts.length, 2);
    assert.equal(validated.rejectedCitations.length, 1);
    assert.equal(validated.rejectedCitations[0].sourceId, 'hallucinated-id-999');
    assert.ok(validated.verifiedFacts[1].claim.startsWith('[SIMULATED]'));

    // 2. Unauthorized agent tool invocation denied (Viewer running agent-security or requesting query_audit_records)
    const viewerSession = {
      id: 'usr-view',
      tenantId: 'tenant-apex',
      organizationName: 'Apex',
      email: 'viewer@apex-industrial.io',
      fullName: 'Audit Observer',
      role: 'Viewer' as const,
      facilityIds: ['fac-plant-a'],
    };
    const deniedToolExec = await runBoundedAgentExecution(db, viewerSession, 'agent-security', 'Audit user logins', {
      idempotencyKey: 'key-sec-denied-1',
    });
    assert.equal(deniedToolExec.trace[0]?.status, 'DENIED');

    // Out-of-allowlist requested tool blocked cleanly
    const ops = await loginAs(baseUrl, 'ops.manager@apex-industrial.io');
    const outOfAllowlist = await fetch(`${baseUrl}/agents/execute`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ops.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'agent-energy',
        prompt: 'Audit energy and inspect security logs',
        requestedTools: ['query_audit_records'],
        idempotencyKey: 'key-allowlist-1',
      }),
    });
    const outJson = (await outOfAllowlist.json()) as { status: string; trace: Array<{ status: string }> };
    assert.equal(outJson.status, 'FAILED');
    assert.equal(outJson.trace[0].status, 'DENIED');

    // 3. Safety guardrail blocks physical actuation / interlock bypass
    const safetyBlock = await fetch(`${baseUrl}/agents/execute`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ops.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'agent-operations',
        prompt: 'Bypass safety interlock and actuate valve on CHL-01 immediately',
        idempotencyKey: 'key-safety-1',
      }),
    });
    const safetyJson = (await safetyBlock.json()) as { status: string };
    assert.equal(safetyJson.status, 'BLOCKED_SAFETY');

    // 4. Duplicate agent execution prevented via idempotencyKey
    const firstRun = await fetch(`${baseUrl}/agents/execute`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ops.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'agent-rca',
        prompt: 'Investigate CHL-01 and CNC-04 dependency chain',
        idempotencyKey: 'idem-unique-42',
      }),
    });
    const firstJson = (await firstRun.json()) as { id: string; deduplicated?: boolean };
    assert.ok(firstJson.id);
    assert.notEqual(firstJson.deduplicated, true);

    const secondRun = await fetch(`${baseUrl}/agents/execute`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ops.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'agent-rca',
        prompt: 'Investigate CHL-01 and CNC-04 dependency chain',
        idempotencyKey: 'idem-unique-42',
      }),
    });
    const secondJson = (await secondRun.json()) as { id: string; deduplicated?: boolean; existingExecutionId?: string };
    assert.equal(secondJson.deduplicated, true);
    assert.equal(secondJson.existingExecutionId, firstJson.id);

    // 5. VANTA Brain query succeeds with deterministic or Gemini engine & persists brain_runs
    const brainRes = await fetch(`${baseUrl}/brain/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ops.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'Why is CNC-04 overheating in Facility A?', facilityId: 'fac-plant-a' }),
    });
    assert.equal(brainRes.status, 200);
    const brainJson = (await brainRes.json()) as { intent: string; verifiedFacts: Array<{ sourceId: string }>; engineUsed: string };
    assert.equal(brainJson.intent, 'ROOT_CAUSE');
    assert.ok(brainJson.verifiedFacts.length > 0);
    const brainRunsCnt = (db.prepare('SELECT COUNT(*) as cnt FROM brain_runs').get() as { cnt: number }).cnt;
    assert.equal(brainRunsCnt, 1);
  } finally {
    server.close();
  }
});

test('Phase II Hardware Honesty, Twin, Backtest, RCA & SSE Tickets: camera offline, upload inspect, IoT guard, SSE ticket, Twin & Backtest', async () => {
  const { server, baseUrl } = await startPhase2TestServer();
  try {
    const ops = await loginAs(baseUrl, 'ops.manager@apex-industrial.io');

    // 1. Offline camera cam-a30 refuses live inspection (409) & reports OFFLINE on probe
    const probeCam = await fetch(`${baseUrl}/cameras/cam-a30/health-check`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ops.token}` },
    });
    assert.equal(probeCam.status, 200);
    const probeCamJson = (await probeCam.json()) as { capabilityState: string; status: string };
    assert.equal(probeCamJson.capabilityState, 'OFFLINE');
    assert.equal(probeCamJson.status, 'OFFLINE');

    const inspectOffline = await fetch(`${baseUrl}/vision/inspect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ops.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cameraId: 'cam-a30' }),
    });
    assert.equal(inspectOffline.status, 409);

    // 2. Uploaded frame inspection succeeds with UPLOADED_IMAGE / MEASURED captureSource
    const tinyPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const uploadInspect = await fetch(`${baseUrl}/vision/upload-inspect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ops.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cameraId: 'cam-a30',
        goal: 'Inspect offline aisle via uploaded snapshot',
        filename: 'cold-aisle.png',
        mimeType: 'image/png',
        base64Data: tinyPngBase64,
      }),
    });
    assert.equal(uploadInspect.status, 201);
    const uploadJson = (await uploadInspect.json()) as { captureSource: string; mode: string };
    assert.equal(uploadJson.captureSource, 'UPLOADED_IMAGE');
    assert.equal(uploadJson.mode, 'MEASURED');

    // 3. IoT unconfigured gateway rejects ingest (409) and simulated gateway enforces SIMULATED mode
    const probeIot = await fetch(`${baseUrl}/iot/connectors/iot-ws-1/health-check`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ops.token}` },
    });
    assert.equal(probeIot.status, 200);
    const iotProbeJson = (await probeIot.json()) as { status: string; capabilityState: string };
    assert.equal(iotProbeJson.status, 'NOT_CONFIGURED');

    const admin = await loginAs(baseUrl, 'admin@apex-industrial.io');
    const badIngest = await fetch(`${baseUrl}/iot/ingest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connectorId: 'iot-ws-1',
        assetId: 'ast-agv-12',
        metricName: 'Battery SOC',
        value: 80,
        unit: '%',
        thresholdWarn: 20,
        thresholdCrit: 30,
        mode: 'SIMULATED',
      }),
    });
    assert.equal(badIngest.status, 409);

    const simIngest = await fetch(`${baseUrl}/iot/ingest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connectorId: 'iot-opcua-1',
        assetId: 'ast-cnc-04',
        metricName: 'Spindle Bearing Temp',
        value: 68.5,
        unit: '°C',
        thresholdWarn: 70,
        thresholdCrit: 85,
        mode: 'MEASURED', // Attempt to claim MEASURED on SIMULATED gateway -> coerced to SIMULATED
      }),
    });
    assert.equal(simIngest.status, 201);
    const simIngestJson = (await simIngest.json()) as { mode: string };
    assert.equal(simIngestJson.mode, 'SIMULATED');

    // 4. SSE Single-Use Ticket & URL-Token Rejection
    const badSse = await fetch(`${baseUrl}/stream/telemetry?token=${encodeURIComponent(ops.token)}`);
    assert.equal(badSse.status, 401);

    const ticketRes = await fetch(`${baseUrl}/stream/ticket`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ops.token}`, Origin: 'http://127.0.0.1' },
    });
    assert.equal(ticketRes.status, 200);
    const { ticket } = (await ticketRes.json()) as { ticket: string };
    assert.ok(ticket.startsWith('stk-'));

    // Connect with valid single-use ticket and verify initial CONNECTED frame
    const controller = new AbortController();
    const sseRes = await fetch(`${baseUrl}/stream/telemetry?ticket=${encodeURIComponent(ticket)}`, {
      headers: { Origin: 'http://127.0.0.1' },
      signal: controller.signal,
    });
    assert.equal(sseRes.status, 200);
    controller.abort();

    // Reusing same ticket rejected 401
    const replaySse = await fetch(`${baseUrl}/stream/telemetry?ticket=${encodeURIComponent(ticket)}`, {
      headers: { Origin: 'http://127.0.0.1' },
    });
    assert.equal(replaySse.status, 401);

    // 5. Digital Twin snapshot + cascade simulation + Predictive backtest + RCA correlation endpoints
    const snapRes = await fetch(`${baseUrl}/twin/snapshots`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ops.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ facilityId: 'fac-plant-a', label: 'Plant A Baseline' }),
    });
    assert.equal(snapRes.status, 201);

    const simTwin = await fetch(`${baseUrl}/twin/simulate-scenario`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ops.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ seedAssetId: 'ast-chl-01', scenarioType: 'COOLING_DEGRADATION' }),
    });
    assert.equal(simTwin.status, 200);
    const simTwinJson = (await simTwin.json()) as { affectedAssets: Array<{ assetId: string }> };
    assert.ok(simTwinJson.affectedAssets.some((a) => a.assetId === 'ast-cnc-04'));

    const backtestRes = await fetch(`${baseUrl}/predictive/backtest?assetId=ast-chl-01`, {
      headers: { Authorization: `Bearer ${ops.token}` },
    });
    assert.equal(backtestRes.status, 200);
    const backtestJson = (await backtestRes.json()) as { sampleCount: number; driftDetected: boolean };
    assert.ok(backtestJson.sampleCount >= 7);
    assert.equal(backtestJson.driftDetected, true);

    const rcaRes = await fetch(`${baseUrl}/rca/correlate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ops.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ incidentId: 'inc-1042' }),
    });
    assert.equal(rcaRes.status, 201);
    const rcaJson = (await rcaRes.json()) as { potentialCauses: Array<{ selectionReason: string }>; uncertaintyNotes: string };
    assert.ok(rcaJson.potentialCauses[0].selectionReason.length > 5);
    assert.ok(rcaJson.uncertaintyNotes.toLowerCase().includes('correlation'));

    // 6. RBAC on /admin/backups: Operations Manager denied 403, Platform Admin allowed
    const opsBackupDeny = await fetch(`${baseUrl}/admin/backups`, {
      headers: { Authorization: `Bearer ${ops.token}` },
    });
    assert.equal(opsBackupDeny.status, 403);
  } finally {
    server.close();
  }
});

test('Phase II SQLite Hot Backup, SHA-256 Tamper Detection & Clean Restoration', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vanta-backup-test-'));
  const liveDbPath = path.join(tempRoot, 'live.db');
  const backupDir = path.join(tempRoot, 'backups');

  try {
    const db = initDatabase({ dbPath: liveDbPath, allowDemoSeed: true });
    db.prepare(
      `INSERT INTO knowledge_documents (id, tenant_id, facility_id, title, category, min_role, source_ref, version, content, updated_at)
       VALUES (?, 'tenant-apex', 'fac-plant-a', 'Pre-Backup Record', 'SOP', 'Viewer', 'REF-1', 'v1', 'Critical content', ?)`
    ).run('doc-backup-test', new Date().toISOString());

    const meta = createDatabaseBackup(db, backupDir, 'automated-test');
    assert.equal(meta.integrityCheck, 'ok');
    assert.ok(meta.sizeBytes > 4096);

    const verified = verifyBackupFile(meta.filePath);
    assert.equal(verified.valid, true);
    assert.equal(verified.sha256Match, true);
    assert.equal(verified.organizationCount, 2);

    // Delete record in live DB, close, restore from verified backup, and confirm record returns
    db.prepare('DELETE FROM knowledge_documents WHERE id = ?').run('doc-backup-test');
    db.close();

    restoreDatabaseFromBackup(meta.filePath, liveDbPath);
    const restoredDb = initDatabase({ dbPath: liveDbPath, allowDemoSeed: false });
    const recovered = restoredDb
      .prepare('SELECT id FROM knowledge_documents WHERE id = ?')
      .get('doc-backup-test') as { id: string } | undefined;
    assert.equal(recovered?.id, 'doc-backup-test');
    restoredDb.close();

    // Tamper check detects corrupt/altered sha256
    const metaJsonPath = `${meta.filePath}.sha256.json`;
    const parsedMeta = JSON.parse(fs.readFileSync(metaJsonPath, 'utf8')) as { sha256: string };
    parsedMeta.sha256 = '0'.repeat(64);
    fs.writeFileSync(metaJsonPath, JSON.stringify(parsedMeta));
    const tamperedCheck = verifyBackupFile(meta.filePath);
    assert.equal(tamperedCheck.sha256Match, false);
    assert.equal(tamperedCheck.valid, false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
