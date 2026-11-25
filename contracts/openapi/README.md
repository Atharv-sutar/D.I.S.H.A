# Canonical REST & WebSocket Interface Contract

Base URL (local dev): `http://localhost:8000`
WebSocket Base (local dev): `ws://localhost:8000`

## REST Endpoints (`services/backend/`)

| Method | Path | Consumer / Producer | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Ops / Monitor | Service liveness & dependency status |
| `GET` | `/api/v1/venue/topology` | `apps/` | Returns `StadiumTopology` graph (`nodes`, `edges`, levels) |
| `GET` | `/api/v1/telemetry/latest` | `apps/` | Returns latest `TelemetrySnapshot` across all stadium nodes |
| `POST` | `/api/v1/telemetry/ingest` | `services/intelligence/` | Ingests new simulation/sensor `TelemetrySnapshot` & triggers broadcasts |
| `GET` | `/api/v1/routing/recommend` | `fan-app` | Query: `origin`, `target_type` (`gate\|concession\|restroom\|seating_section`), `target_id` (optional), `accessible` (bool). Returns `FanGuidanceResponse` |
| `GET` | `/api/v1/incidents` | `ops-dashboard` | Lists active/recent `AlertIncident` records |
| `POST` | `/api/v1/incidents` | `services/intelligence/` or `ops-dashboard` | Creates or ingests an `AlertIncident` |
| `PATCH` | `/api/v1/incidents/{incident_id}` | `ops-dashboard` | Updates incident status (`acknowledged`, `dispatched`, `resolved`) & `assigned_team` |

## WebSocket Streams

### 1. Operations Stream — `WS /ws/ops`
Receives live server-push envelopes:
```json
{
  "event": "telemetry_update | incident_created | incident_updated",
  "timestamp": "2026-11-25T10:00:00Z",
  "payload": {}
}
```

### 2. Fan Live Advisory Stream — `WS /ws/fan`
Receives crowd advisory & gate/concession wait-time updates:
```json
{
  "event": "wait_times_update | gate_advisory | facility_alert",
  "timestamp": "2026-11-25T10:00:00Z",
  "payload": {}
}
```
