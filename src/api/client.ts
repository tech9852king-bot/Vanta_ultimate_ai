import type {
  BrainAnalysisResponse,
  GeminiProviderVerificationReport,
  IndustrySector,
  PredictiveBacktestResult,
  TwinScenarioResult,
  UserSession,
} from '../core/types';
import type {
  AuthSessionResponse,
  BackupMetadataDto,
  SystemHealthStatus,
  WorkspaceData,
} from '../types/workspace';

const TOKEN_STORAGE_KEY = 'vanta_auth_token';
let inMemoryToken: string | null = null;

export function getAuthToken(): string | null {
  if (inMemoryToken) return inMemoryToken;
  try {
    const stored = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) {
      inMemoryToken = stored;
      return stored;
    }
  } catch {
    // Ignore storage restrictions in sandboxed iframes
  }
  return null;
}

export function setAuthToken(token: string | null): void {
  inMemoryToken = token;
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restrictions in sandboxed iframes
  }
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: 'include',
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const vantaApi = {
  getAuthConfig: () =>
    apiJson<{ allowDemoAuth: boolean; nodeEnv: string; geminiConfigured: boolean }>('/api/auth/config'),
  getSession: async () => {
    const res = await apiJson<AuthSessionResponse & { token?: string | null }>('/api/auth/session');
    if (res.authenticated && res.token) {
      setAuthToken(res.token);
    }
    return res;
  },
  login: async (email: string, password: string) => {
    const res = await apiJson<{ authenticated: boolean; user: UserSession; token?: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (res.token) {
      setAuthToken(res.token);
    }
    return res;
  },
  registerOrganization: async (payload: {
    organizationName: string;
    industry: IndustrySector;
    region: string;
    fullName: string;
    email: string;
    password: string;
  }) => {
    const res = await apiJson<{ authenticated: boolean; user: UserSession; token?: string }>(
      '/api/auth/register-organization',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    if (res.token) {
      setAuthToken(res.token);
    }
    return res;
  },
  logout: async () => {
    try {
      await apiJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
    } finally {
      setAuthToken(null);
    }
    return { ok: true };
  },
  revokeAllSessions: async (userId?: string) => {
    const res = await apiJson<{ ok: boolean; revokedUserId: string }>('/api/auth/revoke-all', {
      method: 'POST',
      body: JSON.stringify(userId ? { userId } : {}),
    });
    if (!userId) {
      setAuthToken(null);
    }
    return res;
  },
  getStreamTicket: () =>
    apiJson<{ ticket: string; expiresInSeconds: number }>('/api/stream/ticket', {
      method: 'POST',
    }),
  getHealth: () => apiJson<SystemHealthStatus>('/api/health'),
  getWorkspace: (facilityId: string) =>
    apiJson<WorkspaceData>(`/api/workspace?facilityId=${encodeURIComponent(facilityId)}`),
  queryBrain: (query: string, facilityId: string) =>
    apiJson<BrainAnalysisResponse>('/api/brain/query', {
      method: 'POST',
      body: JSON.stringify({ query, facilityId }),
    }),
  verifyBrainProvider: () =>
    apiJson<GeminiProviderVerificationReport>('/api/brain/verify-provider', {
      method: 'POST',
    }),
  inspectCamera: (cameraId: string, goal: string) =>
    apiJson<Record<string, unknown>>('/api/vision/inspect', {
      method: 'POST',
      body: JSON.stringify({ cameraId, goal }),
    }),
  uploadInspectCamera: (payload: {
    cameraId: string;
    goal: string;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    base64Data: string;
    filename: string;
  }) =>
    apiJson<Record<string, unknown>>('/api/vision/upload-inspect', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  probeCameraHealth: (cameraId: string) =>
    apiJson<{
      cameraId: string;
      capabilityState: string;
      status: string;
      streamHealthPct: number;
      lastError: string | null;
      checkedAt: string;
    }>(`/api/cameras/${encodeURIComponent(cameraId)}/health-check`, { method: 'POST' }),
  probeIotConnector: (connectorId: string) =>
    apiJson<{
      connectorId: string;
      protocol: string;
      status: string;
      capabilityState: string;
      latencyMs: number | null;
      consecutiveFailures: number;
      lastError: string | null;
      checkedAt: string;
    }>(`/api/iot/connectors/${encodeURIComponent(connectorId)}/health-check`, { method: 'POST' }),
  simulateTelemetry: (assetId: string, scenario: 'NOMINAL_SAMPLE' | 'THERMAL_SPIKE' | 'VIBRATION_FAULT') =>
    apiJson<Record<string, unknown>>('/api/iot/simulate', {
      method: 'POST',
      body: JSON.stringify({ assetId, scenario }),
    }),
  captureTwinSnapshot: (facilityId: string, label?: string) =>
    apiJson<Record<string, unknown>>('/api/twin/snapshots', {
      method: 'POST',
      body: JSON.stringify({ facilityId, label }),
    }),
  simulateTwinScenario: (
    seedAssetId: string,
    scenarioType: 'ASSET_OFFLINE' | 'COOLING_DEGRADATION' | 'POWER_LOSS'
  ) =>
    apiJson<TwinScenarioResult>('/api/twin/simulate-scenario', {
      method: 'POST',
      body: JSON.stringify({ seedAssetId, scenarioType }),
    }),
  getPredictiveBacktest: (assetId: string) =>
    apiJson<PredictiveBacktestResult>(`/api/predictive/backtest?assetId=${encodeURIComponent(assetId)}`),
  correlateRca: (incidentId: string) =>
    apiJson<Record<string, unknown>>('/api/rca/correlate', {
      method: 'POST',
      body: JSON.stringify({ incidentId }),
    }),
  resolveRca: (
    id: string,
    payload: { humanDecision: string; resolutionRecord: string; outcomeVerification: string }
  ) =>
    apiJson<{ ok: boolean }>(`/api/rca/${encodeURIComponent(id)}/resolve`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  createWorkOrder: (payload: {
    facilityId: string;
    assetId: string;
    title: string;
    description: string;
    priority: string;
  }) =>
    apiJson<{ workOrderId: string; approvalId: string }>('/api/work-orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  decideApproval: (id: string, decision: 'APPROVED' | 'REJECTED', notes: string) =>
    apiJson<{ ok: boolean }>(`/api/approvals/${encodeURIComponent(id)}/decide`, {
      method: 'POST',
      body: JSON.stringify({ decision, notes }),
    }),
  executeWorkOrder: (id: string, executionNotes: string) =>
    apiJson<{ ok: boolean; status: string; executionMode?: string; executedAt: string }>(
      `/api/work-orders/${encodeURIComponent(id)}/execute`,
      {
        method: 'POST',
        body: JSON.stringify({ executionNotes }),
      }
    ),
  requestWorkOrderVerification: (id: string, notes?: string) =>
    apiJson<{ ok: boolean; status: string }>(
      `/api/work-orders/${encodeURIComponent(id)}/request-verification`,
      {
        method: 'POST',
        body: JSON.stringify({ notes }),
      }
    ),
  verifyWorkOrder: (
    id: string,
    payload: {
      verificationStatus: 'VERIFIED' | 'PARTIAL' | 'UNRESOLVED';
      verificationNotes: string;
      downtimeMinutes?: number;
      partsReplaced?: string;
    }
  ) =>
    apiJson<{ ok: boolean; status: string; verificationStatus: string; maintenanceRecordId: string }>(
      `/api/work-orders/${encodeURIComponent(id)}/verify`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),
  cancelWorkOrder: (id: string, reason: string) =>
    apiJson<{ ok: boolean; status: string }>(`/api/work-orders/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  createIncident: (payload: {
    facilityId: string;
    assetId?: string;
    title: string;
    description: string;
    severity: string;
  }) =>
    apiJson<{ id: string }>('/api/incidents', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateIncidentStatus: (id: string, status: 'OPEN' | 'INVESTIGATING' | 'MITIGATED' | 'RESOLVED') =>
    apiJson<{ ok: boolean; status: string }>(`/api/incidents/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  executeAgent: (
    agentId: string,
    prompt: string,
    options?: { idempotencyKey?: string; requestedTools?: string[] }
  ) =>
    apiJson<Record<string, unknown>>('/api/agents/execute', {
      method: 'POST',
      body: JSON.stringify({ agentId, prompt, ...options }),
    }),
  createAsset: (payload: {
    facilityId: string;
    zoneId: string;
    code: string;
    name: string;
    assetType: string;
    manufacturer: string;
    model: string;
    owner: string;
  }) =>
    apiJson<{ id: string }>('/api/assets', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  createKnowledgeDoc: (payload: {
    facilityId: string;
    title: string;
    category: string;
    minRole: string;
    sourceRef: string;
    content: string;
  }) =>
    apiJson<{ id: string }>('/api/knowledge', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listBackups: () => apiJson<{ backups: BackupMetadataDto[] }>('/api/admin/backups'),
  createBackup: (label?: string) =>
    apiJson<BackupMetadataDto>('/api/admin/backups', {
      method: 'POST',
      body: JSON.stringify({ label }),
    }),
  verifyBackup: (filename: string) =>
    apiJson<{ filename: string; valid: boolean; integrityCheck: string; sha256Match: boolean; organizationCount: number }>(
      '/api/admin/backups/verify',
      {
        method: 'POST',
        body: JSON.stringify({ filename }),
      }
    ),
};
