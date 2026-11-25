---
trigger: glob
globs: "services/backend/**"
description: "Engineering guidelines for Atharv-sutar's Core Backend & Streaming APIs module (FastAPI, WebSockets, state/telemetry gateway)."
---

# Core Backend & Streaming APIs Rules (`services/backend/`)

- **Owner**: `Atharv-sutar` (Atharv Sutar)
- **Tech Stack**: Python 3.11+, FastAPI, Uvicorn, Pydantic v2, native/ASGI WebSockets, Redis/in-memory pub-sub state store, Pytest.

## Module Responsibilities
- Expose canonical REST endpoints (`/api/v1/venue`, `/api/v1/telemetry`, `/api/v1/routing`, `/api/v1/incidents`) and WebSocket streams (`/ws/ops`, `/ws/fan`) defined in `contracts/openapi/README.md`.
- Ingest live telemetry & intelligence outputs from `services/intelligence/` via HTTP/WebSocket/pub-sub without importing Python files directly from `services/intelligence/` via relative filesystem hacks.
- Validate every inbound/outbound payload with Pydantic models aligned to `contracts/schemas/*.json`.
- Broadcast sub-second updates to connected Operations Dashboard and Fan App WebSocket clients, handling reconnects and backpressure cleanly.
- Maintain unit/integration tests under `services/backend/tests/` (`pytest`) and keep `services/backend/README.md` current when adding endpoints or env vars.
