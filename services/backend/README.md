# D.I.S.H.A. Core Backend & Streaming APIs (`services/backend/`)

**Owner**: [@Atharv-sutar](https://github.com/Atharv-sutar)

## Responsibilities

- Serves the canonical **M. Chinnaswamy Stadium** 3D spatial topology & hologram geometry (`GET /api/v1/venue/topology`).
- Resolves exact fan 3D coordinates inside the stadium (`POST /api/v1/fans/locate`) and computes congestion-aware routes with game-style 3D waypoints (`GET /api/v1/routing/recommend`).
- Ingests real-time crowd & alert snapshots from `services/intelligence/` (`POST /api/v1/telemetry/ingest`, `POST /api/v1/incidents`).
- Broadcasts live hologram updates over WebSockets (`/ws/ops` and `/ws/fan`) and supports operator incident dispatch (`PATCH /api/v1/incidents/{incident_id}`).

## Local Development Setup & Running

```bash
cd services/backend
pip install -e ".[dev]"
uvicorn disha_backend.main:app --reload --port 8000
```

Interactive Swagger docs: `http://localhost:8000/docs`

## Running Tests

Works immediately with either `unittest` or `pytest`:

```bash
PYTHONPATH=services/backend/src python -m unittest discover -s services/backend/tests
```
