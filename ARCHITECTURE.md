# VANTA AI — Universal Infrastructure Intelligence & Operations Platform
## Master Enterprise Architecture, Evidence Provenance, State Machine, Security & Verification Reference

**Product:** VANTA AI  
**Category:** Universal Infrastructure Intelligence & Operations Platform  
**Runtime Stack:** Node.js + Express + SQLite (WAL, Foreign Keys, Schema Migrations `001`–`007`) + React 19 + TypeScript + Tailwind CSS 4 + `@google/genai` (`gemini-4-hydrogen`)

---

## 1. Executive Architecture & System Topology

VANTA AI connects fragmented industrial equipment, telemetry sensors, cameras, operational logs, engineering SOPs, and human authorization workflows into a single evidence-driven operational intelligence environment.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        VANTA AI UNIVERSAL INFRASTRUCTURE OS                            │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  11-Stage Operational Intelligence Loop (Physical vs Simulated Strictly Separated):    │
│  CONNECT → COLLECT → NORMALIZE → CONTEXTUALIZE → ANALYZE → CORRELATE →                 │
│  PREDICT → RECOMMEND → APPROVE → EXECUTE → VERIFY                                      │
├──────────────────────┬───────────────────────────┬─────────────────────────────────────┤
│ Pure Core Engine     │ Zero-Trust API & Storage  │ Evidence-Backed Intelligence        │
│ (/src/core/*)        │ (/src/server/*)           │ (/src/server/ai.ts)                 │
│ • Z-score anomaly    │ • Scrypt password auth    │ • 13-Stage VANTA Brain Pipeline     │
│ • Headroom RUL (±h)  │ • SQLite session JTI      │ • Server-side Citation Validator    │
│ • Sliding backtest   │ • Single-use SSE tickets  │ • 12 Bounded Specialized Agents     │
│ • BFS Twin Cascade   │ • Tenant + Facility RBAC  │ • Prompt-Injection & Tool Guards    │
│ • Telemetry Quality  │ • WAL Hot Backups + SHA256│ • Multimodal Vision Inspection      │
│ • WorkOrder Engine   │ • Migrations 001–007      │ • Bounded Retry + Abort + SizeGuard │
└──────────────────────┴───────────────────────────┴─────────────────────────────────────┘
```

---

## 2. File-Level Change Manifest (Controlled Execution Audit)

| Change ID | Risk Class | Files Modified | Purpose & Invariants Enforced | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **CHG-001** | **CLASS A (Safe)** | `/src/core/types.ts`, `/src/core/intelligence.ts`, `/src/core/intelligence.test.ts` | Added 9-category `EvidenceClassification`, 7-type `EvidenceRelationType`, 10-stage `ConnectorLifecycleStage`, `validateWorkOrderTransition` (Part 14), `evaluateTelemetryQuality` (Part 10), and enriched North Star KPI `ratios` with `formula`, `source`, `timeWindow`, `dataQuality`, `calculatedAt`, and `drillDownSection` (Part 15). | Pure unit tests in `src/core/intelligence.test.ts` (`node --test`). |
| **CHG-002** | **CLASS B (Controlled)** | `/src/server/db.ts`, `/src/server/integrations.ts`, `/src/server/ai.ts`, `/src/server/routes.ts` | Added idempotent migration `006_evidence_engine_and_connector_lifecycle`; separated `HUMAN_REPORTED` (post-action verification & incident reports) and `SYSTEM_RECORDED` (workflow execution dispatch) from `MEASURED` sensor readings; added 10-stage connector lifecycle & duplicate telemetry detection; added 13-stage VANTA Brain investigation trace and prompt-injection/tool-manipulation guards. | Pre-change SQLite hot backup + integration tests (`src/server/phase2.test.ts`). |
| **CHG-V4-001** | **CLASS A (Safe)** | `/src/App.tsx` | Priority Zero Section 4: Replaced document-level flex growth (`min-h-screen`) with viewport-locked independent scroll containers (`h-screen h-dvh overflow-hidden`, stationary `<aside>` with `min-h-0 overflow-y-auto` `<nav>`, stationary `<header>`, and independent `<main>` scroll container). | Headless Chromium verification (`playwright-cli`) at desktop (`1440x900`, `1440x620`) and mobile (`390x844`). |
| **CHG-V4-002** | **CLASS B (Controlled)** | `/src/server/config.ts`, `/src/core/types.ts`, `/src/types/workspace.ts`, `/src/server/validation.ts`, `/src/server/db.ts` | Added `SUPPORTED_GEMINI_MODELS` validation, configurable `geminiTimeoutMs` (`12000ms` default) & `geminiMaxRetries` (`1` default), strict `validateStructuredBrainOutput`, and idempotent migration `007_v4_brain_observability_and_provenance` (adding `correlation_id`, `execution_status`, `provider_status`, `failure_category`, `tool_results_json`, `omitted_evidence_count` to `brain_runs` and backfilling genuine `evidence_provenance` rows from seeded records). | Pre-change SQLite hot backup (`vanta-backup-2026-11-15T15-10-21-216Z-v4-baseline.db`, SHA-256 `5a8aae22...`) + automated tests. |
| **CHG-V4-003** | **CLASS B (Controlled)** | `/src/server/ai.ts`, `/src/server/routes.ts`, `/src/components/VantaBrainView.tsx` | Priority Zero Section 5: Implemented `classifyProviderFailure`, `buildSizeAwareEvidencePayload` (preventing mid-string JSON `.slice()` truncation), `computeHeuristicEvidenceStrength`, `withTimeoutAndAbort`, bounded retry with jitter on `429`/`503`, per-tool execution diagnostics, accurate `BRAIN_QUERY` vs `BRAIN_QUERY_FALLBACK` audit logging, and dynamic frontend provider status bar. | 30-scenario VANTA Brain verification matrix in `src/server/phase2.test.ts`. |
| **CHG-V4-004** | **CLASS A (Safe)** | `/README.md`, `/.npmrc`, `/.env.example`, `/ARCHITECTURE.md` | Created comprehensive root `/README.md`, added `.npmrc` (`legacy-peer-deps=true`) alongside verified `bun.lock`, and reconciled `/ARCHITECTURE.md`. | `compile_applet`, `lint_applet`, `npm test`, and `bun install --frozen-lockfile`. |
| **CHG-V6-001** | **CLASS B (Controlled)** | `/src/server/config.ts`, `/src/server/ai.ts`, `/src/core/types.ts`, `/src/server/routes.ts`, `/src/api/client.ts`, `/src/components/VantaBrainView.tsx` | V6 Section 4: Updated `SUPPORTED_GEMINI_MODELS` (`gemini-4-hydrogen`, `gemini-3.1-flash-lite`, `gemini-4-argon`, `gemini-4-carbon`), increased `maxOutputTokens` to `4096` (preventing `gemini-4-hydrogen` thinking-token output truncation), added `enum` constraint on recommendation `priority` in `responseSchema`, set default `geminiTimeoutMs` to `15000` (`15s`), propagated `AbortSignal` to `@google/genai`, added `retryCount`, and implemented 4-step live provider verification (`POST /api/brain/verify-provider`). | Verified live `GEMINI_SUCCESS` with `gemini-4-hydrogen` + 30-case matrix in `src/server/phase2.test.ts`. |
| **CHG-V6-002** | **CLASS B (Controlled)** | `/src/server/db.ts`, `/src/server/backup.ts`, `/src/types/workspace.ts`, `/.vanta-data/backups/*.sha256.json`, `/package.json`, `/.env.example`, `/README.md` | V6 Sections 5 & 9: Checkpointed `.vanta-data/vanta.db-wal` into `.vanta-data/vanta.db` (`7` migrations, `13` provenance rows), added automatic passive WAL checkpointing after `initDatabase` and `brain_runs` inserts, enriched `BackupMetadata` with `backupType` and `schemaVersion`, repaired all backup `.sha256.json` manifests, tested isolated backup restoration, and updated `package.json` (`6.0.0`) and 37-section `README.md`. | `verifyBackupFile` across all 5 backups, isolated restore test, `npm test`, `compile_applet`, and `lint_applet`. |

---

## 3. Database Schema & Migration Reference (`001`–`007`)

All migrations in `/src/server/db.ts` run inside `BEGIN ... COMMIT` transactions with automatic `ROLLBACK` on failure and are tracked in `schema_migrations`:

1. **`001_initial_vanta_os`**: Core multi-tenant relational & time-series tables (`organizations`, `users`, `sites`, `facilities`, `building_zones`, `assets`, `asset_relationships`, `cameras`, `vision_events`, `iot_integrations`, `telemetry_points`, `events`, `incidents`, `maintenance_records`, `work_orders`, `energy_records`, `predictive_assessments`, `root_cause_investigations`, `agent_executions`, `approvals`, `audit_records`, `knowledge_documents`, `session_records`, `evidence_provenance`, `digital_twin_snapshots`, `brain_runs`).
2. **`002_phase2_zero_trust_provenance`**: Added `users.status`, `users.token_version`, `telemetry_points.facility_id`, camera capability states (`LIVE`, `SIMULATED`, `SAMPLE_IMAGE`, `OFFLINE`, `NOT_CONFIGURED`), `iot_integrations.credential_ref`, and `agent_executions.idempotency_key`.
3. **`003_phase2_state_alignment`**: Deduplicated simulated baseline assessments and aligned predictive validation statuses (`STATISTICAL_ZSCORE`, `RULE_VERIFIED`, `SIMULATED_BASELINE`).
4. **`004_workorder_execution_verification`**: Added `execution_notes`, `executed_by`, `executed_at`, `verification_status`, `verification_notes`, `verified_by`, `verified_at` to `work_orders`.
5. **`005_repair_legacy_verification_and_state_machine`**:
   - Added `work_orders.execution_mode` and `maintenance_records.work_order_id` with unique idempotency index `idx_maint_work_order_unique`.
   - Reclassified historical auto-migrated work orders with synthetic verification text (`Completed maintenance logged in CMMS baseline.` or `system@vanta.internal`) to `verification_status = 'LEGACY_UNVERIFIED'` while preserving historical `COMPLETED` status.
   - Mapped `PARTIAL` verification rows to `NEEDS_FOLLOW_UP` and `UNRESOLVED` rows to `UNRESOLVED`.
6. **`006_evidence_engine_and_connector_lifecycle`**:
   - Added `evidence_class`, `data_quality_status`, `relationship_type`, and `parent_evidence_id` to `evidence_provenance`.
   - Added `lifecycle_stage`, `data_freshness_sec`, and `retry_status` to `iot_integrations`.
7. **`007_v4_brain_observability_and_provenance`**:
   - Added `correlation_id`, `execution_status`, `provider_status`, `failure_category`, `tool_results_json`, and `omitted_evidence_count` to `brain_runs`.
   - Backfilled genuine `evidence_provenance` rows from existing seeded `telemetry_points`, `vision_events`, `incidents`, `predictive_assessments`, and `root_cause_investigations`.

---

## 4. Evidence & Provenance Architecture (Part 6 Specification)

Every operational claim, telemetry sample, vision detection, incident escalation, and workflow transition recorded in `evidence_provenance` carries:
- **`evidenceClass`** (9 canonical classifications):
  - `MEASURED`: Direct physical sensor or utility revenue meter reading.
  - `OBSERVED`: Multimodal or edge camera frame observation.
  - `HUMAN_REPORTED`: Operator incident report or technician post-action verification note (never conflated with physical sensor telemetry).
  - `SYSTEM_RECORDED`: Deterministic workflow state transition or field dispatch log.
  - `ESTIMATED`: Engineering calculation from duty cycle or schedule.
  - `INFERRED`: Graph-correlated root-cause hypothesis.
  - `PREDICTED`: Remaining Useful Life (RUL) or risk trajectory projection.
  - `SIMULATED`: Synthetic scenario or sandbox broker reading.
  - `UNKNOWN`: Un-instrumented or missing signal.
- **`relationshipType`** (7 canonical evidence links):
  - `SUPPORTS`, `CONTRADICTS`, `DERIVED_FROM`, `CORRELATES_WITH`, `VERIFIES`, `SUPERSEDES`, `REQUIRES_REVIEW`.
- **`dataQualityStatus`**:
  - `VERIFIED`, `STALE`, `DUPLICATE_DETECTED`, `OUT_OF_ORDER`, `SIMULATED_SYNTHETIC`.

---

## 5. Centralized Work-Order State-Machine Specification (Part 14)

Enforced by `validateWorkOrderTransition` in `/src/core/intelligence.ts` and transactional SQLite updates in `/src/server/routes.ts`:

```
CREATED ──► PENDING_APPROVAL ──► APPROVED ──► IN_PROGRESS ──► VERIFICATION_PENDING
  │                │                 │             │                   │
  ▼                ▼                 ▼             ├──► COMPLETED      ├──► COMPLETED (if VERIFIED)
CANCELLED      REJECTED /        CANCELLED         ├──► NEEDS_FOLLOW_UP├──► NEEDS_FOLLOW_UP (if PARTIAL)
               CANCELLED                           └──► UNRESOLVED     └──► UNRESOLVED (if UNRESOLVED)
```

### Mandatory State-Machine Invariants
1. **No Approval Bypass**: A work order in `CREATED` or `PENDING_APPROVAL` cannot enter `IN_PROGRESS` until an authorized human (`APPROVE_CONSEQUENTIAL_ACTION`) approves it (`APPROVED`).
2. **No Execution Bypass**: `POST /api/work-orders/:id/verify` rejects (`409 Conflict`) any work order that has not completed field execution (`status IN ('IN_PROGRESS', 'VERIFICATION_PENDING')` and `executed_at IS NOT NULL`).
3. **Honest Outcome Mapping**:
   - `verificationStatus = 'VERIFIED'` → `status = 'COMPLETED'`
   - `verificationStatus = 'PARTIAL'` → `status = 'NEEDS_FOLLOW_UP'`
   - `verificationStatus = 'UNRESOLVED'` → `status = 'UNRESOLVED'`
4. **Transactional Idempotency**: Verification updates `work_orders` and inserts into `maintenance_records` inside a single `BEGIN ... COMMIT` transaction guarded by `idx_maint_work_order_unique(work_order_id)`. Concurrent or replayed verification requests return `409 Conflict`.
5. **Asset Health Integrity**: Work-order verification never adds an arbitrary constant (such as `+12`) to `assets.health_score`.

---

## 6. Industrial Connectivity & Telemetry Quality Specification (Parts 9 & 10)

### 10-Stage Connector Lifecycle
Every connector in `iot_integrations` tracks its position across:
`REGISTER → CONFIGURE → VALIDATE → AUTHENTICATE → CONNECT → COLLECT → NORMALIZE → MONITOR → RECOVER → DISCONNECT`
- Connectors missing vault credentials remain in `VALIDATE` (`status = 'NOT_CONFIGURED'`, `retryStatus = 'BLOCKED_MISSING_CREDENTIALS'`) and reject telemetry ingestion with `409 Conflict`.
- Simulated `.internal` gateways operate in `MONITOR` / `COLLECT` with `status = 'SIMULATED'` and coerce any incoming `MEASURED` claim to `SIMULATED`.
- Unreachable external physical hosts transition to `RECOVER` (`status = 'OFFLINE'`, `retryStatus = 'BACKOFF_RETRYING'` or `'CIRCUIT_OPEN'`).

### Telemetry Data Quality (`evaluateTelemetryQuality` & `ingestNormalizedTelemetry`)
- **Duplicate Detection**: Identical `(tenant_id, asset_id, metric_name, value)` samples arriving within a 2-second window are deduplicated (`deduplicated: true`, `dataQualityStatus: 'DUPLICATE_DETECTED'`).
- **Out-of-Order & Clock-Skew Checks**: `evaluateTelemetryQuality` flags non-monotonic timestamps (`OUT_OF_ORDER`), future timestamps (>60s clock skew), and stale streams (`DEGRADED_STALE`).

---

## 7. VANTA Brain 13-Stage Investigation Pipeline & Predictive Validation (Parts 7 & 12)

### 13-Stage Investigation Pipeline
Every `/api/brain/query` execution returns a structured `BrainAnalysisResponse` containing `investigationStages` (Stages 1–13: Intent Parsing → Tenant/Facility Scoping → RBAC Check → Tool Planning → Scoped Tool Execution → Evidence Indexing → Graph/Timeline Correlation → Candidate Cause Comparison → Confidence Assessment → Structured Answer Generation → Bounded Recommendations → Server Citation Validation → Audit Logging), `situationSummary`, `verifiedFacts`, `rejectedCitations`, `observations`, `anomalies`, `candidateCauses`, `supportingEvidence`, `contradictoryEvidence`, `predictions`, `confidence`, `unknowns`, and `recommendations`.

### Predictive Intelligence Validation Report
- **RUL Model (`estimateRemainingUsefulLife`)**: Deterministic engineering headroom + degradation slope + maintenance cycle utilization (`modelKind: 'HEADROOM_RUL_ESTIMATE'`, `modelVersion: 'vanta-rul-heuristic-2.0'`). Explicitly labeled as a deterministic heuristic with `±uncertaintyHours` bounds — never misrepresented as a trained deep-learning model.
- **Sliding-Window Backtest (`evaluatePredictiveBacktest`)**: Computes `precision`, `recall`, `f1Score`, `meanAbsoluteDrift`, `dataQualityScore`, and `driftDetected` against warning threshold ground truth, with an explicit calibration note when `SIMULATED` samples are present.

---

## 8. Security, Governance & Adversarial Test Assessment (Parts 13 & 16)

| Adversarial Scenario | Protection Mechanism | Automated Test Coverage |
| :--- | :--- | :--- |
| **Cross-Tenant Access** | Every SQL query binds `tenant_id = req.auth.tenantId` from verified session JTI. | `phase2.test.ts` (`tenant-meridian` blocked from `tenant-apex` workspace, work orders, backtest). |
| **Cross-Facility Access** | `authorizeFacilityScope` and `isFacilityAuthorized` enforce `req.auth.facilityIds`. | `phase2.test.ts` (`Viewer` and `Infrastructure Engineer` denied `403` on unassigned facilities). |
| **Unauthorized Workflow Transition** | `validateWorkOrderTransition` + `requirePermission` block premature execution or verification bypass. | `intelligence.test.ts` + `phase2.test.ts` (`409 Conflict` on unapproved execute or unexecuted verify). |
| **Forged Evidence References** | `validateBrainCitations` strips any `sourceId` not present in the retrieved `EvidenceIndex`. | `phase2.test.ts` (`hallucinated-id-999` stripped and logged in `rejectedCitations`). |
| **Prompt Injection & Interlock Bypass** | `runVantaBrainQuery` and `runBoundedAgentExecution` block `ignore previous instructions`, `bypass safety interlock`, `actuate valve`, and `dump all tenants`. | `phase2.test.ts` (`BLOCKED_SAFETY` on agent actuation; deterministic guard on Brain prompt injection). |
| **Tool Argument Manipulation** | `executeScopedTool` rejects any tool call passing a mismatched `tenantId` or unauthorized `facilityId`. | `phase2.test.ts` (`crossTenantTool` and `crossFacTool` rejected). |
| **Replayed / Duplicate Operations** | `idx_agent_idempotency`, `idx_maint_work_order_unique`, single-use `StreamTicketStore`, and 2s telemetry deduplication. | `phase2.test.ts` (replay SSE ticket `401`, duplicate verify `409`, duplicate agent key deduplicated, duplicate telemetry deduplicated). |
| **Unauthorized Document Retrieval** | `ROLE_RANK` filtering on `knowledge_documents` in `/api/workspace` and `query_knowledge_docs`. | `phase2.test.ts` (`Viewer` blocked from `Infrastructure Engineer` and `Operations Manager` SOPs). |

---

## 9. Backup, Recovery & Rollback Guide (Part 18)

- **Hot Backup Creation**: `createDatabaseBackup(db, backupDir, label)` executes `VACUUM INTO` on the live WAL database, runs `PRAGMA integrity_check` on the snapshot, and writes a companion `.sha256.json` manifest.
- **Verification**: `verifyBackupFile(backupFilePath)` recomputes the SHA-256 digest and runs `PRAGMA integrity_check` + table count verification.
- **Clean Restoration**: `restoreDatabaseFromBackup(backupFilePath, targetDbPath)` verifies the backup first, removes stale `-wal`/`-shm` sidecars, and atomically copies the verified snapshot into place.
- **Verified Recovery Point**: `.vanta-data/backups/vanta-backup-2026-11-15T14-35-34-750Z-ultra-phase0-baseline.db` (`SHA-256: 5d42824a93238bf11a5a2daf2514f6c6d3750e1f16de71aa8b43db795d298b0d`, `valid: true`, `integrity: ok`).

---

## 10. Known Limitations Register

1. **Physical OT Fieldbus Hardware**: In the cloud container sandbox, `.internal` OPC UA, MQTT, and Modbus endpoints operate in `SIMULATED` normalizer mode (`capabilityState: 'SIMULATED'`), and external RTSP cameras (`cam-a30`) report `OFFLINE` (`409 Conflict` on live frame grab) unless an operator uploads an inspection image (`POST /api/vision/upload-inspect`).
2. **Heuristic RUL Estimation**: Remaining Useful Life (`vanta-rul-heuristic-2.0`) uses deterministic threshold headroom, slope, and maintenance cycle utilization rather than a fleet-trained survival neural network; requires future field failure-history calibration (`REQUIRES_FUTURE_VALIDATION`).
3. **Physical Actuation Boundary**: By design, VANTA AI never writes setpoints to PLCs, breaker relays, or motorized isolation valves. `POST /api/work-orders/:id/execute` records field technician dispatch (`FIELD_DISPATCH_RECORDED`) only.

---

## 11. Updated Capability Matrix (Part 22 Honesty Classification)

| Module / Capability | Classification | Evidence & Runtime Verification |
| :--- | :--- | :--- |
| **Multi-Tenant & Facility-Scoped RBAC + Session Revocation** | `IMPLEMENTED_AND_TESTED` | Scrypt auth, SQLite `session_records` JTI revocation, `authorizeFacilityScope`, verified in `phase2.test.ts`. |
| **Evidence & Provenance Engine (9 Classes, 7 Relations)** | `IMPLEMENTED_AND_TESTED` | Migration `006`, `evidence_provenance` table, `HUMAN_REPORTED` vs `SYSTEM_RECORDED` vs `MEASURED` separation verified in `phase2.test.ts`. |
| **VANTA Brain 13-Stage Pipeline & Citation Validator** | `IMPLEMENTED_AND_TESTED` | `runVantaBrainQuery`, `validateBrainCitations`, `build13StageInvestigationTrace`, prompt-injection guard verified in `phase2.test.ts`. |
| **Centralized Work-Order State Machine (`validateWorkOrderTransition`)** | `IMPLEMENTED_AND_TESTED` | Full lifecycle (`CREATED → PENDING_APPROVAL → APPROVED → IN_PROGRESS → VERIFICATION_PENDING → COMPLETED / NEEDS_FOLLOW_UP / UNRESOLVED / CANCELLED`) verified in `intelligence.test.ts` & `phase2.test.ts`. |
| **North Star Outcome Metrics & Formula Transparency** | `IMPLEMENTED_AND_TESTED` | `computeNorthStarMetrics` with `null` on zero-denominator, `LEGACY_UNVERIFIED` exclusion, and explicit `formula`/`source`/`dataQuality` verified in `intelligence.test.ts`. |
| **Asset 360° Intelligence & Dependency Graph** | `IMPLEMENTED_AND_TESTED` | Directed dependency graph (`POWERS`, `COOLS`, `FEEDS`, `MONITORS`), Asset 360° workbench verified in browser & API tests. |
| **Digital Twin Snapshots & Read-Only Cascade Simulation** | `IMPLEMENTED_AND_TESTED` | `digital_twin_snapshots` + `simulateTwinCascade` BFS propagation (`mode: 'SIMULATED'`), verified in `intelligence.test.ts` & `phase2.test.ts`. |
| **Root Cause Correlation Engine (`correlateRootCauseEvidence`)** | `IMPLEMENTED_AND_TESTED` | Temporal precedence + graph edge scoring + explicit correlation-vs-causation epistemic notice, verified in `intelligence.test.ts` & `phase2.test.ts`. |
| **Multi-Agent Orchestrator (12 Bounded Agents)** | `IMPLEMENTED_AND_TESTED` | Tool allowlists, step limits, safety interlock blocks (`BLOCKED_SAFETY`), and idempotency keys verified in `phase2.test.ts`. |
| **Uploaded Image Multimodal Vision Inspection** | `IMPLEMENTED_AND_TESTED` | `POST /api/vision/upload-inspect` with Gemini multimodal & rule-based fallback (`captureSource: 'UPLOADED_IMAGE'`), verified in `phase2.test.ts`. |
| **SQLite WAL Hot Backup, SHA-256 Verification & Restore** | `IMPLEMENTED_AND_TESTED` | `createDatabaseBackup`, `verifyBackupFile`, `restoreDatabaseFromBackup` verified with tamper detection in `phase2.test.ts`. |
| **Industrial IoT Protocol Normalizer & Duplicate Guard** | `SIMULATED` | 10-stage lifecycle state machine and `/api/iot/ingest` duplicate detection are `IMPLEMENTED_AND_TESTED`; `.internal` plant brokers run in `SIMULATED` mode in sandbox. |
| **Static Sample Camera Buffer Inspection (`cam-14`, `cam-12`, `cam-c4`)** | `SIMULATED` | Inspects curated industrial sample frames (`capabilityState: 'SAMPLE_IMAGE'`, `mode: 'SIMULATED'`). |
| **Warehouse AGV WebSocket Stream (`iot-ws-1`)** | `NOT_CONFIGURED` | Intentionally unconfigured (`status: 'NOT_CONFIGURED'`, `lifecycleStage: 'VALIDATE'`) to verify fail-closed connector gating (`409 Conflict`). |
| **Live RTSP Edge Video Stream (`cam-a30`)** | `REQUIRES_EXTERNAL_INFRASTRUCTURE` | Reports `OFFLINE` (`409 Conflict`) in cloud sandbox until an edge RTSP relay is bridged. |
| **Direct PLC / SCADA Physical Actuation** | `REQUIRES_EXTERNAL_INFRASTRUCTURE` | Intentionally prohibited by safety boundary policy; VANTA records human-approved field dispatch only. |
| **Heuristic RUL Model Field Calibration (`vanta-rul-heuristic-2.0`)** | `REQUIRES_FUTURE_VALIDATION` | Deterministic headroom math + sliding-window z-score backtest implemented; multi-year run-to-failure ML calibration requires field historian data. |
