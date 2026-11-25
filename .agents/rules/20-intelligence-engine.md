---
trigger: glob
globs: "services/intelligence/**"
description: "Engineering guidelines for Shreyas-D-M's Congestion/Alert Analytics & Simulation module."
---

# Congestion, Alert Analytics & Simulation Rules (`services/intelligence/`)

- **Owner**: `Shreyas-D-M` (Shreyas DM)
- **Tech Stack**: Python 3.11+, NumPy, NetworkX, Pydantic v2, Pytest.

## Module Responsibilities
- Implement the real-time **Stadium Crowd & Queue Simulator** generating realistic ingress surges, half-time concession spikes, and bottleneck scenarios.
- Compute real-time **Congestion Scores & Wait-Time Forecasts** per gate, concourse zone, and concession stand conforming to `contracts/schemas/telemetry_events.schema.json`.
- Implement **Smart Wayfinding & Load-Balanced Recommendations** (least-crowded gate, shortest combined walk+wait concession stand, accessible routes) conforming to `contracts/schemas/fan_guidance.schema.json`.
- Detect **Emerging Operational Incidents** (sudden density spikes, stalled queue velocity, bottleneck cascades, safety anomalies) conforming to `contracts/schemas/alert_incident.schema.json`.
- Communicate with `services/backend/` over documented HTTP/WebSocket contracts or clean installable interfaces—never import or modify files inside `services/backend/` or `apps/`.
- Maintain deterministic simulation seeds and `pytest` coverage under `services/intelligence/tests/`.
