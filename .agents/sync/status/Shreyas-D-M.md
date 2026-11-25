# Developer Status — `Shreyas-D-M` (Congestion, Alert Analytics & Simulation)

- **Owner**: Shreyas DM (`Shreyas-D-M`)
- **Module**: `services/intelligence/`
- **Last Updated**: 2026-11-25
- **Branch**: `main`

## Current State
- Set up Python `.venv` in `services/intelligence/` with `pip install -e ".[dev]"` (`pydantic`, `numpy`, `networkx`, `httpx`, `pytest`, `ruff`).
- Implemented core intelligence & simulation engine in `services/intelligence/src/disha_intelligence/`:
  - `models.py`: Pydantic v2 models strictly aligned with `contracts/schemas/` (`StadiumTopology`, `TelemetrySnapshot`, `FanGuidanceResponse`, `AlertIncident`).
  - `topology.py`: Deterministic 2-level stadium graph (`disha_arena_01`, `levels: [1, 2]`, 28 nodes across gates/concourses/concessions/restrooms/medical/seating/transit, 36 edges including accessible ramps vs. stairs-only transitions).
  - `simulator.py`: Deterministic seeded `CrowdSimulator` (`pre_event_ingress`, `in_play`, `halftime_surge`, `egress`, `idle`) with configurable bottleneck injection and expiry.
  - `routing.py`: `networkx`-based `WayfindingEngine` minimizing combined walk + queue wait time, with `accessible_only` filtering, turn-by-turn `steps`, `time_saved_min`, and `alternatives`.
  - `detector.py`: `IncidentDetector` flagging `queue_surge`, `crowd_bottleneck`, and stalled throughput anomalies with severity, confidence, recommended actions, and per-node cooldown.
  - `publisher.py`: Async `SimulationPublisher` runner (`python -m disha_intelligence.publisher --scenario halftime_rush --ticks 3 --dry-run`) posting `TelemetrySnapshot` to `BACKEND_INGEST_URL` and `AlertIncident` to `BACKEND_INCIDENTS_URL`.
  - `forecaster.py`: Sliding-window `CongestionForecaster` predicting `+5m` and `+10m` congestion scores, wait times, and critical-threshold breaches.
  - `scenarios.py`: Reproducible matchday scenario presets (`matchday_ingress`, `halftime_rush`, `in_play_steady`, `post_match_egress`).
- Verified with `pytest` (14/14 passing, including contract JSON schema conformance) and `ruff check`.

## Active Interfaces Provided
- Importable Python package `disha_intelligence` (`build_default_topology`, `CrowdSimulator`, `WayfindingEngine`, `IncidentDetector`, `SimulationPublisher`).
- HTTP publisher targeting:
  - `POST /api/v1/telemetry/ingest` (`TelemetrySnapshot`)
  - `POST /api/v1/incidents` (`AlertIncident`)

## Dependencies / Requests for Peers
- `@Atharv-sutar`: Ready to stream live `TelemetrySnapshot` and `AlertIncident` payloads to `POST /api/v1/telemetry/ingest` and `POST /api/v1/incidents`, and `WayfindingEngine.recommend(...)` can back `GET /api/v1/routing/recommend` once backend endpoints are wired.
- `@Ankit-Navi-8294`: All `StadiumTopology` nodes include normalized `x`, `y` (`0–1000`) and `level` (`1`, `2`) coordinates for SVG/canvas heatmaps and wayfinding overlays.
