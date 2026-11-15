# VANTA AI — Universal Infrastructure Intelligence OS (Phase II)

## Architecture Overview

VANTA AI is a modular, zero-trust full-stack TypeScript infrastructure intelligence operating system connecting physical infrastructure modeling, telemetry ingestion, predictive modeling, visual inspection, root-cause correlation, digital twin simulation, and human-authorized multi-agent operations.

### Layer Breakdown

1. **Pure Core Intelligence Engine (`src/core/`)**
   - `src/core/types.ts`: Universal infrastructure data contracts (Organizations, Tenants, Facilities, Zones, Assets, Relationships, Cameras with explicit `CameraCapabilityState`, IoT Integrations, Telemetry, Incidents, Work Orders, Energy Records, Predictive Assessments, Root Cause Investigations, Digital Twin Snapshots & Scenarios, Provenance Records, Agents, Approvals, Audit Records, Knowledge Documents).
   - `src/core/intelligence.ts`: Deterministic, unit-tested calculations for:
     - Statistical z-score anomaly detection (`computeZScoreAnomaly`)
     - Headroom RUL estimation with uncertainty bounds (`estimateRemainingUsefulLife`, `HEADROOM_RUL_ESTIMATE`)
     - Historical sliding-window backtesting & drift evaluation (`evaluatePredictiveBacktest`)
     - Energy baseline separation (`MEASURED` vs `ESTIMATED` vs `SIMULATED`) with facility and equipment attribution (`computeEnergySummary`)
     - Digital Twin BFS cascade simulation (`simulateTwinCascade`, read-only `SIMULATED` mode)
     - Graph-based Root Cause correlation with temporal precedence, `selectionReason`, and `"Correlation != Causation"` epistemic notices (`correlateRootCauseEvidence`)
     - RBAC & physical safety boundary enforcement (`canPerformAction`, `requiresHumanApproval`)

2. **Zero-Trust Backend Platform (`server.ts`, `src/server/`)**
   - `src/server/config.ts`: Fail-closed environment loader (`loadRuntimeConfig()`). Production (`NODE_ENV=production`) refuses to boot without an explicit high-entropy `VANTA_SESSION_SECRET` (min 32 chars) and disables demo quick-logins (`allowDemoAuth = false`) unless explicitly opted in.
   - `src/server/security.ts`: `scrypt` password hashing, HMAC-SHA256 session tokens (`jti`/`iat`/`exp`/`ver`) with zero-downtime key rotation (`VANTA_SESSION_SECRET_PREVIOUS`), SQLite-backed session revocation, single-use origin-bound SSE streaming tickets (`StreamTicketStore`), and active-account RBAC permission guards.
   - `src/server/authz.ts`: Central tenant and facility-level authorization (`authorizeFacilityScope`, `isFacilityAuthorized`, `isKnowledgeDocAuthorized`, `buildFacilityInClause`). Prevents client-supplied `facilityId` bypasses and restricts facility-scoped knowledge documents.
   - `src/server/rateLimit.ts`: Layered sliding-window rate limiters (`IP`, `IP_AND_EMAIL`, `TENANT_USER`, `TENANT`) emitting standard `RateLimit-*` and `Retry-After` headers.
   - `src/server/validation.ts`: Strict payload validation for auth, Brain queries, asset creation, work orders, knowledge ingestion, uploaded image frames (base64 size & MIME checks), IoT telemetry (`thresholdCrit >= thresholdWarn`), and structured Gemini outputs.
   - `src/server/observability.ts`: Request correlation (`X-Correlation-Id`), log scrubbing (`sanitizeForLog`), latency/AI telemetry snapshots, `/api/health`, and `/api/ready`.
   - `src/server/db.ts` & `src/server/backup.ts`: SQLite (`node:sqlite` in WAL mode with foreign keys), tracked `schema_migrations` (`001_initial_vanta_os`, `002_phase2_zero_trust_provenance`), `session_records`, `evidence_provenance`, `digital_twin_snapshots`, `brain_runs`, and hot `VACUUM INTO` backups with `PRAGMA integrity_check` + SHA-256 verification and clean WAL/SHM restoration. Graceful `SIGINT`/`SIGTERM` shutdown checkpoints WAL (`PRAGMA wal_checkpoint(TRUNCATE)`).
   - `src/server/integrations.ts`: Honest hardware capability layer (`probeCameraProviderHealth`, `probeIoTConnectorHealth`, `ingestNormalizedTelemetry`) separating `SAMPLE_IMAGE`, `UPLOADED_IMAGE`, `SIMULATED`, `OFFLINE`, and `NOT_CONFIGURED` states.
   - `src/server/ai.ts`: 10-stage VANTA Brain (`gemini-4-hydrogen` via `@google/genai` with timeouts & 18KB evidence budget), server-side citation validator (`validateBrainCitations`), uploaded-image multimodal vision inspection, and bounded multi-agent orchestrator with task-aware tool planning, strict allowlist/RBAC enforcement, conflict detection, step trace, and `idempotencyKey` deduplication.
   - `src/server/routes.ts`: Express REST API + single-use ticket SSE stream (`/api/stream/ticket`, `/api/stream/telemetry`).

3. **Enterprise Command Interface (`src/components/`, `src/App.tsx`, `src/api/client.ts`)**
   - 20 structured operational views across Command, Perception, Infrastructure, Intelligence, Operations & Governance, and Platform.
   - Surfaces `OFFLINE` camera refusals alongside manual frame upload inspection, Digital Twin snapshot capture & what-if cascade simulation, Predictive backtest evaluation, VANTA Brain rejected-citation notices, agent execution step traces, session revocation controls, and SQLite hot backup management.

## Environment Variables

- `GEMINI_API_KEY`: Server-side Gemini API key (configured via Secrets; never exposed to browser bundles).
- `VANTA_SESSION_SECRET`: Primary HMAC session signing secret (required >= 32 chars in `NODE_ENV=production`).
- `VANTA_SESSION_SECRET_PREVIOUS`: Optional previous signing secret for zero-downtime key rotation.
- `VANTA_ALLOW_DEMO_AUTH`: Optional `'true' | 'false'` override for demo personas & seeding (defaults to `false` in production, `true` in development).
- `VANTA_DB_PATH`: Optional custom SQLite database file path (defaults to `.vanta-data/vanta.db`).
- `PORT`: Server port (defaults to `3000`).

## Running Automated Tests

```bash
npm test
```

Runs `tsx --test` across:
- `src/core/intelligence.test.ts` (anomaly detection, RUL heuristic, sliding-window backtest, energy attribution & guardrails, twin cascade simulation, RCA temporal correlation, RBAC & safety interlocks)
- `src/server/security.test.ts` (scrypt hashing, fail-closed production secret checks, HMAC signing/rotation/tampering/expiration, `StreamTicketStore` single-use & origin checks, `createScopedRateLimiter`)
- `src/server/api.test.ts` (auth, cross-tenant isolation, RBAC denial, persisted work-order approvals)
- `src/server/phase2.test.ts` (session logout & revoke-all, facility-level authorization, cross-facility knowledge scoping, payload validation, Brain citation validator, agent permission & safety & idempotency enforcement, offline camera refusal, manual upload inspection, IoT gateway guards, single-use SSE ticket stream, Twin snapshots & cascade, Predictive backtesting, SQLite `VACUUM INTO` hot backups & SHA-256 tamper verification & restore)

## Deployment & Build

```bash
npm run build
NODE_ENV=production VANTA_SESSION_SECRET="<32+ char secret>" npm start
```

## Phase II Subsystem Capability Status

| Subsystem | Status | Notes |
| --- | --- | --- |
| Zero-Trust Auth, Session Revocation & RBAC | **FUNCTIONAL** | Fail-closed prod secrets, key rotation, DB `session_records`, `/auth/revoke-all`, facility-scoped authz |
| VANTA Brain & Citation Validator | **FUNCTIONAL** | 10-stage Gemini + deterministic fallback, `validateBrainCitations`, persisted `brain_runs` |
| Multi-Agent Orchestrator | **FUNCTIONAL** | Task-planned tool selection, strict allowlists, step traces, conflict detection, idempotency guard |
| Vision Intelligence & Camera Providers | **PARTIALLY_FUNCTIONAL** | Supports real user image uploads (`UPLOADED_IMAGE`) and `SAMPLE_IMAGE`; RTSP/ONVIF daemons report `OFFLINE`/`NOT_CONFIGURED` honestly |
| IoT Protocol Gateways & Telemetry | **SIMULATED** | Local normalizer ingestion & z-score work; `.internal` industrial brokers remain `SIMULATED` and unreachable external hosts report `OFFLINE`/`NOT_CONFIGURED` |
| Digital Twin & What-If Cascade | **PARTIALLY_FUNCTIONAL** | Versioned persisted SQLite snapshots + 2D graph & BFS cascade simulation; 3D BIM/CAD mesh rendering is planned |
| Predictive Maintenance & Backtesting | **FUNCTIONAL (HEURISTIC)** | Deterministic headroom RUL ± uncertainty + historical sliding-window backtest (not trained neural ML) |
| SQLite Persistence, Migrations & Backups | **FUNCTIONAL** | Versioned `schema_migrations`, `VACUUM INTO` hot backups, SHA-256 verification, graceful WAL shutdown |
