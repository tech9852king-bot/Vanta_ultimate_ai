/**
 * VANTA AI — Pure Core Intelligence & Safety Rules Engine
 * Deterministic, side-effect-free engineering math, RBAC, RUL, backtesting, twin simulation, energy, and RCA logic.
 */

import type {
  Asset,
  AssetRelationship,
  AssetStatus,
  EnergyRecord,
  Incident,
  InfrastructureEvent,
  MaintenanceRecord,
  PredictiveBacktestResult,
  SeverityLevel,
  TelemetryPoint,
  TwinScenarioResult,
  VantaRole,
} from './types.ts';

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
  modelKind: 'HEADROOM_RUL_ESTIMATE';
  modelVersion: string;
  recommendedAction: string;
}

/**
 * Engineering-grade Remaining Useful Life (RUL) estimator combining threshold headroom,
 * degradation rate, and maintenance cycle utilization. Exposes explicit uncertainty.
 * Note: Heuristic deterministic headroom model (NOT a trained ML regression model).
 */
export function estimateRemainingUsefulLife(input: RulEstimationInput): RulEstimationOutput {
  const span = Math.max(input.criticalThreshold - input.nominalValue, 1);
  const stressRatio = Math.max(0, (input.currentValue - input.nominalValue) / span);
  const cycleRatio = Math.max(
    0,
    input.hoursSinceLastMaintenance / Math.max(input.maintenanceIntervalHours, 1)
  );

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
      'Linear Headroom Degradation + Maintenance Interval Utilization (Deterministic Engineering Heuristic)',
    modelKind: 'HEADROOM_RUL_ESTIMATE',
    modelVersion: 'vanta-rul-heuristic-2.0',
    recommendedAction,
  };
}

/**
 * Historical sliding-window backtest for statistical z-score detection vs threshold ground truth.
 * Assesses precision, recall, F1, data quality completeness, and signal drift.
 */
export function evaluatePredictiveBacktest(
  assetId: string,
  pointsAscending: TelemetryPoint[]
): PredictiveBacktestResult {
  const sampleCount = pointsAscending.length;
  if (sampleCount < 4) {
    return {
      assetId,
      sampleCount,
      anomalyAlertsEvaluated: 0,
      thresholdGroundTruthCount: 0,
      precision: null,
      recall: null,
      f1Score: null,
      meanAbsoluteDrift: 0,
      dataQualityScore: sampleCount === 0 ? 0 : 40,
      driftDetected: false,
      calibrationNote: 'Insufficient historical telemetry (< 4 samples) for statistical backtest calibration.',
    };
  }

  let tp = 0;
  let fp = 0;
  let fn = 0;
  let groundTruthCount = 0;
  let alertsEvaluated = 0;
  let validFiniteCount = 0;
  let absDriftSum = 0;

  const nominalSeed = pointsAscending.slice(0, 3).map((p) => p.value);
  const initialMean = nominalSeed.reduce((a, b) => a + b, 0) / nominalSeed.length;

  for (let i = 0; i < sampleCount; i++) {
    const pt = pointsAscending[i];
    if (Number.isFinite(pt.value)) {
      validFiniteCount += 1;
      absDriftSum += Math.abs(pt.value - initialMean);
    }
    if (i < 3) continue;

    const window = pointsAscending.slice(Math.max(0, i - 5), i).map((p) => p.value);
    const pred = computeZScoreAnomaly(window, pt.value, pt.thresholdWarn, pt.thresholdCrit);
    const actualBreach = pt.value >= pt.thresholdWarn;

    if (actualBreach) groundTruthCount += 1;
    if (pred.isAnomaly) alertsEvaluated += 1;

    if (pred.isAnomaly && actualBreach) tp += 1;
    else if (pred.isAnomaly && !actualBreach) fp += 1;
    else if (!pred.isAnomaly && actualBreach) fn += 1;
  }

  const precision = tp + fp > 0 ? Number((tp / (tp + fp)).toFixed(2)) : null;
  const recall = tp + fn > 0 ? Number((tp / (tp + fn)).toFixed(2)) : null;
  const f1Score =
    precision !== null && recall !== null && precision + recall > 0
      ? Number(((2 * precision * recall) / (precision + recall)).toFixed(2))
      : null;

  const meanAbsoluteDrift = Number((absDriftSum / sampleCount).toFixed(2));
  const completenessRatio = validFiniteCount / sampleCount;
  const measuredRatio =
    pointsAscending.filter((p) => p.mode === 'MEASURED').length / sampleCount;
  const dataQualityScore = Math.round(completenessRatio * 70 + measuredRatio * 30);

  const recentMean =
    pointsAscending.slice(-3).reduce((acc, p) => acc + p.value, 0) /
    Math.min(3, sampleCount);
  const driftDetected =
    Math.abs(recentMean - initialMean) > Math.max(Math.abs(initialMean) * 0.12, 1.5);

  return {
    assetId,
    sampleCount,
    anomalyAlertsEvaluated: alertsEvaluated,
    thresholdGroundTruthCount: groundTruthCount,
    precision,
    recall,
    f1Score,
    meanAbsoluteDrift,
    dataQualityScore,
    driftDetected,
    calibrationNote:
      measuredRatio === 1
        ? 'Backtest evaluated exclusively on MEASURED telemetry points against warning thresholds.'
        : `Backtest includes ${Math.round((1 - measuredRatio) * 100)}% SIMULATED/ESTIMATED samples; do not equate to field ML validation.`,
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
  byFacility: Array<{
    facilityId: string;
    measuredKwh: number;
    estimatedOrSimulatedKwh: number;
    peakDemandKw: number;
  }>;
  byEquipment: Array<{
    assetId: string;
    measuredKwh: number;
    estimatedOrSimulatedKwh: number;
    mode: string;
  }>;
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

  const facilityMap = new Map<
    string,
    { facilityId: string; measuredKwh: number; estimatedOrSimulatedKwh: number; peakDemandKw: number }
  >();
  const assetMap = new Map<
    string,
    { assetId: string; measuredKwh: number; estimatedOrSimulatedKwh: number; mode: string }
  >();

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

    const fEntry = facilityMap.get(r.facilityId) || {
      facilityId: r.facilityId,
      measuredKwh: 0,
      estimatedOrSimulatedKwh: 0,
      peakDemandKw: 0,
    };
    if (r.mode === 'MEASURED') fEntry.measuredKwh += r.consumptionKwh;
    else fEntry.estimatedOrSimulatedKwh += r.consumptionKwh;
    fEntry.peakDemandKw = Math.max(fEntry.peakDemandKw, r.peakDemandKw);
    facilityMap.set(r.facilityId, fEntry);

    if (r.assetId) {
      const aEntry = assetMap.get(r.assetId) || {
        assetId: r.assetId,
        measuredKwh: 0,
        estimatedOrSimulatedKwh: 0,
        mode: r.mode,
      };
      if (r.mode === 'MEASURED') aEntry.measuredKwh += r.consumptionKwh;
      else aEntry.estimatedOrSimulatedKwh += r.consumptionKwh;
      assetMap.set(r.assetId, aEntry);
    }
  }

  const totalKwh = Number((measuredKwh + estimatedKwh + simulatedKwh).toFixed(1));
  const avgPowerFactor = records.length > 0 ? Number((pfSum / records.length).toFixed(3)) : 0;

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
    byFacility: Array.from(facilityMap.values()),
    byEquipment: Array.from(assetMap.values()),
  };
}

/**
 * Deterministic graph-traversal scenario simulation for Digital Twin what-if analysis.
 * Strictly read-only / SIMULATED — never mutates live physical or database state.
 */
export function simulateTwinCascade(
  seedAssetId: string,
  scenarioType: 'ASSET_OFFLINE' | 'COOLING_DEGRADATION' | 'POWER_LOSS',
  assets: Asset[],
  relationships: AssetRelationship[]
): TwinScenarioResult {
  const assetMap = new Map(assets.map((a) => [a.id, a]));
  const visited = new Set<string>([seedAssetId]);
  const queue: Array<{ id: string; hop: number; viaType: string; weight: number }> = [];

  for (const rel of relationships) {
    if (rel.sourceAssetId === seedAssetId && rel.relationshipType !== 'MONITORS') {
      queue.push({
        id: rel.targetAssetId,
        hop: 1,
        viaType: rel.relationshipType,
        weight: rel.criticalityWeight,
      });
    }
  }

  const affectedAssets: TwinScenarioResult['affectedAssets'] = [];
  let maxDepth = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    visited.add(current.id);

    const targetAsset = assetMap.get(current.id);
    if (!targetAsset) continue;

    maxDepth = Math.max(maxDepth, current.hop);
    const severityMultiplier =
      scenarioType === 'POWER_LOSS' ? 42 : scenarioType === 'ASSET_OFFLINE' ? 35 : 28;
    const projectedHealthDelta = -Math.round((severityMultiplier * current.weight) / current.hop);
    const newProjectedHealth = Math.max(15, targetAsset.healthScore + projectedHealthDelta);
    const projectedStatus: AssetStatus =
      newProjectedHealth < 55 ? 'CRITICAL' : newProjectedHealth < 78 ? 'WARNING' : targetAsset.status;

    affectedAssets.push({
      assetId: targetAsset.id,
      code: targetAsset.code,
      name: targetAsset.name,
      hopDistance: current.hop,
      impactType: `${current.viaType} cascade (weight ${current.weight})`,
      projectedStatus,
      projectedHealthDelta,
    });

    for (const rel of relationships) {
      if (rel.sourceAssetId === current.id && rel.relationshipType !== 'MONITORS' && !visited.has(rel.targetAssetId)) {
        queue.push({
          id: rel.targetAssetId,
          hop: current.hop + 1,
          viaType: rel.relationshipType,
          weight: rel.criticalityWeight,
        });
      }
    }
  }

  return {
    seedAssetId,
    scenarioType,
    affectedAssets,
    cascadeDepth: maxDepth,
    mode: 'SIMULATED',
    disclaimer:
      'SIMULATED graph propagation model. Does not mutate live asset telemetry or trigger physical actuation.',
  };
}

export interface RootCauseCorrelationResult {
  relatedAssetIds: string[];
  potentialCauses: Array<{ cause: string; score: number; mechanism: string; selectionReason: string }>;
  alternativeExplanations: string[];
  confidence: number;
  uncertaintyNotes: string;
}

/**
 * Correlates an incident with asset dependency graph, temporal precedence, anomalous telemetry,
 * recent events, and maintenance history. Explicitly avoids presenting correlation as proof of causation.
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

  for (const rel of relationships) {
    if (rel.targetAssetId === targetAssetId) {
      relatedIds.add(rel.sourceAssetId);
    } else if (rel.sourceAssetId === targetAssetId) {
      relatedIds.add(rel.targetAssetId);
    }
  }

  const candidateCauses: Array<{
    cause: string;
    score: number;
    mechanism: string;
    selectionReason: string;
  }> = [];

  const targetFirstAnom = telemetry
    .filter((t) => t.isAnomaly && t.assetId === targetAssetId)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0];

  const relevantAnomalies = telemetry.filter(
    (t) => t.isAnomaly && (relatedIds.has(t.assetId) || t.assetId === targetAssetId)
  );
  for (const anom of relevantAnomalies) {
    const assetName = assetMap.get(anom.assetId)?.name ?? anom.assetId;
    const isUpstream = anom.assetId !== targetAssetId;
    const precededTarget =
      isUpstream &&
      targetFirstAnom &&
      new Date(anom.timestamp).getTime() <= new Date(targetFirstAnom.timestamp).getTime();

    const baseScore = 55 + Math.abs(anom.zScore) * 9 + (isUpstream ? 8 : 0) + (precededTarget ? 7 : 0);
    candidateCauses.push({
      cause: `${assetName}: ${anom.metricName} excursion (${anom.value} ${anom.unit}, z=${anom.zScore})`,
      score: Math.min(95, Math.round(baseScore)),
      mechanism: isUpstream
        ? `Upstream dependency anomaly correlated along asset graph to ${assetMap.get(targetAssetId ?? '')?.name ?? 'target asset'}.`
        : `Direct equipment operating parameter exceeded warning threshold (${anom.thresholdWarn} ${anom.unit}).`,
      selectionReason: precededTarget
        ? `Selected because upstream excursion occurred at ${anom.timestamp} (preceding/coincident with target anomaly) on a directed dependency edge.`
        : `Selected due to high statistical z-score deviation (|z|=${Math.abs(anom.zScore)}) in correlated asset scope.`,
    });
  }

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
      selectionReason: `Selected due to high-severity event overlap in facility ${topEvent.facilityId} (${topEvent.mode} stream).`,
    });
  }

  const targetMaint = maintenance.filter((m) => m.assetId === targetAssetId);
  if (targetMaint.length === 0 && targetAssetId) {
    candidateCauses.push({
      cause: 'Deferred preventive maintenance interval / missing recent inspection baseline',
      score: 48,
      mechanism: 'No maintenance logs recorded in current inspection cycle for target asset.',
      selectionReason: 'Selected due to zero maintenance log entries for target asset in scoped history.',
    });
  }

  const sortedCauses = candidateCauses.sort((a, b) => b.score - a.score).slice(0, 4);

  if (sortedCauses.length === 0) {
    sortedCauses.push({
      cause: 'Localized operational disturbance without correlated upstream telemetry excursion',
      score: 40,
      mechanism: 'Available sensor channels remained within statistical bounds; physical inspection required.',
      selectionReason: 'Fallback hypothesis generated because no statistical anomaly or upstream fault was observed.',
    });
  }

  const hasMeasuredTelemetry = telemetry.some((t) => relatedIds.has(t.assetId) && t.mode === 'MEASURED');
  const confidence = Math.min(
    90,
    Math.max(35, Math.round(sortedCauses[0].score * (hasMeasuredTelemetry ? 0.92 : 0.78)))
  );

  return {
    relatedAssetIds: Array.from(relatedIds),
    potentialCauses: sortedCauses,
    alternativeExplanations: [
      'Sensor calibration drift or transient communication packet loss at gateway.',
      'Unscheduled manual load surge or operator changeover not yet logged in shift schedule.',
    ],
    confidence,
    uncertaintyNotes: hasMeasuredTelemetry
      ? 'Statistical & temporal correlation only — NOT proof of physical causation. On-site technician verification required.'
      : 'Partial uncertainty: includes SIMULATED/ESTIMATED telemetry channels; correlation requires physical verification.',
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
  | 'MANAGE_BACKUPS'
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
    'MANAGE_BACKUPS',
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
    'MANAGE_BACKUPS',
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
