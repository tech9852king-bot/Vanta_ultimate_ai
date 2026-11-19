import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canPerformAction,
  computeEnergySummary,
  computeLifecycleStages,
  computeNorthStarMetrics,
  computeZScoreAnomaly,
  correlateRootCauseEvidence,
  countEvidenceByClassification,
  estimateRemainingUsefulLife,
  evaluatePredictiveBacktest,
  evaluateTelemetryQuality,
  formatEvidenceClassificationSummary,
  getSectorProfile,
  requiresHumanApproval,
  resolveCanonicalProvenance,
  simulateTwinCascade,
  validateProvenanceCombination,
  validateWorkOrderTransition,
} from './intelligence.ts';
import type {
  Asset,
  AssetRelationship,
  EnergyRecord,
  Incident,
  InfrastructureEvent,
  PredictiveAssessment,
  RootCauseInvestigation,
  TelemetryPoint,
  WorkOrder,
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

test('computeLifecycleStages returns all 11 ordered VANTA stages grounded in live records', () => {
  const stages = computeLifecycleStages({
    iotIntegrations: [],
    cameras: [],
    telemetry: [],
    visionEvents: [],
    assets: [],
    relationships: [],
    events: [],
    incidents: [],
    rootCauseInvestigations: [],
    predictiveAssessments: [],
    approvals: [],
    workOrders: [],
  });
  assert.equal(stages.length, 11);
  assert.equal(stages[0].stage, 'CONNECT');
  assert.equal(stages[10].stage, 'VERIFY');
  assert.equal(stages[0].status, 'NOT_CONFIGURED');
});

test('computeNorthStarMetrics computes honest measured vs unverified ratios without fabricating data', () => {
  const workOrders: WorkOrder[] = [
    {
      id: 'wo-1',
      tenantId: 't1',
      facilityId: 'f1',
      assetId: 'a1',
      incidentId: null,
      title: 'Inspect Pump',
      description: 'Seal flush',
      priority: 'HIGH',
      status: 'COMPLETED',
      requestedBy: 'ops@test',
      approvedBy: 'mgr@test',
      safetyInterlockChecked: true,
      verificationStatus: 'VERIFIED',
      createdAt: '2026-11-12T00:00:00Z',
      updatedAt: '2026-11-12T01:00:00Z',
    },
    {
      id: 'wo-2',
      tenantId: 't1',
      facilityId: 'f1',
      assetId: 'a1',
      incidentId: null,
      title: 'Check Fan',
      description: 'Belt check',
      priority: 'LOW',
      status: 'COMPLETED',
      requestedBy: 'ops@test',
      approvedBy: 'mgr@test',
      safetyInterlockChecked: true,
      verificationStatus: 'PENDING',
      createdAt: '2026-11-12T00:00:00Z',
      updatedAt: '2026-11-12T01:00:00Z',
    },
  ];
  const predictive: PredictiveAssessment[] = [
    {
      id: 'p1',
      tenantId: 't1',
      assetId: 'a1',
      facilityId: 'f1',
      failureMode: 'Thermal',
      riskScore: 70,
      rulHours: 40,
      uncertaintyHours: 8,
      methodology: 'Z-Score',
      dataSource: 'OPC UA',
      validationStatus: 'STATISTICAL_ZSCORE',
      recommendedAction: 'Inspect',
      mode: 'MEASURED',
      computedAt: '2026-11-12T00:00:00Z',
    },
  ];
  const metrics = computeNorthStarMetrics({
    incidents: [],
    rootCauseInvestigations: [] as RootCauseInvestigation[],
    workOrders,
    predictiveAssessments: predictive,
    energyRecords: [],
  });
  assert.equal(metrics.incidentTriageCoveragePct, null);
  assert.equal(metrics.verifiedOutcomeRatePct, 50);
  assert.equal(metrics.predictiveEvidenceCoveragePct, 100);
  assert.equal(metrics.measuredEnergySharePct, null);
  assert.equal(metrics.safetyInterlockCompliancePct, 100);

  const sector = getSectorProfile('Data Center Operations');
  assert.ok(sector.monitoredEquipmentClasses.some((c) => c.includes('UPS')));
  assert.equal(metrics.ratios.verifiedOutcome.numerator, 1);
  assert.equal(metrics.ratios.verifiedOutcome.denominator, 2);

  // Priority Zero 4.4: Zero denominator MUST return null, never 100%
  const emptyMetrics = computeNorthStarMetrics({
    incidents: [],
    rootCauseInvestigations: [],
    workOrders: [],
    predictiveAssessments: [],
    energyRecords: [],
  });
  assert.equal(emptyMetrics.safetyInterlockCompliancePct, null);
  assert.equal(emptyMetrics.verifiedOutcomeRatePct, null);
  assert.equal(emptyMetrics.incidentTriageCoveragePct, null);
  assert.equal(emptyMetrics.predictiveEvidenceCoveragePct, null);
  assert.equal(emptyMetrics.measuredEnergySharePct, null);

  // Priority Zero 4.2 & 4.4: LEGACY_UNVERIFIED work orders do not inflate verified outcome rate,
  // while NEEDS_FOLLOW_UP and UNRESOLVED count in evaluated post-execution denominator
  const mixedOutcomes = computeNorthStarMetrics({
    incidents: [],
    rootCauseInvestigations: [],
    workOrders: [
      {
        ...workOrders[0],
        id: 'wo-legacy',
        status: 'COMPLETED',
        verificationStatus: 'LEGACY_UNVERIFIED',
      },
      {
        ...workOrders[0],
        id: 'wo-verified',
        status: 'COMPLETED',
        verificationStatus: 'VERIFIED',
      },
      {
        ...workOrders[0],
        id: 'wo-partial',
        status: 'NEEDS_FOLLOW_UP',
        verificationStatus: 'PARTIAL',
      },
      {
        ...workOrders[0],
        id: 'wo-unresolved',
        status: 'UNRESOLVED',
        verificationStatus: 'UNRESOLVED',
      },
    ],
    predictiveAssessments: [],
    energyRecords: [],
  });
  assert.equal(mixedOutcomes.legacyUnverifiedWorkOrdersCount, 1);
  assert.equal(mixedOutcomes.verifiedWorkOrdersCount, 1);
  assert.equal(mixedOutcomes.needsFollowUpWorkOrdersCount, 1);
  assert.equal(mixedOutcomes.unresolvedWorkOrdersCount, 1);
  assert.equal(mixedOutcomes.ratios.verifiedOutcome.numerator, 1);
  assert.equal(mixedOutcomes.ratios.verifiedOutcome.denominator, 3);
  assert.equal(mixedOutcomes.verifiedOutcomeRatePct, 33);
});

test('computeLifecycleStages strictly separates physical vs simulated connectors and telemetry (Priority Zero 4.5)', () => {
  const stages = computeLifecycleStages({
    iotIntegrations: [
      {
        id: 'iot-sim',
        tenantId: 't1',
        facilityId: 'f1',
        name: 'Simulated Broker',
        protocol: 'MQTT',
        endpoint: 'mqtt://broker.internal',
        status: 'SIMULATED',
        capabilityState: 'SIMULATED',
        pollingIntervalMs: 5000,
        deviceCount: 4,
        lastHeartbeatAt: '2026-11-15T00:00:00Z',
      },
      {
        id: 'iot-phys',
        tenantId: 't1',
        facilityId: 'f1',
        name: 'Physical Gateway',
        protocol: 'OPC_UA',
        endpoint: 'opc.tcp://10.0.0.10:4840',
        status: 'CONNECTED',
        capabilityState: 'FUNCTIONAL',
        pollingIntervalMs: 2000,
        deviceCount: 8,
        lastHeartbeatAt: '2026-11-15T01:00:00Z',
      },
    ],
    cameras: [],
    telemetry: [],
    visionEvents: [],
    assets: [],
    relationships: [],
    events: [],
    incidents: [],
    rootCauseInvestigations: [],
    predictiveAssessments: [],
    approvals: [],
    workOrders: [],
  });

  const connectStage = stages.find((s) => s.stage === 'CONNECT')!;
  assert.equal(connectStage.physicalCount, 1);
  assert.equal(connectStage.simulatedCount, 1);
  assert.equal(connectStage.count, 2);
  assert.ok(connectStage.summary.includes('1 physical'));
  assert.ok(connectStage.summary.includes('1 simulated'));

  // Verify all 8 industry sector profiles resolve distinctly
  const industries = [
    'Manufacturing & Industrial Production',
    'Energy & Power Infrastructure',
    'Data Centers',
    'Airports & Transportation',
    'Hospitals & Healthcare Infrastructure',
    'Commercial Buildings & Campuses',
    'Logistics & Supply Chain',
    'Smart Infrastructure',
  ];
  const resolvedSectors = new Set(industries.map((ind) => getSectorProfile(ind).sector));
  assert.equal(resolvedSectors.size, 8);
});

test('validateWorkOrderTransition enforces Part 14 state machine and blocks verification before execution', () => {
  assert.equal(validateWorkOrderTransition('CREATED', 'PENDING_APPROVAL').allowed, true);
  assert.equal(validateWorkOrderTransition('CREATED', 'COMPLETED').allowed, false);
  assert.equal(validateWorkOrderTransition('PENDING_APPROVAL', 'APPROVED').allowed, true);
  assert.equal(validateWorkOrderTransition('PENDING_APPROVAL', 'IN_PROGRESS').allowed, false);

  // Cannot bypass execution from APPROVED directly to COMPLETED or VERIFICATION_PENDING
  assert.equal(validateWorkOrderTransition('APPROVED', 'COMPLETED').allowed, false);
  assert.equal(validateWorkOrderTransition('APPROVED', 'VERIFICATION_PENDING').allowed, false);
  assert.equal(
    validateWorkOrderTransition('APPROVED', 'IN_PROGRESS', { hasExecutionRecord: true }).allowed,
    true
  );

  // In-progress requires execution record to enter VERIFICATION_PENDING or verify
  assert.equal(
    validateWorkOrderTransition('IN_PROGRESS', 'VERIFICATION_PENDING', { hasExecutionRecord: true }).allowed,
    true
  );

  // PARTIAL must map to NEEDS_FOLLOW_UP, never COMPLETED
  assert.equal(
    validateWorkOrderTransition('VERIFICATION_PENDING', 'COMPLETED', {
      hasExecutionRecord: true,
      verificationStatus: 'PARTIAL',
    }).allowed,
    false
  );
  assert.equal(
    validateWorkOrderTransition('VERIFICATION_PENDING', 'NEEDS_FOLLOW_UP', {
      hasExecutionRecord: true,
      verificationStatus: 'PARTIAL',
    }).allowed,
    true
  );

  // UNRESOLVED must map to UNRESOLVED, never COMPLETED
  assert.equal(
    validateWorkOrderTransition('VERIFICATION_PENDING', 'UNRESOLVED', {
      hasExecutionRecord: true,
      verificationStatus: 'UNRESOLVED',
    }).allowed,
    true
  );

  // VERIFIED maps to COMPLETED
  assert.equal(
    validateWorkOrderTransition('VERIFICATION_PENDING', 'COMPLETED', {
      hasExecutionRecord: true,
      verificationStatus: 'VERIFIED',
    }).allowed,
    true
  );

  // Terminal states cannot transition
  assert.equal(validateWorkOrderTransition('COMPLETED', 'IN_PROGRESS').allowed, false);
  assert.equal(validateWorkOrderTransition('CANCELLED', 'APPROVED').allowed, false);
  assert.equal(validateWorkOrderTransition('IN_PROGRESS', 'CANCELLED').allowed, false);
});

test('evaluateTelemetryQuality detects duplicates, out-of-order timestamps, staleness, and Part 15 KPI metadata', () => {
  const nowMs = Date.parse('2026-11-15T12:00:00.000Z');
  const basePoint: TelemetryPoint = {
    id: 'tp-1',
    tenantId: 't1',
    facilityId: 'f1',
    assetId: 'ast-1',
    metricName: 'Spindle Temp',
    value: 52.4,
    unit: '°C',
    thresholdWarn: 70,
    thresholdCrit: 85,
    zScore: 0.4,
    isAnomaly: false,
    mode: 'MEASURED',
    timestamp: '2026-11-15T11:55:00.000Z',
  };

  const healthy = evaluateTelemetryQuality([basePoint], nowMs);
  assert.equal(healthy.sensorHealth, 'HEALTHY');
  assert.equal(healthy.completenessPct, 100);
  assert.equal(healthy.measuredSharePct, 100);
  assert.equal(healthy.duplicateCount, 0);

  const dup = evaluateTelemetryQuality([basePoint, { ...basePoint, id: 'tp-2' }], nowMs);
  assert.equal(dup.duplicateCount, 1);
  assert.equal(dup.sensorHealth, 'DUPLICATE_DETECTED');

  const outOfOrder = evaluateTelemetryQuality(
    [
      basePoint,
      { ...basePoint, id: 'tp-early', value: 51.0, timestamp: '2026-11-15T11:40:00.000Z' },
    ],
    nowMs
  );
  assert.equal(outOfOrder.outOfOrderCount, 1);
  assert.equal(outOfOrder.sensorHealth, 'OUT_OF_ORDER');

  // Verify Part 15 KPI metadata fields
  const kpi = computeNorthStarMetrics({
    incidents: [],
    rootCauseInvestigations: [],
    workOrders: [],
    predictiveAssessments: [],
    energyRecords: [],
  });
  assert.ok(kpi.ratios.verifiedOutcome.formula.includes('human_verified'));
  assert.ok(kpi.ratios.verifiedOutcome.source.includes('HUMAN_REPORTED'));
  assert.equal(kpi.ratios.verifiedOutcome.dataQuality, 'INSUFFICIENT_DATA');
  assert.equal(kpi.ratios.verifiedOutcome.drillDownSection, 'operations');
});

test('validateProvenanceCombination & resolveCanonicalProvenance reject contradictory combinations and enforce Section 3 invariants', () => {
  // 1. Contradictory combinations explicitly forbidden by Section 3
  assert.equal(validateProvenanceCombination('MEASURED', 'HUMAN_REPORTED', 'INCIDENTS').valid, false);
  assert.equal(validateProvenanceCombination('MEASURED', 'INFERRED', 'RCA').valid, false);
  assert.equal(validateProvenanceCombination('MEASURED', 'PREDICTED', 'PREDICTIVE').valid, false);
  assert.equal(validateProvenanceCombination('SIMULATED', 'OBSERVED', 'VISION').valid, false);
  assert.equal(validateProvenanceCombination('MEASURED', 'OBSERVED', 'VISION').valid, false);
  assert.equal(validateProvenanceCombination('MEASURED', 'SYSTEM_RECORDED', 'WORKFLOW').valid, false);

  // 2. Non-sensor modules cannot claim MEASURED even if both fields are MEASURED
  assert.equal(validateProvenanceCombination('MEASURED', 'MEASURED', 'INCIDENTS').valid, false);
  assert.equal(validateProvenanceCombination('MEASURED', 'MEASURED', 'RCA').valid, false);
  assert.equal(validateProvenanceCombination('MEASURED', 'MEASURED', 'PREDICTIVE').valid, false);
  assert.equal(validateProvenanceCombination('MEASURED', 'MEASURED', 'VISION').valid, false);
  assert.equal(validateProvenanceCombination('MEASURED', 'MEASURED', 'WORKFLOW').valid, false);

  // 3. Valid canonical pairs pass validation
  assert.equal(validateProvenanceCombination('MEASURED', 'MEASURED', 'IOT_TELEMETRY').valid, true);
  assert.equal(validateProvenanceCombination('SIMULATED', 'SIMULATED', 'IOT_TELEMETRY').valid, true);
  assert.equal(validateProvenanceCombination('SIMULATED', 'SIMULATED', 'VISION').valid, true);
  assert.equal(validateProvenanceCombination('OBSERVED', 'OBSERVED', 'VISION').valid, true);
  assert.equal(validateProvenanceCombination('HUMAN_REPORTED', 'HUMAN_REPORTED', 'INCIDENTS').valid, true);
  assert.equal(validateProvenanceCombination('HUMAN_REPORTED', 'HUMAN_REPORTED', 'WORKFLOW').valid, true);
  assert.equal(validateProvenanceCombination('SYSTEM_RECORDED', 'SYSTEM_RECORDED', 'WORKFLOW').valid, true);
  assert.equal(validateProvenanceCombination('INFERRED', 'INFERRED', 'RCA').valid, true);
  assert.equal(validateProvenanceCombination('PREDICTED', 'PREDICTED', 'PREDICTIVE').valid, true);
  assert.equal(validateProvenanceCombination('ESTIMATED', 'ESTIMATED', 'ENERGY').valid, true);

  // 4. resolveCanonicalProvenance maps legacy/mismatched inputs to consistent canonical pairs
  const incResolved = resolveCanonicalProvenance({
    sourceModule: 'INCIDENTS',
    dataMode: 'MEASURED',
    evidenceClass: 'HUMAN_REPORTED',
  });
  assert.equal(incResolved.dataMode, 'HUMAN_REPORTED');
  assert.equal(incResolved.evidenceClass, 'HUMAN_REPORTED');

  const rcaResolved = resolveCanonicalProvenance({
    sourceModule: 'RCA',
    dataMode: 'MEASURED',
    evidenceClass: 'INFERRED',
  });
  assert.equal(rcaResolved.dataMode, 'INFERRED');
  assert.equal(rcaResolved.evidenceClass, 'INFERRED');

  const predResolved = resolveCanonicalProvenance({
    sourceModule: 'PREDICTIVE',
    dataMode: 'MEASURED',
    evidenceClass: 'PREDICTED',
  });
  assert.equal(predResolved.dataMode, 'PREDICTED');
  assert.equal(predResolved.evidenceClass, 'PREDICTED');

  const visSampleResolved = resolveCanonicalProvenance({
    sourceModule: 'VISION',
    dataMode: 'SIMULATED',
    evidenceClass: 'OBSERVED',
  });
  assert.equal(visSampleResolved.dataMode, 'SIMULATED');
  assert.equal(visSampleResolved.evidenceClass, 'SIMULATED');

  const visUploadResolved = resolveCanonicalProvenance({
    sourceModule: 'VISION',
    dataMode: 'MEASURED',
    evidenceClass: 'OBSERVED',
  });
  assert.equal(visUploadResolved.dataMode, 'OBSERVED');
  assert.equal(visUploadResolved.evidenceClass, 'OBSERVED');
  assert.equal(visUploadResolved.dataQualityStatus, 'PENDING_VERIFICATION');

  // 5. Phase 5 Data-Quality Status Governance: VERIFIED vs VALIDATED vs PENDING_VERIFICATION vs SIMULATED_SYNTHETIC
  assert.equal(incResolved.dataQualityStatus, 'PENDING_VERIFICATION');
  assert.equal(
    resolveCanonicalProvenance({
      sourceModule: 'INCIDENTS',
      dataMode: 'HUMAN_REPORTED',
      evidenceClass: 'HUMAN_REPORTED',
      isIndependentlyVerified: true,
    }).dataQualityStatus,
    'VERIFIED'
  );
  assert.equal(rcaResolved.dataQualityStatus, 'PENDING_VERIFICATION');
  assert.equal(predResolved.dataQualityStatus, 'PENDING_VERIFICATION');
  assert.equal(visSampleResolved.dataQualityStatus, 'SIMULATED_SYNTHETIC');
  assert.equal(
    resolveCanonicalProvenance({
      sourceModule: 'WORKFLOW',
      dataMode: 'SYSTEM_RECORDED',
      evidenceClass: 'SYSTEM_RECORDED',
    }).dataQualityStatus,
    'VALIDATED'
  );
  assert.equal(
    resolveCanonicalProvenance({
      sourceModule: 'IOT',
      dataMode: 'MEASURED',
      evidenceClass: 'MEASURED',
    }).dataQualityStatus,
    'VERIFIED'
  );
});

test('countEvidenceByClassification & formatEvidenceClassificationSummary strictly separate all 9 categories and never conflate OBSERVED/HUMAN_REPORTED/SYSTEM_RECORDED into MEASURED', () => {
  const emptyCounts = countEvidenceByClassification([]);
  assert.deepEqual(emptyCounts, {
    MEASURED: 0,
    OBSERVED: 0,
    HUMAN_REPORTED: 0,
    SYSTEM_RECORDED: 0,
    ESTIMATED: 0,
    INFERRED: 0,
    PREDICTED: 0,
    SIMULATED: 0,
    UNKNOWN: 0,
  });

  // Mixed evidence set across all 9 classifications
  const mixedCounts = countEvidenceByClassification([
    { evidenceClass: 'MEASURED', dataMode: 'MEASURED' },
    { evidenceClass: 'MEASURED', dataMode: 'MEASURED' },
    { evidenceClass: 'OBSERVED', dataMode: 'OBSERVED' },
    { evidenceClass: 'HUMAN_REPORTED', dataMode: 'HUMAN_REPORTED' },
    { evidenceClass: 'HUMAN_REPORTED', dataMode: 'HUMAN_REPORTED' },
    { evidenceClass: 'HUMAN_REPORTED', dataMode: 'HUMAN_REPORTED' },
    { evidenceClass: 'SYSTEM_RECORDED', dataMode: 'SYSTEM_RECORDED' },
    { evidenceClass: 'ESTIMATED', dataMode: 'ESTIMATED' },
    { evidenceClass: 'INFERRED', dataMode: 'INFERRED' },
    { evidenceClass: 'PREDICTED', dataMode: 'PREDICTED' },
    { evidenceClass: 'PREDICTED', dataMode: 'PREDICTED' },
    { evidenceClass: 'SIMULATED', dataMode: 'SIMULATED' },
    { evidenceClass: 'UNKNOWN', dataMode: 'UNKNOWN' },
  ]);

  // MEASURED must equal 2 (never 2 + 1 + 3 + 1 = 7!)
  assert.equal(mixedCounts.MEASURED, 2);
  assert.equal(mixedCounts.OBSERVED, 1);
  assert.equal(mixedCounts.HUMAN_REPORTED, 3);
  assert.equal(mixedCounts.SYSTEM_RECORDED, 1);
  // ESTIMATED must equal 1 (never 1 + 1 + 2 = 4!)
  assert.equal(mixedCounts.ESTIMATED, 1);
  assert.equal(mixedCounts.INFERRED, 1);
  assert.equal(mixedCounts.PREDICTED, 2);
  assert.equal(mixedCounts.SIMULATED, 1);
  assert.equal(mixedCounts.UNKNOWN, 1);

  const summary = formatEvidenceClassificationSummary(mixedCounts);
  assert.ok(summary.includes('MEASURED: 2'));
  assert.ok(summary.includes('OBSERVED: 1'));
  assert.ok(summary.includes('HUMAN_REPORTED: 3'));
  assert.ok(summary.includes('SYSTEM_RECORDED: 1'));
  assert.ok(summary.includes('ESTIMATED: 1'));
  assert.ok(summary.includes('INFERRED: 1'));
  assert.ok(summary.includes('PREDICTED: 2'));
  assert.ok(summary.includes('SIMULATED: 1'));
  assert.ok(summary.includes('UNKNOWN: 1'));
});




