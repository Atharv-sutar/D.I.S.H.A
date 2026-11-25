# Developer Status — `Atharv-sutar` (Core Backend & Streaming APIs)

- **Owner**: Atharv Sutar (`Atharv-sutar`)
- **Module**: `services/backend/` (plus user-authorized one-time override for 3D Hologram integration in `apps/`)
- **Last Updated**: 2026-11-25
- **Branch**: `main`

## Current State
- **Backend (`services/backend/`)**:
  - Added `gate_role` (`entry | exit | entry_exit`), `floodlight_towers`, and `stand_sectors` in `contracts/venues/chinnaswamy_stadium.json` & `models.py` (preserving exact 26 nodes / 38 edges for `services/intelligence/` compatibility).
  - Added `route_mode` (`entry | exit | facility`) support in `routing.py` & `GET /api/v1/routing/recommend` for dedicated entry/exit/destination waypoint paths.
  - All 7 backend unit & ASGI end-to-end tests passing.
- **3D Stadium Hologram (`apps/`, one-time user override)**:
  - Installed `three`, `@types/three`, `@react-three/fiber@^8.17.10`, `@react-three/drei@^9.117.3` in `apps/ops-dashboard/` and `apps/fan-app/`.
  - Upgraded `apps/shared/` (`contracts.ts`, `ws.ts`, `apiClient.ts`, `stadiumData.ts`, `simulator.ts`, `congestion.ts`, `useFanStream.ts`, `useOpsStream.ts`) to `chinnaswamy_bengaluru`.
  - Built interactive 3D M. Chinnaswamy Stadium Hologram (`apps/shared/components/StadiumHologram3D.tsx` & `apps/shared/components/hologram/HologramSceneContent.tsx`) with orbit/zoom/pan controls, camera presets, tiered holographic stand sectors, floodlights, solar canopy, live congestion columns, dedicated EXIT arches, exact user 3D location + Move My Location floor click, floating 3D incident beacons, and animated particle `waypoints_3d` trails.
  - Integrated into `apps/fan-app` and `apps/ops-dashboard` (`typecheck`, `lint`, `build` passing on both).

## Active Interfaces Provided
- `GET /health`, `GET /api/v1/venue/topology`, `GET /api/v1/telemetry/latest`, `POST /api/v1/telemetry/ingest`
- `GET /api/v1/ops/overview`, `GET /api/v1/hologram/frame`, `GET /api/v1/analytics/forecast`
- `POST /api/v1/fans/locate`, `GET /api/v1/fans/active`, `GET /api/v1/routing/recommend` (supports `route_mode=entry|exit|facility` & `user_x/y/level`)
- `GET/POST/PATCH /api/v1/incidents`, `POST /api/v1/simulation/*`, `WS /ws/ops`, `WS /ws/fan`

## Dependencies / Requests for Peers
- `@Ankit-Navi-8294`: See `.agents/sync/handoffs/20261125-Atharv-sutar-3d-hologram-override.md` for details of the 3D hologram override in `apps/`. All `npm run typecheck`, `lint`, and `build` checks pass; continue styling/expanding UI features inside `apps/`.
- `@Shreyas-D-M`: `contracts/venues/chinnaswamy_stadium.json` keeps 26 nodes & 38 edges intact and adds optional `gate_role`, `floodlight_towers`, and `stand_sectors`.
