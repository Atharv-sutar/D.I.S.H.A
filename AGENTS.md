# D.I.S.H.A. Workspace Agent Constitution

Welcome to **D.I.S.H.A.** (Smart Stadium Operations and Fan Experience Platform).
Two developers (`Atharv-sutar` and `Shreyas-D-M`) collaborate via `https://github.com/Atharv-sutar/D.I.S.H.A.`.

## Mandatory Startup & Pull-Before-Task Protocol

**CRITICAL RULE — ALWAYS PULL BEFORE STARTING ANY NEW TASK**:
Before beginning any new task, feature, bugfix, or exploration in this repository:
1. **Identify the active developer** by running `python .agents/scripts/identify_dev.py` (or checking `git config user.name` and `git config user.email` against `.agents/ownership.json`).
   - If the local Git identity does not match `Atharv-sutar` or `Shreyas-D-M`, ask the user once which developer they are and configure local `git config user.name` (or `.agents/.local-dev`).
2. **Pull latest remote changes FIRST** before editing or planning code:
   - Run `git fetch origin` and check `git status -sb`.
   - If the working tree is clean, immediately run `git pull --rebase origin main` (or use `python .agents/scripts/identify_dev.py --pull`).
   - If uncommitted local changes prevent rebasing, stash or resolve them cleanly (never discard user work silently) and sync with `origin/main` before starting the new task.
3. **Read teammate sync context & self-serve directives after pulling**:
   - `.agents/sync/directives/<your-github-handle>.md`
   - `.agents/sync/status/Atharv-sutar.md`, `.agents/sync/status/Shreyas-D-M.md`
   - Recent files in `.agents/sync/handoffs/`
   - Relevant schemas & venues in `contracts/`

## Full Repository Access

All project files (`services/backend/`, `services/intelligence/`, `apps/`, `contracts/`, `scripts/`, `docs/`, `.agents/`) are **accessible to all developers**. There are no per-developer directory locks.

## Mandatory Git Push Discipline

After completing verified changes:
1. Run relevant tests/builds (`services/backend/tests`, `services/intelligence/tests`, `apps/`).
2. Update your status file `.agents/sync/status/<github-handle>.md`.
3. Stage your changes, commit with `<type>(<scope>): <description> [<github-handle>]` under the matching `git config user.name`, and push to GitHub (`git pull --rebase` first if remote is ahead).
