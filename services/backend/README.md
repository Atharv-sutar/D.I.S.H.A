# D.I.S.H.A. Core Backend & Streaming APIs (`services/backend/`)

**Owner**: [@Atharv-sutar](https://github.com/Atharv-sutar)

## Responsibilities

- Serves the canonical **M. Chinnaswamy Stadium** 3D spatial topology & hologram geometry (`GET /api/v1/venue/topology`).
- Resolves & tracks live fan 3D coordinates (`POST /api/v1/fans/locate`, `GET /api/v1/fans/active`) and computes congestion-aware routes with game-style 3D waypoints (`GET /api/v1/routing/recommend`).
- Provides single-call Ops KPIs (`GET /api/v1/ops/overview`), unified 3D hologram frames (`GET /api/v1/hologram/frame`), and `+5m/+10m` congestion forecasts (`GET /api/v1/analytics/forecast`, bridged to `services/intelligence` on port `8001` with local fallback).
- Ingests real-time crowd & alert snapshots from `services/intelligence/` (`POST /api/v1/telemetry/ingest`, `POST /api/v1/incidents`), runs an auto-yielding background demo stream (`DISHA_AUTO_STREAM=true`), and broadcasts live envelopes over `/ws/ops` and `/ws/fan`.

## Local Development Setup & Running

```bash
cd services/backend
pip install -e ".[dev]"
python -m disha_backend.main
```

Or using Uvicorn directly from repo root:

```bash
PYTHONPATH=services/backend/src uvicorn disha_backend.main:app --reload --port 8000
```

Interactive Swagger docs: `http://localhost:8000/docs`

## Running Tests

```bash
PYTHONPATH=services/backend/src python -m unittest discover -s services/backend/tests -v
```
