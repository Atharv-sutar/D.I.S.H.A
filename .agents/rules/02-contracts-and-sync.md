---
trigger: model_decision
description: "Apply whenever designing, reading, proposing, or updating REST endpoints, WebSocket channels, stadium schemas, or cross-module integration contracts."
---

# Cross-Module Contract & Integration Rules

D.I.S.H.A. connects three decoupled layers exclusively through `contracts/`:
- `contracts/schemas/stadium_topology.schema.json`: Zones, gates, concession stands, restrooms, medical stations, seating sections, and navigation graph edges.
- `contracts/schemas/telemetry_events.schema.json`: Real-time crowd density, queue lengths, service throughput, and sensor/POS telemetry.
- `contracts/schemas/alert_incident.schema.json`: Congestion warnings, safety/medical/bottleneck incidents, severity, and dispatch status.
- `contracts/schemas/fan_guidance.schema.json`: Optimal entrance, concession, and turn-by-turn route recommendations.
- `contracts/openapi/README.md`: Canonical REST API paths and WebSocket topics (`/ws/ops`, `/ws/fan`).

## Rules When a Contract Change Is Needed

1. Do **not** silently alter shared schemas in `contracts/` while working on single-module features unless all developers agree or the change is strictly additive and documented.
2. When one developer needs a new field, endpoint, or WebSocket payload from another developer's layer:
   - Create a handoff file `.agents/sync/handoffs/YYYYMMDD-<github-username>-<short-topic>.md` specifying the consumer need, proposed JSON payload, and target owner.
   - Mention the handoff file in your `.agents/sync/status/<github-username>.md` and push to GitHub.
3. Keep all timestamps in ISO-8601 UTC (`YYYY-MM-DDTHH:MM:SSZ`) and all IDs stable across layers (`gate_north_a`, `concession_l1_east`, `zone_bowl_104`, etc.).
