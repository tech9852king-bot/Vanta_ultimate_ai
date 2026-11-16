/**
 * VANTA AI — Universal Infrastructure Data Contracts
 * Common types shared across backend, core intelligence engine, and frontend.
 */

export type CapabilityState =
  | 'FUNCTIONAL'
  | 'PARTIALLY_FUNCTIONAL'
  | 'SIMULATED'
  | 'NOT_CONFIGURED'
  | 'PLANNED';

export type CameraCapabilityState =
  | 'LIVE'
  | 'SIMULATED'
  | 'SAMPLE_IMAGE'
  | 'OFFLINE'
  | 'DEGRADED'
  | 'NOT_CONFIGURED';

export type CameraProviderType =
  | 'SAMPLE_BUFFER'
  | 'UPLOADED_IMAGE'
  | 'RTSP_EDGE'
  | 'ONVIF_DEVICE'
  | 'WEBRTC_PROXY';

export type IndustrySector =
  | 'Manufacturing & Industrial Production'
  | 'Energy & Power Infrastructure'
  | 'Airports & Transportation'
  | 'Hospitals & Healthcare Infrastructure'
  | 'Data Centers'
  | 'Commercial Buildings & Campuses'
  | 'Logistics & Supply Chain'
  | 'Smart Infrastructure';

export type VantaRole =
  | 'Platform Administrator'
  | 'Organization Administrator'
  | 'Facility Administrator'
  | 'Infrastructure Engineer'
  | 'Operations Manager'
  | 'Security Operator'
  | 'Maintenance Engineer'
  | 'Analyst'
  | 'Viewer';

export type DataOriginMode = 'MEASURED' | 'ESTIMATED' | 'SIMULATED';

/**
 * Part 6: VANTA Evidence Intelligence Engine — 9 canonical evidence classifications.
 * Human reports and system records are never collapsed into sensor measurements.
 */
export type EvidenceClassification =
  | 'MEASURED'
  | 'OBSERVED'
  | 'HUMAN_REPORTED'
  | 'SYSTEM_RECORDED'
  | 'ESTIMATED'
  | 'INFERRED'
  | 'PREDICTED'
  | 'SIMULATED'
  | 'UNKNOWN';

/**
 * Part 6: Evidence graph relationship types.
 */
export type EvidenceRelationType =
  | 'SUPPORTS'
  | 'CONTRADICTS'
  | 'DERIVED_FROM'
  | 'CORRELATES_WITH'
  | 'VERIFIES'
  | 'SUPERSEDES'
  | 'REQUIRES_REVIEW';

export type ConnectorLifecycleStage =
  | 'REGISTER'
  | 'CONFIGURE'
  | 'VALIDATE'
  | 'AUTHENTICATE'
  | 'CONNECT'
  | 'COLLECT'
  | 'NORMALIZE'
  | 'MONITOR'
  | 'RECOVER'
  | 'DISCONNECT';

export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type AssetStatus = 'NOMINAL' | 'WARNING' | 'CRITICAL' | 'MAINTENANCE' | 'OFFLINE';

export type NavigationSection =
  | 'overview'
  | 'command-center'
  | 'vanta-brain'
  | 'vision-intelligence'
  | 'camera-management'
  | 'infrastructure'
  | 'asset-intelligence'
  | 'iot-telemetry'
  | 'digital-twin'
  | 'predictive-maintenance'
  | 'energy-intelligence'
  | 'root-cause-analysis'
  | 'ai-agents'
  | 'operations-workflows'
  | 'knowledge-center'
  | 'security-governance'
  | 'analytics-reports'
  | 'integrations'
  | 'administration'
  | 'system-health';

export interface Organization {
  id: string;
  tenantId: string;
  name: string;
  industry: IndustrySector;
  region: string;
  createdAt: string;
}

export interface UserSession {
  id: string;
  tenantId: string;
  organizationName: string;
  email: string;
  fullName: string;
  role: VantaRole;
  facilityIds: string[];
  sessionId?: string;
  status?: 'ACTIVE' | 'SUSPENDED';
}

export interface Site {
  id: string;
  tenantId: string;
  name: string;
  country: string;
  timezone: string;
}

export interface Facility {
  id: string;
  tenantId: string;
  siteId: string;
  name: string;
  sector: IndustrySector;
  code: string;
  status: AssetStatus;
  coordinates: string;
  areaSqm: number;
  criticality: 'TIER_1' | 'TIER_2' | 'TIER_3';
}

export interface BuildingZone {
  id: string;
  tenantId: string;
  facilityId: string;
  buildingName: string;
  floor: string;
  zoneName: string;
  zoneType: 'PRODUCTION' | 'ELECTRICAL' | 'COMPUTE' | 'LOGISTICS' | 'RESTRICTED' | 'HVAC';
  restricted: boolean;
}

export interface Asset {
  id: string;
  tenantId: string;
  facilityId: string;
  zoneId: string;
  parentAssetId: string | null;
  code: string;
  name: string;
  assetType:
    | 'PRODUCTION_LINE'
    | 'MACHINE'
    | 'EQUIPMENT'
    | 'SENSOR'
    | 'DEVICE'
    | 'ELECTRICAL_ASSET'
    | 'NETWORK_ASSET'
    | 'HVAC_CHILLER';
  manufacturer: string;
  model: string;
  status: AssetStatus;
  owner: string;
  dataMode: DataOriginMode;
  healthScore: number;
  xPos: number;
  yPos: number;
  metadata: Record<string, string | number | boolean>;
  updatedAt: string;
}

export interface AssetRelationship {
  id: string;
  tenantId: string;
  sourceAssetId: string;
  targetAssetId: string;
  relationshipType: 'POWERS' | 'COOLS' | 'FEEDS' | 'MONITORS' | 'CONTAINS' | 'DEPENDS_ON';
  criticalityWeight: number;
}

export interface DigitalTwinSnapshot {
  id: string;
  tenantId: string;
  facilityId: string | null;
  twinVersion: string;
  label: string;
  assetCount: number;
  criticalAssetCount: number;
  meanHealthScore: number;
  stateSummary: Array<{
    assetId: string;
    code: string;
    status: AssetStatus;
    healthScore: number;
    dataMode: DataOriginMode;
  }>;
  createdBy: string;
  createdAt: string;
}

export interface TwinScenarioResult {
  seedAssetId: string;
  scenarioType: 'ASSET_OFFLINE' | 'COOLING_DEGRADATION' | 'POWER_LOSS';
  affectedAssets: Array<{
    assetId: string;
    code: string;
    name: string;
    hopDistance: number;
    impactType: string;
    projectedStatus: AssetStatus;
    projectedHealthDelta: number;
  }>;
  cascadeDepth: number;
  mode: 'SIMULATED';
  disclaimer: string;
}

export interface Camera {
  id: string;
  tenantId: string;
  facilityId: string;
  zoneId: string;
  assetId: string | null;
  name: string;
  streamProtocol: 'RTSP_EDGE' | 'ONVIF_SIMULATED' | 'WEBRTC_PROXY';
  providerType?: CameraProviderType;
  capabilityState?: CameraCapabilityState;
  resolution: string;
  fps: number;
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  mode: DataOriginMode;
  modelVersion: string;
  confidenceThreshold: number;
  sampleImageUrl: string;
  privacyPolicy: string;
  lastError?: string | null;
  streamHealthPct?: number;
  lastFrameAt: string;
}

export interface VisionDetection {
  label: string;
  category: 'PPE_COMPLIANCE' | 'SAFETY_ZONE' | 'EQUIPMENT_STATE' | 'OBSTRUCTION' | 'VEHICLE';
  confidence: number;
  zone: string;
  observation: string;
}

export interface VisionEvent {
  id: string;
  tenantId: string;
  cameraId: string;
  facilityId: string;
  assetId: string | null;
  eventType: string;
  severity: SeverityLevel;
  confidence: number;
  summary: string;
  detections: VisionDetection[];
  inferenceEngine: 'GEMINI_MULTIMODAL' | 'RULE_BASED_EDGE';
  mode: DataOriginMode;
  captureSource?: 'SAMPLE_IMAGE' | 'UPLOADED_IMAGE' | 'SIMULATED_BUFFER';
  evidenceImageUrl: string;
  createdAt: string;
}

export interface IoTIntegration {
  id: string;
  tenantId: string;
  facilityId: string;
  name: string;
  protocol: 'MQTT' | 'OPC_UA' | 'MODBUS_TCP' | 'REST_API' | 'WEBSOCKET' | 'BACNET_IP' | 'SNMP';
  endpoint: string;
  status: 'CONNECTED' | 'SIMULATED' | 'DEGRADED' | 'NOT_CONFIGURED' | 'OFFLINE';
  capabilityState: CapabilityState;
  lifecycleStage?: ConnectorLifecycleStage;
  pollingIntervalMs: number;
  deviceCount: number;
  latencyMs?: number | null;
  consecutiveFailures?: number;
  dataFreshnessSec?: number | null;
  retryStatus?: 'IDLE' | 'BACKOFF_RETRY' | 'RECOVERED' | 'HALTED';
  lastError?: string | null;
  credentialRef?: string | null;
  lastHeartbeatAt: string;
}

export interface TelemetryPoint {
  id: string;
  tenantId: string;
  facilityId?: string;
  assetId: string;
  metricName: string;
  value: number;
  unit: string;
  thresholdWarn: number;
  thresholdCrit: number;
  zScore: number;
  isAnomaly: boolean;
  mode: DataOriginMode;
  timestamp: string;
}

export interface EvidenceProvenanceRecord {
  id: string;
  sourceModule: string;
  sourceRecordId?: string;
  assetId: string | null;
  facilityId: string | null;
  timestamp: string;
  ingestionTimestamp?: string;
  observationWindow?: string | null;
  unit?: string | null;
  dataMode: DataOriginMode;
  evidenceClass?: EvidenceClassification;
  dataQualityStatus?: 'VERIFIED' | 'VALIDATED' | 'UNVERIFIED' | 'STALE' | 'DEGRADED';
  relationshipType?: EvidenceRelationType | null;
  parentEvidenceId?: string | null;
  processingMethod: string;
  modelVersion: string | null;
  summary: string;
}

export interface InfrastructureEvent {
  id: string;
  tenantId: string;
  facilityId: string;
  assetId: string | null;
  sourceModule: 'VISION' | 'IOT' | 'PREDICTIVE' | 'ENERGY' | 'SECURITY' | 'WORKFLOW' | 'SYSTEM';
  eventType: string;
  severity: SeverityLevel;
  title: string;
  description: string;
  mode: DataOriginMode;
  createdAt: string;
}

export interface Incident {
  id: string;
  tenantId: string;
  facilityId: string;
  assetId: string | null;
  title: string;
  description: string;
  severity: SeverityLevel;
  status: 'OPEN' | 'INVESTIGATING' | 'MITIGATED' | 'RESOLVED';
  assignedTo: string | null;
  openedAt: string;
  resolvedAt: string | null;
}

export interface MaintenanceRecord {
  id: string;
  tenantId: string;
  assetId: string;
  facilityId: string;
  maintenanceType: 'PREVENTIVE' | 'CORRECTIVE' | 'PREDICTIVE' | 'INSPECTION';
  performedBy: string;
  summary: string;
  downtimeMinutes: number;
  partsReplaced: string;
  performedAt: string;
}

export interface WorkOrder {
  id: string;
  tenantId: string;
  facilityId: string;
  assetId: string;
  incidentId: string | null;
  title: string;
  description: string;
  priority: SeverityLevel;
  status:
    | 'CREATED'
    | 'DRAFT'
    | 'PENDING_APPROVAL'
    | 'APPROVED'
    | 'IN_PROGRESS'
    | 'VERIFICATION_PENDING'
    | 'COMPLETED'
    | 'NEEDS_FOLLOW_UP'
    | 'UNRESOLVED'
    | 'REJECTED'
    | 'CANCELLED';
  requestedBy: string;
  approvedBy: string | null;
  safetyInterlockChecked: boolean;
  executionNotes?: string | null;
  executedBy?: string | null;
  executedAt?: string | null;
  executionMode?: 'FIELD_DISPATCH_RECORDED' | null;
  verificationStatus?: 'PENDING' | 'VERIFIED' | 'PARTIAL' | 'UNRESOLVED' | 'LEGACY_UNVERIFIED' | null;
  verificationNotes?: string | null;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LifecycleStageSnapshot {
  stage:
    | 'CONNECT'
    | 'COLLECT'
    | 'NORMALIZE'
    | 'CONTEXTUALIZE'
    | 'ANALYZE'
    | 'CORRELATE'
    | 'PREDICT'
    | 'RECOMMEND'
    | 'APPROVE'
    | 'EXECUTE'
    | 'VERIFY';
  order: number;
  label: string;
  status: 'ACTIVE' | 'ATTENTION' | 'PENDING' | 'NOT_CONFIGURED';
  count: number;
  physicalCount: number;
  simulatedCount: number;
  summary: string;
  evidence: string[];
  blockers: string[];
  lastUpdatedAt: string | null;
}

export interface MetricObservationRatio {
  numerator: number;
  denominator: number;
  methodology: string;
  formula: string;
  source: string;
  timeWindow: string;
  dataQuality: 'VERIFIED' | 'MIXED_MODES' | 'SIMULATED_ONLY' | 'INSUFFICIENT_DATA' | 'MEASURED' | 'MIXED' | 'SIMULATED';
  calculatedAt: string;
  drillDownSection: string;
}

export interface NorthStarMetrics {
  incidentTriageCoveragePct: number | null;
  verifiedOutcomeRatePct: number | null;
  predictiveEvidenceCoveragePct: number | null;
  measuredEnergySharePct: number | null;
  safetyInterlockCompliancePct: number | null;
  connectorReliabilityPct?: number | null;
  telemetryQualityScore?: number | null;
  assetDataCoveragePct?: number | null;
  evidenceCompletenessPct?: number | null;
  completedWorkOrdersCount: number;
  verifiedWorkOrdersCount: number;
  needsFollowUpWorkOrdersCount: number;
  unresolvedWorkOrdersCount: number;
  legacyUnverifiedWorkOrdersCount: number;
  openIncidentsCount: number;
  corroboratedIncidentsCount: number;
  measuredEnergyKwh: number;
  estimatedEnergyKwh: number;
  simulatedEnergyKwh: number;
  ruleVerifiedAssessmentsCount: number;
  statisticalAssessmentsCount: number;
  simulatedAssessmentsCount: number;
  ratios: {
    incidentTriage: MetricObservationRatio;
    verifiedOutcome: MetricObservationRatio;
    predictiveEvidence: MetricObservationRatio;
    measuredEnergy: MetricObservationRatio;
    safetyInterlock: MetricObservationRatio;
  };
  epistemicNote: string;
}

export interface SectorConfigurationProfile {
  sector: string;
  monitoredEquipmentClasses: string[];
  criticalEnvelopes: string[];
  interlockBoundaryPolicy: string;
  recommendedConnectors: string[];
  standardsRef?: string[];
}

export interface EnergyRecord {
  id: string;
  tenantId: string;
  facilityId: string;
  assetId: string | null;
  periodStart: string;
  consumptionKwh: number;
  peakDemandKw: number;
  baselineKwh: number;
  powerFactor: number;
  mode: DataOriginMode;
  methodology: string;
}

export interface PredictiveAssessment {
  id: string;
  tenantId: string;
  assetId: string;
  facilityId: string;
  failureMode: string;
  riskScore: number;
  rulHours: number;
  uncertaintyHours: number;
  methodology: string;
  dataSource: string;
  validationStatus: 'RULE_VERIFIED' | 'STATISTICAL_ZSCORE' | 'SIMULATED_BASELINE';
  modelKind?: 'THRESHOLD_RULE' | 'STATISTICAL_ZSCORE' | 'HEURISTIC_HEALTH' | 'HEADROOM_RUL_ESTIMATE';
  modelVersion?: string;
  dataQualityScore?: number;
  driftStatus?: 'NOMINAL' | 'ELEVATED_DRIFT' | 'INSUFFICIENT_HISTORY';
  recommendedAction: string;
  mode: DataOriginMode;
  computedAt: string;
}

export interface PredictiveBacktestResult {
  assetId: string;
  sampleCount: number;
  anomalyAlertsEvaluated: number;
  thresholdGroundTruthCount: number;
  precision: number | null;
  recall: number | null;
  f1Score: number | null;
  meanAbsoluteDrift: number;
  dataQualityScore: number;
  driftDetected: boolean;
  calibrationNote: string;
}

export interface RootCauseInvestigation {
  id: string;
  tenantId: string;
  incidentId: string;
  facilityId: string;
  detectedIssue: string;
  supportingEvidence: Array<{ sourceType: string; recordId: string; summary: string }>;
  relatedAssetIds: string[];
  potentialCauses: Array<{ cause: string; score: number; mechanism: string; selectionReason?: string }>;
  alternativeExplanations: string[];
  confidence: number;
  uncertaintyNotes: string;
  recommendedInvestigation: string;
  humanDecision: string | null;
  resolutionRecord: string | null;
  outcomeVerification: string | null;
  status: 'OPEN' | 'REVIEWED' | 'VERIFIED';
  createdAt: string;
}

export interface AgentDefinition {
  id: string;
  name: string;
  domain: string;
  purpose: string;
  authorizedTools: string[];
  maxSteps: number;
  canActuatePhysicalControl: false;
  capabilityState: CapabilityState;
}

export interface AgentTraceStep {
  stepIndex: number;
  toolName: string;
  status: 'COMPLETED' | 'SKIPPED' | 'DENIED' | 'FAILED';
  durationMs: number;
  recordsRetrieved: number;
  note?: string;
}

export interface AgentExecution {
  id: string;
  tenantId: string;
  agentId: string;
  requestedBy: string;
  prompt: string;
  status: 'COMPLETED' | 'AWAITING_APPROVAL' | 'FAILED' | 'BLOCKED_SAFETY';
  stepsTaken: number;
  toolsInvoked: string[];
  evidenceRefs: string[];
  outputSummary: string;
  requiresApproval: boolean;
  idempotencyKey?: string | null;
  trace?: AgentTraceStep[];
  conflictsDetected?: string[];
  durationMs?: number;
  createdAt: string;
}

export interface ApprovalItem {
  id: string;
  tenantId: string;
  facilityId: string;
  targetType: 'WORK_ORDER' | 'THRESHOLD_CHANGE' | 'ISOLATION_REQUEST' | 'AGENT_RECOMMENDATION';
  targetId: string;
  title: string;
  justification: string;
  requestedBy: string;
  riskLevel: SeverityLevel;
  safetyBoundaryCheck: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decidedBy: string | null;
  decisionNotes: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface AuditRecord {
  id: string;
  tenantId: string;
  actorEmail: string;
  actorRole: VantaRole;
  action: string;
  resourceType: string;
  resourceId: string;
  outcome: 'SUCCESS' | 'DENIED' | 'ERROR';
  details: string;
  createdAt: string;
}

export interface KnowledgeDocument {
  id: string;
  tenantId: string;
  facilityId: string | null;
  title: string;
  category: 'MANUAL' | 'SOP' | 'SPECIFICATION' | 'POSTMORTEM' | 'SAFETY_INTERLOCK';
  minRole: VantaRole;
  sourceRef: string;
  version: string;
  content: string;
  updatedAt: string;
}

export type BrainExecutionStatus =
  | 'GEMINI_SUCCESS'
  | 'DETERMINISTIC_FALLBACK'
  | 'DEGRADED'
  | 'FAILED'
  | 'CANCELLED'
  | 'NOT_CONFIGURED';

export type BrainProviderStatus =
  | 'AVAILABLE'
  | 'NOT_CONFIGURED'
  | 'MISSING_API_KEY'
  | 'AUTH_ERROR'
  | 'PERMISSION_ERROR'
  | 'PERMISSION_DENIED'
  | 'INVALID_MODEL'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'UNAVAILABLE'
  | 'MALFORMED_OUTPUT'
  | 'ABORTED'
  | 'PROMPT_BLOCKED';

export interface BrainToolExecutionResult {
  toolName: string;
  status: 'COMPLETED' | 'FAILED' | 'DENIED';
  recordCount: number;
  recordsRetrieved?: number;
  durationMs: number;
  error?: string;
}

export interface BrainRunRecord {
  id: string;
  tenantId: string;
  facilityIds: string[];
  actorEmail: string;
  query: string;
  intent: string;
  engineUsed: 'GEMINI_4_HYDROGEN' | 'DETERMINISTIC_CORE_FALLBACK';
  modelId: string;
  executionStatus: BrainExecutionStatus;
  providerStatus: BrainProviderStatus | null;
  failureCategory: string | null;
  correlationId: string | null;
  toolsCalled: string[];
  toolResults: BrainToolExecutionResult[];
  verifiedFactsCount: number;
  rejectedCitationsCount: number;
  omittedEvidenceCount: number;
  retryCount?: number;
  latencyMs: number;
  createdAt: string;
}

export interface GeminiProviderVerificationStep {
  step: number;
  name: string;
  status: 'PASSED' | 'FAILED' | 'BLOCKED' | 'SKIPPED';
  durationMs: number;
  detail: string;
}

export interface GeminiProviderVerificationReport {
  overallStatus: 'VERIFIED_LIVE' | 'DEGRADED_FALLBACK' | 'BLOCKED_NO_CREDENTIALS' | 'FAILED_CONFIG';
  geminiConfigured: boolean;
  modelId: string;
  modelValid: boolean;
  timeoutMs: number;
  steps: GeminiProviderVerificationStep[];
  sampleBrainRunId?: string | null;
  totalDurationMs: number;
  verifiedAt: string;
}

export interface BrainAnalysisResponse {
  executionId?: string;
  correlationId?: string;
  query: string;
  intent?: string;
  situationSummary?: string;
  verifiedFacts: Array<{
    claim: string;
    sourceId: string;
    module: string;
    dataMode?: DataOriginMode;
    evidenceClass?: EvidenceClassification;
    facilityId?: string | null;
  }>;
  rejectedCitations?: Array<{ claim: string; sourceId: string; reason: string }>;
  observations: string[];
  anomalies?: string[];
  candidateCauses?: string[];
  supportingEvidence?: string[];
  contradictoryEvidence?: string[];
  assumptionsAndHypotheses: string[];
  predictions?: string[];
  confidence?: number;
  confidenceLabel?: 'HIGH_EVIDENCE_CORROBORATION' | 'MODERATE_EVIDENCE_CORROBORATION' | 'LIMITED_EVIDENCE';
  confidenceMethodology?: string;
  unknowns?: string[];
  recommendations: Array<{
    action: string;
    priority: SeverityLevel;
    requiresHumanApproval: boolean;
    rationale: string;
  }>;
  investigationStages?: Array<{
    stage: number;
    name: string;
    status: 'COMPLETED' | 'SKIPPED' | 'DEGRADED' | 'FAILED';
    detail: string;
  }>;
  toolsCalled: string[];
  toolResults?: BrainToolExecutionResult[];
  omittedEvidenceCount?: number;
  retryCount?: number;
  dataFreshnessSummary?: string;
  engineUsed: 'GEMINI_4_HYDROGEN' | 'DETERMINISTIC_CORE_FALLBACK';
  executionStatus?: BrainExecutionStatus;
  providerStatus?: BrainProviderStatus;
  failureCategory?: string | null;
  modelId?: string;
  latencyMs?: number;
  uncertaintyNote: string;
  createdAt: string;
}
