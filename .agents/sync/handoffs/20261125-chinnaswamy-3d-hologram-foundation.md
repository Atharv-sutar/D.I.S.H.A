# Handoff: M. Chinnaswamy Stadium 3D Hologram, Exact Location & Game Waypoints Foundation

- **Date**: 2026-11-25
- **From**: `Atharv-sutar` (`services/backend/`)
- **To**: `Shreyas-D-M` (`services/intelligence/`), `Ankit-Navi-8294` (`apps/`)
- **Status**: `ACTIVE — WORKING BACKEND READY`

## Product Direction Update

1. **Target Venue**: **M. Chinnaswamy Stadium (Bengaluru)** (`contracts/venues/chinnaswamy_stadium.json`).
   - Coordinate frame: metric `(x, y, z)` centered at pitch `(0, 0, 0)` across levels `0` (plaza/gates), `1` (lower bowl/concourse), `2` (upper stands/pavilion terrace).
   - Includes `hologram_spec` (`field_radius_m`, `pitch_length_m`, `ends`, `tier_rings`, `canopy_ring`, `perimeter_roads`).
2. **Core Selling Point (3D Hologram UX)**:
   - Movie-style glowing 3D holographic wireframe of M. Chinnaswamy Stadium.
   - Exact user 3D position marker (`user_position`: `{ x, y, z, level, heading_deg, snapped_node_id }`).
   - Live congestion glow (`pulse_intensity`) and floating 3D incident beacons (`AlertIncident.position`).
   - Game-style animated 3D waypoint trail (`waypoints_3d`) and destination beacon (`target_beacon`).
3. **Rule Update**: All developers & agents MUST run `python .agents/scripts/identify_dev.py --pull` (or `git pull --rebase origin main`) before starting any new task.

## Action Needed from `Shreyas-D-M` (`services/intelligence/`)
- Update `services/intelligence/src/disha_intelligence/topology.py` (`build_default_topology`) to load `contracts/venues/chinnaswamy_stadium.json` (`chinnaswamy_bengaluru`, metric 3D `x, y, z, level`, `hologram_spec`) instead of `disha_arena_01` (`0–1000`).
- Update `models.py`, `simulator.py`, `routing.py`, `detector.py`, and `forecaster.py` / `server.py` so:
  - `NodeTelemetry` populates `pulse_intensity` for holographic heat zones
  - `AlertIncident` populates 3D `position` (`x`, `y`, `z`, `level`) for floating holographic incident beacons
  - `FanGuidanceResponse` populates `user_position`, `target_beacon`, and `waypoints_3d`
- Note: `services/backend/` (`POST /api/v1/incidents` and `POST /api/v1/telemetry/ingest`) already accepts the exact payload shape emitted by `SimulationPublisher` (`publisher.py`).

## Action Needed from `Ankit-Navi-8294` (`apps/`)
- Update `apps/shared/types/contracts.ts` to add the new 3D schema fields from `contracts/schemas/`:
  - `HologramSpec`, `TierRing`, `CanopyRing`, `PerimeterRoad` + `z`, `stand_code`, `road_perimeter` on `StadiumNode`
  - `pulse_intensity` and `active_incident_ids` on `NodeTelemetry`
  - `Position3D` (`position`) on `AlertIncident`
  - `UserPosition3D`, `TargetBeacon`, and `Waypoint3D` (`waypoints_3d`) on `FanGuidanceResponse`
  - `LocateFanRequest` & `LocateFanResponse` for `POST /api/v1/fans/locate`
- Build the working Next.js REST/WS data foundation first, then render the Three.js / React Three Fiber movie-style M. Chinnaswamy 3D Hologram on top of `GET /api/v1/venue/topology`, `/ws/ops`, `/ws/fan`, and `GET /api/v1/routing/recommend`.
