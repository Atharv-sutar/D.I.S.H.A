# Frontend Applications Instructions (`apps/`)

- **Owner**: `Ankit-Navi-8294` (Ankit Navi)
- **Scope**:
  - `apps/ops-dashboard/` — Stadium Operations Command Center (heatmaps, queue monitors, incident alert triage & dispatch)
  - `apps/fan-app/` — Fan Experience & Smart Navigation App (least-crowded entrance/concession routing, first-time visitor wayfinding)
  - `apps/shared/` — Shared frontend TypeScript contract types & UI utilities
- Follow root `AGENTS.md` and `.agents/rules/30-frontend-apps.md`.
- Align API/WebSocket client shapes with `../contracts/` and `apps/shared/types/contracts.ts`.
- Never modify `services/backend/` or `services/intelligence/`.
