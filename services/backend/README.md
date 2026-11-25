# D.I.S.H.A. Core Backend & Streaming APIs (`services/backend/`)

**Owner**: [@Atharv-sutar](https://github.com/Atharv-sutar)

## Responsibilities

- FastAPI REST endpoints for stadium topology, live telemetry hydration, fan routing proxy, and incident lifecycle management.
- Real-time WebSocket broadcasters (`/ws/ops` for Operations Command Dashboard, `/ws/fan` for Fan Navigation App).
- Ingestion pipeline receiving crowd & alert snapshots from `services/intelligence/` (`Shreyas-D-M`).
- Payload validation strictly matching [`contracts/schemas/`](../../contracts/schemas/) and [`contracts/openapi/README.md`](../../contracts/openapi/README.md).

## Local Development Setup

```bash
cd services/backend
python -m venv .venv
# Windows: .venv\Scripts\activate  |  macOS/Linux: source .venv/bin/activate
pip install -e ".[dev]"
uvicorn disha_backend.main:app --reload --port 8000
```

## Running Tests

```bash
pytest
```
