/**
 * VANTA AI — Centralized Request & Structured AI Output Validation
 * Rejects malformed inputs, out-of-range numbers, unknown enums, and oversized payloads before persistence.
 */

import type { BrainAnalysisResponse, SeverityLevel, VantaRole } from '../core/types.ts';

export interface ValidationFailure {
  ok: false;
  error: string;
  fields: string[];
}

export interface ValidationSuccess<T> {
  ok: true;
  data: T;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

const ID_RE = /^[a-zA-Z0-9_-]{2,80}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const VALID_ROLES: VantaRole[] = [
  'Platform Administrator',
  'Organization Administrator',
  'Facility Administrator',
  'Infrastructure Engineer',
  'Operations Manager',
  'Security Operator',
  'Maintenance Engineer',
  'Analyst',
  'Viewer',
];

export const VALID_SEVERITIES: SeverityLevel[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
export const VALID_ASSET_TYPES = [
  'PRODUCTION_LINE',
  'MACHINE',
  'EQUIPMENT',
  'SENSOR',
  'DEVICE',
  'ELECTRICAL_ASSET',
  'NETWORK_ASSET',
  'HVAC_CHILLER',
] as const;

export const VALID_KNOWLEDGE_CATEGORIES = [
  'MANUAL',
  'SOP',
  'SPECIFICATION',
  'POSTMORTEM',
  'SAFETY_INTERLOCK',
] as const;

export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && ID_RE.test(value.trim());
}

export function cleanString(value: unknown, minLen: number, maxLen: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length < minLen || trimmed.length > maxLen) return null;
  return trimmed;
}

export function validatePagination(rawLimit: unknown, rawOffset: unknown): { limit: number; offset: number } {
  const limitNum = Number(rawLimit);
  const offsetNum = Number(rawOffset);
  const limit = Number.isFinite(limitNum) ? Math.min(200, Math.max(1, Math.floor(limitNum))) : 50;
  const offset = Number.isFinite(offsetNum) ? Math.max(0, Math.floor(offsetNum)) : 0;
  return { limit, offset };
}

export function validateLoginBody(body: unknown): ValidationResult<{ email: string; password: string }> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Malformed JSON object body.', fields: ['body'] };
  }
  const b = body as Record<string, unknown>;
  const email = cleanString(b.email, 5, 160);
  const password = typeof b.password === 'string' ? b.password : '';
  const fields: string[] = [];
  if (!email || !EMAIL_RE.test(email)) fields.push('email');
  if (!password || password.length < 6 || password.length > 200) fields.push('password');
  if (fields.length > 0) {
    return { ok: false, error: 'Valid enterprise email and password are required.', fields };
  }
  return { ok: true, data: { email: email!, password } };
}

export function validateBrainQueryBody(
  body: unknown
): ValidationResult<{ query: string; facilityId?: string }> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object.', fields: ['body'] };
  }
  const b = body as Record<string, unknown>;
  const query = cleanString(b.query, 3, 1200);
  if (!query) {
    return { ok: false, error: 'Analysis prompt must be 3-1200 characters.', fields: ['query'] };
  }
  if (b.facilityId !== undefined && b.facilityId !== 'ALL' && !isValidId(b.facilityId)) {
    return { ok: false, error: 'Invalid facilityId format.', fields: ['facilityId'] };
  }
  return {
    ok: true,
    data: {
      query,
      facilityId: typeof b.facilityId === 'string' && b.facilityId !== 'ALL' ? b.facilityId.trim() : undefined,
    },
  };
}

export function validateAssetCreateBody(body: unknown): ValidationResult<{
  facilityId: string;
  zoneId: string;
  code: string;
  name: string;
  assetType: (typeof VALID_ASSET_TYPES)[number];
  manufacturer: string;
  model: string;
  owner: string;
}> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object.', fields: ['body'] };
  }
  const b = body as Record<string, unknown>;
  const fields: string[] = [];
  if (!isValidId(b.facilityId)) fields.push('facilityId');
  if (!isValidId(b.zoneId)) fields.push('zoneId');
  const code = cleanString(b.code, 2, 40);
  if (!code) fields.push('code');
  const name = cleanString(b.name, 2, 140);
  if (!name) fields.push('name');
  const rawType = typeof b.assetType === 'string' ? b.assetType : 'EQUIPMENT';
  if (!VALID_ASSET_TYPES.includes(rawType as (typeof VALID_ASSET_TYPES)[number])) {
    fields.push('assetType');
  }
  if (fields.length > 0) {
    return { ok: false, error: `Invalid asset fields: ${fields.join(', ')}`, fields };
  }
  return {
    ok: true,
    data: {
      facilityId: (b.facilityId as string).trim(),
      zoneId: (b.zoneId as string).trim(),
      code: code!,
      name: name!,
      assetType: rawType as (typeof VALID_ASSET_TYPES)[number],
      manufacturer: cleanString(b.manufacturer, 1, 80) || 'Generic Industrial',
      model: cleanString(b.model, 1, 80) || 'Series-1',
      owner: cleanString(b.owner, 1, 80) || 'Operations',
    },
  };
}

export function validateWorkOrderBody(body: unknown): ValidationResult<{
  facilityId: string;
  assetId: string;
  title: string;
  description: string;
  priority: SeverityLevel;
}> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object.', fields: ['body'] };
  }
  const b = body as Record<string, unknown>;
  const fields: string[] = [];
  if (!isValidId(b.facilityId)) fields.push('facilityId');
  if (!isValidId(b.assetId)) fields.push('assetId');
  const title = cleanString(b.title, 3, 180);
  if (!title) fields.push('title');
  const rawPriority = typeof b.priority === 'string' ? b.priority.toUpperCase() : 'MEDIUM';
  if (!VALID_SEVERITIES.includes(rawPriority as SeverityLevel)) {
    fields.push('priority');
  }
  if (fields.length > 0) {
    return { ok: false, error: `Invalid work order fields: ${fields.join(', ')}`, fields };
  }
  return {
    ok: true,
    data: {
      facilityId: (b.facilityId as string).trim(),
      assetId: (b.assetId as string).trim(),
      title: title!,
      description: cleanString(b.description, 1, 1500) || 'Operator-submitted maintenance request.',
      priority: rawPriority as SeverityLevel,
    },
  };
}

export function validateKnowledgeBody(body: unknown): ValidationResult<{
  facilityId: string | null;
  title: string;
  category: (typeof VALID_KNOWLEDGE_CATEGORIES)[number];
  minRole: VantaRole;
  sourceRef: string;
  content: string;
}> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object.', fields: ['body'] };
  }
  const b = body as Record<string, unknown>;
  const fields: string[] = [];
  const title = cleanString(b.title, 3, 200);
  const content = cleanString(b.content, 5, 10000);
  if (!title) fields.push('title');
  if (!content) fields.push('content');
  if (b.facilityId && b.facilityId !== '' && !isValidId(b.facilityId)) {
    fields.push('facilityId');
  }
  const category = (typeof b.category === 'string' ? b.category : 'SOP') as (typeof VALID_KNOWLEDGE_CATEGORIES)[number];
  if (!VALID_KNOWLEDGE_CATEGORIES.includes(category)) fields.push('category');
  const minRole = (typeof b.minRole === 'string' ? b.minRole : 'Viewer') as VantaRole;
  if (!VALID_ROLES.includes(minRole)) fields.push('minRole');

  if (fields.length > 0) {
    return { ok: false, error: `Invalid knowledge record fields: ${fields.join(', ')}`, fields };
  }
  return {
    ok: true,
    data: {
      facilityId: typeof b.facilityId === 'string' && b.facilityId.trim() ? b.facilityId.trim() : null,
      title: title!,
      category,
      minRole,
      sourceRef: cleanString(b.sourceRef, 1, 140) || 'Operator Upload',
      content: content!,
    },
  };
}

export function validateUploadedImagePayload(body: unknown): ValidationResult<{
  cameraId: string;
  goal: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  base64Data: string;
  filename: string;
}> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object.', fields: ['body'] };
  }
  const b = body as Record<string, unknown>;
  const fields: string[] = [];
  if (!isValidId(b.cameraId)) fields.push('cameraId');
  const mimeType = b.mimeType;
  if (mimeType !== 'image/jpeg' && mimeType !== 'image/png' && mimeType !== 'image/webp') {
    fields.push('mimeType');
  }
  const rawData = typeof b.base64Data === 'string' ? b.base64Data.replace(/^data:image\/[a-z]+;base64,/, '') : '';
  if (!rawData || rawData.length < 32 || rawData.length > 2_000_000 || !/^[A-Za-z0-9+/=]+$/.test(rawData)) {
    fields.push('base64Data');
  }
  if (fields.length > 0) {
    return { ok: false, error: `Invalid uploaded image metadata: ${fields.join(', ')}`, fields };
  }
  return {
    ok: true,
    data: {
      cameraId: (b.cameraId as string).trim(),
      goal: cleanString(b.goal, 3, 400) || 'Inspect uploaded plant frame for PPE & equipment state',
      mimeType: mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
      base64Data: rawData,
      filename: cleanString(b.filename, 1, 120) || 'uploaded-frame',
    },
  };
}

export function validateIotIngestBody(body: unknown): ValidationResult<{
  connectorId: string;
  assetId: string;
  metricName: string;
  value: number;
  unit: string;
  thresholdWarn: number;
  thresholdCrit: number;
  mode: 'MEASURED' | 'SIMULATED';
}> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object.', fields: ['body'] };
  }
  const b = body as Record<string, unknown>;
  const fields: string[] = [];
  if (!isValidId(b.connectorId)) fields.push('connectorId');
  if (!isValidId(b.assetId)) fields.push('assetId');
  const metricName = cleanString(b.metricName, 2, 80);
  if (!metricName) fields.push('metricName');
  const value = Number(b.value);
  const thresholdWarn = Number(b.thresholdWarn);
  const thresholdCrit = Number(b.thresholdCrit);
  if (!Number.isFinite(value) || value < -10000 || value > 1_000_000) fields.push('value');
  if (!Number.isFinite(thresholdWarn)) fields.push('thresholdWarn');
  if (!Number.isFinite(thresholdCrit) || thresholdCrit < thresholdWarn) fields.push('thresholdCrit');
  const unit = cleanString(b.unit, 1, 24);
  if (!unit) fields.push('unit');
  const mode = b.mode === 'MEASURED' ? 'MEASURED' : b.mode === 'SIMULATED' ? 'SIMULATED' : null;
  if (!mode) fields.push('mode');

  if (fields.length > 0) {
    return { ok: false, error: `Invalid IoT telemetry payload: ${fields.join(', ')}`, fields };
  }
  return {
    ok: true,
    data: {
      connectorId: (b.connectorId as string).trim(),
      assetId: (b.assetId as string).trim(),
      metricName: metricName!,
      value,
      unit: unit!,
      thresholdWarn,
      thresholdCrit,
      mode: mode!,
    },
  };
}

export function validateStructuredBrainOutput(raw: unknown): {
  verifiedFacts: Array<{ claim: string; sourceId: string; module: string }>;
  observations: string[];
  assumptionsAndHypotheses: string[];
  predictions: string[];
  unknowns: string[];
  recommendations: BrainAnalysisResponse['recommendations'];
  uncertaintyNote: string;
} | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  // Section 5.8: Strictly require all schema arrays and uncertaintyNote to be present with valid types
  if (
    !Array.isArray(obj.verifiedFacts) ||
    !Array.isArray(obj.observations) ||
    !Array.isArray(obj.assumptionsAndHypotheses) ||
    !Array.isArray(obj.predictions) ||
    !Array.isArray(obj.unknowns) ||
    !Array.isArray(obj.recommendations) ||
    typeof obj.uncertaintyNote !== 'string' ||
    obj.uncertaintyNote.trim().length === 0
  ) {
    return null;
  }

  for (const item of obj.verifiedFacts) {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof (item as Record<string, unknown>).claim !== 'string' ||
      typeof (item as Record<string, unknown>).sourceId !== 'string' ||
      typeof (item as Record<string, unknown>).module !== 'string'
    ) {
      return null;
    }
  }

  const verifiedFacts = obj.verifiedFacts
    .map((f) => {
      const rec = f as Record<string, unknown>;
      return {
        claim: String(rec.claim).trim().slice(0, 600),
        sourceId: String(rec.sourceId).trim().slice(0, 120),
        module: String(rec.module).trim().slice(0, 80) || 'CORE',
      };
    })
    .filter((f) => f.claim.length > 0 && f.sourceId.length > 0);

  const toStringList = (val: unknown[]): string[] | null => {
    const out: string[] = [];
    for (const s of val) {
      if (typeof s !== 'string') return null;
      const trimmed = s.trim().slice(0, 600);
      if (trimmed.length > 0) out.push(trimmed);
    }
    return out;
  };

  const observations = toStringList(obj.observations);
  const assumptionsAndHypotheses = toStringList(obj.assumptionsAndHypotheses);
  const predictions = toStringList(obj.predictions);
  const unknowns = toStringList(obj.unknowns);

  if (!observations || !assumptionsAndHypotheses || !predictions || !unknowns) {
    return null;
  }

  if (observations.length === 0 && verifiedFacts.length === 0) {
    return null;
  }

  const recommendations: BrainAnalysisResponse['recommendations'] = [];
  for (const r of obj.recommendations) {
    if (!r || typeof r !== 'object') return null;
    const rec = r as Record<string, unknown>;
    if (
      typeof rec.action !== 'string' ||
      typeof rec.priority !== 'string' ||
      typeof rec.requiresHumanApproval !== 'boolean' ||
      typeof rec.rationale !== 'string'
    ) {
      return null;
    }
    const upperPriority = rec.priority.trim().toUpperCase() as SeverityLevel;
    if (!VALID_SEVERITIES.includes(upperPriority)) {
      return null;
    }
    const action = rec.action.trim().slice(0, 500);
    if (action.length > 0) {
      recommendations.push({
        action,
        priority: upperPriority,
        requiresHumanApproval: rec.requiresHumanApproval,
        rationale: rec.rationale.trim().slice(0, 600),
      });
    }
  }

  return {
    verifiedFacts,
    observations,
    assumptionsAndHypotheses,
    predictions,
    unknowns,
    recommendations,
    uncertaintyNote: obj.uncertaintyNote.trim().slice(0, 800),
  };
}
