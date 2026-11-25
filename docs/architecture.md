# D.I.S.H.A. System Architecture

## Overview

**D.I.S.H.A.** unifies disconnected stadium operations and fan-facing guidance into one real-time loop:

1. **Intelligence & Simulation (`services/intelligence/` — `Shreyas-D-M`)**
   - Simulates stadium crowd inflow (pre-match gate arrivals), concourse movement, concession queues (halftime surges), and facility bottlenecks.
   - Scores real-time congestion ($0.0$ to $1.0$) and predicts wait times per gate/concession.
   - Computes optimal congestion-aware routes (`FanGuidanceResponse`) across the stadium graph.
   - Detects anomalies (rapid queue buildup, stalled throughput, bottleneck cascades) and emits `AlertIncident` events.

2. **Core Backend & Streaming APIs (`services/backend/` — `Atharv-sutar`)**
   - Validates and stores stadium topology, latest telemetry snapshots, and active incidents against `contracts/schemas/`.
   - Exposes REST APIs for initial hydration, fan routing queries, and operator incident dispatch.
   - Maintains low-latency WebSocket pub/sub channels (`/ws/ops` and `/ws/fan`) pushing live updates to connected dashboards and fan mobile clients.

3. **Frontend Applications (`apps/` — `Ankit-Navi-8294`)**
   - **Operations Command Center (`apps/ops-dashboard/`)**: Live interactive stadium congestion heatmap, gate & concession queue telemetry table, emerging incident alert feed, and operator dispatch/resolve workflows.
   - **Fan Experience & Navigation App (`apps/fan-app/`)**: Mobile-first interface for first-time visitors featuring least-crowded gate recommendations, shortest total-time (walk + wait) concession discovery, step-by-step stadium navigation, and live venue advisories.

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
