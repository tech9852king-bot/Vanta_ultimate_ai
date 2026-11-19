# VANTA AI — Universal Infrastructure Intelligence & Operations Platform

> **V7 Phase 2 Complete Reliability Recovery & Functional Release (`v7.0.0`)**  
> **Architecture**: Node.js (`v22.x`) + Express + SQLite (`node:sqlite` WAL Mode, Foreign Keys, Migrations `001`–`009`) + React 19 + TypeScript + Tailwind CSS 4 + `@google/genai` (`gemini-4-hydrogen`)  
> **Operating Standard**: Backup-First • Zero-Regression • Evidence-First • Fail-Closed Multi-Tenant & Facility RBAC

---

## 1. Executive Summary
**VANTA AI** (`v7.0.0`) is a Universal Infrastructure Intelligence & Operations Platform that connects industrial assets, telemetry streams, computer-vision inspections, asset dependency graphs, digital twin snapshots, predictive maintenance models, engineering SOPs, and human-governed operational workflows into a single evidence-backed operating environment.

## 2. Product Vision & Scope
Instead of forcing operators to interpret disconnected dashboards or unverified AI summaries, VANTA AI enforces an **11-Stage Operational Intelligence Loop**:
`CONNECT → COLLECT → NORMALIZE → CONTEXTUALIZE → ANALYZE → CORRELATE → PREDICT → RECOMMEND → APPROVE → EXECUTE → VERIFY`.
Every analytical claim, root-cause hypothesis, energy total, and maintenance recommendation is bound to tenant-authorized and facility-authorized SQLite records, classified by data origin (`MEASURED`, `OBSERVED`, `HUMAN_REPORTED`, `SYSTEM_RECORDED`, `ESTIMATED`, `INFERRED`, `PREDICTED`, `SIMULATED`, `UNKNOWN`), and gated by human approval before field dispatch.

## 3. Verified vs Simulated vs Planned Capability Matrix

| Module / Capability | Status Classification | Runtime Verification & Evidence |
| :--- | :--- | :--- |
| **Desktop & Mobile Command Shell (`src/App.tsx`)** | `VERIFIED_IMPLEMENTED` | Stationary top header (`h-14 shrink-0`), stationary left sidebar (`lg:h-full overflow-hidden`) with independent `<nav>` scroll (`min-h-0 overflow-y-auto overscroll-contain`), independent `<main>` scroll container, and responsive mobile drawer. |
| **Multi-Tenant & Facility-Scoped RBAC + Scrypt Auth** | `VERIFIED_IMPLEMENTED` | Scrypt password hashing, HMAC-SHA256 JWTs backed by SQLite `session_records` JTI revocation (`logout` & `revoke-all`), and `authorizeFacilityScope` on all reads/mutations. |
| **VANTA Brain 13-Stage Investigation Engine (`src/server/ai.ts`)** | `VERIFIED_IMPLEMENTED` | Live `gemini-4-hydrogen` structured synthesis (`maxOutputTokens: 4096`, `15,000ms` per-attempt timeout, `AbortSignal` & client-disconnect cancellation, in-flight duplicate query coalescing, bounded retry on `429`/`503`), authoritative 9-category evidence counter (`countEvidenceByClassification`), size-aware JSON context builder (`buildSizeAwareEvidencePayload`), server-side citation validator (`validateBrainCitations`), 4-step live provider verification (`POST /api/brain/verify-provider`), and deterministic fallback (`DETERMINISTIC_CORE_FALLBACK`). |
| **Evidence & Provenance Engine (`evidence_provenance`)** | `VERIFIED_IMPLEMENTED` | Migrations `006`, `007`, `008`, and `009` enforce centralized provenance validation (`validateProvenanceCombination` & `resolveCanonicalProvenance`) across all 9 canonical classes (`MEASURED`, `OBSERVED`, `HUMAN_REPORTED`, `SYSTEM_RECORDED`, `ESTIMATED`, `INFERRED`, `PREDICTED`, `SIMULATED`, `UNKNOWN`) and audited `data_quality_status` (`VERIFIED`, `VALIDATED`, `PENDING_VERIFICATION`, `SIMULATED_SYNTHETIC`) with zero contradictory `(data_mode, evidence_class)` pairs. |
| **Closed-Loop Work-Order State Machine (`validateWorkOrderTransition`)** | `VERIFIED_IMPLEMENTED` | Enforces `CREATED → PENDING_APPROVAL → APPROVED → IN_PROGRESS → VERIFICATION_PENDING → COMPLETED / NEEDS_FOLLOW_UP / UNRESOLVED / CANCELLED` with transactional SQLite idempotency (`idx_maint_work_order_unique`). |
| **Asset 360° Intelligence & Directed Dependency Graph** | `VERIFIED_IMPLEMENTED` | Directed edges (`POWERS`, `COOLS`, `FEEDS`, `MONITORS`) across Manufacturing, Grid Substation, Data Center, Warehouse, and Healthcare facilities. |
| **Digital Twin Snapshots & BFS Cascade Simulation** | `VERIFIED_IMPLEMENTED` | Persists `digital_twin_snapshots` and runs read-only BFS cascade propagation (`simulateTwinCascade`, explicitly labeled `SIMULATED`). |
| **Root Cause Analysis Engine (`correlateRootCauseEvidence`)** | `VERIFIED_IMPLEMENTED` | Correlates incident timestamps, upstream asset anomalies, and dependency graph weights (`dataMode: 'INFERRED'`, `evidenceClass: 'INFERRED'`, `dataQualityStatus: 'PENDING_VERIFICATION'` until human-verified) with explicit correlation-vs-causation disclosure. |
| **Bounded Multi-Agent Orchestrator (12 Specialized Agents)** | `VERIFIED_IMPLEMENTED` | Enforces per-agent tool allowlists, step budgets, safety interlock blocks (`BLOCKED_SAFETY`), and `idempotencyKey` deduplication. |
| **Multimodal Vision Inspection (`POST /api/vision/upload-inspect`)** | `VERIFIED_IMPLEMENTED` | Accepts operator-uploaded PNG/JPEG/WebP frames (`captureSource: 'UPLOADED_IMAGE'`, `mode: 'OBSERVED'`, `dataMode: 'OBSERVED'`, `evidenceClass: 'OBSERVED'`, `dataQualityStatus: 'PENDING_VERIFICATION'`), preserving real camera status without faking `LIVE` stream state or `MEASURED` sensor telemetry. |
| **SQLite WAL Hot Backup, SHA-256 Verification & Restore** | `VERIFIED_IMPLEMENTED` | `VACUUM INTO` hot backups in `.vanta-data/backups/` with companion `.sha256.json` manifests (`backupType`, `schemaVersion`), tamper detection, and verified restoration (`restoreDatabaseFromBackup`). |
| **Industrial IoT Protocol Normalizer (`iot_integrations`)** | `SIMULATED` | 10-stage connector lifecycle (`REGISTER` through `DISCONNECT`) and 2-second duplicate telemetry guard are `VERIFIED_IMPLEMENTED`; `.internal` plant brokers run in `SIMULATED` mode in the cloud sandbox. |
| **Static Sample Camera Buffer Inspection (`cam-14`, `cam-12`, `cam-c4`)** | `SIMULATED` | Inspects curated industrial sample frames (`capabilityState: 'SAMPLE_IMAGE'`, `mode: 'SIMULATED'`). |
| **Warehouse AGV WebSocket Stream (`iot-ws-1`)** | `NOT_CONFIGURED` | Intentionally unconfigured (`status: 'NOT_CONFIGURED'`, `lifecycleStage: 'VALIDATE'`) to demonstrate fail-closed `409 Conflict` ingestion gating. |
| **Live RTSP Edge Camera Stream (`cam-a30`)** | `REQUIRES_EXTERNAL_INFRASTRUCTURE` | Reports `OFFLINE` (`409 Conflict` on live frame grab) unless an edge RTSP relay is connected or a frame is uploaded manually. |
| **Direct Physical PLC / Breaker Actuation** | `PROHIBITED_BY_SAFETY_GOVERNANCE` | VANTA AI never bypasses PLC safety logic, interlocks, or emergency stops; workflow execution records human-dispatched field work (`FIELD_DISPATCH_RECORDED`). |

## 4. System Architecture Overview
```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                              VANTA AI ENTERPRISE ARCHITECTURE                            │
├───────────────────────────┬──────────────────────────────┬───────────────────────────────┤
│ Frontend SPA (/src/*)     │ Express API (/src/server/*)  │ Pure Core (/src/core/*)       │
│ • App.tsx (20 modules,    │ • routes.ts (RBAC, SSE,      │ • intelligence.ts (Z-score,   │
│   isolated scroll shells) │   validation, provenance)    │   RUL headroom, backtest,     │
│ • VantaBrainView.tsx      │ • ai.ts (13-stage Brain,     │   BFS Twin cascade, RCA,      │
│ • OverviewAndCommand.tsx  │   retry/abort, citation val) │   WorkOrder state machine,    │
│ • VisionAndCameras.tsx    │ • db.ts (SQLite WAL, 001–007)│   North Star KPI formulas)    │
│ • InfrastructureAndTwin   │ • security.ts (Scrypt, JTI)  │ • types.ts (Canonical         │
│ • IntelligenceModules     │ • authz.ts (Tenant/Facility) │   contracts & enums)          │
│ • GovernanceAndPlatform   │ • backup.ts (VACUUM + SHA256)│                               │
└───────────────────────────┴──────────────────────────────┴───────────────────────────────┘
```

## 5. Technology Stack

| Layer | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Runtime** | Node.js (`node:sqlite` & `node:test`) | `v22.23.2` | Server runtime, native SQLite WAL engine, and test runner |
| **Package Manager / Lockfile** | npm (`package-lock.json`) & Bun (`bun.lock`) | npm `10.x` / Bun `1.4.4` | Deterministic dependency resolution (`npm ci` / `npm install` or `bun install --frozen-lockfile`) |
| **Backend HTTP** | Express | `^4.21.2` | REST API, HTTP-only cookies, SSE telemetry stream, static serving |
| **AI SDK** | `@google/genai` | `^2.4.0` | Server-side Gemini structured synthesis & multimodal vision (`gemini-4-hydrogen`) |
| **Frontend UI** | React + React DOM | `^19.0.1` | 20-module enterprise command center SPA |
| **Styling** | Tailwind CSS + `@tailwindcss/vite` | `^4.3.3` | Responsive dark command-center styling (`h-dvh` independent scroll shells) |
| **Build / Bundler** | Vite + TypeScript + `tsx` | Vite `^8.3.0`, TS `^7.0.2` | Frontend production build (`dist/`) and TypeScript execution |

## 6. Complete Directory & File Structure
```text
/
├── .env.example                 # Documented environment variable template (no secrets)
├── .npmrc                       # npm peer-dependency compatibility (legacy-peer-deps=true)
├── ARCHITECTURE.md              # Deep architectural, schema, state-machine & security reference
├── README.md                    # Primary enterprise engineering & operations manual
├── bun.lock                     # Deterministic Bun lockfile (verified via bun install --frozen-lockfile)
├── package-lock.json            # Deterministic npm v3 lockfile for standard npm / CI workflows
├── index.html                   # SPA HTML entry point
├── metadata.json                # Applet metadata & capability declarations
├── package.json                 # Scripts (dev, build, start, lint, test) and dependencies
├── server.ts                    # Express server entry point (API + Vite middleware / static dist)
├── tsconfig.json                # TypeScript compiler configuration
├── vite.config.ts               # Vite bundler configuration
├── public/samples/              # Curated industrial camera sample frames
└── src/
    ├── App.tsx                  # Root layout shell (independent sidebar & main scroll) + 20-module router
    ├── main.tsx                 # React DOM mount
    ├── index.css                # Tailwind CSS 4 imports & typography tokens
    ├── api/client.ts            # Typed frontend API client
    ├── components/              # 20 enterprise modules across 8 component bundles
    ├── core/                    # Pure types.ts, intelligence.ts, and intelligence.test.ts
    ├── server/                  # Express routes.ts, ai.ts, db.ts, config.ts, security.ts, authz.ts, backup.ts, phase2.test.ts
    └── types/workspace.ts       # Frontend workspace payload & health response contracts
```

## 7. Prerequisites
- **Node.js** `>= 22.0.0` (required for built-in `node:sqlite` and `node:test`)
- **npm** `>= 10.0.0` (`package-lock.json`) or **Bun** `>= 1.1.0` (`bun.lock`)

## 8. Reproducible Installation Guide
```bash
# Standard npm installation using committed package-lock.json + .npmrc:
npm install

# Or Bun deterministic installation from committed bun.lock:
bun install --frozen-lockfile
```

## 9. Environment Variables & Configuration Matrix

| Variable | Required | Default | Validation / Clamping | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | Optional (Required for live Gemini synthesis) | Unset | Non-empty string (`!== 'MY_GEMINI_API_KEY'`) | Server-side Gemini API key. When unset, VANTA Brain and Vision automatically execute deterministic SQLite fallback (`DETERMINISTIC_CORE_FALLBACK`). |
| `VANTA_SESSION_SECRET` | **Required in Production** | Dev fallback in `development` | `>= 32` characters in `production` | Secret for signing HMAC-SHA256 session tokens. Fails closed on startup in `NODE_ENV=production` if missing or `< 32` chars. |
| `VANTA_SESSION_SECRET_PREVIOUS` | Optional | `""` | Optional string | Previous signing secret for zero-downtime key rotation. |
| `VANTA_ALLOW_DEMO_AUTH` | Optional | `true` in dev, `false` in prod | `"true"` or `"false"` | Enables demo persona quick-login and initial demo tenant seeding. |
| `VANTA_DB_PATH` | Optional | `./.vanta-data/vanta.db` | File path or `:memory:` | Path to the SQLite WAL database file. |
| `VANTA_GEMINI_MODEL` | Optional | `gemini-4-hydrogen` | Allowlist: `gemini-4-hydrogen`, `gemini-3.1-flash-lite`, `gemini-4-argon`, `gemini-4-carbon` | Validated Gemini model ID. Unsupported IDs set `geminiModelValid=false` and route immediately to `INVALID_MODEL` fallback without network calls. |
| `VANTA_GEMINI_TIMEOUT_MS` | Optional | `15000` | Clamped to `1500`–`30000` ms | Per-attempt timeout budget for Gemini provider calls. |
| `VANTA_GEMINI_MAX_RETRIES` | Optional | `1` | Clamped to `0`–`2` | Bounded retry count for transient `429` / `503` errors within overall request deadline. |

## 10. Development, Build & Production Startup
```bash
npm run dev      # Start Express + Vite middleware server on http://localhost:3000
npm run lint     # Run TypeScript compiler check (tsc --noEmit)
npm run build    # Build production frontend bundle to dist/
npm start        # Run production server
npm test         # Execute full unit + integration test suite (src/core/*.test.ts src/server/*.test.ts)
```

## 11. Database Architecture & Schema Migrations (`001`–`009`)
VANTA AI uses **SQLite in WAL (`Write-Ahead Logging`) mode** (`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;`) and executes `PRAGMA wal_checkpoint(PASSIVE);` after startup migrations and `brain_runs` writes so single-file reads of `.vanta-data/vanta.db` always observe committed state:
1. **`001_initial_vanta_os`**: Creates 26 core multi-tenant tables.
2. **`002_phase2_zero_trust_provenance`**: Adds `users.status`, `users.token_version`, `telemetry_points.facility_id`, camera capability states, `iot_integrations.credential_ref`, and `agent_executions.idempotency_key`.
3. **`003_phase2_state_alignment`**: Aligns predictive validation statuses and deduplicates baseline assessments.
4. **`004_workorder_execution_verification`**: Adds field execution and post-action verification columns to `work_orders`.
5. **`005_repair_legacy_verification_and_state_machine`**: Reclassifies historical auto-migrated work orders with synthetic verification text to `LEGACY_UNVERIFIED` and adds `idx_maint_work_order_unique`.
6. **`006_evidence_engine_and_connector_lifecycle`**: Adds 9-class `evidence_class`, `data_quality_status`, `relationship_type`, and `parent_evidence_id` to `evidence_provenance`, plus 10-stage `lifecycle_stage` to `iot_integrations`.
7. **`007_v4_brain_observability_and_provenance`**: Adds `correlation_id`, `execution_status`, `provider_status`, `failure_category`, `tool_results_json`, and `omitted_evidence_count` to `brain_runs`, and backfills 13 baseline `evidence_provenance` rows from seeded telemetry, vision, incident, predictive, and root-cause records.
8. **`008_repair_provenance_and_vision_classification`**: Eliminates contradictory `(data_mode, evidence_class)` pairs in `evidence_provenance` (`MEASURED + HUMAN_REPORTED` → `HUMAN_REPORTED + HUMAN_REPORTED`, `MEASURED + PREDICTED` → `PREDICTED + PREDICTED`, `MEASURED + INFERRED` → `INFERRED + INFERRED`, `SIMULATED + OBSERVED` sample buffer → `SIMULATED + SIMULATED`, `MEASURED + OBSERVED` uploaded image → `OBSERVED + OBSERVED`).
9. **`009_audit_provenance_data_quality_and_vision_mode`**: Repairs `vision_events.mode` for `UPLOADED_IMAGE` captures from `'MEASURED'` to `'OBSERVED'` and audits `evidence_provenance.data_quality_status` so `VERIFIED` is reserved strictly for direct `MEASURED` sensor readings and independently verified outcomes (`RESOLVED` incidents, `VERIFIED` RCA investigations, `VERIFIED` post-action work orders), while unverified human reports, correlation hypotheses, heuristic RUL projections, and uploaded frames are marked `PENDING_VERIFICATION`, system dispatch logs are marked `VALIDATED`, and simulated records are marked `SIMULATED_SYNTHETIC`.

## 12. V5-to-V6 Database Lineage & Provenance Explanation
Forensic inspection of `.vanta-data/` and `.vanta-data/backups/` established the exact lineage across versions:
- `vanta-backup-2026-11-15T13-49-01-243Z-phase0-pre-evolution-baseline.db`: Migrations `001`–`004` (`0` provenance rows, `2` brain runs).
- `vanta-backup-2026-11-15T14-35-34-750Z-ultra-phase0-baseline.db`: Migrations `001`–`005` (`0` provenance rows, `2` brain runs).
- `vanta-backup-2026-11-15T15-10-21-216Z-v4-baseline.db`: Migrations `001`–`006` (`0` provenance rows, `2` brain runs).
- **Why external single-file inspection of `vanta.db` before V6 reported 6 migrations, 0 provenance rows, and 2 brain runs**: Migration `007`, the `13` backfilled `evidence_provenance` rows, and 2 additional `brain_runs` (`brn-18c57d0e`, `brn-1b595a16`) had been committed to the SQLite Write-Ahead Log sidecar (`.vanta-data/vanta.db-wal`, `869,352` bytes) and had not yet been checkpointed into `.vanta-data/vanta.db` (`319,488` bytes). In V6 Phase 1, `PRAGMA wal_checkpoint(TRUNCATE)` flushed all 7 migrations, 13 provenance rows, and all brain runs into `.vanta-data/vanta.db`, and `initDatabase` + `POST /api/brain/query` now run `PRAGMA wal_checkpoint(PASSIVE)` automatically.

## 13. Multi-Tenant & Facility-Scoped Authorization Model
- **9 Hierarchical Roles**: `Viewer`, `Analyst`, `Maintenance Engineer`, `Security Operator`, `Infrastructure Engineer`, `Operations Manager`, `Facility Administrator`, `Organization Administrator`, `Platform Administrator`.
- **Strict Tenant & Facility Isolation**: Every query binds `tenant_id` from the verified session token and validates facility access via `authorizeFacilityScope`.
- **Demo Personas** (when `VANTA_ALLOW_DEMO_AUTH=true`):
  - `ops.manager@apex-industrial.io` / `VantaDemo!2026` (`Operations Manager`, 4 Apex facilities)
  - `admin@apex-industrial.io` / `VantaDemo!2026` (`Platform Administrator`, 4 Apex facilities)
  - `engineer@apex-industrial.io` / `VantaDemo!2026` (`Infrastructure Engineer`, 3 Apex facilities; no `fac-whse-west`)
  - `viewer@apex-industrial.io` / `VantaDemo!2026` (`Viewer`, `fac-plant-a` only)
  - `facility.admin@meridian-infra.io` / `VantaDemo!2026` (`Facility Administrator`, separate tenant `tenant-meridian`)

## 14. VANTA Brain Architecture, Gemini Provider Governance & Fallback Semantics
Every `POST /api/brain/query` request runs a 13-stage pipeline (`Intent Parsing → Tenant/Facility Scoping → RBAC Check → Tool Planning → Scoped Tool Execution → Evidence Indexing → Graph/Timeline Correlation → Candidate Cause Comparison → Confidence Assessment → Structured Answer Generation → Bounded Recommendations → Server Citation Validation → Audit Logging`).
- **Live Gemini Synthesis (`gemini-4-hydrogen`)**: Allocates `maxOutputTokens: 4096` so internal thinking tokens (`~480` tokens) plus structured JSON output never truncate mid-stream, enforces `enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']` on recommendation priorities, propagates `AbortSignal` into `@google/genai`, and validates output via `validateStructuredBrainOutput`.
- **4-Step Live Provider Verification (`POST /api/brain/verify-provider`)**: Executes (1) API Key & Model Allowlist Check, (2) SDK Initialization, (3) Minimal Structured JSON Probe, and (4) Full VANTA Brain Synthesis Verification.
- **Deterministic Fallback (`DETERMINISTIC_CORE_FALLBACK`)**: Triggered transparently if `GEMINI_API_KEY` is unset or on provider error (`TIMEOUT`, `RATE_LIMITED`, `QUOTA_EXCEEDED`, `AUTH_ERROR`, `PERMISSION_ERROR`, `INVALID_MODEL`, `MALFORMED_OUTPUT`, `ABORTED`).

## 15. Evidence & Provenance Architecture
Every record in `evidence_provenance` carries a validated 9-category `(data_mode, evidence_class)` pair (`MEASURED`, `OBSERVED`, `HUMAN_REPORTED`, `SYSTEM_RECORDED`, `ESTIMATED`, `INFERRED`, `PREDICTED`, `SIMULATED`, `UNKNOWN`), a 7-type `relationship_type` (`SUPPORTS`, `CONTRADICTS`, `DERIVED_FROM`, `CORRELATES_WITH`, `VERIFIES`, `SUPERSEDES`, `REQUIRES_REVIEW`), and `data_quality_status`. Centralized `validateProvenanceCombination` and `resolveCanonicalProvenance` (`src/core/intelligence.ts`) reject contradictory pairs (`MEASURED + HUMAN_REPORTED`, `MEASURED + INFERRED`, `MEASURED + PREDICTED`, `SIMULATED + OBSERVED`, `MEASURED + OBSERVED`). Server-side `validateBrainCitations` strips any citation not found in the facility-authorized `EvidenceIndex` and prefixes non-measured claims (`[SIMULATED]`, `[ESTIMATED]`, `[PREDICTED]`, `[INFERRED]`, `[HUMAN_REPORTED]`, `[OBSERVED]`, `[SYSTEM_RECORDED]`) automatically.

## 16. Vision Intelligence & Camera Management
Supports sample-buffer inspection (`cam-14`, `cam-12`, `cam-c4` — labeled `SAMPLE_IMAGE`, provenance `SIMULATED + SIMULATED`), fail-closed offline RTSP detection (`cam-a30` — returns `409 Conflict` on live grab), and operator-uploaded frame inspection (`POST /api/vision/upload-inspect` — `captureSource: 'UPLOADED_IMAGE'`, provenance `OBSERVED + OBSERVED`, preserving actual camera status without claiming a live RTSP stream).

## 17. Infrastructure Hierarchy & Asset Graph
Models `Organization → Site → Facility → BuildingZone → Asset → Equipment/Sensor` with directed dependency edges (`POWERS`, `COOLS`, `FEEDS`, `MONITORS`) and criticality weights (`0.0`–`1.0`).

## 18. Industrial IoT Connectors & Telemetry Governance
Tracks connectors across a 10-stage lifecycle (`REGISTER → CONFIGURE → VALIDATE → AUTHENTICATE → CONNECT → COLLECT → NORMALIZE → MONITOR → RECOVER → DISCONNECT`), enforces a 2-second duplicate telemetry guard (`DUPLICATE_DETECTED`), and evaluates Z-score anomalies (`computeZScoreAnomaly`).

## 19. Digital Twin & Scenario Simulation
Captures versioned facility state snapshots (`digital_twin_snapshots`) and runs read-only Breadth-First Search cascade simulations (`simulateTwinCascade` for `ASSET_OFFLINE`, `COOLING_DEGRADATION`, `POWER_LOSS`), explicitly disclosing `mode: 'SIMULATED'`.

## 20. Predictive Maintenance & Backtesting
Computes deterministic Remaining Useful Life (`estimateRemainingUsefulLife`, `vanta-rul-heuristic-2.0`) with `±uncertaintyHours` bounds and sliding-window anomaly backtests (`evaluatePredictiveBacktest` reporting `precision`, `recall`, `f1Score`, `meanAbsoluteDrift`, and `driftDetected`).

## 21. Energy Intelligence
Strictly separates `MEASURED` revenue-grade metering (`eng-1`, `eng-2`) from `ESTIMATED` (`eng-4`) and `SIMULATED` (`eng-3`, `eng-med-1`) profiles via `computeEnergySummary`.

## 22. Root Cause Intelligence
Correlates incident timestamps, upstream dependency edges, anomaly Z-scores, and maintenance intervals (`correlateRootCauseEvidence`) while explicitly distinguishing statistical/topological correlation from physical causation.

## 23. Multi-Agent Orchestrator & Safety Guardrails
Governs 12 specialized agents (`VANTA_AGENTS`) with explicit tool allowlists, step limits, `idempotencyKey` deduplication, and hard safety interlock blocks (`BLOCKED_SAFETY` on any prompt attempting physical actuation or interlock bypass).

## 24. Operations Workflows, Work Orders & Human Approvals
Enforces the closed-loop state machine (`validateWorkOrderTransition`):
- Consequential work orders start in `PENDING_APPROVAL` and require human sign-off (`POST /api/approvals/:id/decide`).
- Field dispatch (`POST /api/work-orders/:id/execute`) records `IN_PROGRESS` (`FIELD_DISPATCH_RECORDED`).
- Post-action verification (`POST /api/work-orders/:id/verify`) maps `VERIFIED → COMPLETED`, `PARTIAL → NEEDS_FOLLOW_UP`, and `UNRESOLVED → UNRESOLVED` without adding arbitrary constants to `assets.health_score`.

## 25. Knowledge Center
Stores role-scoped (`min_role`) and facility-scoped SOPs, equipment specifications, and safety interlock procedures (`knowledge_documents`).

## 26. Security, Sessions, Rate Limiting & SSE Tickets
- **Passwords**: Hashed with Node `crypto.scryptSync` (`16`-byte salt, `64`-byte key) and verified via `crypto.timingSafeEqual`.
- **Sessions**: HMAC-SHA256 tokens backed by SQLite `session_records` JTI state (`ACTIVE` / `REVOKED`).
- **SSE Tickets**: `POST /api/stream/ticket` issues 30-second single-use tickets (`stk-...`) so JWTs are never exposed in query strings.
- **Rate Limiting**: Scoped token buckets on login, registration, AI synthesis, and mutations (`src/server/rateLimit.ts`).

## 27. Analytics & North Star Metrics
Computes operational KPIs (`computeNorthStarMetrics`) with explicit `formula`, `source`, `timeWindow`, `dataQuality`, and `null` handling when denominators are zero (excluding `LEGACY_UNVERIFIED` historical records from verified resolution rates).

## 28. Administration, Observability & System Health
Exposes correlation-tracked structured telemetry (`X-Correlation-Id`), request/AI latency histograms, error counters (`GET /api/health`), and SQLite readiness probes (`GET /api/ready`).

## 29. Backup, Verification & Disaster Recovery Guide
- **Hot Backups**: Stored in `.vanta-data/backups/` using `VACUUM INTO` (`createDatabaseBackup`), verified immediately with `PRAGMA integrity_check`, and paired with `.sha256.json` manifests (`filename`, `filePath`, `sizeBytes`, `sha256`, `integrityCheck`, `createdAt`, `backupType`, `schemaVersion`).
- **Verified V6 Baseline Snapshot**: `.vanta-data/backups/vanta-backup-2026-11-16T13-00-00-000Z-v6-phase1-baseline.db` (`SHA-256: e35c9266f70c4ac9f46c1ce44d6caf1974e31687c230a043e23c69f8f3026820`, `sizeBytes: 319488`, `schemaVersion: 007_v4_brain_observability_and_provenance`).
- **Restoration**: Call `restoreDatabaseFromBackup(backupFilePath, targetDbPath)` in `src/server/backup.ts`.

## 30. Automated Testing Guide
Execute `npm test` to run all 27 automated test suites across `src/core/intelligence.test.ts` (16 unit tests), `src/server/security.test.ts` (3 security suites), `src/server/api.test.ts` (1 API integration suite), and `src/server/phase2.test.ts` (7 comprehensive integration suites including the 30-case VANTA Brain & Provider Verification matrix).

## 31. API Reference

| Method & Path | Permission | Description |
| :--- | :--- | :--- |
| `GET /api/health` | Public | Operational status, migration count, Gemini model/timeout config, and observability metrics |
| `GET /api/ready` | Public | SQLite WAL readiness probe |
| `POST /api/auth/login` | Public | Scrypt authentication + session JTI creation |
| `POST /api/auth/logout` | Authenticated | Immediate session JTI revocation |
| `POST /api/auth/revoke-all` | `VIEW_PLATFORM` | Revokes all active sessions for user and increments `token_version` |
| `POST /api/stream/ticket` | `VIEW_PLATFORM` | Issues single-use 30s SSE stream ticket |
| `GET /api/stream/telemetry` | Ticket / Cookie | Facility-scoped real-time telemetry SSE stream |
| `GET /api/workspace` | `VIEW_PLATFORM` | Full tenant- and facility-scoped workspace payload |
| `POST /api/brain/query` | `QUERY_BRAIN` | 13-stage VANTA Brain analysis with citation validation & WAL checkpoint |
| `POST /api/brain/verify-provider` | `QUERY_BRAIN` | 4-step live Gemini provider & structured synthesis readiness check |
| `POST /api/vision/inspect` | `RUN_VISION_INSPECT` | Camera frame inspection (`409` if `OFFLINE`) |
| `POST /api/vision/upload-inspect` | `RUN_VISION_INSPECT` | Operator-uploaded multimodal frame inspection (`OBSERVED` / `UPLOADED_IMAGE`, `PENDING_VERIFICATION`) |
| `POST /api/iot/connectors/:id/health-check` | `VIEW_PLATFORM` | Connector health probe & 10-stage lifecycle update |
| `POST /api/iot/ingest` | `MANAGE_ASSETS_IOT` | Telemetry ingestion with 2s duplicate guard |
| `POST /api/twin/snapshots` | `RUN_TWIN_SIMULATION` | Captures Digital Twin snapshot |
| `POST /api/twin/simulate-scenario` | `RUN_TWIN_SIMULATION` | Runs BFS cascade simulation (`SIMULATED`) |
| `GET /api/predictive/backtest` | `VIEW_PLATFORM` | Sliding-window anomaly backtest |
| `POST /api/rca/correlate` | `INVESTIGATE_RCA` | Root-cause timeline & dependency correlation |
| `POST /api/work-orders` | `CREATE_WORK_ORDER` | Creates work order (`PENDING_APPROVAL`) + approval item |
| `POST /api/approvals/:id/decide` | `APPROVE_CONSEQUENTIAL_ACTION` | Approves or rejects pending consequential action |
| `POST /api/work-orders/:id/execute` | `CREATE_WORK_ORDER` | Dispatches approved work order (`IN_PROGRESS`) |
| `POST /api/work-orders/:id/verify` | `VERIFY_WORK_ORDER_OUTCOME` | Post-action outcome verification (`COMPLETED` / `NEEDS_FOLLOW_UP` / `UNRESOLVED`) |
| `GET / POST /api/admin/backups` | `MANAGE_BACKUPS` | Lists, creates, and verifies SQLite hot backups |

## 32. UI Navigation & Scroll Architecture
`src/App.tsx` implements a viewport-locked layout (`h-screen h-dvh overflow-hidden flex`):
- **Desktop Sidebar (`<aside>`)**: Stationary container (`lg:flex lg:flex-col lg:w-64 lg:shrink-0 lg:h-full overflow-hidden`) with fixed brand header, independently scrollable navigation (`flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain`), and fixed operator footer.
- **Main Content Area**: Stationary 3-zone `<header>` (`h-14 shrink-0`) above an independently scrollable `<main>` (`flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain`).

## 33. Troubleshooting Guide
- **Brain Query Falls Back to Deterministic Engine**: Click **"Verify Live Provider"** in VANTA Brain (`POST /api/brain/verify-provider`) to inspect which of the 4 steps failed (`MISSING_API_KEY`, `INVALID_MODEL`, `QUOTA_EXCEEDED`, or `TIMEOUT`).
- **Camera Inspection Returns `409 Conflict`**: Camera `cam-a30` is an offline RTSP edge stream; use **Upload Frame for Inspection** (`POST /api/vision/upload-inspect`) to analyze an image file.
- **IoT Ingestion Returns `409 Conflict`**: Connector `iot-ws-1` is intentionally `NOT_CONFIGURED` (`missing vault credential reference`).

## 34. Security Considerations
Never commit real API keys or session secrets to `.env` or source control. In `NODE_ENV=production`, `VANTA_SESSION_SECRET` must be at least 32 characters of CSPRNG material and `VANTA_ALLOW_DEMO_AUTH` must remain `false`.

## 35. Known Limitations
1. `.internal` industrial fieldbus brokers (OPC UA, MQTT, Modbus) run in `SIMULATED` mode inside the cloud sandbox.
2. `gemini-4-argon` and `gemini-4-carbon` require a paid-tier Gemini API billing key (`429 QUOTA_EXCEEDED` on free-tier keys); `gemini-4-hydrogen` and `gemini-3.1-flash-lite` are verified working on the standard runtime key.
3. Direct physical actuation of PLCs, breakers, or valves is prohibited by platform safety governance.

## 36. Release Lineage (`V1` → `V6`)
- **V1**: Initial prototype SPA and mock endpoints.
- **V2**: Phase II Zero-Trust RBAC, SQLite WAL persistence, Scrypt auth, JTI revocation, and hot backups (`001`–`003`).
- **V3**: Closed-loop work-order verification state machine (`004`–`005`) and North Star KPI transparency.
- **V4**: 9-class Evidence & Provenance engine, 10-stage connector lifecycle, 13-stage VANTA Brain pipeline, and independent scroll shells (`006`–`007`).
- **V5**: Forensic stabilization, lockfile verification (`bun.lock`), and 28-case Brain test matrix.
- **V6 (`v6.0.0`)**: Resolved `gemini-4-hydrogen` thinking-token output truncation (`maxOutputTokens: 4096`) and timeout budget (`15,000ms`), added `POST /api/brain/verify-provider` 4-step live verification, checkpointed WAL state into `vanta.db` with automatic passive checkpoints, repaired all historical backup `.sha256.json` manifests, and reconciled all documentation.

- **V7 (`v7.0.0`)**: Repaired all contradictory `(data_mode, evidence_class)` pairs in `evidence_provenance` via migration `008_repair_provenance_and_vision_classification`, added migration `009_audit_provenance_data_quality_and_vision_mode` to audit `data_quality_status` (`VERIFIED` vs `VALIDATED` vs `PENDING_VERIFICATION` vs `SIMULATED_SYNTHETIC`) and align uploaded vision events (`mode: 'OBSERVED'`), enforced centralized 9-category evidence counting (`countEvidenceByClassification`) so `MEASURED` counts only `MEASURED`, added in-flight Brain query deduplication and disconnect abort handling, and committed `package-lock.json` alongside `bun.lock`.

## 37. Production Readiness Checklist
- [x] `VANTA_SESSION_SECRET` configured (`>= 32` chars) in production
- [x] `GEMINI_API_KEY` verified live with `gemini-4-hydrogen` (`GEMINI_SUCCESS`)
- [x] All 9 SQLite migrations (`001`–`009`) and consistent baseline provenance records checkpointed in `.vanta-data/vanta.db`
- [x] All `.vanta-data/backups/*.db` snapshots verified (`integrityCheck: ok`, `sha256Match: true`)
- [x] `package-lock.json` and `bun.lock` committed and verified (`npm install`, `npm run lint`, `npm run build`, and `npm test` passing with `0` failures)
