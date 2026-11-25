# D.I.S.H.A. Congestion, Alert Analytics & Simulation (`services/intelligence/`)

**Owner**: [@Shreyas-D-M](https://github.com/Shreyas-D-M)

## Responsibilities

- **Stadium Topology Seed** (`topology.py`): Multi-level graph (`disha_arena_01`, Levels 1–2) with normalized `0–1000` coordinates, capacities, and accessible vs. stairs-only transitions (`StadiumTopology`).
- **Crowd & Queue Simulator** (`simulator.py`, `scenarios.py`): Deterministic seeded simulation (`pre_event_ingress`, `in_play`, `halftime_surge`, `egress`, `idle`) with configurable bottleneck injection (`TelemetrySnapshot`).
- **Congestion Forecaster** (`forecaster.py`): Sliding-window `+5m` and `+10m` congestion & wait-time projections (`CongestionForecaster`).
- **Smart Wayfinding Engine** (`routing.py`): NetworkX shortest combined walk + wait-time routing with `accessible_only` filtering, step-by-step instructions, `time_saved_min`, and `alternatives` (`FanGuidanceResponse`).
- **Incident Detector & Publisher** (`detector.py`, `publisher.py`): Detects `queue_surge`, `crowd_bottleneck`, and stalled throughput anomalies (`AlertIncident`) and publishes ticks/alerts to `services/backend/` (`Atharv-sutar`).

## Local Development Setup

```bash
cd services/intelligence
python3 -m venv .venv
# Windows: .venv\Scripts\activate  |  macOS/Linux: source .venv/bin/activate
pip install -e ".[dev]"
```

## Running the Simulation Publisher

```bash
# Dry-run 3 ticks of halftime rush to stdout
python -m disha_intelligence.publisher --scenario halftime_rush --ticks 3 --dry-run

# Live publish to backend (uses BACKEND_INGEST_URL & BACKEND_INCIDENTS_URL)
python -m disha_intelligence.publisher --scenario matchday_ingress
```

## Running the Intelligence HTTP Server (Port 8001)

```bash
python -m disha_intelligence.server --scenario matchday_ingress --port 8001
```

Exposes `/health`, `/topology`, `/telemetry/latest`, `/forecast`, `/routing/recommend`, `/simulation/step`, `/simulation/phase`, and `/simulation/bottleneck`.

## Running Tests & Lint

```bash
pytest -v
ruff check src tests
```
