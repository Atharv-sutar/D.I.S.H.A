---
trigger: glob
globs: "apps/**"
description: "Engineering guidelines for Atharv-sutar's Frontend Apps (3D Stadium Map, Operations Dashboard, Fan Guide, Simulator Studio)."
---

# Frontend Apps Rules (`apps/`)

- **Owner**: `Atharv-sutar` (Atharv Sutar)
- **Sub-Apps**:
  - `apps/ops-dashboard/` — 3D Hologram Operations Command Center (live holographic stadium congestion, pulsing 3D incident beacons, queue monitors, incident dispatch).
  - `apps/fan-app/` — 3D Hologram Fan Navigation App (exact user 3D location marker, sci-fi wireframe M. Chinnaswamy Stadium hologram, game-style animated 3D waypoint trail & destination beacon).
- **Tech Stack**: TypeScript (strict), Next.js / React, Tailwind CSS, Three.js / React Three Fiber (`three`, `@react-three/fiber`, `@react-three/drei`) for the 3D hologram, WebSocket & REST hooks.

## Module Responsibilities
- Build the basic working foundation (API/WS hydration, live telemetry & routing state, clean controls) first, then layer the movie-style **M. Chinnaswamy Stadium 3D Hologram** (glowing cyan wireframe tiers, pitch ends, user avatar beacon, congestion aura nodes, floating incident alerts, and animated game-style `waypoints_3d` pathing).
- Render geometry directly from `GET /api/v1/venue/topology` (`hologram_spec` + 3D `nodes`/`edges`) and `contracts/venues/chinnaswamy_stadium.json` fallback when offline.
- Keep all frontend source, types (`apps/shared/`), tests, and builds strictly within `apps/`. Never modify `services/backend/` or `services/intelligence/`.
