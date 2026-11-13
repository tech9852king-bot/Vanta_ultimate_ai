import type { BrainAnalysisResponse, IndustrySector, UserSession } from '../core/types';
import type { AuthSessionResponse, SystemHealthStatus, WorkspaceData } from '../types/workspace';

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    credentials: 'include',
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const vantaApi = {
  getSession: () => apiJson<AuthSessionResponse>('/api/auth/session'),
  login: (email: string, password: string) =>
    apiJson<{ authenticated: boolean; user: UserSession }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  registerOrganization: (payload: {
    organizationName: string;
    industry: IndustrySector;
    region: string;
    fullName: string;
    email: string;
    password: string;
  }) =>
    apiJson<{ authenticated: boolean; user: UserSession }>('/api/auth/register-organization', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  logout: () => apiJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  getHealth: () => apiJson<SystemHealthStatus>('/api/health'),
  getWorkspace: (facilityId: string) =>
    apiJson<WorkspaceData>(`/api/workspace?facilityId=${encodeURIComponent(facilityId)}`),
  queryBrain: (query: string, facilityId: string) =>
    apiJson<BrainAnalysisResponse>('/api/brain/query', {
      method: 'POST',
      body: JSON.stringify({ query, facilityId }),
    }),
  inspectCamera: (cameraId: string, goal: string) =>
    apiJson<Record<string, unknown>>('/api/vision/inspect', {
      method: 'POST',
      body: JSON.stringify({ cameraId, goal }),
    }),
  simulateTelemetry: (assetId: string, scenario: 'NOMINAL_SAMPLE' | 'THERMAL_SPIKE' | 'VIBRATION_FAULT') =>
    apiJson<Record<string, unknown>>('/api/iot/simulate', {
      method: 'POST',
      body: JSON.stringify({ assetId, scenario }),
    }),
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
  executeAgent: (agentId: string, prompt: string) =>
    apiJson<Record<string, unknown>>('/api/agents/execute', {
      method: 'POST',
      body: JSON.stringify({ agentId, prompt }),
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
};
