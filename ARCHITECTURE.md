# VANTA AI — Universal Infrastructure Intelligence OS

## Architecture Overview

VANTA AI is structured as a modular full-stack TypeScript platform connecting physical infrastructure modeling, telemetry ingestion, predictive modeling, visual inspection, root-cause correlation, and human-authorized multi-agent operations.

### Layer Breakdown

1. **Pure Core Intelligence Engine (`src/core/`)**
   - `src/core/types.ts`: Universal infrastructure data contracts (Organizations, Tenants, Facilities, Zones, Assets, Relationships, Cameras, IoT Integrations, Telemetry, Incidents, Work Orders, Energy Records, Predictive Assessments, Root Cause Investigations, Agents, Approvals, Audit Records, Knowledge Documents).
   - `src/core/intelligence.ts`: Deterministic, unit-tested calculations for statistical z-score anomaly detection, Remaining Useful Life (RUL ± uncertainty), energy baseline separation (`MEASURED` vs `ESTIMATED` vs `SIMULATED`), graph-based root-cause correlation, and RBAC / physical safety boundary enforcement.

2. **Backend Platform (`server.ts`, `src/server/`)**
   - `src/server/db.ts`: SQLite (`node:sqlite` in WAL mode with foreign keys) relational + time-series schema and idempotent multi-tenant seed data (`tenant-apex` and `tenant-meridian`).
   - `src/server/security.ts`: `scrypt` password hashing, HMAC-SHA256 signed HTTP-only session cookies, sliding-window API rate limiter, and server-side RBAC enforcement.
   - `src/server/ai.ts`: Server-side `@google/genai` integration (`gemini-4-hydrogen` with `'User-Agent': 'aistudio-build'`) providing tenant-scoped tool calling for VANTA Brain, multimodal camera frame inspection, and bounded 12-agent execution. Includes deterministic database-backed fallback when `GEMINI_API_KEY` is unavailable.
   - `src/server/routes.ts`: Express REST API + Server-Sent Events (`/api/stream/telemetry`) enforcing tenant isolation from verified session state.

3. **Enterprise Command Interface (`src/components/`, `src/App.tsx`)**
   - 20 structured operational views organized across Command, Perception, Infrastructure, Intelligence, Operations & Governance, and Platform.

## Environment Variables

- `GEMINI_API_KEY`: Server-side Gemini API key (configured via AI Studio Secrets; never exposed to browser bundles).
- `VANTA_SESSION_SECRET`: Optional HMAC signing secret for session cookies.
- `PORT`: Server port (defaults to `3000`).

## Running Automated Tests

```bash
npm test
```

Runs `tsx --test` across:
- `src/core/intelligence.test.ts` (anomaly math, RUL uncertainty, energy baseline guardrails, RCA graph tracing, RBAC & safety interlocks)
- `src/server/security.test.ts` (scrypt hashing, HMAC signing/tamper detection, expiration)
- `src/server/api.test.ts` (unauthenticated rejection, strict cross-tenant isolation, Viewer RBAC denial, persisted work-order approval workflow)

## Deployment & Build

```bash
npm run build
NODE_ENV=production npm start
```

## Known Limitations & Roadmap

- **Hardware Protocol Gateways**: MQTT, OPC UA, Modbus TCP, and RTSP/ONVIF stream ingestion currently run in explicit `SIMULATED` mode with reproducible frame buffers and telemetry scenario injection; live edge broker connectors require site-local TLS gateway deployment.
- **Digital Twin Rendering**: Implemented as an interactive 2D spatial dependency graph synchronized with SQLite telemetry (`PARTIALLY_FUNCTIONAL`); 3D BIM/CAD mesh rendering is planned for a future release.
- **Persistence**: Uses embedded SQLite WAL (`.vanta-data/vanta.db`) for zero-dependency single-node deployment; multi-region clustering requires migrating the `db.ts` adapter to PostgreSQL/TimescaleDB.
