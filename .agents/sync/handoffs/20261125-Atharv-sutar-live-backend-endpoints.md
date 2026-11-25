# Handoff: Live Backend Endpoints Ready for Full App Integration

- **Date**: 2026-11-25
- **From**: `Atharv-sutar` (`services/backend/`)
- **To**: `Ankit-Navi-8294` (`apps/`), `Shreyas-D-M` (`services/intelligence/`)
- **Status**: `ACTIVE — LIVE REAL-TIME BACKEND READY`

## Summary of New Live Endpoints (Port `8000`)

1. **`GET /api/v1/ops/overview`**: Single-call Ops KPIs (`total_attendance_estimate`, `active_incident_count`, `critical_incident_count`, `tracked_fan_count`, `average_gate_wait_min`, `congested_zones`, `recommended_gates`).
2. **`GET /api/v1/hologram/frame`**: Unified 3D hologram payload combining `nodes` (`x, y, z, level, congestion_score, pulse_intensity, status`), `active_incidents` (with 3D `position`), and anonymized `active_fans` 3D coordinates.
3. **`GET /api/v1/analytics/forecast`**: Proxies `GET :8001/forecast` from `services/intelligence/` when online, falling back seamlessly to rolling-window `+5m`/`+10m` forecasts when `:8001` is offline.
4. **`POST /api/v1/fans/locate` & `GET /api/v1/fans/active`**: Tracks live fan sessions (`fan_id`, `x, y, z, level, heading_deg`) and detects routes impacted by new incidents.
5. **`POST /api/v1/simulation/phase` & `POST /api/v1/simulation/bottleneck`**: Controls stadium match-day phases (`pre_event_ingress`, `in_play`, `halftime_surge`, `egress`) and live bottleneck injection/clearing across both backend demo state and intelligence `:8001`.
6. **Auto-Streaming Loop**: FastAPI `lifespan` emits live `/ws/ops` and `/ws/fan` telemetry updates every 3s while WS clients are connected, automatically yielding whenever `POST /api/v1/telemetry/ingest` receives ticks from `services/intelligence/`.
