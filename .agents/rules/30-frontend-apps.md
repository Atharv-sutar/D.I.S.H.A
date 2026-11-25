---
trigger: glob
globs: "apps/**"
description: "Engineering guidelines for Ankit-Navi-8294's Frontend Apps (Operations Command Dashboard and Fan Experience App)."
---

# Frontend Apps Rules (`apps/`)

- **Owner**: `Ankit-Navi-8294` (Ankit Navi)
- **Sub-Apps**:
  - `apps/ops-dashboard/` — Stadium Operations Command Center (live stadium congestion heatmap, gate/concession queue monitoring, incident alert triage & dispatch).
  - `apps/fan-app/` — Fan Experience & Smart Navigation App (first-time visitor wayfinding, least-crowded gate & concession recommendations, live advisories).
- **Tech Stack**: TypeScript (strict), Next.js / React, Tailwind CSS, WebSocket & REST client hooks.

## Module Responsibilities
- Consume backend REST endpoints and WebSocket streams (`/ws/ops` and `/ws/fan`) strictly matching `contracts/schemas/*.json` and `contracts/openapi/README.md`.
- Design resilient real-time UI states: connection indicator, live/stale telemetry timestamps, optimistic alert acknowledgment, and responsive mobile-first layouts for `fan-app` alongside high-density command-center layouts for `ops-dashboard`.
- Provide graceful local fallback/mock mode driven by `contracts/` schemas when working offline from the backend.
- Keep all frontend source, TypeScript interfaces, tests, and builds strictly within `apps/`. Never modify `services/backend/` or `services/intelligence/`.
