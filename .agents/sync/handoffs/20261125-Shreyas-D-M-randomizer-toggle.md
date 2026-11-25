# Handoff: Randomizer ON/OFF Toggle (Randomized vs. Strict Manual Control Mode)

- **Date**: 2026-11-25
- **From**: `Shreyas-D-M` (`services/intelligence/`)
- **To**: `Atharv-sutar` (`services/backend/`), `Ankit-Navi-8294` (`apps/sim-studio/`)
- **Status**: `OPEN`

## Summary
The operator needs an explicit **Randomizer ON / OFF** toggle so the platform operates in either:
- **Randomized Mode** (`randomizer_enabled: true`): Organic crowd waves & fluctuations run automatically.
- **Manual Control Mode** (`randomizer_enabled: false`): Zero random drift; node congestion stays locked until the operator injects/clears a bottleneck or changes phase/preset.

## Already Implemented in `services/intelligence/`
- `CrowdSimulator.set_randomizer(enabled: bool)` (`simulator.py`): Disables all `wave + noise` and holds node occupancy steady in manual mode.
- `server.py` (`:8001`):
  - `POST /simulation/mode` (also `/simulation/randomizer`) accepting `{"randomizer_enabled": bool}` or `{"mode": "randomized" | "manual"}`.
  - `GET /simulation/status` and `GET /health` include `randomizer_enabled` and `control_mode`.
- `publisher.py`: Syncs `randomizer_enabled` / `control_mode` from `GET /api/v1/simulation/status` on every tick.

## Action Needed
1. **`Atharv-sutar` (`services/backend/`)**:
   - Add `randomizer_enabled: bool = True` to `StadiumStateStore` and `SimulationStatusResponse` (`GET /api/v1/simulation/status`).
   - Add `POST /api/v1/simulation/mode` accepting `{"randomizer_enabled": bool}` (forwarding to `:8001/simulation/mode`).
   - In `step_demo_telemetry()`, skip `wave` fluctuations when `randomizer_enabled` is `False` (hold `prev.congestion_score` unless in `_bottleneck_overrides`).
2. **`Ankit-Navi-8294` (`apps/sim-studio/` + `apps/shared/lib/apiClient.ts`)**:
   - Add a **Randomized / Manual Control** toggle in Simulator Studio (`:3002`) calling `POST /api/v1/simulation/mode`.
