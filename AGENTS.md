# D.I.S.H.A. Workspace Agent Constitution

Welcome to **D.I.S.H.A.** (Smart Stadium Operations and Fan Experience Platform).
Three developers work concurrently on separate laptops via `https://github.com/Atharv-sutar/D.I.S.H.A.`.

## Mandatory Startup & Pull-Before-Task Protocol

**CRITICAL RULE — ALWAYS PULL BEFORE STARTING ANY NEW TASK**:
Before beginning any new task, feature, bugfix, or exploration in this repository:
1. **Identify the active developer** by running `python .agents/scripts/identify_dev.py` (or checking `git config user.name` and `git config user.email` against `.agents/ownership.json`).
   - If the local Git identity does not match `Atharv-sutar`, `Shreyas-D-M`, or `Ankit-Navi-8294`, ask the user once which developer they are and configure local `git config user.name` (or `.agents/.local-dev`).
2. **Pull latest remote changes FIRST** before editing or planning code:
   - Run `git fetch origin` and check `git status -sb`.
   - If the working tree is clean, immediately run `git pull --rebase origin main` (or use `python .agents/scripts/identify_dev.py --pull`).
   - If uncommitted local changes prevent rebasing, stash or resolve them cleanly (never discard user work silently) and sync with `origin/main` before starting the new task.
3. **Read teammate sync context & self-serve directives after pulling**:
   - `.agents/sync/directives/<your-github-handle>.md` (your queued autonomous tasks)
   - `.agents/sync/status/Atharv-sutar.md`, `.agents/sync/status/Shreyas-D-M.md`, `.agents/sync/status/Ankit-Navi-8294.md`
   - Recent files in `.agents/sync/handoffs/`
   - Relevant schemas & venues in `contracts/`
4. **Zero-Prompt Autonomous Continuation**:
   - Do NOT wait for manual cross-laptop copy-paste prompts from teammates.
   - Automatically derive your next action from open handoffs targeted to you, `contracts/` updates since your last commit, and `[PENDING]` tasks in `.agents/sync/directives/<your-github-handle>.md`, then proceed directly within your owned folder.

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
