# D.I.S.H.A. Frontend Applications (`apps/`)

**Owner**: [@Ankit-Navi-8294](https://github.com/Ankit-Navi-8294)

## Three Independent Applications

1. **[`fan-app/`](fan-app/)** (Port `3001`) — **Fan Experience & 3D Navigation App**:
   - Interactive 3D M. Chinnaswamy Stadium Hologram showing exact user location, live congestion, exits, and entry/exit/destination waypoints.
   - Seat ticket detection & simulated walking to seat and from seat to concessions/restrooms/exits.
2. **[`ops-dashboard/`](ops-dashboard/)** (Port `3000`) — **Admin Operations Command Center**:
   - Live 3D stadium congestion hologram, active fan tracking, queue telemetry monitors, and incident triage/dispatch (`Acknowledge`, `Dispatch`, `Resolve`).
3. **[`sim-studio/`](sim-studio/)** (Port `3002`) — **Behind-the-Scenes Simulator Studio**:
   - Click any zone/gate/stand on the 3D map to inject or clear congestion spikes, trigger unusual activity/incidents, switch match-day phases, or run 1-click demo presets.
4. **[`shared/`](shared/)** — Shared 3D Hologram components, TypeScript contract types, REST/WS clients, seat parser, and walk simulator.
