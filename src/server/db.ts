/**
 * VANTA AI — SQLite Relational & Time-Series Database Layer
 * Implements the Universal Infrastructure Data Model with strict tenant isolation.
 */

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AgentDefinition } from '../core/types';
import { hashPassword } from './security';

export const VANTA_AGENTS: AgentDefinition[] = [
  {
    id: 'agent-orchestrator',
    name: 'VANTA Orchestrator Agent',
    domain: 'Cross-Module Coordination',
    purpose: 'Coordinates multi-agent investigations, enforces tool permissions, and verifies evidence citations.',
    authorizedTools: ['query_assets', 'query_incidents', 'query_telemetry', 'query_knowledge_docs'],
    maxSteps: 4,
    canActuatePhysicalControl: false,
    capabilityState: 'FUNCTIONAL',
  },
  {
    id: 'agent-vision',
    name: 'VANTA Vision Agent',
    domain: 'Visual & Safety Inspection',
    purpose: 'Inspects industrial camera frames for PPE compliance, aisle obstructions, and equipment visual anomalies.',
    authorizedTools: ['inspect_camera_frame', 'query_vision_events'],
    maxSteps: 3,
    canActuatePhysicalControl: false,
    capabilityState: 'PARTIALLY_FUNCTIONAL',
  },
  {
    id: 'agent-equipment',
    name: 'VANTA Equipment Agent',
    domain: 'Machinery & Production Health',
    purpose: 'Analyzes CNC, robotics, transformer, and chiller operating envelopes against manufacturer specs.',
    authorizedTools: ['query_assets', 'query_telemetry', 'query_maintenance'],
    maxSteps: 3,
    canActuatePhysicalControl: false,
    capabilityState: 'FUNCTIONAL',
  },
  {
    id: 'agent-iot',
    name: 'VANTA IoT Agent',
    domain: 'Protocol & Sensor Diagnostics',
    purpose: 'Evaluates MQTT/OPC UA/Modbus gateway connectivity, sampling health, and sensor calibration drift.',
    authorizedTools: ['query_iot_integrations', 'query_telemetry'],
    maxSteps: 3,
    canActuatePhysicalControl: false,
    capabilityState: 'SIMULATED',
  },
  {
    id: 'agent-asset',
    name: 'VANTA Asset Agent',
    domain: 'Topology & Asset Registry',
    purpose: 'Maps hierarchical facilities, zones, and graph dependencies across physical infrastructure.',
    authorizedTools: ['query_assets', 'query_asset_relationships'],
    maxSteps: 3,
    canActuatePhysicalControl: false,
    capabilityState: 'FUNCTIONAL',
  },
  {
    id: 'agent-predictive',
    name: 'VANTA Predictive Agent',
    domain: 'Remaining Useful Life & Risk',
    purpose: 'Computes failure-risk trajectories and drafts preventive maintenance work orders for human approval.',
    authorizedTools: ['query_predictive_assessments', 'query_telemetry', 'create_approval_recommendation'],
    maxSteps: 3,
    canActuatePhysicalControl: false,
    capabilityState: 'FUNCTIONAL',
  },
  {
    id: 'agent-energy',
    name: 'VANTA Energy Agent',
    domain: 'Load & Power Optimization',
    purpose: 'Audits measured vs simulated kWh consumption, peak demand intervals, and power factor efficiency.',
    authorizedTools: ['query_energy_records', 'query_assets'],
    maxSteps: 3,
    canActuatePhysicalControl: false,
    capabilityState: 'FUNCTIONAL',
  },
  {
    id: 'agent-rca',
    name: 'VANTA Root Cause Agent',
    domain: 'Cross-System Causal Analysis',
    purpose: 'Correlates upstream dependency anomalies, vision detections, and maintenance gaps into ranked hypotheses.',
    authorizedTools: ['query_incidents', 'query_telemetry', 'query_asset_relationships', 'query_maintenance'],
    maxSteps: 4,
    canActuatePhysicalControl: false,
    capabilityState: 'FUNCTIONAL',
  },
  {
    id: 'agent-twin',
    name: 'VANTA Digital Twin Agent',
    domain: 'State Synchronization & What-If',
    purpose: 'Reconstructs historical infrastructure states and evaluates simulated failure scenarios without impacting live equipment.',
    authorizedTools: ['query_assets', 'query_asset_relationships', 'run_twin_scenario'],
    maxSteps: 3,
    canActuatePhysicalControl: false,
    capabilityState: 'SIMULATED',
  },
  {
    id: 'agent-security',
    name: 'VANTA Security Agent',
    domain: 'Governance & Access Auditing',
    purpose: 'Monitors RBAC denials, anomalous operator sessions, and tenant isolation boundaries.',
    authorizedTools: ['query_audit_records'],
    maxSteps: 2,
    canActuatePhysicalControl: false,
    capabilityState: 'FUNCTIONAL',
  },
  {
    id: 'agent-operations',
    name: 'VANTA Operations Agent',
    domain: 'Workflow & Approval Routing',
    purpose: 'Prepares structured work orders and routes consequential actions through mandatory human approval queues.',
    authorizedTools: ['query_work_orders', 'create_approval_recommendation'],
    maxSteps: 3,
    canActuatePhysicalControl: false,
    capabilityState: 'FUNCTIONAL',
  },
  {
    id: 'agent-knowledge',
    name: 'VANTA Knowledge Agent',
    domain: 'SOP & Technical Retrieval',
    purpose: 'Retrieves permission-scoped equipment manuals, safety interlocks, and postmortem records with source citations.',
    authorizedTools: ['query_knowledge_docs'],
    maxSteps: 2,
    canActuatePhysicalControl: false,
    capabilityState: 'FUNCTIONAL',
  },
];

export function initDatabase(dbPath?: string): DatabaseSync {
  const resolvedPath = dbPath || path.resolve(process.cwd(), '.vanta-data', 'vanta.db');
  if (resolvedPath !== ':memory:') {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  const db = new DatabaseSync(resolvedPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      industry TEXT NOT NULL,
      region TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      facility_ids_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES organizations(tenant_id)
    );

    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      country TEXT NOT NULL,
      timezone TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS facilities (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sector TEXT NOT NULL,
      code TEXT NOT NULL,
      status TEXT NOT NULL,
      coordinates TEXT NOT NULL,
      area_sqm INTEGER NOT NULL,
      criticality TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS building_zones (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      facility_id TEXT NOT NULL,
      building_name TEXT NOT NULL,
      floor TEXT NOT NULL,
      zone_name TEXT NOT NULL,
      zone_type TEXT NOT NULL,
      restricted INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      facility_id TEXT NOT NULL,
      zone_id TEXT NOT NULL,
      parent_asset_id TEXT,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      manufacturer TEXT NOT NULL,
      model TEXT NOT NULL,
      status TEXT NOT NULL,
      owner TEXT NOT NULL,
      data_mode TEXT NOT NULL,
      health_score INTEGER NOT NULL,
      x_pos REAL NOT NULL,
      y_pos REAL NOT NULL,
      metadata_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS asset_relationships (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      source_asset_id TEXT NOT NULL,
      target_asset_id TEXT NOT NULL,
      relationship_type TEXT NOT NULL,
      criticality_weight REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cameras (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      facility_id TEXT NOT NULL,
      zone_id TEXT NOT NULL,
      asset_id TEXT,
      name TEXT NOT NULL,
      stream_protocol TEXT NOT NULL,
      resolution TEXT NOT NULL,
      fps INTEGER NOT NULL,
      status TEXT NOT NULL,
      mode TEXT NOT NULL,
      model_version TEXT NOT NULL,
      confidence_threshold REAL NOT NULL,
      sample_image_url TEXT NOT NULL,
      privacy_policy TEXT NOT NULL,
      last_frame_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vision_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      camera_id TEXT NOT NULL,
      facility_id TEXT NOT NULL,
      asset_id TEXT,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      confidence REAL NOT NULL,
      summary TEXT NOT NULL,
      detections_json TEXT NOT NULL,
      inference_engine TEXT NOT NULL,
      mode TEXT NOT NULL,
      evidence_image_url TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS iot_integrations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      facility_id TEXT NOT NULL,
      name TEXT NOT NULL,
      protocol TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      status TEXT NOT NULL,
      capability_state TEXT NOT NULL,
      polling_interval_ms INTEGER NOT NULL,
      device_count INTEGER NOT NULL,
      last_heartbeat_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS telemetry_points (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      metric_name TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT NOT NULL,
      threshold_warn REAL NOT NULL,
      threshold_crit REAL NOT NULL,
      z_score REAL NOT NULL,
      is_anomaly INTEGER NOT NULL,
      mode TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      facility_id TEXT NOT NULL,
      asset_id TEXT,
      source_module TEXT NOT NULL,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      mode TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      facility_id TEXT NOT NULL,
      asset_id TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      assigned_to TEXT,
      opened_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS maintenance_records (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      facility_id TEXT NOT NULL,
      maintenance_type TEXT NOT NULL,
      performed_by TEXT NOT NULL,
      summary TEXT NOT NULL,
      downtime_minutes INTEGER NOT NULL,
      parts_replaced TEXT NOT NULL,
      performed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS work_orders (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      facility_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      incident_id TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      approved_by TEXT,
      safety_interlock_checked INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS energy_records (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      facility_id TEXT NOT NULL,
      asset_id TEXT,
      period_start TEXT NOT NULL,
      consumption_kwh REAL NOT NULL,
      peak_demand_kw REAL NOT NULL,
      baseline_kwh REAL NOT NULL,
      power_factor REAL NOT NULL,
      mode TEXT NOT NULL,
      methodology TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS predictive_assessments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      facility_id TEXT NOT NULL,
      failure_mode TEXT NOT NULL,
      risk_score INTEGER NOT NULL,
      rul_hours INTEGER NOT NULL,
      uncertainty_hours INTEGER NOT NULL,
      methodology TEXT NOT NULL,
      data_source TEXT NOT NULL,
      validation_status TEXT NOT NULL,
      recommended_action TEXT NOT NULL,
      mode TEXT NOT NULL,
      computed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS root_cause_investigations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      incident_id TEXT NOT NULL,
      facility_id TEXT NOT NULL,
      detected_issue TEXT NOT NULL,
      supporting_evidence_json TEXT NOT NULL,
      related_asset_ids_json TEXT NOT NULL,
      potential_causes_json TEXT NOT NULL,
      alternative_explanations_json TEXT NOT NULL,
      confidence INTEGER NOT NULL,
      uncertainty_notes TEXT NOT NULL,
      recommended_investigation TEXT NOT NULL,
      human_decision TEXT,
      resolution_record TEXT,
      outcome_verification TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_executions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL,
      steps_taken INTEGER NOT NULL,
      tools_invoked_json TEXT NOT NULL,
      evidence_refs_json TEXT NOT NULL,
      output_summary TEXT NOT NULL,
      requires_approval INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      facility_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      title TEXT NOT NULL,
      justification TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      safety_boundary_check TEXT NOT NULL,
      status TEXT NOT NULL,
      decided_by TEXT,
      decision_notes TEXT,
      created_at TEXT NOT NULL,
      decided_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_records (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      actor_email TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      outcome TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_documents (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      facility_id TEXT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      min_role TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      version TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_assets_tenant ON assets(tenant_id, facility_id);
    CREATE INDEX IF NOT EXISTS idx_telemetry_tenant_asset ON telemetry_points(tenant_id, asset_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_incidents_tenant ON incidents(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_records(tenant_id, created_at);
  `);

  seedDatabase(db);
  return db;
}

export function seedDatabase(db: DatabaseSync): void {
  const existingOrg = db.prepare('SELECT COUNT(*) as cnt FROM organizations').get() as { cnt: number };
  if (existingOrg.cnt > 0) return;

  const now = new Date('2026-11-12T21:45:00.000Z').toISOString();
  const hAgo = (hours: number) => new Date(Date.now() - hours * 3600 * 1000).toISOString();

  // 1. Organizations (Multi-Tenant Isolation)
  const insertOrg = db.prepare(
    'INSERT INTO organizations (id, tenant_id, name, industry, region, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  insertOrg.run('org-1', 'tenant-apex', 'Apex Industrial & Grid Corp', 'Manufacturing & Industrial Production', 'US-West / EU-Central', now);
  insertOrg.run('org-2', 'tenant-meridian', 'Meridian Healthcare & Smart Campus', 'Hospitals & Healthcare Infrastructure', 'US-East', now);

  // 2. Users (Password hashed with scrypt)
  const defaultHash = hashPassword('VantaDemo!2026');
  const insertUser = db.prepare(
    'INSERT INTO users (id, tenant_id, email, full_name, password_hash, role, facility_ids_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  insertUser.run('usr-ops', 'tenant-apex', 'ops.manager@apex-industrial.io', 'Elena Vance', defaultHash, 'Operations Manager', JSON.stringify(['fac-plant-a', 'fac-sub-alpha', 'fac-dc-01', 'fac-whse-west']), now);
  insertUser.run('usr-admin', 'tenant-apex', 'admin@apex-industrial.io', 'Marcus Chen', defaultHash, 'Platform Administrator', JSON.stringify(['fac-plant-a', 'fac-sub-alpha', 'fac-dc-01', 'fac-whse-west']), now);
  insertUser.run('usr-eng', 'tenant-apex', 'engineer@apex-industrial.io', 'Dr. Priya Nair', defaultHash, 'Infrastructure Engineer', JSON.stringify(['fac-plant-a', 'fac-sub-alpha', 'fac-dc-01']), now);
  insertUser.run('usr-view', 'tenant-apex', 'viewer@apex-industrial.io', 'Audit Observer', defaultHash, 'Viewer', JSON.stringify(['fac-plant-a']), now);
  insertUser.run('usr-meridian', 'tenant-meridian', 'facility.admin@meridian-infra.io', 'David Kowalski', defaultHash, 'Facility Administrator', JSON.stringify(['fac-med-utl', 'fac-campus-b']), now);

  // 3. Sites & Facilities
  const insertSite = db.prepare('INSERT INTO sites (id, tenant_id, name, country, timezone) VALUES (?, ?, ?, ?, ?)');
  insertSite.run('site-apex-west', 'tenant-apex', 'Nevada Precision Industrial Corridor', 'USA', 'America/Los_Angeles');
  insertSite.run('site-meridian-east', 'tenant-meridian', 'Boston Medical & Campus District', 'USA', 'America/New_York');

  const insertFacility = db.prepare(
    'INSERT INTO facilities (id, tenant_id, site_id, name, sector, code, status, coordinates, area_sqm, criticality) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  insertFacility.run('fac-plant-a', 'tenant-apex', 'site-apex-west', 'Facility A — CNC & Robotic Assembly', 'Manufacturing & Industrial Production', 'PLT-A01', 'WARNING', '39.5296° N, 119.8138° W', 28400, 'TIER_1');
  insertFacility.run('fac-sub-alpha', 'tenant-apex', 'site-apex-west', 'Substation Alpha — 138kV Switchyard', 'Energy & Power Infrastructure', 'SUB-138', 'NOMINAL', '39.5311° N, 119.8092° W', 11200, 'TIER_1');
  insertFacility.run('fac-dc-01', 'tenant-apex', 'site-apex-west', 'Core Compute Data Center DC-01', 'Data Centers', 'DC-01', 'NOMINAL', '39.5284° N, 119.8150° W', 6800, 'TIER_1');
  insertFacility.run('fac-whse-west', 'tenant-apex', 'site-apex-west', 'Automated Distribution Hub West', 'Logistics & Supply Chain', 'WH-W04', 'NOMINAL', '39.5240° N, 119.8211° W', 42000, 'TIER_2');
  insertFacility.run('fac-med-utl', 'tenant-meridian', 'site-meridian-east', 'St. Jude Central Utilities & HVAC Plant', 'Hospitals & Healthcare Infrastructure', 'MED-UTL', 'NOMINAL', '42.3601° N, 71.0589° W', 14500, 'TIER_1');
  insertFacility.run('fac-campus-b', 'tenant-meridian', 'site-meridian-east', 'Meridian Tower B Smart Building', 'Commercial Buildings & Campuses', 'CMP-TWRB', 'NOMINAL', '42.3612° N, 71.0604° W', 22000, 'TIER_2');

  // 4. Building Zones
  const insertZone = db.prepare(
    'INSERT INTO building_zones (id, tenant_id, facility_id, building_name, floor, zone_name, zone_type, restricted) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  insertZone.run('zn-bay-4a', 'tenant-apex', 'fac-plant-a', 'Assembly Hall 1', 'Level 1', 'Bay 4A — CNC Machining', 'PRODUCTION', 1);
  insertZone.run('zn-mech-a', 'tenant-apex', 'fac-plant-a', 'Utility Annex', 'Ground', 'Process Cooling Plant', 'HVAC', 1);
  insertZone.run('zn-yard-1', 'tenant-apex', 'fac-sub-alpha', 'Switchyard North', 'Grade', 'Transformer Pad T1-T3', 'ELECTRICAL', 1);
  insertZone.run('zn-aisle-a3', 'tenant-apex', 'fac-dc-01', 'Data Hall 2', 'Floor 2', 'Cold Aisle A30', 'COMPUTE', 1);
  insertZone.run('zn-whse-c4', 'tenant-apex', 'fac-whse-west', 'Fulfillment West', 'Level 1', 'AGV Corridor C4-South', 'LOGISTICS', 0);
  insertZone.run('zn-med-hvac', 'tenant-meridian', 'fac-med-utl', 'Energy Center', 'Basement B1', 'Chiller & Backup Gen Bay', 'HVAC', 1);

  // 5. Assets
  const insertAsset = db.prepare(`
    INSERT INTO assets (id, tenant_id, facility_id, zone_id, parent_asset_id, code, name, asset_type, manufacturer, model, status, owner, data_mode, health_score, x_pos, y_pos, metadata_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertAsset.run('ast-tx-t1', 'tenant-apex', 'fac-sub-alpha', 'zn-yard-1', null, 'TX-138-T1', 'Main Power Transformer T1', 'ELECTRICAL_ASSET', 'ABB', 'TrafoStar 45MVA', 'NOMINAL', 'Grid Operations', 'MEASURED', 94, 18, 28, JSON.stringify({ voltageKv: 138, oilTempNominalC: 58 }), hAgo(0.1));
  insertAsset.run('ast-sw-b2', 'tenant-apex', 'fac-sub-alpha', 'zn-yard-1', 'ast-tx-t1', 'SWG-B2', 'Medium Voltage Switchgear B2', 'ELECTRICAL_ASSET', 'Siemens', 'NXAIR 13.8kV', 'NOMINAL', 'Grid Operations', 'MEASURED', 96, 36, 28, JSON.stringify({ busRatingA: 2500 }), hAgo(0.1));
  insertAsset.run('ast-chl-01', 'tenant-apex', 'fac-plant-a', 'zn-mech-a', null, 'CHL-01', 'Process Coolant Chiller CHL-01', 'HVAC_CHILLER', 'Trane', 'CenTraVac CVHF', 'WARNING', 'Facilities Eng', 'MEASURED', 61, 22, 62, JSON.stringify({ refrigerant: 'R-1233zd', ratedTons: 420 }), hAgo(0.05));
  insertAsset.run('ast-cnc-04', 'tenant-apex', 'fac-plant-a', 'zn-bay-4a', null, 'CNC-04', '5-Axis CNC Machining Center 04', 'MACHINE', 'DMG Mori', 'DMU 85 monoBLOCK', 'CRITICAL', 'Production Ops', 'MEASURED', 52, 54, 52, JSON.stringify({ maxRpm: 18000, spindleHours: 4820 }), hAgo(0.05));
  insertAsset.run('ast-cnc-09', 'tenant-apex', 'fac-plant-a', 'zn-bay-4a', null, 'CNC-09', '5-Axis CNC Machining Center 09', 'MACHINE', 'DMG Mori', 'DMU 85 monoBLOCK', 'NOMINAL', 'Production Ops', 'SIMULATED', 91, 54, 76, JSON.stringify({ maxRpm: 18000, spindleHours: 1920 }), hAgo(0.1));
  insertAsset.run('ast-rob-12', 'tenant-apex', 'fac-plant-a', 'zn-bay-4a', null, 'ROB-12', 'Articulated Transfer Robot 12', 'EQUIPMENT', 'FANUC', 'R-2000iC/210F', 'NOMINAL', 'Automation Team', 'SIMULATED', 93, 78, 62, JSON.stringify({ payloadKg: 210 }), hAgo(0.1));
  insertAsset.run('ast-ups-01', 'tenant-apex', 'fac-dc-01', 'zn-aisle-a3', null, 'UPS-DC1', 'Modular UPS Bank A', 'ELECTRICAL_ASSET', 'Schneider', 'Galaxy VX 1000kW', 'NOMINAL', 'DC Infrastructure', 'MEASURED', 97, 26, 45, JSON.stringify({ batterySocPct: 99 }), hAgo(0.2));
  insertAsset.run('ast-crah-03', 'tenant-apex', 'fac-dc-01', 'zn-aisle-a3', null, 'CRAH-03', 'Cold Aisle CRAH Unit 03', 'HVAC_CHILLER', 'Vertiv', 'Liebert CW', 'NOMINAL', 'DC Infrastructure', 'SIMULATED', 90, 56, 45, JSON.stringify({ airflowCfm: 18400 }), hAgo(0.2));
  insertAsset.run('ast-rack-a30', 'tenant-apex', 'fac-dc-01', 'zn-aisle-a3', null, 'RCK-A30', 'AI Compute Rack Cluster A30', 'NETWORK_ASSET', 'Dell EMC', 'PowerEdge XE9680', 'NOMINAL', 'Compute Ops', 'SIMULATED', 95, 80, 45, JSON.stringify({ rackCount: 16 }), hAgo(0.2));
  insertAsset.run('ast-agv-12', 'tenant-apex', 'fac-whse-west', 'zn-whse-c4', null, 'AGV-12', 'Autonomous Pallet Mover 12', 'DEVICE', 'MiR', 'MiR1350 Pallet', 'NOMINAL', 'Logistics Ops', 'SIMULATED', 88, 50, 50, JSON.stringify({ batteryPct: 81 }), hAgo(0.2));
  insertAsset.run('ast-vib-s04', 'tenant-apex', 'fac-plant-a', 'zn-bay-4a', 'ast-cnc-04', 'SEN-VIB04', 'Tri-Axial Spindle Vibration Sensor', 'SENSOR', 'SKF', 'CMSS 2200', 'WARNING', 'Reliability Eng', 'MEASURED', 89, 54, 42, JSON.stringify({ sampleRateHz: 10240 }), hAgo(0.05));
  // Tenant 2 asset
  insertAsset.run('ast-med-chl', 'tenant-meridian', 'fac-med-utl', 'zn-med-hvac', null, 'MED-CHL-1', 'Hospital Primary Chiller Loop 1', 'HVAC_CHILLER', 'Carrier', '19XR Centrifugal', 'NOMINAL', 'Medical Facilities', 'SIMULATED', 95, 45, 50, JSON.stringify({ capacityTons: 600 }), hAgo(0.2));

  // 6. Asset Dependency Graph Relationships
  const insertRel = db.prepare(
    'INSERT INTO asset_relationships (id, tenant_id, source_asset_id, target_asset_id, relationship_type, criticality_weight) VALUES (?, ?, ?, ?, ?, ?)'
  );
  insertRel.run('rel-1', 'tenant-apex', 'ast-tx-t1', 'ast-sw-b2', 'POWERS', 1.0);
  insertRel.run('rel-2', 'tenant-apex', 'ast-sw-b2', 'ast-chl-01', 'POWERS', 0.95);
  insertRel.run('rel-3', 'tenant-apex', 'ast-sw-b2', 'ast-cnc-04', 'POWERS', 0.95);
  insertRel.run('rel-4', 'tenant-apex', 'ast-chl-01', 'ast-cnc-04', 'COOLS', 0.92);
  insertRel.run('rel-5', 'tenant-apex', 'ast-chl-01', 'ast-cnc-09', 'COOLS', 0.88);
  insertRel.run('rel-6', 'tenant-apex', 'ast-cnc-04', 'ast-rob-12', 'FEEDS', 0.85);
  insertRel.run('rel-7', 'tenant-apex', 'ast-vib-s04', 'ast-cnc-04', 'MONITORS', 0.8);
  insertRel.run('rel-8', 'tenant-apex', 'ast-ups-01', 'ast-rack-a30', 'POWERS', 1.0);
  insertRel.run('rel-9', 'tenant-apex', 'ast-crah-03', 'ast-rack-a30', 'COOLS', 0.94);

  // 7. Cameras (using generated industrial camera frames)
  const insertCam = db.prepare(`
    INSERT INTO cameras (id, tenant_id, facility_id, zone_id, asset_id, name, stream_protocol, resolution, fps, status, mode, model_version, confidence_threshold, sample_image_url, privacy_policy, last_frame_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertCam.run('cam-14', 'tenant-apex', 'fac-plant-a', 'zn-bay-4a', 'ast-cnc-04', 'CAM-14 · Assembly Bay 4A', 'ONVIF_SIMULATED', '2560x1920', 15, 'ONLINE', 'SIMULATED', 'vanta-vision-gemini-4h', 0.72, '/src/assets/images/cam_cnc_assembly_1794549731756.jpg', 'No biometric or facial recognition; zone & PPE compliance only.', hAgo(0.05));
  insertCam.run('cam-12', 'tenant-apex', 'fac-sub-alpha', 'zn-yard-1', 'ast-tx-t1', 'CAM-12 · Substation Transformer Yard', 'ONVIF_SIMULATED', '2560x1920', 10, 'ONLINE', 'SIMULATED', 'vanta-vision-gemini-4h', 0.75, '/src/assets/images/cam_substation_yard_1794549731728.jpg', 'Perimeter & switchgear visual inspection; no personal identity tracking.', hAgo(0.1));
  insertCam.run('cam-a30', 'tenant-apex', 'fac-dc-01', 'zn-aisle-a3', 'ast-rack-a30', 'CAM-A30 · Data Center Cold Aisle', 'RTSP_EDGE', '1920x1440', 10, 'ONLINE', 'SIMULATED', 'vanta-vision-gemini-4h', 0.78, '/src/assets/images/cam_datacenter_aisle_1794549731827.jpg', 'Rack door state & aisle clearance monitoring only.', hAgo(0.15));
  insertCam.run('cam-c4', 'tenant-apex', 'fac-whse-west', 'zn-whse-c4', 'ast-agv-12', 'CAM-C4 · Warehouse AGV Corridor', 'WEBRTC_PROXY', '2560x1920', 20, 'ONLINE', 'SIMULATED', 'vanta-vision-gemini-4h', 0.70, '/src/assets/images/cam_warehouse_agv_1794549731009.jpg', 'AGV lane obstruction & forklift proximity monitoring.', hAgo(0.08));

  // 8. Seed Vision Event
  db.prepare(`
    INSERT INTO vision_events (id, tenant_id, camera_id, facility_id, asset_id, event_type, severity, confidence, summary, detections_json, inference_engine, mode, evidence_image_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'vis-evt-1',
    'tenant-apex',
    'cam-14',
    'fac-plant-a',
    'ast-cnc-04',
    'PPE_AND_ZONE_VERIFICATION',
    'INFO',
    0.91,
    'Operators in Bay 4A wearing high-visibility vests and hard hats outside robotic swing envelope.',
    JSON.stringify([
      { label: 'High-Vis PPE Operator', category: 'PPE_COMPLIANCE', confidence: 0.94, zone: 'MNGMY-BAY B Workstation', observation: 'Hard hat and hi-vis vest confirmed.' },
      { label: 'Articulated Robot Cell', category: 'EQUIPMENT_STATE', confidence: 0.96, zone: 'Conveyor Line 4A', observation: 'Robotic arms aligned over machined housings; safety floor perimeter clear.' },
    ]),
    'RULE_BASED_EDGE',
    'SIMULATED',
    '/src/assets/images/cam_cnc_assembly_1794549731756.jpg',
    hAgo(0.4)
  );

  // 9. IoT Protocol Connectors
  const insertIoT = db.prepare(`
    INSERT INTO iot_integrations (id, tenant_id, facility_id, name, protocol, endpoint, status, capability_state, polling_interval_ms, device_count, last_heartbeat_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertIoT.run('iot-opcua-1', 'tenant-apex', 'fac-plant-a', 'Plant A CNC OPC UA Gateway', 'OPC_UA', 'opc.tcp://gw-plant-a.internal:4840', 'SIMULATED', 'SIMULATED', 2000, 18, hAgo(0.02));
  insertIoT.run('iot-mqtt-1', 'tenant-apex', 'fac-plant-a', 'Chiller & Vibration MQTT Broker', 'MQTT', 'mqtts://broker-west.internal:8883/vanta/#', 'SIMULATED', 'SIMULATED', 1000, 42, hAgo(0.02));
  insertIoT.run('iot-modbus-1', 'tenant-apex', 'fac-sub-alpha', 'Substation Alpha DNP3/Modbus Bridge', 'MODBUS_TCP', 'modbus://rtu-sub138.internal:502', 'SIMULATED', 'SIMULATED', 5000, 14, hAgo(0.05));
  insertIoT.run('iot-rest-1', 'tenant-apex', 'fac-dc-01', 'DC-01 BMS Telemetry Collector', 'REST_API', 'https://bms-dc01.internal/api/v2/metrics', 'SIMULATED', 'SIMULATED', 10000, 64, hAgo(0.08));
  insertIoT.run('iot-ws-1', 'tenant-apex', 'fac-whse-west', 'AGV Fleet Telemetry Stream', 'WEBSOCKET', 'wss://fleet-whse.internal/telemetry', 'NOT_CONFIGURED', 'NOT_CONFIGURED', 1000, 0, hAgo(24));
  insertIoT.run('iot-med-1', 'tenant-meridian', 'fac-med-utl', 'Meridian HVAC BACnet/MQTT Gateway', 'MQTT', 'mqtts://bms-meridian.internal:8883', 'SIMULATED', 'SIMULATED', 5000, 24, hAgo(0.05));

  // 10. Telemetry Points (including realistic anomaly chain: Chiller CHL-01 -> CNC-04)
  const insertTel = db.prepare(`
    INSERT INTO telemetry_points (id, tenant_id, asset_id, metric_name, value, unit, threshold_warn, threshold_crit, z_score, is_anomaly, mode, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const chillerTemps = [18.1, 18.3, 18.4, 19.2, 22.8, 26.4, 28.9];
  chillerTemps.forEach((v, i) => {
    const isAnom = v >= 24;
    insertTel.run(
      `tel-chl-${i}`,
      'tenant-apex',
      'ast-chl-01',
      'Coolant Supply Temp',
      v,
      '°C',
      24,
      28,
      isAnom ? Number(((v - 18.5) / 1.8).toFixed(2)) : 0.2,
      isAnom ? 1 : 0,
      'MEASURED',
      hAgo(6 - i)
    );
  });

  const cncSpindleTemps = [46.2, 46.8, 47.1, 51.4, 62.5, 74.8, 81.6];
  cncSpindleTemps.forEach((v, i) => {
    const isAnom = v >= 70;
    insertTel.run(
      `tel-cnc-temp-${i}`,
      'tenant-apex',
      'ast-cnc-04',
      'Spindle Bearing Temp',
      v,
      '°C',
      70,
      85,
      isAnom ? Number(((v - 47.0) / 4.2).toFixed(2)) : 0.4,
      isAnom ? 1 : 0,
      'MEASURED',
      hAgo(6 - i)
    );
  });

  const cncVib = [1.4, 1.5, 1.4, 2.1, 3.6, 5.2, 6.4];
  cncVib.forEach((v, i) => {
    const isAnom = v >= 4.5;
    insertTel.run(
      `tel-cnc-vib-${i}`,
      'tenant-apex',
      'ast-cnc-04',
      'Spindle RMS Vibration',
      v,
      'mm/s',
      4.5,
      7.1,
      isAnom ? Number(((v - 1.5) / 0.8).toFixed(2)) : 0.1,
      isAnom ? 1 : 0,
      'MEASURED',
      hAgo(6 - i)
    );
  });

  [31.2, 31.8, 32.4, 33.1, 32.9].forEach((v, i) => {
    insertTel.run(`tel-tx-${i}`, 'tenant-apex', 'ast-tx-t1', 'Transformer Load', v, 'MVA', 38, 43, 0.3, 0, 'MEASURED', hAgo(4 - i));
  });
  [1.24, 1.25, 1.24, 1.26, 1.25].forEach((v, i) => {
    insertTel.run(`tel-dc-${i}`, 'tenant-apex', 'ast-rack-a30', 'Cluster PUE Ratio', v, 'PUE', 1.4, 1.6, 0.1, 0, 'SIMULATED', hAgo(4 - i));
  });
  [6.9, 6.8, 7.0, 6.9].forEach((v, i) => {
    insertTel.run(`tel-med-${i}`, 'tenant-meridian', 'ast-med-chl', 'Chilled Water Loop', v, '°C', 9.5, 12.0, 0.1, 0, 'SIMULATED', hAgo(3 - i));
  });

  // 11. Events & Incidents
  const insertEvent = db.prepare(`
    INSERT INTO events (id, tenant_id, facility_id, asset_id, source_module, event_type, severity, title, description, mode, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertEvent.run('evt-1', 'tenant-apex', 'fac-plant-a', 'ast-chl-01', 'IOT', 'THRESHOLD_EXCURSION', 'HIGH', 'Coolant Chiller CHL-01 supply temp rose to 28.9°C', 'Coolant loop supply exceeded 28.0°C critical ceiling due to fouling / condenser flow restriction.', 'MEASURED', hAgo(1.2));
  insertEvent.run('evt-2', 'tenant-apex', 'fac-plant-a', 'ast-cnc-04', 'PREDICTIVE', 'THERMAL_DERATING', 'CRITICAL', 'CNC-04 spindle thermal derating & vibration spike (6.4 mm/s)', 'CNC-04 auto-throttled feed rate by 22% to protect spindle bearings following coolant temp rise.', 'MEASURED', hAgo(0.8));
  insertEvent.run('evt-3', 'tenant-apex', 'fac-sub-alpha', 'ast-tx-t1', 'ENERGY', 'LOAD_NOMINAL', 'INFO', 'Substation Alpha harmonic distortion within IEEE-519 limits', 'THD measured at 1.8% across 13.8kV bus.', 'MEASURED', hAgo(2.5));
  insertEvent.run('evt-4', 'tenant-meridian', 'fac-med-utl', 'ast-med-chl', 'IOT', 'ROUTINE_CHECK', 'INFO', 'Meridian Hospital HVAC Loop 1 pressure balanced', 'Differential pressure steady at 142 kPa.', 'SIMULATED', hAgo(1.0));

  const insertIncident = db.prepare(`
    INSERT INTO incidents (id, tenant_id, facility_id, asset_id, title, description, severity, status, assigned_to, opened_at, resolved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertIncident.run(
    'inc-1042',
    'tenant-apex',
    'fac-plant-a',
    'ast-cnc-04',
    'Production Efficiency Decline & Thermal Derating in Bay 4A (CNC-04)',
    'CNC Machining Center 04 throughput dropped 22% over the past 3 hours as spindle bearing temperature reached 81.6°C and RMS vibration climbed to 6.4 mm/s.',
    'CRITICAL',
    'INVESTIGATING',
    'Dr. Priya Nair',
    hAgo(1.0),
    null
  );
  insertIncident.run(
    'inc-1038',
    'tenant-apex',
    'fac-whse-west',
    'ast-agv-12',
    'AGV Fleet Gateway WebSocket Connector Unconfigured',
    'Automated Distribution Hub West real-time AGV WebSocket stream awaits edge TLS certificate provisioning.',
    'MEDIUM',
    'OPEN',
    'Marcus Chen',
    hAgo(14),
    null
  );
  insertIncident.run(
    'inc-med-1',
    'tenant-meridian',
    'fac-med-utl',
    'ast-med-chl',
    'Quarterly Backup Generator Load Bank Test Scheduled',
    'Non-critical scheduled verification for Hospital Utilities Plant.',
    'LOW',
    'RESOLVED',
    'David Kowalski',
    hAgo(48),
    hAgo(42)
  );

  // 12. Maintenance Records & Work Orders
  db.prepare(`
    INSERT INTO maintenance_records (id, tenant_id, asset_id, facility_id, maintenance_type, performed_by, summary, downtime_minutes, parts_replaced, performed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('mnt-901', 'tenant-apex', 'ast-chl-01', 'fac-plant-a', 'PREVENTIVE', 'R. Morales (HVAC Tech)', 'Condenser tube brush cleaning and glycol concentration top-up.', 95, 'Differential pressure strainer gasket', hAgo(960));

  db.prepare(`
    INSERT INTO work_orders (id, tenant_id, facility_id, asset_id, incident_id, title, description, priority, status, requested_by, approved_by, safety_interlock_checked, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('wo-401', 'tenant-apex', 'fac-plant-a', 'ast-chl-01', 'inc-1042', 'Inspect CHL-01 Condenser Flow & Descale Heat Exchanger', 'Address elevated coolant supply temperature (28.9°C) feeding CNC-04 spindle cooling manifold.', 'CRITICAL', 'PENDING_APPROVAL', 'VANTA Predictive Agent', null, 1, hAgo(0.6), hAgo(0.6));

  // 13. Energy Records (Explicit MEASURED vs SIMULATED separation)
  const insertEnergy = db.prepare(`
    INSERT INTO energy_records (id, tenant_id, facility_id, asset_id, period_start, consumption_kwh, peak_demand_kw, baseline_kwh, power_factor, mode, methodology)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertEnergy.run('eng-1', 'tenant-apex', 'fac-plant-a', null, hAgo(24), 14820, 742, 15200, 0.94, 'MEASURED', 'Revenue-grade utility submeter Modbus pulse counter');
  insertEnergy.run('eng-2', 'tenant-apex', 'fac-sub-alpha', 'ast-tx-t1', hAgo(24), 31200, 1640, 31500, 0.97, 'MEASURED', 'Substation 138kV SCADA CT/PT revenue metering');
  insertEnergy.run('eng-3', 'tenant-apex', 'fac-dc-01', null, hAgo(24), 19400, 880, 19400, 0.98, 'SIMULATED', 'Simulated IT load profile based on rack nominal TDP');
  insertEnergy.run('eng-4', 'tenant-apex', 'fac-whse-west', null, hAgo(24), 4650, 260, 4800, 0.92, 'ESTIMATED', 'Estimated from lighting schedule & charger duty cycle');
  insertEnergy.run('eng-med-1', 'tenant-meridian', 'fac-med-utl', null, hAgo(24), 8900, 410, 9100, 0.95, 'SIMULATED', 'Simulated hospital central chiller plant load');

  // 14. Predictive Assessments
  const insertPred = db.prepare(`
    INSERT INTO predictive_assessments (id, tenant_id, asset_id, facility_id, failure_mode, risk_score, rul_hours, uncertainty_hours, methodology, data_source, validation_status, recommended_action, mode, computed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertPred.run('prd-1', 'tenant-apex', 'ast-cnc-04', 'fac-plant-a', 'Spindle Bearing Thermal Fatigue (Cascading from Coolant Excursion)', 84, 18, 5, 'Linear Headroom Degradation + Statistical Z-Score (z=8.24)', 'SKF CMSS 2200 Vibration + Spindle RTD (MEASURED)', 'STATISTICAL_ZSCORE', 'Verify CHL-01 coolant restoration; inspect CNC-04 front angular contact bearings.', 'MEASURED', hAgo(0.1));
  insertPred.run('prd-2', 'tenant-apex', 'ast-chl-01', 'fac-plant-a', 'Condenser Fouling / Reduced Heat Rejection Capacity', 78, 36, 9, 'Threshold Envelope Drift + 40-day Maintenance Interval Model', 'Chiller Supply Temp Sensor (MEASURED)', 'RULE_VERIFIED', 'Approve WO-401 for condenser inspection and strainer flush.', 'MEASURED', hAgo(0.1));
  insertPred.run('prd-3', 'tenant-apex', 'ast-tx-t1', 'fac-sub-alpha', 'Nominal Dielectric & Thermal Aging', 18, 2840, 420, 'IEEE C57.91 Top-Oil Thermal Model', 'Substation SCADA (MEASURED)', 'RULE_VERIFIED', 'Continue routine dissolved gas analysis on quarterly schedule.', 'MEASURED', hAgo(0.5));

  // 15. Root Cause Investigation
  db.prepare(`
    INSERT INTO root_cause_investigations (id, tenant_id, incident_id, facility_id, detected_issue, supporting_evidence_json, related_asset_ids_json, potential_causes_json, alternative_explanations_json, confidence, uncertainty_notes, recommended_investigation, human_decision, resolution_record, outcome_verification, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'rca-1042',
    'tenant-apex',
    'inc-1042',
    'fac-plant-a',
    'CNC-04 Spindle Thermal Derating & 22% Throughput Drop',
    JSON.stringify([
      { sourceType: 'TELEMETRY', recordId: 'tel-chl-6', summary: 'CHL-01 Coolant Supply Temp climbed from 18.1°C to 28.9°C (+10.8°C).' },
      { sourceType: 'TELEMETRY', recordId: 'tel-cnc-temp-6', summary: 'CNC-04 Spindle Bearing Temp rose to 81.6°C shortly after coolant rise.' },
      { sourceType: 'GRAPH_DEPENDENCY', recordId: 'rel-4', summary: 'Asset graph confirms CHL-01 COOLS CNC-04 (criticality 0.92).' },
      { sourceType: 'MAINTENANCE', recordId: 'mnt-901', summary: 'Last CHL-01 condenser cleaning performed 40 days ago (960h).' },
    ]),
    JSON.stringify(['ast-cnc-04', 'ast-chl-01', 'ast-vib-s04']),
    JSON.stringify([
      { cause: 'Process Coolant Chiller CHL-01 degraded heat rejection causing CNC-04 spindle overheating', score: 89, mechanism: 'Elevated coolant supply temp (28.9°C) reduces spindle jacket heat transfer, driving thermal expansion and bearing vibration.' },
      { cause: 'CNC-04 spindle bearing lubrication starvation independent of chiller', score: 44, mechanism: 'Possible secondary contributor if oil-air mist nozzle is partially occluded.' },
    ]),
    JSON.stringify([
      'Transient ambient heat load in Assembly Hall 1 during afternoon shift.',
      'Coolant manifold proportional valve stuck partially closed at CNC-04 inlet.',
    ]),
    86,
    'High confidence based on MEASURED telemetry correlation across dependency edge rel-4; physical valve check still required.',
    '1) Inspect CHL-01 condenser flow and strainer differential pressure; 2) Verify CNC-04 coolant inlet valve position; 3) Confirm vibration drops below 2.5 mm/s post-cooling recovery.',
    null,
    null,
    null,
    'OPEN',
    hAgo(0.5)
  );

  // 16. Approvals Queue
  db.prepare(`
    INSERT INTO approvals (id, tenant_id, facility_id, target_type, target_id, title, justification, requested_by, risk_level, safety_boundary_check, status, decided_by, decision_notes, created_at, decided_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'apr-201',
    'tenant-apex',
    'fac-plant-a',
    'WORK_ORDER',
    'wo-401',
    'Authorize WO-401: CHL-01 Condenser Inspection & Controlled Switchover',
    'Predictive and Root Cause engines indicate CHL-01 coolant excursion (28.9°C) is driving CNC-04 thermal derating (81.6°C).',
    'VANTA Operations Agent',
    'HIGH',
    'PASSED — Lockout/Tagout & redundant loop PLC interlocks verified; human sign-off mandatory prior to maintenance isolation.',
    'PENDING',
    null,
    null,
    hAgo(0.5),
    null
  );

  // 17. Knowledge Documents (Tenant-isolated, Role-scoped)
  const insertDoc = db.prepare(`
    INSERT INTO knowledge_documents (id, tenant_id, facility_id, title, category, min_role, source_ref, version, content, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertDoc.run('doc-1', 'tenant-apex', 'fac-plant-a', 'DMU 85 Spindle Thermal Envelope & Coolant Spec', 'SPECIFICATION', 'Viewer', 'OEM-DMG-85-REV4.pdf §4.2', 'v4.2', 'Nominal spindle bearing operating temperature: 42–58°C. Warning threshold: 70°C. Critical thermal interlock trip: 85°C. Required process coolant supply temperature: 18–22°C at 24 L/min minimum flow. Vibration ISO 10816 Class II limit: 4.5 mm/s warning, 7.1 mm/s critical.', hAgo(120));
  insertDoc.run('doc-2', 'tenant-apex', 'fac-plant-a', 'SOP-402: Process Chiller CHL-01 Isolation & LOTO Procedure', 'SAFETY_INTERLOCK', 'Infrastructure Engineer', 'EHS-SOP-402.docx', 'v2.1', 'CRITICAL SAFETY BOUNDARY: AI agents and remote supervisory dashboards must NEVER bypass PLC flow interlocks or actuate motorized isolation valves remotely. Physical LOTO verification by certified technician is mandatory before opening CHL-01 condenser waterbox.', hAgo(72));
  insertDoc.run('doc-3', 'tenant-apex', 'fac-sub-alpha', 'Substation Alpha 138kV Switchyard Maintenance Manual', 'MANUAL', 'Operations Manager', 'ABB-TX45MVA-OM.pdf', 'v3.0', 'Maintain top-oil temperature below 75°C under 45MVA continuous load. Perform dissolved gas analysis (DGA) every 90 days. Restricted yard entry requires arc-flash PPE Category 4.', hAgo(240));
  insertDoc.run('doc-med-1', 'tenant-meridian', 'fac-med-utl', 'Meridian Central Plant Emergency Generator SOP', 'SOP', 'Facility Administrator', 'MER-FAC-09.pdf', 'v1.4', 'Hospital utility backup transfer switches are strictly governed by NFPA 110 certified PLC logic. VANTA monitors telemetry read-only.', hAgo(100));

  // 18. Agent Executions & Audit Trail
  db.prepare(`
    INSERT INTO agent_executions (id, tenant_id, agent_id, requested_by, prompt, status, steps_taken, tools_invoked_json, evidence_refs_json, output_summary, requires_approval, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'agx-1',
    'tenant-apex',
    'agent-rca',
    'ops.manager@apex-industrial.io',
    'Investigate efficiency drop on CNC-04 in Bay 4A',
    'AWAITING_APPROVAL',
    3,
    JSON.stringify(['query_incidents', 'query_telemetry', 'query_asset_relationships']),
    JSON.stringify(['inc-1042', 'tel-chl-6', 'rel-4', 'wo-401']),
    'Identified upstream Coolant Chiller CHL-01 excursion (28.9°C) propagating via cooling loop rel-4 to CNC-04. Prepared WO-401 for human approval.',
    1,
    hAgo(0.5)
  );

  db.prepare(`
    INSERT INTO audit_records (id, tenant_id, actor_email, actor_role, action, resource_type, resource_id, outcome, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('aud-1', 'tenant-apex', 'system@vanta.internal', 'Platform Administrator', 'SYSTEM_BOOTSTRAP', 'ORGANIZATION', 'tenant-apex', 'SUCCESS', 'Initialized tenant workspace, RBAC matrix, and deterministic asset topology.', hAgo(24));
}
