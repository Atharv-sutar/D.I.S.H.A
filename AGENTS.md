# D.I.S.H.A. Workspace Agent Constitution

Welcome to **D.I.S.H.A.** (Smart Stadium Operations and Fan Experience Platform).
Three developers work concurrently on separate laptops via `https://github.com/Atharv-sutar/D.I.S.H.A.`.

## Mandatory Startup & Sync Protocol

At the start of every task in this repository:
1. **Identify the active developer** by reading `.agents/ownership.json` and running `python .agents/scripts/identify_dev.py` (or checking `git config user.name` and `git config user.email`).
   - If the local Git identity does not match `Atharv-sutar`, `Shreyas-D-M`, or `Ankit-Navi-8294`, ask the user once which developer they are and configure local `git config user.name` (or `.agents/.local-dev`).
2. **Sync with teammate agents** by running `git fetch origin` (and checking `git status` / remote updates) and reading:
   - `.agents/sync/status/Atharv-sutar.md`
   - `.agents/sync/status/Shreyas-D-M.md`
   - `.agents/sync/status/Ankit-Navi-8294.md`
   - Recent files in `.agents/sync/handoffs/`
   - Relevant schemas in `contracts/`

## Hard Module Ownership Boundaries

NEVER create, modify, or delete files inside another developer's module directory unless the user gives an explicit one-time override:

- **`Atharv-sutar`**: Owns `services/backend/` (Core Backend & Streaming APIs — FastAPI, WebSockets, state/telemetry gateway).
- **`Shreyas-D-M`**: Owns `services/intelligence/` (Congestion/Alert Analytics & Simulation — crowd simulator, congestion scoring, smart routing, anomaly detection).
- **`Ankit-Navi-8294`**: Owns `apps/` (`apps/ops-dashboard/` & `apps/fan-app/` — Next.js / React TypeScript frontends).

Reading peer `README.md` files and `contracts/` is encouraged; modifying peer code is strictly prohibited. To request an API or schema change from another layer, create a handoff file in `.agents/sync/handoffs/` (see `.agents/skills/propose-contract/SKILL.md`).

## Mandatory Git Push Discipline

After completing verified changes:
1. Run `python .agents/scripts/check_boundaries.py` to confirm all modified files belong to the active developer.
2. Update **only** your own status file `.agents/sync/status/<github-handle>.md` (never edit another developer's status file).
3. Stage only your owned changes, commit with `<type>(<scope>): <description> [<github-handle>]` under the matching `git config user.name`, and push to GitHub (`git pull --rebase` first if remote is ahead).
