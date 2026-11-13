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
  healthScore: number; // 0..100 computed from telemetry/maintenance
  xPos: number; // Digital Twin normalized coordinate 0..100
  yPos: number; // Digital Twin normalized coordinate 0..100
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

export interface Camera {
  id: string;
  tenantId: string;
  facilityId: string;
  zoneId: string;
  assetId: string | null;
  name: string;
  streamProtocol: 'RTSP_EDGE' | 'ONVIF_SIMULATED' | 'WEBRTC_PROXY';
  resolution: string;
  fps: number;
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  mode: DataOriginMode;
  modelVersion: string;
  confidenceThreshold: number;
  sampleImageUrl: string;
  privacyPolicy: string;
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
  evidenceImageUrl: string;
  createdAt: string;
}

export interface IoTIntegration {
  id: string;
  tenantId: string;
  facilityId: string;
  name: string;
  protocol: 'MQTT' | 'OPC_UA' | 'MODBUS_TCP' | 'REST_API' | 'WEBSOCKET';
  endpoint: string;
  status: 'CONNECTED' | 'SIMULATED' | 'DEGRADED' | 'NOT_CONFIGURED';
  capabilityState: CapabilityState;
  pollingIntervalMs: number;
  deviceCount: number;
  lastHeartbeatAt: string;
}

export interface TelemetryPoint {
  id: string;
  tenantId: string;
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
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';
  requestedBy: string;
  approvedBy: string | null;
  safetyInterlockChecked: boolean;
  createdAt: string;
  updatedAt: string;
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
  riskScore: number; // 0..100
  rulHours: number;
  uncertaintyHours: number;
  methodology: string;
  dataSource: string;
  validationStatus: 'RULE_VERIFIED' | 'STATISTICAL_ZSCORE' | 'SIMULATED_BASELINE';
  recommendedAction: string;
  mode: DataOriginMode;
  computedAt: string;
}

export interface RootCauseInvestigation {
  id: string;
  tenantId: string;
  incidentId: string;
  facilityId: string;
  detectedIssue: string;
  supportingEvidence: Array<{ sourceType: string; recordId: string; summary: string }>;
  relatedAssetIds: string[];
  potentialCauses: Array<{ cause: string; score: number; mechanism: string }>;
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
  canActuatePhysicalControl: false; // Hard architectural boundary (Part 9)
  capabilityState: CapabilityState;
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

export interface BrainAnalysisResponse {
  query: string;
  verifiedFacts: Array<{ claim: string; sourceId: string; module: string }>;
  observations: string[];
  assumptionsAndHypotheses: string[];
  recommendations: Array<{
    action: string;
    priority: SeverityLevel;
    requiresHumanApproval: boolean;
    rationale: string;
  }>;
  toolsCalled: string[];
  engineUsed: 'GEMINI_4_HYDROGEN' | 'DETERMINISTIC_CORE_FALLBACK';
  uncertaintyNote: string;
  createdAt: string;
}
