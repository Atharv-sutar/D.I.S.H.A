---
trigger: glob
globs: "services/backend/**"
description: "Engineering guidelines for Atharv-sutar's Core Backend & Streaming APIs module (FastAPI, WebSockets, Chinnaswamy 3D topology & routing)."
---

# Core Backend & Streaming APIs Rules (`services/backend/`)

- **Owner**: `Atharv-sutar` (Atharv Sutar)
- **Tech Stack**: Python 3.11+, FastAPI, Uvicorn, Pydantic (v1/v2 compatible), WebSockets, unittest/Pytest.

## Module Responsibilities
- Serve the canonical 3D **M. Chinnaswamy Stadium** topology (`contracts/venues/chinnaswamy_stadium.json`) at `GET /api/v1/venue/topology`.
- Resolve exact fan 3D coordinates (`POST /api/v1/fans/locate`) and compute congestion-aware routes with game-style 3D waypoints (`GET /api/v1/routing/recommend`).
- Ingest live telemetry & incident alerts from `services/intelligence/` (`POST /api/v1/telemetry/ingest`, `POST /api/v1/incidents`) and broadcast over `/ws/ops` and `/ws/fan`.
- Maintain tests in `services/backend/tests/` (`unittest` / `pytest`) and keep `services/backend/README.md` current.
