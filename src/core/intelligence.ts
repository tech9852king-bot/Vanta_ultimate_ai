/**
 * VANTA AI — Pure Core Intelligence & Safety Rules Engine
 * Deterministic, side-effect-free engineering math, RBAC, RUL, energy, and RCA logic.
 */

import type {
  Asset,
  AssetRelationship,
  EnergyRecord,
  Incident,
  InfrastructureEvent,
  MaintenanceRecord,
  SeverityLevel,
  TelemetryPoint,
  VantaRole,
} from './types';

export interface AnomalyResult {
  mean: number;
  stdDev: number;
  zScore: number;
  isAnomaly: boolean;
  severity: SeverityLevel;
}

/**
 * Statistical z-score anomaly detection against historical baseline readings.
 * Uses sample standard deviation with floor epsilon to avoid division by zero on flat signals.
 */
export function computeZScoreAnomaly(
  baselineValues: number[],
  currentValue: number,
  thresholdWarn: number,
  thresholdCrit: number
): AnomalyResult {
  if (baselineValues.length === 0) {
    const isCrit = currentValue >= thresholdCrit;
    const isWarn = currentValue >= thresholdWarn;
    return {
      mean: currentValue,
      stdDev: 0,
      zScore: 0,
      isAnomaly: isCrit || isWarn,
      severity: isCrit ? 'CRITICAL' : isWarn ? 'HIGH' : 'INFO',
    };
  }

  const n = baselineValues.length;
  const mean = baselineValues.reduce((acc, v) => acc + v, 0) / n;
  const variance =
    n > 1
      ? baselineValues.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (n - 1)
      : 0;
  const stdDev = Math.sqrt(variance);
  const safeStd = Math.max(stdDev, Math.abs(mean) * 0.015, 0.05);
  const zScore = Number(((currentValue - mean) / safeStd).toFixed(2));
  const absZ = Math.abs(zScore);

  const exceedsCrit = currentValue >= thresholdCrit || absZ >= 3.2;
  const exceedsWarn = currentValue >= thresholdWarn || absZ >= 2.1;

  let severity: SeverityLevel = 'INFO';
  if (exceedsCrit) severity = 'CRITICAL';
  else if (exceedsWarn) severity = 'HIGH';
  else if (absZ >= 1.5) severity = 'MEDIUM';

  return {
    mean: Number(mean.toFixed(2)),
    stdDev: Number(stdDev.toFixed(2)),
    zScore,
    isAnomaly: exceedsCrit || exceedsWarn,
    severity,
  };
}

export interface RulEstimationInput {
  assetName: string;
  currentValue: number;
  nominalValue: number;
  criticalThreshold: number;
  recentSlopePerHour: number;
  hoursSinceLastMaintenance: number;
  maintenanceIntervalHours: number;
}

export interface RulEstimationOutput {
  riskScore: number;
  rulHours: number;
  uncertaintyHours: number;
  failureMode: string;
  methodology: string;
  recommendedAction: string;
}

/**
 * Engineering-grade Remaining Useful Life (RUL) estimator combining threshold headroom,
 * degradation rate, and maintenance cycle utilization. Exposes explicit uncertainty.
 */
export function estimateRemainingUsefulLife(input: RulEstimationInput): RulEstimationOutput {
  const span = Math.max(input.criticalThreshold - input.nominalValue, 1);
  const stressRatio = Math.max(0, (input.currentValue - input.nominalValue) / span);
  const cycleRatio = Math.max(
    0,
    input.hoursSinceLastMaintenance / Math.max(input.maintenanceIntervalHours, 1)
  );

  // Compute remaining headroom in hours if degrading
  const headroom = Math.max(0, input.criticalThreshold - input.currentValue);
  let rulHours: number;
  if (input.recentSlopePerHour > 0.01) {
    rulHours = Math.round(headroom / input.recentSlopePerHour);
  } else {
    const remainingCycle = Math.max(24, input.maintenanceIntervalHours - input.hoursSinceLastMaintenance);
    rulHours = Math.round(remainingCycle * Math.max(0.25, 1 - stressRatio * 0.65));
  }
  rulHours = Math.max(4, Math.min(4380, rulHours));

  const uncertaintyHours = Math.max(
    4,
    Math.round(rulHours * (input.recentSlopePerHour > 0.01 ? 0.18 : 0.28))
  );

  const rawRisk = stressRatio * 62 + Math.min(cycleRatio, 1.2) * 28 + (input.recentSlopePerHour > 0.05 ? 12 : 0);
  const riskScore = Math.max(5, Math.min(99, Math.round(rawRisk)));

  let failureMode = 'Nominal Mechanical / Thermal Wear';
  if (riskScore >= 75) {
    failureMode = 'Accelerated Threshold Breach / Bearing or Thermal Fatigue';
  } else if (riskScore >= 45) {
    failureMode = 'Elevated Drift Above Nominal Operating Envelope';
  }

  let recommendedAction = 'Continue scheduled condition monitoring.';
  if (riskScore >= 75) {
    recommendedAction = `Schedule immediate inspection and prepare preventive work order for ${input.assetName} within ${Math.max(4, Math.round(rulHours * 0.5))}h.`;
  } else if (riskScore >= 45) {
    recommendedAction = `Increase telemetry sampling cadence and inspect ${input.assetName} at next planned maintenance window.`;
  }

  return {
    riskScore,
    rulHours,
    uncertaintyHours,
    failureMode,
    methodology:
      'Linear Headroom Degradation + Maintenance Interval Utilization (Rule-Verified Statistical Model)',
    recommendedAction,
  };
}

export interface EnergySummary {
  measuredKwh: number;
  estimatedKwh: number;
  simulatedKwh: number;
  totalKwh: number;
  verifiedBaselineKwh: number;
  peakDemandKw: number;
  avgPowerFactor: number;
  baselineDeltaPct: number | null;
  savingsClaimPermitted: boolean;
  methodologyNote: string;
}

/**
 * Strictly separates measured, estimated, and simulated energy consumption.
 * Refuses to claim financial/efficiency savings unless verified measured baseline exists.
 */
export function computeEnergySummary(records: EnergyRecord[]): EnergySummary {
  let measuredKwh = 0;
  let estimatedKwh = 0;
  let simulatedKwh = 0;
  let measuredBaselineKwh = 0;
  let peakDemandKw = 0;
  let pfSum = 0;

  for (const r of records) {
    if (r.mode === 'MEASURED') {
      measuredKwh += r.consumptionKwh;
      measuredBaselineKwh += r.baselineKwh;
    } else if (r.mode === 'ESTIMATED') {
      estimatedKwh += r.consumptionKwh;
    } else {
      simulatedKwh += r.consumptionKwh;
    }
    if (r.peakDemandKw > peakDemandKw) {
      peakDemandKw = r.peakDemandKw;
    }
    pfSum += r.powerFactor;
  }

  const totalKwh = Number((measuredKwh + estimatedKwh + simulatedKwh).toFixed(1));
  const avgPowerFactor = records.length > 0 ? Number((pfSum / records.length).toFixed(3)) : 0;

  // Baseline comparison is strictly permitted only when measured data & baseline exist
  const savingsClaimPermitted = measuredKwh > 0 && measuredBaselineKwh > 0;
  const baselineDeltaPct = savingsClaimPermitted
    ? Number((((measuredKwh - measuredBaselineKwh) / measuredBaselineKwh) * 100).toFixed(1))
    : null;

  return {
    measuredKwh: Number(measuredKwh.toFixed(1)),
    estimatedKwh: Number(estimatedKwh.toFixed(1)),
    simulatedKwh: Number(simulatedKwh.toFixed(1)),
    totalKwh,
    verifiedBaselineKwh: Number(measuredBaselineKwh.toFixed(1)),
    peakDemandKw: Number(peakDemandKw.toFixed(1)),
    avgPowerFactor,
    baselineDeltaPct,
    savingsClaimPermitted,
    methodologyNote: savingsClaimPermitted
      ? 'Delta computed strictly against verified MEASURED meter baseline.'
      : 'Insufficient verified MEASURED baseline records; financial savings claims withheld.',
  };
}

export interface RootCauseCorrelationResult {
  relatedAssetIds: string[];
  potentialCauses: Array<{ cause: string; score: number; mechanism: string }>;
  alternativeExplanations: string[];
  confidence: number;
  uncertaintyNotes: string;
}

/**
 * Correlates an incident with asset dependency graph, anomalous telemetry, recent events,
 * and maintenance history to produce ranked, explainable root cause candidates.
 */
export function correlateRootCauseEvidence(
  incident: Incident,
  assets: Asset[],
  relationships: AssetRelationship[],
  telemetry: TelemetryPoint[],
  events: InfrastructureEvent[],
  maintenance: MaintenanceRecord[]
): RootCauseCorrelationResult {
  const assetMap = new Map(assets.map((a) => [a.id, a]));
  const targetAssetId = incident.assetId;
  const relatedIds = new Set<string>();
  if (targetAssetId) relatedIds.add(targetAssetId);

  // Traverse upstream and downstream dependency edges (1 hop)
  const upstreamDeps: AssetRelationship[] = [];
  for (const rel of relationships) {
    if (rel.targetAssetId === targetAssetId) {
      relatedIds.add(rel.sourceAssetId);
      upstreamDeps.push(rel);
    } else if (rel.sourceAssetId === targetAssetId) {
      relatedIds.add(rel.targetAssetId);
    }
  }

  const candidateCauses: Array<{ cause: string; score: number; mechanism: string }> = [];

  // 1. Check anomalous telemetry on target or upstream assets
  const relevantAnomalies = telemetry.filter(
    (t) => t.isAnomaly && (relatedIds.has(t.assetId) || t.assetId === targetAssetId)
  );
  for (const anom of relevantAnomalies) {
    const assetName = assetMap.get(anom.assetId)?.name ?? anom.assetId;
    const isUpstream = anom.assetId !== targetAssetId;
    candidateCauses.push({
      cause: `${assetName}: ${anom.metricName} excursion (${anom.value} ${anom.unit}, z=${anom.zScore})`,
      score: Math.min(95, Math.round(55 + Math.abs(anom.zScore) * 10 + (isUpstream ? 8 : 0))),
      mechanism: isUpstream
        ? `Upstream dependency anomaly propagating along asset graph to ${assetMap.get(targetAssetId ?? '')?.name ?? 'target asset'}.`
        : `Direct equipment operating parameter exceeded threshold (${anom.thresholdWarn} ${anom.unit}).`,
    });
  }

  // 2. Check recent high-severity events on related assets
  const relevantEvents = events.filter(
    (e) =>
      (e.severity === 'CRITICAL' || e.severity === 'HIGH') &&
      ((e.assetId && relatedIds.has(e.assetId)) || e.facilityId === incident.facilityId)
  );
  if (relevantEvents.length > 0) {
    const topEvent = relevantEvents[0];
    candidateCauses.push({
      cause: `Correlated ${topEvent.sourceModule} event: ${topEvent.title}`,
      score: 72,
      mechanism: topEvent.description,
    });
  }

  // 3. Check corrective maintenance gaps
  const targetMaint = maintenance.filter((m) => m.assetId === targetAssetId);
  if (targetMaint.length === 0 && targetAssetId) {
    candidateCauses.push({
      cause: 'Deferred preventive maintenance interval / missing recent inspection baseline',
      score: 48,
      mechanism: 'No maintenance logs recorded in current inspection cycle for target asset.',
    });
  }

  // Deduplicate and sort descending
  const sortedCauses = candidateCauses
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  if (sortedCauses.length === 0) {
    sortedCauses.push({
      cause: 'Localized operational disturbance without correlated upstream telemetry excursion',
      score: 40,
      mechanism: 'Available sensor channels remained within statistical bounds; physical inspection required.',
    });
  }

  const hasMeasuredTelemetry = telemetry.some((t) => relatedIds.has(t.assetId) && t.mode === 'MEASURED');
  const confidence = Math.min(92, Math.max(35, Math.round(sortedCauses[0].score * (hasMeasuredTelemetry ? 0.95 : 0.8))));

  return {
    relatedAssetIds: Array.from(relatedIds),
    potentialCauses: sortedCauses,
    alternativeExplanations: [
      'Sensor calibration drift or transient communication packet loss at gateway.',
      'Unscheduled manual load surge or operator changeover not yet logged in shift schedule.',
    ],
    confidence,
    uncertaintyNotes: hasMeasuredTelemetry
      ? 'Correlation derived from measured telemetry, dependency graph, and event timeline.'
      : 'Partial uncertainty: includes SIMULATED/ESTIMATED telemetry channels; verify physically on site.',
  };
}

export type PermissionAction =
  | 'VIEW_PLATFORM'
  | 'QUERY_BRAIN'
  | 'RUN_VISION_INSPECT'
  | 'TRIGGER_SIMULATION'
  | 'CREATE_INCIDENT'
  | 'CREATE_WORK_ORDER'
  | 'APPROVE_CONSEQUENTIAL_ACTION'
  | 'MANAGE_ASSETS_IOT'
  | 'MANAGE_TENANTS_USERS'
  | 'BYPASS_SAFETY_INTERLOCK';

const ROLE_PERMISSIONS: Record<VantaRole, Set<PermissionAction>> = {
  'Platform Administrator': new Set([
    'VIEW_PLATFORM',
    'QUERY_BRAIN',
    'RUN_VISION_INSPECT',
    'TRIGGER_SIMULATION',
    'CREATE_INCIDENT',
    'CREATE_WORK_ORDER',
    'APPROVE_CONSEQUENTIAL_ACTION',
    'MANAGE_ASSETS_IOT',
    'MANAGE_TENANTS_USERS',
  ]),
  'Organization Administrator': new Set([
    'VIEW_PLATFORM',
    'QUERY_BRAIN',
    'RUN_VISION_INSPECT',
    'TRIGGER_SIMULATION',
    'CREATE_INCIDENT',
    'CREATE_WORK_ORDER',
    'APPROVE_CONSEQUENTIAL_ACTION',
    'MANAGE_ASSETS_IOT',
    'MANAGE_TENANTS_USERS',
  ]),
  'Facility Administrator': new Set([
    'VIEW_PLATFORM',
    'QUERY_BRAIN',
    'RUN_VISION_INSPECT',
    'TRIGGER_SIMULATION',
    'CREATE_INCIDENT',
    'CREATE_WORK_ORDER',
    'APPROVE_CONSEQUENTIAL_ACTION',
    'MANAGE_ASSETS_IOT',
  ]),
  'Operations Manager': new Set([
    'VIEW_PLATFORM',
    'QUERY_BRAIN',
    'RUN_VISION_INSPECT',
    'TRIGGER_SIMULATION',
    'CREATE_INCIDENT',
    'CREATE_WORK_ORDER',
    'APPROVE_CONSEQUENTIAL_ACTION',
  ]),
  'Infrastructure Engineer': new Set([
    'VIEW_PLATFORM',
    'QUERY_BRAIN',
    'RUN_VISION_INSPECT',
    'TRIGGER_SIMULATION',
    'CREATE_INCIDENT',
    'CREATE_WORK_ORDER',
    'MANAGE_ASSETS_IOT',
  ]),
  'Maintenance Engineer': new Set([
    'VIEW_PLATFORM',
    'QUERY_BRAIN',
    'TRIGGER_SIMULATION',
    'CREATE_INCIDENT',
    'CREATE_WORK_ORDER',
  ]),
  'Security Operator': new Set([
    'VIEW_PLATFORM',
    'QUERY_BRAIN',
    'RUN_VISION_INSPECT',
    'CREATE_INCIDENT',
  ]),
  Analyst: new Set(['VIEW_PLATFORM', 'QUERY_BRAIN']),
  Viewer: new Set(['VIEW_PLATFORM']),
};

/**
 * Enforces strict Role-Based Access Control and Part 9 Physical Safety boundaries.
 * BYPASS_SAFETY_INTERLOCK is unconditionally denied for ALL roles and AI agents.
 */
export function canPerformAction(role: VantaRole, action: PermissionAction): boolean {
  if (action === 'BYPASS_SAFETY_INTERLOCK') {
    return false;
  }
  const perms = ROLE_PERMISSIONS[role];
  return perms ? perms.has(action) : false;
}

export function requiresHumanApproval(actionType: string): boolean {
  const normalized = actionType.toUpperCase();
  return [
    'WORK_ORDER',
    'ISOLATION_REQUEST',
    'THRESHOLD_CHANGE',
    'EQUIPMENT_SHUTDOWN',
    'PLC_ACTUATION',
    'AGENT_RECOMMENDATION',
  ].includes(normalized);
}
