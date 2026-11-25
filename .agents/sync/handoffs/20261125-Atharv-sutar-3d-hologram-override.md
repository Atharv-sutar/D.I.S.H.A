# Handoff: User-Authorized One-Time Override — Interactive 3D M. Chinnaswamy Hologram Implemented in `apps/`

- **Date**: 2026-11-25
- **From**: `Atharv-sutar` (under explicit user one-time override)
- **To**: `Ankit-Navi-8294` (`apps/`), `Shreyas-D-M` (`services/intelligence/`)
- **Status**: `ACTIVE — PULL BEFORE EDITING apps/`

## Summary of Changes

1. **Dependencies Added in `apps/ops-dashboard/` and `apps/fan-app/`**:
   - `three@^0.169.0`, `@types/three@^0.169.0`, `@react-three/fiber@^8.17.10`, `@react-three/drei@^9.117.3`.
   - `tsconfig.json` `paths` and `next.config.mjs` (`transpilePackages: ["three"]`) updated cleanly.
2. **Canonical 3D Data & Types in `apps/shared/`**:
   - `apps/shared/types/contracts.ts`, `ws.ts`, `apiClient.ts`, `congestion.ts` (`toSvgPoint`), `stadiumData.ts` (imports `contracts/venues/chinnaswamy_stadium.json`), `simulator.ts`, `useFanStream.ts`, and `useOpsStream.ts`.
3. **Interactive 3D Hologram Component**:
   - `apps/shared/components/StadiumHologram3D.tsx` & `apps/shared/components/hologram/HologramSceneContent.tsx`.
   - Features: full `OrbitControls` (drag to look around, scroll to zoom, right-drag to pan), camera presets (`Aerial`, `My Location`, `Top-Down`, `Pitch View`, `Exits View`), layer toggles (`All`, `Congestion`, `Exits & Gates`, `Waypoints`, `Food / WC / Med`), 7 curved holographic stand sectors, solar canopy & 4 floodlights, live congestion columns, dedicated `EXIT` arches, exact `YOU ARE HERE` marker + `Move My Location` floor placement, floating 3D incident beacons, and animated game-style `waypoints_3d` ribbon + destination beacon.
4. **Integrated into Both Next.js Apps**:
   - `apps/fan-app/src/app/page.tsx` & `WayfindingControls.tsx` (`Least Crowded Entry`, `Fastest Exit`, `Food & Drinks`, `Restroom`, `First Aid`, `My Stand`) + `WayfindingMap.tsx` (2D SVG updated for metric coords).
   - `apps/ops-dashboard/src/app/page.tsx` & `StadiumHeatmap.tsx` (3D Hologram primary view + 2D Heatmap toggle).

## Next Steps for `Ankit-Navi-8294`
- Run `python .agents/scripts/identify_dev.py --pull` before editing `apps/`.
- Mark completed Priority 1–3 items `[DONE]` in `.agents/sync/directives/Ankit-Navi-8294.md` and polish/expand 3D UI cards, simulation controls, or forecast views inside `apps/`.
