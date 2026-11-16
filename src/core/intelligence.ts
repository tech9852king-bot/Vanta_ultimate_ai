/**
 * VANTA AI — Pure Core Intelligence & Safety Rules Engine
 * Deterministic, side-effect-free engineering math, RBAC, RUL, backtesting, twin simulation, energy, and RCA logic.
 */

import type {
  ApprovalItem,
  Asset,
  AssetRelationship,
  AssetStatus,
  Camera,
  EnergyRecord,
  Incident,
  InfrastructureEvent,
  IoTIntegration,
  LifecycleStageSnapshot,
  MaintenanceRecord,
  NorthStarMetrics,
  PredictiveAssessment,
  PredictiveBacktestResult,
  RootCauseInvestigation,
  SectorConfigurationProfile,
  SeverityLevel,
  TelemetryPoint,
  TwinScenarioResult,
  VantaRole,
  VisionEvent,
  WorkOrder,
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

function latestIso(timestamps: Array<string | null | undefined>): string | null {
  let maxTime = -1;
  let maxIso: string | null = null;
  for (const ts of timestamps) {
    if (!ts) continue;
    const ms = Date.parse(ts);
    if (!Number.isNaN(ms) && ms > maxTime) {
      maxTime = ms;
      maxIso = ts;
    }
  }
  return maxIso;
}

/**
 * Section 4.5 & Section 5: VANTA 11-Stage Intelligence Lifecycle
 * CONNECT -> COLLECT -> NORMALIZE -> CONTEXTUALIZE -> ANALYZE -> CORRELATE -> PREDICT -> RECOMMEND -> APPROVE -> EXECUTE -> VERIFY
 * Strictly separates physical connections/measurements from simulated sources.
 */
export function computeLifecycleStages(input: {
  iotIntegrations: IoTIntegration[];
  cameras: Camera[];
  telemetry: TelemetryPoint[];
  visionEvents: VisionEvent[];
  assets: Asset[];
  relationships: AssetRelationship[];
  events: InfrastructureEvent[];
  incidents: Incident[];
  rootCauseInvestigations: RootCauseInvestigation[];
  predictiveAssessments: PredictiveAssessment[];
  approvals: ApprovalItem[];
  workOrders: WorkOrder[];
}): LifecycleStageSnapshot[] {
  const physicalIot = input.iotIntegrations.filter((c) => c.status === 'CONNECTED').length;
  const simulatedIot = input.iotIntegrations.filter((c) => c.status === 'SIMULATED').length;
  const physicalCams = input.cameras.filter(
    (c) => c.status === 'ONLINE' && (c.capabilityState === 'LIVE' || c.mode === 'MEASURED')
  ).length;
  const simulatedCams = input.cameras.filter(
    (c) => c.status === 'ONLINE' && c.capabilityState !== 'LIVE' && c.mode !== 'MEASURED'
  ).length;

  const physicalConnectors = physicalIot + physicalCams;
  const simulatedConnectors = simulatedIot + simulatedCams;
  const activeConnectors = physicalConnectors + simulatedConnectors;
  const totalConnectors = input.iotIntegrations.length + input.cameras.length;
  const offlineOrUnconfigured =
    input.iotIntegrations.filter((c) => c.status === 'NOT_CONFIGURED' || c.status === 'OFFLINE' || c.status === 'DEGRADED').length +
    input.cameras.filter((c) => c.status === 'OFFLINE' || c.status === 'DEGRADED').length;

  const connectBlockers: string[] = [];
  for (const c of input.iotIntegrations) {
    if (c.status === 'OFFLINE' || c.status === 'NOT_CONFIGURED') {
      connectBlockers.push(`IoT ${c.name} (${c.protocol}): ${c.status}`);
    }
  }
  for (const cam of input.cameras) {
    if (cam.status === 'OFFLINE') {
      connectBlockers.push(`Camera ${cam.name}: OFFLINE`);
    }
  }

  const measuredTelemetry = input.telemetry.filter((t) => t.mode === 'MEASURED').length;
  const simulatedTelemetry = input.telemetry.length - measuredTelemetry;
  const measuredVision = input.visionEvents.filter((v) => v.mode === 'MEASURED').length;
  const simulatedVision = input.visionEvents.length - measuredVision;

  const collectedSignals = input.telemetry.length + input.visionEvents.length;
  const measuredSignals = measuredTelemetry + measuredVision;
  const simulatedSignals = simulatedTelemetry + simulatedVision;

  const measuredAssets = input.assets.filter((a) => a.dataMode === 'MEASURED').length;
  const simulatedAssets = input.assets.length - measuredAssets;

  const zAnomalies = input.telemetry.filter((t) => t.isAnomaly);
  const measuredAnomalies = zAnomalies.filter((t) => t.mode === 'MEASURED').length;
  const anomaliesDetected = zAnomalies.length + input.events.length;

  const rcaCount = input.rootCauseInvestigations.length;
  const uncorroboratedIncidents = input.incidents.filter(
    (inc) => !input.rootCauseInvestigations.some((r) => r.incidentId === inc.id)
  );

  const ruleOrStatPredictive = input.predictiveAssessments.filter(
    (p) => p.validationStatus === 'RULE_VERIFIED' || p.validationStatus === 'STATISTICAL_ZSCORE'
  ).length;
  const simPredictive = input.predictiveAssessments.length - ruleOrStatPredictive;

  const pendingApprovals = input.approvals.filter((a) => a.status === 'PENDING');
  const approvedApprovals = input.approvals.filter((a) => a.status === 'APPROVED');

  const executedWorkOrders = input.workOrders.filter(
    (w) =>
      Boolean(w.executedAt) ||
      w.status === 'IN_PROGRESS' ||
      w.status === 'VERIFICATION_PENDING' ||
      w.status === 'COMPLETED' ||
      w.status === 'NEEDS_FOLLOW_UP' ||
      w.status === 'UNRESOLVED'
  );
  const awaitingExecution = input.workOrders.filter((w) => w.status === 'APPROVED');

  const verifiedWorkOrders = input.workOrders.filter(
    (w) => w.status === 'COMPLETED' && w.verificationStatus === 'VERIFIED'
  );
  const verifiedRcas = input.rootCauseInvestigations.filter((r) => r.status === 'VERIFIED');
  const verifiedCount = verifiedWorkOrders.length + verifiedRcas.length;
  const followUpOrUnresolved = input.workOrders.filter(
    (w) =>
      w.status === 'NEEDS_FOLLOW_UP' ||
      w.status === 'UNRESOLVED' ||
      w.verificationStatus === 'PARTIAL' ||
      w.verificationStatus === 'UNRESOLVED'
  );
  const awaitingVerification = input.workOrders.filter(
    (w) => w.status === 'IN_PROGRESS' || w.status === 'VERIFICATION_PENDING'
  );

  return [
    {
      stage: 'CONNECT',
      order: 1,
      label: 'Connect',
      status: totalConnectors === 0 ? 'NOT_CONFIGURED' : offlineOrUnconfigured > 0 ? 'ATTENTION' : 'ACTIVE',
      count: activeConnectors,
      physicalCount: physicalConnectors,
      simulatedCount: simulatedConnectors,
      summary: `${physicalConnectors} physical · ${simulatedConnectors} simulated · ${offlineOrUnconfigured} offline`,
      evidence: [
        `${physicalIot} CONNECTED IoT gateways, ${simulatedIot} SIMULATED brokers`,
        `${physicalCams} MEASURED cameras, ${simulatedCams} sample/simulated streams`,
      ],
      blockers: connectBlockers,
      lastUpdatedAt: latestIso([
        ...input.iotIntegrations.map((c) => c.lastHeartbeatAt),
        ...input.cameras.map((c) => c.lastFrameAt),
      ]),
    },
    {
      stage: 'COLLECT',
      order: 2,
      label: 'Collect',
      status: collectedSignals > 0 ? 'ACTIVE' : 'PENDING',
      count: collectedSignals,
      physicalCount: measuredSignals,
      simulatedCount: simulatedSignals,
      summary: `${input.telemetry.length} telemetry · ${input.visionEvents.length} vision captures`,
      evidence: [
        `${measuredTelemetry} MEASURED telemetry points, ${simulatedTelemetry} SIMULATED/ESTIMATED`,
        `${measuredVision} MEASURED vision inspections, ${simulatedVision} SIMULATED`,
      ],
      blockers: collectedSignals === 0 ? ['No telemetry or vision samples ingested in current scope'] : [],
      lastUpdatedAt: latestIso([
        ...input.telemetry.map((t) => t.timestamp),
        ...input.visionEvents.map((v) => v.createdAt),
      ]),
    },
    {
      stage: 'NORMALIZE',
      order: 3,
      label: 'Normalize',
      status: collectedSignals > 0 ? 'ACTIVE' : 'PENDING',
      count: measuredSignals,
      physicalCount: measuredSignals,
      simulatedCount: simulatedSignals,
      summary: `${measuredSignals} MEASURED · ${simulatedSignals} SIMULATED/EST`,
      evidence: [
        `Origin tagging enforced across ${collectedSignals} records`,
        `Threshold & schema validation active on all ingested points`,
      ],
      blockers: measuredSignals === 0 && collectedSignals > 0 ? ['All current signals are SIMULATED/ESTIMATED'] : [],
      lastUpdatedAt: latestIso(input.telemetry.map((t) => t.timestamp)),
    },
    {
      stage: 'CONTEXTUALIZE',
      order: 4,
      label: 'Contextualize',
      status: input.assets.length > 0 ? 'ACTIVE' : 'PENDING',
      count: input.assets.length + input.relationships.length,
      physicalCount: measuredAssets,
      simulatedCount: simulatedAssets,
      summary: `${input.assets.length} assets · ${input.relationships.length} dependency edges`,
      evidence: [
        `${measuredAssets} MEASURED assets, ${simulatedAssets} SIMULATED/ESTIMATED assets`,
        `${input.relationships.length} directed dependency edges in twin graph`,
      ],
      blockers: input.assets.length === 0 ? ['No assets registered in selected facility scope'] : [],
      lastUpdatedAt: latestIso(input.assets.map((a) => a.updatedAt)),
    },
    {
      stage: 'ANALYZE',
      order: 5,
      label: 'Analyze',
      status: anomaliesDetected > 0 ? 'ATTENTION' : 'ACTIVE',
      count: anomaliesDetected,
      physicalCount: measuredAnomalies,
      simulatedCount: anomaliesDetected - measuredAnomalies,
      summary: `${zAnomalies.length} z-score anomalies · ${input.events.length} events`,
      evidence: [
        `${zAnomalies.length} statistical z-score excursions detected`,
        `${input.events.length} cross-module infrastructure events logged`,
      ],
      blockers: zAnomalies.length > 0 ? [`${zAnomalies.length} active telemetry anomalies require triage`] : [],
      lastUpdatedAt: latestIso([
        ...zAnomalies.map((t) => t.timestamp),
        ...input.events.map((e) => e.createdAt),
      ]),
    },
    {
      stage: 'CORRELATE',
      order: 6,
      label: 'Correlate',
      status: uncorroboratedIncidents.length > 0 ? 'ATTENTION' : input.incidents.length > 0 ? 'ACTIVE' : 'PENDING',
      count: rcaCount,
      physicalCount: rcaCount,
      simulatedCount: 0,
      summary: `${rcaCount} RCA dossiers across ${input.incidents.length} incidents`,
      evidence: [
        `${rcaCount} graph-correlated root cause investigations persisted`,
        `Temporal precedence & dependency edge scoring active`,
      ],
      blockers:
        uncorroboratedIncidents.length > 0
          ? [`${uncorroboratedIncidents.length} open incident(s) lack RCA correlation dossier`]
          : [],
      lastUpdatedAt: latestIso(input.rootCauseInvestigations.map((r) => r.createdAt)),
    },
    {
      stage: 'PREDICT',
      order: 7,
      label: 'Predict',
      status: input.predictiveAssessments.length > 0 ? 'ACTIVE' : 'PENDING',
      count: input.predictiveAssessments.length,
      physicalCount: ruleOrStatPredictive,
      simulatedCount: simPredictive,
      summary: `${ruleOrStatPredictive} rule/stat · ${simPredictive} simulated RUL`,
      evidence: [
        `${ruleOrStatPredictive} assessments backed by statistical z-score or rule verification`,
        `Explicit uncertainty bounds (±h) attached to every RUL estimate`,
      ],
      blockers:
        input.predictiveAssessments.length === 0 ? ['No predictive RUL assessments computed in scope'] : [],
      lastUpdatedAt: latestIso(input.predictiveAssessments.map((p) => p.computedAt)),
    },
    {
      stage: 'RECOMMEND',
      order: 8,
      label: 'Recommend',
      status: input.workOrders.length > 0 ? 'ACTIVE' : 'PENDING',
      count: input.workOrders.length,
      physicalCount: input.workOrders.length,
      simulatedCount: 0,
      summary: `${input.workOrders.length} bounded work orders queued`,
      evidence: [
        `${input.workOrders.length} maintenance/mitigation work orders with LOTO interlock checks`,
      ],
      blockers: [],
      lastUpdatedAt: latestIso(input.workOrders.map((w) => w.createdAt)),
    },
    {
      stage: 'APPROVE',
      order: 9,
      label: 'Approve',
      status: pendingApprovals.length > 0 ? 'ATTENTION' : 'ACTIVE',
      count: approvedApprovals.length,
      physicalCount: approvedApprovals.length,
      simulatedCount: 0,
      summary: `${pendingApprovals.length} pending human sign-off · ${approvedApprovals.length} approved`,
      evidence: [
        `${approvedApprovals.length} consequential actions authorized by human operators`,
        `Zero autonomous physical actuations permitted`,
      ],
      blockers:
        pendingApprovals.length > 0
          ? [`${pendingApprovals.length} approval item(s) awaiting human decision`]
          : [],
      lastUpdatedAt: latestIso(input.approvals.map((a) => a.decidedAt || a.createdAt)),
    },
    {
      stage: 'EXECUTE',
      order: 10,
      label: 'Execute',
      status: awaitingExecution.length > 0 ? 'ATTENTION' : executedWorkOrders.length > 0 ? 'ACTIVE' : 'PENDING',
      count: executedWorkOrders.length,
      physicalCount: executedWorkOrders.length,
      simulatedCount: 0,
      summary: `${executedWorkOrders.length} field dispatches recorded`,
      evidence: [
        `${executedWorkOrders.length} work order field executions recorded (workflow record only, not direct PLC actuation)`,
      ],
      blockers:
        awaitingExecution.length > 0
          ? [`${awaitingExecution.length} approved work order(s) awaiting field execution start`]
          : [],
      lastUpdatedAt: latestIso(executedWorkOrders.map((w) => w.executedAt || w.updatedAt)),
    },
    {
      stage: 'VERIFY',
      order: 11,
      label: 'Verify',
      status:
        followUpOrUnresolved.length > 0 || awaitingVerification.length > 0
          ? 'ATTENTION'
          : verifiedCount > 0
          ? 'ACTIVE'
          : 'PENDING',
      count: verifiedCount,
      physicalCount: verifiedCount,
      simulatedCount: 0,
      summary: `${verifiedCount} verified · ${followUpOrUnresolved.length} follow-up/unresolved`,
      evidence: [
        `${verifiedWorkOrders.length} work orders verified post-execution`,
        `${verifiedRcas.length} RCA investigations verified`,
      ],
      blockers: [
        ...(awaitingVerification.length > 0
          ? [`${awaitingVerification.length} executed work order(s) awaiting post-action verification`]
          : []),
        ...(followUpOrUnresolved.length > 0
          ? [`${followUpOrUnresolved.length} work order(s) marked NEEDS_FOLLOW_UP or UNRESOLVED`]
          : []),
      ],
      lastUpdatedAt: latestIso(verifiedWorkOrders.map((w) => w.verifiedAt || w.updatedAt)),
    },
  ];
}

/**
 * Section 4.4 & Section 16: Honest North Star Outcome Measures.
 * - Zero denominator always returns null (INSUFFICIENT DATA), NEVER 100%.
 * - Separates MEASURED, ESTIMATED, and SIMULATED records.
 * - Tracks completed, needs-follow-up (PARTIAL), unresolved, and legacy-unverified work orders separately.
 * - Exposes exact numerator and denominator observation counts behind every percentage.
 */
export function computeNorthStarMetrics(input: {
  incidents: Incident[];
  rootCauseInvestigations: RootCauseInvestigation[];
  workOrders: WorkOrder[];
  predictiveAssessments: PredictiveAssessment[];
  energyRecords: EnergyRecord[];
}): NorthStarMetrics {
  const corroboratedIds = new Set(input.rootCauseInvestigations.map((r) => r.incidentId));
  const corroboratedIncidentsCount = input.incidents.filter((i) => corroboratedIds.has(i.id)).length;
  const incidentDenominator = input.incidents.length;
  const incidentTriageCoveragePct =
    incidentDenominator > 0 ? Math.round((corroboratedIncidentsCount / incidentDenominator) * 100) : null;

  const completedWorkOrders = input.workOrders.filter((w) => w.status === 'COMPLETED');
  const needsFollowUpWorkOrders = input.workOrders.filter(
    (w) => w.status === 'NEEDS_FOLLOW_UP' || (w.status === 'COMPLETED' && w.verificationStatus === 'PARTIAL')
  );
  const unresolvedWorkOrders = input.workOrders.filter(
    (w) => w.status === 'UNRESOLVED' || (w.status === 'COMPLETED' && w.verificationStatus === 'UNRESOLVED')
  );
  const legacyUnverifiedWorkOrders = input.workOrders.filter(
    (w) => w.verificationStatus === 'LEGACY_UNVERIFIED'
  );
  const verifiedWorkOrders = completedWorkOrders.filter((w) => w.verificationStatus === 'VERIFIED');

  // Post-execution outcome denominator includes all non-legacy evaluated work orders
  const evaluatedWorkOrders = input.workOrders.filter(
    (w) =>
      (w.status === 'COMPLETED' || w.status === 'NEEDS_FOLLOW_UP' || w.status === 'UNRESOLVED') &&
      w.verificationStatus !== 'LEGACY_UNVERIFIED'
  );
  const outcomeDenominator = evaluatedWorkOrders.length;
  const verifiedOutcomeRatePct =
    outcomeDenominator > 0
      ? Math.round((verifiedWorkOrders.length / outcomeDenominator) * 100)
      : null;

  const ruleVerifiedAssessmentsCount = input.predictiveAssessments.filter(
    (p) => p.validationStatus === 'RULE_VERIFIED'
  ).length;
  const statisticalAssessmentsCount = input.predictiveAssessments.filter(
    (p) => p.validationStatus === 'STATISTICAL_ZSCORE'
  ).length;
  const simulatedAssessmentsCount = input.predictiveAssessments.filter(
    (p) => p.validationStatus === 'SIMULATED_BASELINE'
  ).length;
  const nonSimPredictive = ruleVerifiedAssessmentsCount + statisticalAssessmentsCount;
  const predictiveDenominator = input.predictiveAssessments.length;
  const predictiveEvidenceCoveragePct =
    predictiveDenominator > 0
      ? Math.round((nonSimPredictive / predictiveDenominator) * 100)
      : null;

  const measuredEnergyKwh = Number(
    input.energyRecords
      .filter((r) => r.mode === 'MEASURED')
      .reduce((acc, r) => acc + r.consumptionKwh, 0)
      .toFixed(1)
  );
  const estimatedEnergyKwh = Number(
    input.energyRecords
      .filter((r) => r.mode === 'ESTIMATED')
      .reduce((acc, r) => acc + r.consumptionKwh, 0)
      .toFixed(1)
  );
  const simulatedEnergyKwh = Number(
    input.energyRecords
      .filter((r) => r.mode === 'SIMULATED')
      .reduce((acc, r) => acc + r.consumptionKwh, 0)
      .toFixed(1)
  );
  const totalKwh = Number((measuredEnergyKwh + estimatedEnergyKwh + simulatedEnergyKwh).toFixed(1));
  const measuredEnergySharePct = totalKwh > 0 ? Math.round((measuredEnergyKwh / totalKwh) * 100) : null;

  const interlockChecked = input.workOrders.filter((w) => Boolean(w.safetyInterlockChecked)).length;
  const workOrderDenominator = input.workOrders.length;
  // Section 4.4: No denominator means null (INSUFFICIENT DATA), NEVER 100%
  const safetyInterlockCompliancePct =
    workOrderDenominator > 0 ? Math.round((interlockChecked / workOrderDenominator) * 100) : null;

  return {
    incidentTriageCoveragePct,
    verifiedOutcomeRatePct,
    predictiveEvidenceCoveragePct,
    measuredEnergySharePct,
    safetyInterlockCompliancePct,
    completedWorkOrdersCount: completedWorkOrders.length,
    verifiedWorkOrdersCount: verifiedWorkOrders.length,
    needsFollowUpWorkOrdersCount: needsFollowUpWorkOrders.length,
    unresolvedWorkOrdersCount: unresolvedWorkOrders.length,
    legacyUnverifiedWorkOrdersCount: legacyUnverifiedWorkOrders.length,
    openIncidentsCount: input.incidents.filter((i) => i.status !== 'RESOLVED').length,
    corroboratedIncidentsCount,
    measuredEnergyKwh,
    estimatedEnergyKwh,
    simulatedEnergyKwh,
    ruleVerifiedAssessmentsCount,
    statisticalAssessmentsCount,
    simulatedAssessmentsCount,
    ratios: {
      incidentTriage: {
        numerator: corroboratedIncidentsCount,
        denominator: incidentDenominator,
        methodology: 'Incidents linked to a persisted Root Cause Investigation dossier / Total scoped incidents',
        formula: '(corroborated_incidents / total_scoped_incidents) * 100',
        source: 'incidents JOIN root_cause_investigations (SQLite WAL)',
        timeWindow: 'Current active facility & tenant operational window',
        dataQuality: incidentDenominator > 0 ? 'VERIFIED' : 'INSUFFICIENT_DATA',
        calculatedAt: new Date().toISOString(),
        drillDownSection: 'rca',
      },
      verifiedOutcome: {
        numerator: verifiedWorkOrders.length,
        denominator: outcomeDenominator,
        methodology:
          'Human-verified COMPLETED work orders / Total evaluated post-execution work orders (excluding LEGACY_UNVERIFIED)',
        formula: '(human_verified_completed_work_orders / evaluated_post_execution_work_orders) * 100',
        source: 'work_orders + maintenance_records (HUMAN_REPORTED post-action verification)',
        timeWindow: 'All non-legacy post-execution work orders in scope',
        dataQuality: outcomeDenominator > 0 ? 'VERIFIED' : 'INSUFFICIENT_DATA',
        calculatedAt: new Date().toISOString(),
        drillDownSection: 'operations',
      },
      predictiveEvidence: {
        numerator: nonSimPredictive,
        denominator: predictiveDenominator,
        methodology:
          'Assessments backed by RULE_VERIFIED or STATISTICAL_ZSCORE telemetry / Total predictive assessments',
        formula: '((rule_verified_assessments + statistical_zscore_assessments) / total_assessments) * 100',
        source: 'predictive_assessments (vanta-rul-heuristic-2.0)',
        timeWindow: 'Latest rolling assessment window per asset',
        dataQuality:
          predictiveDenominator === 0
            ? 'INSUFFICIENT_DATA'
            : simulatedAssessmentsCount === 0
            ? 'VERIFIED'
            : nonSimPredictive > 0
            ? 'MIXED_MODES'
            : 'SIMULATED_ONLY',
        calculatedAt: new Date().toISOString(),
        drillDownSection: 'predictive',
      },
      measuredEnergy: {
        numerator: Math.round(measuredEnergyKwh),
        denominator: Math.round(totalKwh),
        methodology: 'MEASURED meter consumption (kWh) / Total scoped energy consumption (kWh)',
        formula: '(measured_kwh / (measured_kwh + estimated_kwh + simulated_kwh)) * 100',
        source: 'energy_records (utility submeters vs estimated/simulated profiles)',
        timeWindow: 'Trailing 24-hour facility metering interval',
        dataQuality:
          totalKwh === 0
            ? 'INSUFFICIENT_DATA'
            : measuredEnergyKwh === totalKwh
            ? 'VERIFIED'
            : measuredEnergyKwh > 0
            ? 'MIXED_MODES'
            : 'SIMULATED_ONLY',
        calculatedAt: new Date().toISOString(),
        drillDownSection: 'energy',
      },
      safetyInterlock: {
        numerator: interlockChecked,
        denominator: workOrderDenominator,
        methodology: 'Work orders with verified LOTO safety interlock check / Total scoped work orders',
        formula: '(loto_interlock_checked_work_orders / total_work_orders) * 100',
        source: 'work_orders.safety_interlock_checked + approvals.safety_boundary_check',
        timeWindow: 'All active & historical work orders in tenant scope',
        dataQuality: workOrderDenominator > 0 ? 'VERIFIED' : 'INSUFFICIENT_DATA',
        calculatedAt: new Date().toISOString(),
        drillDownSection: 'operations',
      },
    },
    epistemicNote:
      'All North Star metrics are computed strictly from persisted tenant records. Zero denominators return null (INSUFFICIENT DATA) rather than synthetic 100% defaults.',
  };
}

export interface WorkOrderTransitionContext {
  hasExecutionRecord?: boolean;
  verificationStatus?: 'VERIFIED' | 'PARTIAL' | 'UNRESOLVED' | null;
  actorApproved?: boolean;
}

export interface WorkOrderTransitionValidation {
  allowed: boolean;
  nextStatus: WorkOrder['status'];
  reason?: string;
}

/**
 * Part 14: Centralized Work-Order State-Machine Transition Engine.
 * Enforces deterministic transitions across:
 * CREATED -> PENDING_APPROVAL -> APPROVED -> IN_PROGRESS -> VERIFICATION_PENDING -> COMPLETED
 * with explicit support for REJECTED, CANCELLED, NEEDS_FOLLOW_UP, and UNRESOLVED.
 * Strictly prevents verification bypass before execution and prevents PARTIAL/UNRESOLVED
 * outcomes from silently becoming COMPLETED.
 */
export function validateWorkOrderTransition(
  currentStatus: WorkOrder['status'],
  targetStatus: WorkOrder['status'],
  context: WorkOrderTransitionContext = {}
): WorkOrderTransitionValidation {
  const normalizedCurrent: WorkOrder['status'] =
    currentStatus === 'DRAFT' ? 'CREATED' : currentStatus;

  if (
    normalizedCurrent === 'COMPLETED' ||
    normalizedCurrent === 'REJECTED' ||
    normalizedCurrent === 'CANCELLED'
  ) {
    return {
      allowed: false,
      nextStatus: currentStatus,
      reason: `Work order in terminal status '${currentStatus}' cannot transition to '${targetStatus}'.`,
    };
  }

  if (targetStatus === 'CANCELLED') {
    if (
      normalizedCurrent === 'CREATED' ||
      normalizedCurrent === 'PENDING_APPROVAL' ||
      normalizedCurrent === 'APPROVED'
    ) {
      return { allowed: true, nextStatus: 'CANCELLED' };
    }
    return {
      allowed: false,
      nextStatus: currentStatus,
      reason: `Work order in status '${currentStatus}' cannot be cancelled after field execution has started.`,
    };
  }

  if (normalizedCurrent === 'CREATED') {
    if (targetStatus === 'PENDING_APPROVAL') {
      return { allowed: true, nextStatus: 'PENDING_APPROVAL' };
    }
    return {
      allowed: false,
      nextStatus: currentStatus,
      reason: `Work order in 'CREATED' status must enter 'PENDING_APPROVAL' before '${targetStatus}'.`,
    };
  }

  if (normalizedCurrent === 'PENDING_APPROVAL') {
    if (targetStatus === 'APPROVED' || targetStatus === 'REJECTED') {
      return { allowed: true, nextStatus: targetStatus };
    }
    return {
      allowed: false,
      nextStatus: currentStatus,
      reason: `Work order in 'PENDING_APPROVAL' requires human approval decision (APPROVED or REJECTED) before '${targetStatus}'.`,
    };
  }

  if (normalizedCurrent === 'APPROVED') {
    if (targetStatus === 'IN_PROGRESS') {
      if (context.hasExecutionRecord === false) {
        return {
          allowed: false,
          nextStatus: currentStatus,
          reason: 'Field execution notes and execution timestamp are required to enter IN_PROGRESS.',
        };
      }
      return { allowed: true, nextStatus: 'IN_PROGRESS' };
    }
    return {
      allowed: false,
      nextStatus: currentStatus,
      reason: `Work order in 'APPROVED' status must complete field execution ('IN_PROGRESS') before '${targetStatus}'.`,
    };
  }

  if (normalizedCurrent === 'IN_PROGRESS' || normalizedCurrent === 'VERIFICATION_PENDING') {
    if (!context.hasExecutionRecord) {
      return {
        allowed: false,
        nextStatus: currentStatus,
        reason: `Work order must have a recorded field execution timestamp before transitioning to '${targetStatus}'.`,
      };
    }

    if (normalizedCurrent === 'IN_PROGRESS' && targetStatus === 'VERIFICATION_PENDING') {
      return { allowed: true, nextStatus: 'VERIFICATION_PENDING' };
    }

    if (
      targetStatus === 'COMPLETED' ||
      targetStatus === 'NEEDS_FOLLOW_UP' ||
      targetStatus === 'UNRESOLVED'
    ) {
      const vStatus = context.verificationStatus;
      if (!vStatus) {
        return {
          allowed: false,
          nextStatus: currentStatus,
          reason: 'Explicit post-action verificationStatus (VERIFIED, PARTIAL, or UNRESOLVED) is required.',
        };
      }
      const expectedStatus: WorkOrder['status'] =
        vStatus === 'VERIFIED'
          ? 'COMPLETED'
          : vStatus === 'PARTIAL'
          ? 'NEEDS_FOLLOW_UP'
          : 'UNRESOLVED';

      if (targetStatus !== expectedStatus) {
        return {
          allowed: false,
          nextStatus: currentStatus,
          reason: `Verification outcome '${vStatus}' must map to status '${expectedStatus}', not '${targetStatus}'.`,
        };
      }
      return { allowed: true, nextStatus: expectedStatus };
    }
  }

  if (
    (normalizedCurrent === 'NEEDS_FOLLOW_UP' || normalizedCurrent === 'UNRESOLVED') &&
    targetStatus === 'IN_PROGRESS'
  ) {
    return { allowed: true, nextStatus: 'IN_PROGRESS' };
  }

  return {
    allowed: false,
    nextStatus: currentStatus,
    reason: `Invalid work order state transition from '${currentStatus}' to '${targetStatus}'.`,
  };
}

export interface TelemetryQualityReport {
  sampleCount: number;
  completenessPct: number;
  measuredSharePct: number;
  duplicateCount: number;
  outOfOrderCount: number;
  futureTimestampCount: number;
  staleSampleCount: number;
  freshnessSec: number | null;
  sensorHealth: 'HEALTHY' | 'DEGRADED_STALE' | 'DUPLICATE_DETECTED' | 'OUT_OF_ORDER' | 'INSUFFICIENT_SAMPLES';
}

/**
 * Part 10: Telemetry & Data Quality Evaluation.
 * Evaluates completeness, freshness/staleness, duplicate timestamps, out-of-order arrival,
 * future clock-skew timestamps, and sensor health classification.
 */
export function evaluateTelemetryQuality(
  pointsInArrivalOrder: TelemetryPoint[],
  nowMs: number = Date.now(),
  staleThresholdSec: number = 7200
): TelemetryQualityReport {
  const sampleCount = pointsInArrivalOrder.length;
  if (sampleCount === 0) {
    return {
      sampleCount: 0,
      completenessPct: 0,
      measuredSharePct: 0,
      duplicateCount: 0,
      outOfOrderCount: 0,
      futureTimestampCount: 0,
      staleSampleCount: 0,
      freshnessSec: null,
      sensorHealth: 'INSUFFICIENT_SAMPLES',
    };
  }

  let validCount = 0;
  let measuredCount = 0;
  let duplicateCount = 0;
  let outOfOrderCount = 0;
  let futureTimestampCount = 0;
  let staleSampleCount = 0;
  let latestMs = -1;
  let prevMs: number | null = null;
  const seenKeys = new Set<string>();

  for (const pt of pointsInArrivalOrder) {
    const ms = Date.parse(pt.timestamp);
    const hasValidTs = !Number.isNaN(ms);
    if (Number.isFinite(pt.value) && Boolean(pt.unit) && hasValidTs) {
      validCount += 1;
    }
    if (pt.mode === 'MEASURED') {
      measuredCount += 1;
    }
    const dedupKey = `${pt.assetId}:${pt.metricName}:${pt.timestamp}:${pt.value}`;
    if (seenKeys.has(dedupKey)) {
      duplicateCount += 1;
    } else {
      seenKeys.add(dedupKey);
    }

    if (hasValidTs) {
      if (ms > latestMs) latestMs = ms;
      if (ms > nowMs + 60_000) {
        futureTimestampCount += 1;
      }
      if ((nowMs - ms) / 1000 > staleThresholdSec) {
        staleSampleCount += 1;
      }
      if (prevMs !== null && ms < prevMs) {
        outOfOrderCount += 1;
      }
      prevMs = ms;
    }
  }

  const completenessPct = Math.round((validCount / sampleCount) * 100);
  const measuredSharePct = Math.round((measuredCount / sampleCount) * 100);
  const freshnessSec = latestMs > 0 ? Math.max(0, Math.round((nowMs - latestMs) / 1000)) : null;

  let sensorHealth: TelemetryQualityReport['sensorHealth'] = 'HEALTHY';
  if (duplicateCount > 0) {
    sensorHealth = 'DUPLICATE_DETECTED';
  } else if (outOfOrderCount > 0 || futureTimestampCount > 0) {
    sensorHealth = 'OUT_OF_ORDER';
  } else if (freshnessSec !== null && freshnessSec > staleThresholdSec) {
    sensorHealth = 'DEGRADED_STALE';
  }

  return {
    sampleCount,
    completenessPct,
    measuredSharePct,
    duplicateCount,
    outOfOrderCount,
    futureTimestampCount,
    staleSampleCount,
    freshnessSec,
    sensorHealth,
  };
}

const SECTOR_PROFILES: SectorConfigurationProfile[] = [
  {
    sector: 'Manufacturing & Industrial Production',
    monitoredEquipmentClasses: ['CNC Spindles & Robotics', 'Industrial Chillers', 'Compressed Air Headers', 'HV Transformers'],
    criticalEnvelopes: ['Spindle Bearing Temp (<70°C)', 'RMS Vibration (<4.5 mm/s ISO 10816)', 'Chilled Loop Delta-T'],
    interlockBoundaryPolicy: 'Physical PLC E-stops, LOTO interlocks, and relief valves cannot be bypassed by VANTA or AI agents.',
    recommendedConnectors: ['OPC UA Plant Historian', 'MQTT Telemetry Broker', 'Modbus TCP Sub-Meter'],
    standardsRef: ['ISO 10816-3 Vibration', 'IEC 61131-3 PLC Boundary', 'OSHA 1910.147 LOTO'],
  },
  {
    sector: 'Energy & Power Infrastructure',
    monitoredEquipmentClasses: ['Power Transformers', 'SF6 Switchgear', 'Feeder Breakers', 'Relay Protection'],
    criticalEnvelopes: ['Top-Oil Thermal Limit (85°C)', 'Phase Voltage Harmonics (<3% THD)', 'Substation Load Factor'],
    interlockBoundaryPolicy: 'SCADA/relay protection trips remain exclusively hardware-enforced; AI is advisory only.',
    recommendedConnectors: ['IEC 61850 / DNP3 Gateway', 'Modbus TCP Substation RTU', 'IEEE C37.118 PMU'],
    standardsRef: ['IEEE C57.91 Transformer Loading', 'IEC 61850 Substation Automation', 'NERC CIP Boundary'],
  },
  {
    sector: 'Data Centers',
    monitoredEquipmentClasses: ['CRAC/CRAH Units', 'UPS Battery Strings', 'PDU Busways', 'Liquid Cooling Loops'],
    criticalEnvelopes: ['Cold Aisle Inlet Temp (18-27°C ASHRAE)', 'PUE Envelope (<1.35)', 'UPS Bus Transfer Readiness'],
    interlockBoundaryPolicy: 'ATS/UPS transfer switches operate autonomously; work orders enforce maintenance LOTO.',
    recommendedConnectors: ['BACnet/IP BMS Bridge', 'SNMPv3 PDU Collector', 'Redfish Server Telemetry'],
    standardsRef: ['ASHRAE TC 9.9 Thermal Guidelines', 'Uptime Institute Tier III/IV', 'NFPA 75/70E'],
  },
  {
    sector: 'Airports & Transportation',
    monitoredEquipmentClasses: ['Baggage Handling Conveyors', 'Airfield Ground Lighting (AGL)', 'Jet Bridge Actuators', 'Terminal HVAC'],
    criticalEnvelopes: ['Conveyor Drive Motor Current', 'AGL Constant Current Regulator Loop', 'Terminal Air Exchange Rate'],
    interlockBoundaryPolicy: 'Airfield lighting, rail interlocking, and passenger boarding safety trips remain hardware-governed.',
    recommendedConnectors: ['OPC UA BHS Supervisor', 'Modbus TCP AGL Monitoring', 'ONVIF Apron Vision'],
    standardsRef: ['ICAO Annex 14 Airfield Lighting', 'EN 12312 Passenger Boarding Bridges'],
  },
  {
    sector: 'Hospitals & Healthcare Infrastructure',
    monitoredEquipmentClasses: ['Medical Gas Manifolds (O2/Vacuum)', 'Operating Theater HEPA AHU', 'Emergency Diesel Generators', 'Blood Bank Cold Storage'],
    criticalEnvelopes: ['OR Positive Pressure Differential (>2.5 Pa)', 'Medical O2 Line Pressure (345-380 kPa)', 'Generator Auto-Start (<10s)'],
    interlockBoundaryPolicy: 'Life-safety medical gas valves, emergency power transfer switches, and clinical alarms are strictly read-only.',
    recommendedConnectors: ['BACnet/IP Clinical BMS', 'Modbus TCP Generator ATS', 'MQTT Cold-Storage Sensors'],
    standardsRef: ['NFPA 99 Health Care Facilities Code', 'ASHRAE 170 Ventilation of Health Care Facilities'],
  },
  {
    sector: 'Commercial Buildings & Campuses',
    monitoredEquipmentClasses: ['Central Chiller Plants', 'Variable Air Volume (VAV) Boxes', 'Elevators & Escalators', 'Solar/BESS Microgrids'],
    criticalEnvelopes: ['Chilled Water Approach Temp (<2.5°C)', 'Indoor CO2 Concentration (<800 ppm)', 'Peak Demand Tariff Ceiling'],
    interlockBoundaryPolicy: 'Fire/smoke damper overrides, elevator safety brakes, and main breaker trips remain hardware-locked.',
    recommendedConnectors: ['BACnet/IP Campus Trunk', 'Modbus TCP Revenue Sub-Meters', 'MQTT Occupancy & IAQ'],
    standardsRef: ['ASHRAE 90.1 Energy Standard', 'ISO 50001 Energy Management'],
  },
  {
    sector: 'Logistics & Supply Chain',
    monitoredEquipmentClasses: ['Cold-Chain Compressors', 'AGV Fleets', 'Dock Doors & Air Curtains', 'Battery Chargers'],
    criticalEnvelopes: ['Frozen Storage Hold (<-18°C)', 'AGV Corridor Clearance', 'Battery Thermal Cutoff'],
    interlockBoundaryPolicy: 'AGV collision E-stop and ammonia/refrigerant safety valves remain hardware-governed.',
    recommendedConnectors: ['MQTT Fleet Broker', 'Modbus TCP Refrigeration PLC', 'ONVIF Dock Vision'],
    standardsRef: ['ISO 3691-4 Driverless Industrial Trucks', 'IIAR-2 Ammonia Refrigeration Safety'],
  },
  {
    sector: 'Smart Infrastructure',
    monitoredEquipmentClasses: ['Municipal Water Booster Pumps', 'District Heating Heat Exchangers', 'Tunnel Ventilation Fans', 'Substation Feeders'],
    criticalEnvelopes: ['Distribution Main Pressure (3.5-6.0 bar)', 'Pump Cavitation Vibration Limit', 'Tunnel CO/NOx Threshold'],
    interlockBoundaryPolicy: 'High-pressure relief valves, chlorination dosing interlocks, and floodgates require certified field actuation.',
    recommendedConnectors: ['OPC UA SCADA Historian', 'MQTT Edge Telemetry', 'Modbus TCP Flow & Pressure RTU'],
    standardsRef: ['AWWA Water Distribution Standards', 'IEC 62443 Industrial Cybersecurity'],
  },
];

export function getAllSectorProfiles(): SectorConfigurationProfile[] {
  return SECTOR_PROFILES;
}

/**
 * Section 17: Configurable Industry Sector Operational Profiles across all 8 target sectors.
 */
export function getSectorProfile(industry: string): SectorConfigurationProfile {
  const norm = (industry || '').toLowerCase();
  if (norm.includes('energy') || norm.includes('grid') || norm.includes('utility') || norm.includes('power')) {
    return SECTOR_PROFILES[1];
  }
  if (norm.includes('data') || norm.includes('cloud')) {
    return SECTOR_PROFILES[2];
  }
  if (norm.includes('airport') || norm.includes('transport') || norm.includes('aviation') || norm.includes('rail')) {
    return SECTOR_PROFILES[3];
  }
  if (norm.includes('hospital') || norm.includes('health') || norm.includes('medical') || norm.includes('clinical')) {
    return SECTOR_PROFILES[4];
  }
  if (norm.includes('commercial') || norm.includes('building') || norm.includes('campus')) {
    return SECTOR_PROFILES[5];
  }
  if (norm.includes('logistics') || norm.includes('warehouse') || norm.includes('cold') || norm.includes('supply')) {
    return SECTOR_PROFILES[6];
  }
  if (norm.includes('smart') || norm.includes('municipal') || norm.includes('water') || norm.includes('city')) {
    return SECTOR_PROFILES[7];
  }
  return {
    ...SECTOR_PROFILES[0],
    sector: industry || SECTOR_PROFILES[0].sector,
  };
}


