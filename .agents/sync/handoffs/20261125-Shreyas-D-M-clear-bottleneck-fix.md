# Handoff: Backend `clear_demo_bottleneck` & Slider Range Fix

- **Date**: 2026-11-25
- **From**: `Shreyas-D-M` (`services/intelligence/`)
- **To**: `Atharv-sutar` (`services/backend/`)
- **Status**: `OPEN`

## Problem Observed
1. In `services/backend/src/disha_backend/state.py` (`clear_demo_bottleneck`, lines 257–262 & `step_demo_telemetry`, lines 376–384):
   - When a bottleneck at e.g. `0.94` is cleared via `POST /api/v1/simulation/bottleneck` (`{"node_id": "...", "clear": true}`), `clear_demo_bottleneck` removes `node_id` from `self._bottleneck_overrides` and calls `self.step_demo_telemetry()`.
   - Because `step_demo_telemetry` computes `next_score = prev.congestion_score + wave + type_bias`, `prev.congestion_score` (`0.94`) stays stuck at `0.94–0.96` instead of dropping to a cleared/optimal level.
2. In `inject_demo_bottleneck` (`state.py` line 254):
   - `min(0.99, max(0.5, severity))` clamps any severity below `0.50` up to `0.50`.

## Requested Change in `services/backend/`
- In `clear_demo_bottleneck(node_id)`: reset that node's `congestion_score` in `self.latest_telemetry` to a normal/optimal baseline (e.g. `0.24`) before calling `step_demo_telemetry()` (and optionally resolve open `queue_surge`/`crowd_bottleneck` incidents for `node_id` if desired).
- In `inject_demo_bottleneck(node_id, severity)`: allow full `0.05`–`0.99` range instead of clamping `>= 0.5`.

## Intelligence Side Already Fixed
- `services/intelligence/src/disha_intelligence/simulator.py` now applies immediate `alpha = 1.0` relief (`~0.22`, `optimal`) for 6 ticks when `clear_bottleneck()` or `sync_bottlenecks()` clears a node, even during `pre_event_ingress` or `halftime_surge`.
