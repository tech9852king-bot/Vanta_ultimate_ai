import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { initDatabase } from './db';
import { createApiRouter } from './routes';

function startTestServer() {
  const db = initDatabase(':memory:');
  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter(db));
  const server = http.createServer(app);
  return new Promise<{ server: http.Server; baseUrl: string }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/api` });
    });
  });
}

test('API enforces auth, tenant isolation, RBAC, and persisted approval workflows', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    // 1. Unauthenticated access rejected
    const unauthRes = await fetch(`${baseUrl}/workspace`);
    assert.equal(unauthRes.status, 401);

    // 2. Login as Tenant 1 Operations Manager
    const loginApex = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'ops.manager@apex-industrial.io',
        password: 'VantaDemo!2026',
      }),
    });
    assert.equal(loginApex.status, 200);
    const apexData = (await loginApex.json()) as { token: string; user: { tenantId: string } };
    assert.equal(apexData.user.tenantId, 'tenant-apex');

    // 3. Login as Tenant 2 Facility Admin & verify strict isolation
    const loginMeridian = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'facility.admin@meridian-infra.io',
        password: 'VantaDemo!2026',
      }),
    });
    assert.equal(loginMeridian.status, 200);
    const meridianData = (await loginMeridian.json()) as { token: string; user: { tenantId: string } };
    assert.equal(meridianData.user.tenantId, 'tenant-meridian');

    const meridianWs = await fetch(`${baseUrl}/workspace`, {
      headers: { Authorization: `Bearer ${meridianData.token}` },
    });
    const meridianJson = (await meridianWs.json()) as {
      assets: Array<{ id: string; tenantId: string }>;
      incidents: Array<{ id: string }>;
    };
    assert.ok(meridianJson.assets.length > 0);
    assert.ok(meridianJson.assets.every((a) => a.tenantId === 'tenant-meridian'));
    assert.equal(meridianJson.incidents.some((i) => i.id === 'inc-1042'), false);

    // 4. Verify Viewer RBAC denial on approval & restricted knowledge docs
    const loginViewer = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'viewer@apex-industrial.io',
        password: 'VantaDemo!2026',
      }),
    });
    const viewerData = (await loginViewer.json()) as { token: string };

    const viewerWs = await fetch(`${baseUrl}/workspace`, {
      headers: { Authorization: `Bearer ${viewerData.token}` },
    });
    const viewerJson = (await viewerWs.json()) as {
      knowledgeDocuments: Array<{ id: string }>;
    };
    // doc-2 requires Infrastructure Engineer role
    assert.equal(viewerJson.knowledgeDocuments.some((d) => d.id === 'doc-2'), false);

    const denyApprove = await fetch(`${baseUrl}/approvals/apr-201/decide`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${viewerData.token}`,
      },
      body: JSON.stringify({ decision: 'APPROVED' }),
    });
    assert.equal(denyApprove.status, 403);

    // 5. Operations Manager approves apr-201 & verifies persisted state
    const approveRes = await fetch(`${baseUrl}/approvals/apr-201/decide`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apexData.token}`,
      },
      body: JSON.stringify({ decision: 'APPROVED', notes: 'LOTO verified on CHL-01.' }),
    });
    assert.equal(approveRes.status, 200);

    const updatedWs = await fetch(`${baseUrl}/workspace`, {
      headers: { Authorization: `Bearer ${apexData.token}` },
    });
    const updatedJson = (await updatedWs.json()) as {
      approvals: Array<{ id: string; status: string }>;
      workOrders: Array<{ id: string; status: string }>;
    };
    const apr = updatedJson.approvals.find((a) => a.id === 'apr-201');
    const wo = updatedJson.workOrders.find((w) => w.id === 'wo-401');
    assert.equal(apr?.status, 'APPROVED');
    assert.equal(wo?.status, 'APPROVED');
  } finally {
    server.close();
  }
});
