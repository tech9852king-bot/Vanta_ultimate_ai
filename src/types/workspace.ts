import type {
  AgentDefinition,
  AgentExecution,
  ApprovalItem,
  Asset,
  AssetRelationship,
  AuditRecord,
  BrainRunRecord,
  BuildingZone,
  Camera,
  DigitalTwinSnapshot,
  EnergyRecord,
  EvidenceProvenanceRecord,
  Facility,
  Incident,
  InfrastructureEvent,
  IoTIntegration,
  KnowledgeDocument,
  MaintenanceRecord,
  Organization,
  PredictiveAssessment,
  RootCauseInvestigation,
  Site,
  TelemetryPoint,
  UserSession,
  VantaRole,
  VisionEvent,
  WorkOrder,
} from '../core/types';
import type { EnergySummary } from '../core/intelligence';

export interface WorkspaceData {
  organization: Organization;
  sites: Site[];
  facilities: Facility[];
  zones: BuildingZone[];
  assets: Asset[];
  relationships: AssetRelationship[];
  cameras: Camera[];
  visionEvents: VisionEvent[];
  iotIntegrations: IoTIntegration[];
  telemetry: TelemetryPoint[];
  events: InfrastructureEvent[];
  incidents: Incident[];
  maintenanceRecords: MaintenanceRecord[];
  workOrders: WorkOrder[];
  energyRecords: EnergyRecord[];
  energySummary: EnergySummary;
  predictiveAssessments: PredictiveAssessment[];
  rootCauseInvestigations: RootCauseInvestigation[];
  agents: AgentDefinition[];
  agentExecutions: AgentExecution[];
  approvals: ApprovalItem[];
  auditRecords: AuditRecord[];
  knowledgeDocuments: KnowledgeDocument[];
  twinSnapshots?: DigitalTwinSnapshot[];
  provenanceRecords?: EvidenceProvenanceRecord[];
  brainRuns?: BrainRunRecord[];
  users: Array<{
    id: string;
    tenantId: string;
    email: string;
    fullName: string;
    role: VantaRole;
    facilityIdsJson: string;
    status?: string;
    createdAt: string;
  }>;
}

export interface SystemHealthStatus {
  status: string;
  database: string;
  migrationsApplied?: number;
  geminiConfigured: boolean;
  geminiModelId?: string;
  geminiModelValid?: boolean;
  geminiTimeoutMs?: number;
  allowDemoAuth?: boolean;
  simulationEngine: string;
  observability?: {
    uptimeSeconds: number;
    totalRequests: number;
    apiErrors5xx: number;
    apiErrors4xx: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    aiCallsTotal: number;
    aiCallsFailed: number;
    aiAvgLatencyMs: number;
    rateLimitRejections: number;
    activeSseStreams: number;
    memoryRssMb: number;
  };
  timestamp: string;
}

export interface AuthSessionResponse {
  authenticated: boolean;
  user: UserSession | null;
}

export interface BackupMetadataDto {
  filename: string;
  sizeBytes: number;
  sha256: string;
  integrityCheck: string;
  createdAt: string;
  backupType?: string;
  schemaVersion?: string | null;
}
