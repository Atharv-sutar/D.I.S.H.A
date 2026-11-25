# Canonical REST & WebSocket Interface Contract

Base URL (local dev): `http://localhost:8000`
WebSocket Base (local dev): `ws://localhost:8000`
Canonical Venue: **M. Chinnaswamy Stadium, Bengaluru** (`contracts/venues/chinnaswamy_stadium.json`)

## REST Endpoints (`services/backend/`)

| Method | Path | Consumer / Producer | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Ops / Monitor | Service liveness, active venue ID, tracked fan count & WebSocket client counts |
| `GET` | `/api/v1/venue/topology` | `apps/`, `intelligence` | Returns 3D `StadiumTopology` (`hologram_spec`, 3D `nodes`, `edges`, `levels`) |
| `GET` | `/api/v1/telemetry/latest` | `apps/` | Returns latest `TelemetrySnapshot` across all stadium nodes |
| `POST` | `/api/v1/telemetry/ingest` | `services/intelligence/` | Ingests new `TelemetrySnapshot` & broadcasts updates to `/ws/ops` and `/ws/fan` |
| `GET` | `/api/v1/ops/overview` | `ops-dashboard` | Aggregated attendance, phase, incident counts, congested zones & recommended gates |
| `GET` | `/api/v1/hologram/frame` | `ops-dashboard`, `fan-app` | Unified 3D hologram snapshot (`nodes` + `active_incidents` + `active_fans`) |
| `GET` | `/api/v1/analytics/forecast` | `ops-dashboard` | +5m/+10m congestion forecasts (proxied from `:8001/forecast` or backend fallback) |
| `GET` | `/api/v1/fans/active` | `ops-dashboard` | Active anonymized 3D fan positions inside the stadium |
| `POST` | `/api/v1/fans/locate` | `fan-app` | Body: `{ fan_id?, x, y, z?, level?, heading_deg? }` -> Snaps exact fan coordinates onto the 3D hologram and tracks live session |
| `GET` | `/api/v1/routing/recommend` | `fan-app` | Query: `origin` (or `user_x`, `user_y`, `user_level`), `fan_id?`, `target_type` (`gate\|concession\|restroom\|medical\|seating_section`), `target_id` (optional), `accessible` (bool). Returns `FanGuidanceResponse` including 3D `waypoints_3d` & `target_beacon` |
| `GET` | `/api/v1/incidents` | `ops-dashboard`, `fan-app` | Lists active/recent `AlertIncident` records (with 3D `position` beacons) |
| `POST` | `/api/v1/incidents` | `services/intelligence/` or `ops-dashboard` | Creates or ingests an `AlertIncident` & broadcasts to `/ws/ops` and `/ws/fan` |
| `PATCH` | `/api/v1/incidents/{incident_id}` | `ops-dashboard` | Updates incident status (`acknowledged`, `dispatched`, `resolved`) & `assigned_team` |
| `POST` | `/api/v1/simulation/phase` | `ops-dashboard` | Sets match-day `EventPhase` locally & forwards to intelligence `:8001` if running |
| `POST` | `/api/v1/simulation/bottleneck` | `ops-dashboard` | Injects/clears node congestion bottleneck locally & forwards to `:8001` if running |
| `POST` | `/api/v1/demo/step` | Dev / Demo | Advances built-in M. Chinnaswamy crowd telemetry step when `services/intelligence/` is offline |

## WebSocket Streams

### 1. Operations Stream — `WS /ws/ops`
Receives live server-push envelopes for the 3D Ops Hologram & incident console:
```json
{
  "event": "telemetry_update | incident_created | incident_updated",
  "timestamp": "2026-11-25T10:00:00Z",
  "payload": {}
}
```

### 2. Fan Live Advisory Stream — `WS /ws/fan`
Receives crowd advisory, gate wait-times, and hazard avoidance alerts for the 3D Fan Hologram (`gate_advisory` / `facility_alert` payload: `{ advisory_id, title, message, severity, node_id?, recommended_node_id? }`):
```json
{
  "event": "wait_times_update | gate_advisory | facility_alert",
  "timestamp": "2026-11-25T10:00:00Z",
  "payload": {}
}
```
