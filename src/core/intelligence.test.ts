import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canPerformAction,
  computeEnergySummary,
  computeZScoreAnomaly,
  correlateRootCauseEvidence,
  estimateRemainingUsefulLife,
  requiresHumanApproval,
} from './intelligence';
import type {
  Asset,
  AssetRelationship,
  EnergyRecord,
  Incident,
  InfrastructureEvent,
  TelemetryPoint,
} from './types';

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

test('estimateRemainingUsefulLife exposes uncertainty and scales risk score', () => {
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

test('computeEnergySummary separates measured vs simulated and blocks unverified savings claims', () => {
  const simOnly: EnergyRecord[] = [
    {
      id: 'e1',
      tenantId: 't1',
      facilityId: 'f1',
      assetId: null,
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
      facilityId: 'f1',
      assetId: null,
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
});

test('correlateRootCauseEvidence traces upstream dependency anomalies in asset graph', () => {
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
    openedAt: '2026-11-12T00:00:00Z',
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
      timestamp: '2026-11-12T00:00:00Z',
    },
  ];
  const events: InfrastructureEvent[] = [];

  const rca = correlateRootCauseEvidence(incident, assets, rels, telemetry, events, []);
  assert.ok(rca.relatedAssetIds.includes('a-chiller'));
  assert.ok(rca.potentialCauses[0].cause.includes('Coolant Chiller 01'));
  assert.ok(rca.confidence >= 60);
});

test('RBAC and physical safety interlocks enforce Part 9 boundaries', () => {
  assert.equal(canPerformAction('Viewer', 'VIEW_PLATFORM'), true);
  assert.equal(canPerformAction('Viewer', 'APPROVE_CONSEQUENTIAL_ACTION'), false);
  assert.equal(canPerformAction('Operations Manager', 'APPROVE_CONSEQUENTIAL_ACTION'), true);
  assert.equal(canPerformAction('Platform Administrator', 'BYPASS_SAFETY_INTERLOCK'), false);
  assert.equal(requiresHumanApproval('WORK_ORDER'), true);
  assert.equal(requiresHumanApproval('PLC_ACTUATION'), true);
  assert.equal(requiresHumanApproval('READ_ONLY_QUERY'), false);
});
