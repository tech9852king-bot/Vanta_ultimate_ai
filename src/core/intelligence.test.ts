import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canPerformAction,
  computeEnergySummary,
  computeZScoreAnomaly,
  correlateRootCauseEvidence,
  estimateRemainingUsefulLife,
  evaluatePredictiveBacktest,
  requiresHumanApproval,
  simulateTwinCascade,
} from './intelligence.ts';
import type {
  Asset,
  AssetRelationship,
  EnergyRecord,
  Incident,
  InfrastructureEvent,
  TelemetryPoint,
} from './types.ts';

test('computeZScoreAnomaly detects critical spikes and normal readings accurately', () => {
  const baseline = [42.1, 42.4, 41.9, 42.0, 42.3, 42.2];
  const normal = computeZScoreAnomaly(baseline, 42.5, 55, 70);
  assert.equal(normal.isAnomaly, false);
  assert.equal(normal.severity, 'INFO');

  const spike = computeZScoreAnomaly(baseline, 78.4, 55, 70);
  assert.equal(spike.isAnomaly, true);
  assert.equal(spike.severity, 'CRITICAL');
  assert.ok(spike.zScore > 5);
});

test('estimateRemainingUsefulLife exposes uncertainty, heuristic modelKind, and scales risk score', () => {
  const degraded = estimateRemainingUsefulLife({
    assetName: 'CNC-04 Main Spindle',
    currentValue: 82,
    nominalValue: 45,
    criticalThreshold: 90,
    recentSlopePerHour: 0.4,
    hoursSinceLastMaintenance: 1450,
    maintenanceIntervalHours: 1500,
  });
  assert.ok(degraded.riskScore >= 75);
  assert.equal(degraded.rulHours, 20);
  assert.equal(degraded.modelKind, 'HEADROOM_RUL_ESTIMATE');
  assert.ok(degraded.uncertaintyHours >= 4);
  assert.ok(degraded.methodology.length > 10);

  const healthy = estimateRemainingUsefulLife({
    assetName: 'Chiller Loop B',
    currentValue: 46,
    nominalValue: 45,
    criticalThreshold: 90,
    recentSlopePerHour: 0,
    hoursSinceLastMaintenance: 120,
    maintenanceIntervalHours: 1500,
  });
  assert.ok(healthy.riskScore < 25);
});

test('evaluatePredictiveBacktest computes precision, recall, F1, dataQualityScore, and drift', () => {
  const points: TelemetryPoint[] = [18.1, 18.2, 18.4, 19.0, 22.8, 26.4, 28.9].map((v, i) => ({
    id: `t-${i}`,
    tenantId: 't1',
    facilityId: 'f1',
    assetId: 'ast-chl-01',
    metricName: 'Coolant Supply Temp',
    value: v,
    unit: '°C',
    thresholdWarn: 24,
    thresholdCrit: 28,
    zScore: 0,
    isAnomaly: v >= 24,
    mode: 'MEASURED',
    timestamp: new Date(Date.now() - (7 - i) * 3600_000).toISOString(),
  }));

  const backtest = evaluatePredictiveBacktest('ast-chl-01', points);
  assert.equal(backtest.sampleCount, 7);
  assert.equal(backtest.thresholdGroundTruthCount, 2);
  assert.equal(backtest.driftDetected, true);
  assert.equal(backtest.dataQualityScore, 100);
  assert.ok(backtest.recall !== null && backtest.recall > 0);
  assert.ok(backtest.precision !== null && backtest.precision > 0);
  assert.ok(backtest.calibrationNote.includes('MEASURED'));
});

test('computeEnergySummary separates measured vs simulated, blocks unverified savings claims, and attributes by facility/equipment', () => {
  const simOnly: EnergyRecord[] = [
    {
      id: 'e1',
      tenantId: 't1',
      facilityId: 'f1',
      assetId: 'ast-sim-1',
      periodStart: '2026-11-12T00:00:00Z',
      consumptionKwh: 1200,
      peakDemandKw: 180,
      baselineKwh: 1400,
      powerFactor: 0.94,
      mode: 'SIMULATED',
      methodology: 'Simulation profile',
    },
  ];
  const simSummary = computeEnergySummary(simOnly);
  assert.equal(simSummary.savingsClaimPermitted, false);
  assert.equal(simSummary.baselineDeltaPct, null);
  assert.equal(simSummary.simulatedKwh, 1200);
  assert.equal(simSummary.measuredKwh, 0);

  const mixed: EnergyRecord[] = [
    ...simOnly,
    {
      id: 'e2',
      tenantId: 't1',
      facilityId: 'f2',
      assetId: 'ast-tx-1',
      periodStart: '2026-11-12T01:00:00Z',
      consumptionKwh: 900,
      peakDemandKw: 210,
      baselineKwh: 1000,
      powerFactor: 0.96,
      mode: 'MEASURED',
      methodology: 'Utility revenue meter',
    },
  ];
  const mixedSummary = computeEnergySummary(mixed);
  assert.equal(mixedSummary.savingsClaimPermitted, true);
  assert.equal(mixedSummary.baselineDeltaPct, -10);
  assert.equal(mixedSummary.peakDemandKw, 210);
  assert.equal(mixedSummary.byFacility.length, 2);
  assert.equal(mixedSummary.byEquipment.length, 2);
});

test('correlateRootCauseEvidence traces upstream dependency anomalies with temporal precedence & epistemic notice', () => {
  const assets: Asset[] = [
    {
      id: 'a-chiller',
      tenantId: 't1',
      facilityId: 'f1',
      zoneId: 'z1',
      parentAssetId: null,
      code: 'CHL-01',
      name: 'Coolant Chiller 01',
      assetType: 'HVAC_CHILLER',
      manufacturer: 'Trane',
      model: 'CVHF',
      status: 'WARNING',
      owner: 'Facilities',
      dataMode: 'MEASURED',
      healthScore: 68,
      xPos: 20,
      yPos: 30,
      metadata: {},
      updatedAt: '2026-11-12T00:00:00Z',
    },
    {
      id: 'a-cnc',
      tenantId: 't1',
      facilityId: 'f1',
      zoneId: 'z1',
      parentAssetId: null,
      code: 'CNC-04',
      name: '5-Axis CNC Mill 04',
      assetType: 'MACHINE',
      manufacturer: 'DMG Mori',
      model: 'DMU 85',
      status: 'CRITICAL',
      owner: 'Production',
      dataMode: 'MEASURED',
      healthScore: 54,
      xPos: 60,
      yPos: 30,
      metadata: {},
      updatedAt: '2026-11-12T00:00:00Z',
    },
  ];
  const rels: AssetRelationship[] = [
    {
      id: 'r1',
      tenantId: 't1',
      sourceAssetId: 'a-chiller',
      targetAssetId: 'a-cnc',
      relationshipType: 'COOLS',
      criticalityWeight: 0.9,
    },
  ];
  const incident: Incident = {
    id: 'inc-1',
    tenantId: 't1',
    facilityId: 'f1',
    assetId: 'a-cnc',
    title: 'Spindle thermal derating',
    description: 'Efficiency drop in Bay A',
    severity: 'HIGH',
    status: 'OPEN',
    assignedTo: null,
    openedAt: '2026-11-12T02:00:00Z',
    resolvedAt: null,
  };
  const telemetry: TelemetryPoint[] = [
    {
      id: 'tel-1',
      tenantId: 't1',
      assetId: 'a-chiller',
      metricName: 'Coolant Supply Temp',
      value: 29.5,
      unit: '°C',
      thresholdWarn: 24,
      thresholdCrit: 28,
      zScore: 3.8,
      isAnomaly: true,
      mode: 'MEASURED',
      timestamp: '2026-11-12T01:00:00Z',
    },
  ];
  const events: InfrastructureEvent[] = [];

  const rca = correlateRootCauseEvidence(incident, assets, rels, telemetry, events, []);
  assert.ok(rca.relatedAssetIds.includes('a-chiller'));
  assert.ok(rca.potentialCauses[0].cause.includes('Coolant Chiller 01'));
  assert.ok(rca.potentialCauses[0].selectionReason.length > 10);
  assert.ok(rca.uncertaintyNotes.toLowerCase().includes('correlation'));
  assert.ok(rca.confidence >= 60);
});

test('simulateTwinCascade performs read-only BFS impact traversal across asset graph', () => {
  const assets: Asset[] = [
    {
      id: 'a-1',
      tenantId: 't1',
      facilityId: 'f1',
      zoneId: 'z1',
      parentAssetId: null,
      code: 'TX-1',
      name: 'Main Transformer',
      assetType: 'ELECTRICAL_ASSET',
      manufacturer: 'ABB',
      model: '45MVA',
      status: 'NOMINAL',
      owner: 'Grid',
      dataMode: 'MEASURED',
      healthScore: 95,
      xPos: 10,
      yPos: 10,
      metadata: {},
      updatedAt: '2026-11-12T00:00:00Z',
    },
    {
      id: 'a-2',
      tenantId: 't1',
      facilityId: 'f1',
      zoneId: 'z1',
      parentAssetId: null,
      code: 'CHL-1',
      name: 'Chiller 1',
      assetType: 'HVAC_CHILLER',
      manufacturer: 'Trane',
      model: 'CVHF',
      status: 'NOMINAL',
      owner: 'Facilities',
      dataMode: 'MEASURED',
      healthScore: 80,
      xPos: 30,
      yPos: 10,
      metadata: {},
      updatedAt: '2026-11-12T00:00:00Z',
    },
  ];
  const rels: AssetRelationship[] = [
    {
      id: 'r1',
      tenantId: 't1',
      sourceAssetId: 'a-1',
      targetAssetId: 'a-2',
      relationshipType: 'POWERS',
      criticalityWeight: 1.0,
    },
  ];

  const sim = simulateTwinCascade('a-1', 'POWER_LOSS', assets, rels);
  assert.equal(sim.mode, 'SIMULATED');
  assert.equal(sim.affectedAssets.length, 1);
  assert.equal(sim.affectedAssets[0].assetId, 'a-2');
  assert.ok(sim.affectedAssets[0].projectedHealthDelta < 0);
  // Original asset array remains untouched
  assert.equal(assets[1].healthScore, 80);
});

test('RBAC and physical safety interlocks enforce Part 9 and Phase II backup boundaries', () => {
  assert.equal(canPerformAction('Viewer', 'VIEW_PLATFORM'), true);
  assert.equal(canPerformAction('Viewer', 'APPROVE_CONSEQUENTIAL_ACTION'), false);
  assert.equal(canPerformAction('Operations Manager', 'APPROVE_CONSEQUENTIAL_ACTION'), true);
  assert.equal(canPerformAction('Operations Manager', 'MANAGE_BACKUPS'), false);
  assert.equal(canPerformAction('Platform Administrator', 'MANAGE_BACKUPS'), true);
  assert.equal(canPerformAction('Platform Administrator', 'BYPASS_SAFETY_INTERLOCK'), false);
  assert.equal(requiresHumanApproval('WORK_ORDER'), true);
  assert.equal(requiresHumanApproval('PLC_ACTUATION'), true);
  assert.equal(requiresHumanApproval('READ_ONLY_QUERY'), false);
});
