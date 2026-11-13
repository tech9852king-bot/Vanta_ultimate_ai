import type {
  AgentDefinition,
  AgentExecution,
  ApprovalItem,
  Asset,
  AssetRelationship,
  AuditRecord,
  BuildingZone,
  Camera,
  EnergyRecord,
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
  users: Array<{
    id: string;
    tenantId: string;
    email: string;
    fullName: string;
    role: VantaRole;
    facilityIdsJson: string;
    createdAt: string;
  }>;
}

export interface SystemHealthStatus {
  status: string;
  database: string;
  geminiConfigured: boolean;
  simulationEngine: string;
  timestamp: string;
}

export interface AuthSessionResponse {
  authenticated: boolean;
  user: UserSession | null;
}
