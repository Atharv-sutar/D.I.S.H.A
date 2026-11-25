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
  - Overhauled 3D M. Chinnaswamy Stadium model (`HologramSceneContent.tsx`, `StadiumHologram3D.tsx`): replaced raw neon cylinders with realistic outfield/pitch/stand architecture, architectural Gate Portals (`GatePortalMarker`), clean Facility Pods (`FacilityPodMarker`), `Gates Only` / `Full Stadium` / `Food / WC / Aid` / `Route Focus` layer tabs, 1-click `Best Exit (Low Crowd)` button, any-node origin picker, seat ticket 3D marker, and smooth walk simulator (`typecheck`, `lint`, and `build` passing across all 3 apps).
  - Integrated into `apps/fan-app` and `apps/ops-dashboard` (`typecheck`, `lint`, `build` passing on both).

- **Unified Single-Command Launcher & 3-App Suite**:
  - Added 3rd Next.js app `apps/sim-studio/` (`:3002`) for behind-the-scenes congestion & incident simulation at any M. Chinnaswamy Stadium location, backed by `/api/v1/simulation/status`, `/api/v1/simulation/reset`, and `/api/v1/simulation/preset` (+ CORS for `:3002`).
  - Updated `scripts/start_disha.py`, `start.ps1`, `start.bat`, `start.sh`, and root `package.json` (`npm start`) to boot Backend (`:8000`), optional Intelligence (`:8001`), Ops Admin (`:3000`), Fan 3D App (`:3001`), and Simulator Studio (`:3002`) in one command and auto-open all 3 apps in the browser.
- **Active Interfaces Provided**
- `GET /health`, `GET /api/v1/venue/topology`, `GET /api/v1/telemetry/latest`, `POST /api/v1/telemetry/ingest`
- `GET /api/v1/ops/overview`, `GET /api/v1/hologram/frame`, `GET /api/v1/analytics/forecast`
- `POST /api/v1/fans/locate`, `GET /api/v1/fans/active`, `GET /api/v1/routing/recommend` (supports `route_mode=entry|exit|facility` & `user_x/y/level`)
- `GET/POST/PATCH /api/v1/incidents`, `POST /api/v1/simulation/*`, `WS /ws/ops`, `WS /ws/fan`

## Dependencies / Requests for Peers
- `@Ankit-Navi-8294`: See `.agents/sync/handoffs/20261125-Atharv-sutar-3d-hologram-override.md` for details of the 3D hologram override in `apps/`. All `npm run typecheck`, `lint`, and `build` checks pass; continue styling/expanding UI features inside `apps/`.
- `@Shreyas-D-M`: `contracts/venues/chinnaswamy_stadium.json` keeps 26 nodes & 38 edges intact and adds optional `gate_role`, `floodlight_towers`, and `stand_sectors`.
