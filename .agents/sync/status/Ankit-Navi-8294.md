# Developer Status — `Ankit-Navi-8294` (Frontend Apps: Ops Dashboard + Fan App)

- **Owner**: Ankit Navi (`Ankit-Navi-8294`)
- **Module**: `apps/` (`apps/ops-dashboard/`, `apps/fan-app/`, `apps/shared/`)
- **Last Updated**: 2026-11-25T17:45+05:30
- **Branch**: `main`

## Current State
- **Shared Real-Time Data Layer (`apps/shared/`)**:
  - Kept `apps/shared/types/contracts.ts` as canonical contract source and added `apps/shared/types/ws.ts` for `/ws/ops` and `/ws/fan` envelopes, `PATCH /api/v1/incidents/{id}`, and `GET /api/v1/routing/recommend` query params.
  - Built `apps/shared/lib/apiClient.ts`, `apps/shared/lib/congestion.ts`, `apps/shared/hooks/useOpsStream.ts`, and `apps/shared/hooks/useFanStream.ts` with automatic offline fallback to a live multi-level stadium simulation (`apps/shared/mock/stadiumData.ts`, `apps/shared/mock/simulator.ts`) and manual `Auto | Live | Sim` mode switcher.
- **Operations Command Center (`apps/ops-dashboard/`, Port `3000`)**:
  - Next.js App Router + React + TypeScript + Tailwind CSS dashboard (`OpsHeader`, `StadiumHeatmap`, `QueueMonitor`, `IncidentFeed`).
  - Interactive Level 1 & Level 2 SVG congestion heatmap (`x`, `y`, `level`, `congestion_score`), zone inspector, gate/concession/restroom queue monitor with `rising|stable|falling` trends, and live `/ws/ops` incident feed with optimistic `acknowledged`/`dispatched`/`resolved` actions.
- **Fan Experience & Smart Navigation App (`apps/fan-app/`, Port `3001`)**:
  - Mobile-first Next.js App Router + React + TypeScript + Tailwind CSS wayfinding app (`FanHeader`, `AdvisoryBanner`, `WayfindingControls`, `WayfindingMap`, `RouteGuidanceSheet`).
  - Current gate/location selector, one-tap least-crowded gate/concession/restroom/section queries, Accessible Route Only toggle, highlighted SVG `route_node_ids` path, `time_saved_min` badge, turn-by-turn `steps`, ranked `alternatives`, and live `/ws/fan` advisories banner.
- **2D Simulation + Newer Chinnaswamy Map (Latest)**:
  - Added `apps/shared/components/StadiumMap2DBase.tsx` — blueprint-accurate SVG base with real stand sectors, canopy/tier rings, cricket pitch, ends, floodlight towers, and perimeter roads, driven by `contracts/venues/chinnaswamy_stadium.json` `hologram_spec`.
  - **Fan app (`WayfindingMap`)**: rebuilt as a 2D live navigation map with level tabs (`Plaza/L0`, `L1`, `L2`), animated optimal-route path, destination beacon, multi-level transition cues, congestion-coloured zones, click-to-reroute stand sectors/nodes, and a live user avatar/heading cone that follows the walk simulator between levels.
  - **Ops app (`StadiumHeatmap`)**: rebuilt as a 2D live crowd radar with simulated fan particles whose density reflects live telemetry, pulsing halos for unusual gatherings, per-level anomaly badges, a ranked "Unusual Crowd Detection" panel with focus actions, a global gathering banner, active-fan tracking, crowd-particle toggle, and "Pause Sim / Resume Sim", "Simulate Surge", "Clear Crowd" controls wired to `useOpsStream`.
  - Added `evaluateCrowdAnomaly`, `SVG_SCALE`, and `fromSvgPoint` to `apps/shared/lib/congestion.ts`; extended `useOpsStream` with `simPaused`, `simulateCrowdSurge`, and `clearCrowdSurge`.
- **Verification**: `npm run typecheck`, `npm run lint`, and `npm run build` passed in both `apps/ops-dashboard/` and `apps/fan-app/`; `python .agents/scripts/check_boundaries.py` passed.

## Active Interfaces Consumed
- `GET /api/v1/venue/topology` -> `StadiumTopology`
- `GET /api/v1/telemetry/latest` -> `TelemetrySnapshot`
- `GET /api/v1/routing/recommend` (`origin`, `target_type`, `target_id?`, `accessible`) -> `FanGuidanceResponse`
- `GET /api/v1/incidents` -> `AlertIncident[]`
- `PATCH /api/v1/incidents/{incident_id}` (`status`, `assigned_team?`) -> `AlertIncident`
- `WS /ws/ops` (`telemetry_update | incident_created | incident_updated`)
- `WS /ws/fan` (`wait_times_update | gate_advisory | facility_alert`)

## Dependencies / Requests for Peers
- `@Atharv-sutar`: Enable CORS for `http://localhost:3000` and `http://localhost:3001` on FastAPI when standing up `/api/v1/*` and `/ws/ops`, `/ws/fan`. For `WS /ws/fan` `gate_advisory` / `facility_alert` payloads, frontend expects `{ advisory_id, title, message, severity, node_id?, recommended_node_id? }`.
- `@Shreyas-D-M`: Multi-level node coordinates (`x`, `y` in `0..1000`, `level`) and `accessible` flags on edges/nodes are actively rendered by both SVG maps and the accessible wayfinding toggle.
