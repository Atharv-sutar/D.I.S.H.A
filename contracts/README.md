# D.I.S.H.A. Shared Integration Contracts (`contracts/`)

This directory is the **single source of truth** connecting all three developer layers:
- `services/intelligence/` (`Shreyas-D-M`) produces telemetry predictions, congestion scores, route recommendations, and incident alerts matching these schemas.
- `services/backend/` (`Atharv-sutar`) validates, persists, and streams these payloads via REST and WebSocket endpoints.
- `apps/` (`Ankit-Navi-8294`) renders Ops Command Center and Fan Navigation UIs strictly typed against these contracts.

## Contents

- `schemas/stadium_topology.schema.json` — Nodes (gates, concessions, restrooms, medical posts, seating bowls) & walkable edges.
- `schemas/telemetry_events.schema.json` — Real-time crowd density, queue lengths, and wait-time telemetry.
- `schemas/alert_incident.schema.json` — Emerging congestion/safety alerts and incident dispatch states.
- `schemas/fan_guidance.schema.json` — Smart entrance/concession recommendations and step-by-step fan wayfinding paths.
- `openapi/README.md` — Canonical REST API paths and WebSocket stream contracts (`/ws/ops`, `/ws/fan`).

## Contract Change Policy

1. Additive optional fields may be proposed via `.agents/sync/handoffs/`.
2. Never make breaking field renames/removals without updating schemas here and notifying all three developers.
