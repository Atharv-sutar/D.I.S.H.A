# Developer Status — `Ankit-Navi-8294` (Frontend Apps: Ops Dashboard + Fan App)

- **Owner**: Ankit Navi (`Ankit-Navi-8294`)
- **Module**: `apps/` (`apps/ops-dashboard/`, `apps/fan-app/`)
- **Last Updated**: 2026-11-25
- **Branch**: `main`

## Current State
- Module scaffolds initialized at `apps/ops-dashboard/` and `apps/fan-app/` ready for Next.js / React + TypeScript UI implementation.

## Active Interfaces Consumed
- Consumes REST endpoints & `/ws/ops` + `/ws/fan` WebSocket feeds defined in `contracts/openapi/README.md`.

## Dependencies / Requests for Peers
- `@Atharv-sutar`: Provide sample payloads / local dev server URL (`http://localhost:8000`) once `/api/v1/venue` and WS streams are active.
- `@Shreyas-D-M`: Include coordinates (`x`, `y`, `level`) on zones/gates so stadium SVG/canvas heatmaps & wayfinding paths render cleanly.
