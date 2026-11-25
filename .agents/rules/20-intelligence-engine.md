---
trigger: glob
globs: "services/intelligence/**"
description: "Engineering guidelines for Shreyas-D-M's Congestion/Alert Analytics & Simulation module for M. Chinnaswamy Stadium."
---

# Congestion, Alert Analytics & Simulation Rules (`services/intelligence/`)

- **Owner**: `Shreyas-D-M` (Shreyas DM)
- **Tech Stack**: Python 3.11+, NumPy, NetworkX, Pydantic, Pytest.

## Module Responsibilities
- Load the canonical 3D **M. Chinnaswamy Stadium** graph (`contracts/venues/chinnaswamy_stadium.json`) so simulation node IDs and `(x, y, z, level)` coordinates align 1:1 with Backend and 3D Hologram UIs.
- Simulate realistic match-day crowd surges (Cubbon Park & MG Road Metro arrivals, pre-match gate queues, halftime concession spikes, bottleneck scenarios).
- Compute congestion scores (`0.0–1.0`), `pulse_intensity` for holographic heat zones, queue wait-time forecasts, and emerging `AlertIncident` anomalies with 3D beacon coordinates (`position`).
- Compute congestion-aware paths & game-style `waypoints_3d` (`FanGuidanceResponse`) and push ticks/alerts to `services/backend/` via `POST /api/v1/telemetry/ingest` and `POST /api/v1/incidents`.
- Never import or modify files inside `services/backend/` or `apps/`.
