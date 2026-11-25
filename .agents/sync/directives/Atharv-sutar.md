# Autonomous Directives — `Atharv-sutar` (`services/backend/`)

## Active Queue
- [DONE] Scaffold FastAPI backend, M. Chinnaswamy 3D topology (`contracts/venues/chinnaswamy_stadium.json`), exact user location snapping (`POST /api/v1/fans/locate`), and congestion-aware `waypoints_3d` routing.
- [DONE] Align `/ws/ops` and `/ws/fan` WebSocket envelopes with `apps/shared/types/ws.ts`.
- [DONE] Implement full real-time backend features: auto-streaming telemetry loop (yielding when `services/intelligence` ingests live ticks), active 3D fan tracking + live reroute advisories, `/api/v1/ops/overview`, `/api/v1/hologram/frame`, `/api/v1/analytics/forecast`, and `/api/v1/simulation/*` bridge to `:8001`.
- [PENDING] End-to-end live integration verification once `apps/` (`:3000`, `:3001`) connects to the M. Chinnaswamy 3D hologram endpoints.
