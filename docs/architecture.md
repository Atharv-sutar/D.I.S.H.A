# D.I.S.H.A. System Architecture

## Overview

**D.I.S.H.A.** unifies disconnected stadium operations and fan-facing guidance for **M. Chinnaswamy Stadium (Bengaluru)** into one real-time loop anchored on a **3D Holographic Digital Twin**:

1. **Intelligence & Simulation (`services/intelligence/` — `Shreyas-D-M`)**
   - Simulates match-day crowd inflow (Cubbon Park & MG Road Metro arrivals, pre-match gate queues), concourse movement, concession surges, and facility bottlenecks using `contracts/venues/chinnaswamy_stadium.json`.
   - Scores real-time congestion ($0.0$ to $1.0$), hologram `pulse_intensity`, and wait times per node.
   - Computes optimal congestion-aware routes (`FanGuidanceResponse`) and game-style 3D waypoints (`waypoints_3d`).
   - Detects anomalies and emits `AlertIncident` events with 3D beacon coordinates.

2. **Core Backend & Streaming APIs (`services/backend/` — `Atharv-sutar`)**
   - Serves the canonical 3D M. Chinnaswamy Stadium graph (`hologram_spec` + 3D nodes/edges) at `GET /api/v1/venue/topology`.
   - Snaps exact fan 3D locations (`POST /api/v1/fans/locate`) and computes congestion-aware routes with game-style 3D `waypoints_3d` & `target_beacon` (`GET /api/v1/routing/recommend`).
   - Maintains low-latency WebSocket pub/sub channels (`/ws/ops` and `/ws/fan`) pushing live congestion heatmaps and 3D incident beacons.

3. **Frontend Applications (`apps/` — `Ankit-Navi-8294`)**
   - **Operations Command Center (`apps/ops-dashboard/`)**: Interactive movie-style 3D holographic stadium with pulsing congestion zones, floating 3D incident beacons, queue telemetry tables, and operator dispatch workflows.
   - **Fan Experience & Navigation App (`apps/fan-app/`)**: Interactive 3D stadium hologram displaying the fan's **exact 3D location**, congestion overlays, least-crowded gate/concession picks, and **game-style glowing 3D waypoints** leading directly to their gate/stand/facility.

## Real-Time Data Flow

```text
[Crowd Simulator / Sensors]
          │
          ▼  (TelemetrySnapshot + AlertIncident)
[services/intelligence] ──POST /api/v1/telemetry/ingest──▶ [services/backend]
          ▲                                                    │         │
          │  routing queries / live state                      ▼         ▼
          └─────────────────────────────────────────────  WS /ws/ops   WS /ws/fan
                                                               │         │
                                                               ▼         ▼
                                                    [ops-dashboard]  [fan-app]
```
