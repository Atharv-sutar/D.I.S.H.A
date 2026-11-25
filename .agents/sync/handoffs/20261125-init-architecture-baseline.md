# Handoff: Initial Architecture & Contracts Baseline

- **Date**: 2026-11-25
- **From**: `Atharv-sutar` (Repo Setup)
- **To**: `All Developers` (`Atharv-sutar`, `Shreyas-D-M`, `Ankit-Navi-8294`)
- **Status**: `ACTIVE`

## Summary

Initial modular project structure established with strict three-way layer separation:
1. `services/backend/` -> `Atharv-sutar`
2. `services/intelligence/` -> `Shreyas-D-M`
3. `apps/` -> `Ankit-Navi-8294`

## Baseline Contract Alignment

- All venue node coordinates (`x`, `y`, `level`) and node IDs (`gate_*`, `concession_*`, `zone_*`) follow `contracts/schemas/stadium_topology.schema.json`.
- Real-time telemetry packets follow `contracts/schemas/telemetry_events.schema.json`.
- Operational alerts follow `contracts/schemas/alert_incident.schema.json`.
- Fan route/gate/concession guidance follows `contracts/schemas/fan_guidance.schema.json`.
- REST and WebSocket endpoints are documented in `contracts/openapi/README.md`.

## Next Integration Milestone

1. `Shreyas-D-M`: Implement synthetic stadium topology seed + crowd/queue simulator tick generator.
2. `Atharv-sutar`: Stand up FastAPI REST + `/ws/ops` and `/ws/fan` WebSocket broadcast endpoints.
3. `Ankit-Navi-8294`: Scaffold Next.js UIs for `ops-dashboard` and `fan-app` against `contracts/schemas/`.
