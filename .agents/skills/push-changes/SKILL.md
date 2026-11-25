---
name: push-changes
description: >-
  Use after completing and verifying changes. Enforces module boundary checks,
  updates the active developer's sync status and directive log, creates an
  attributed commit, and pushes changes to GitHub.
---

# Verify, Attribute & Push Runbook

Follow this checklist after finishing any meaningful code or documentation change.

## Steps

1. **Verify Module Isolation**:
   ```bash
   python .agents/scripts/check_boundaries.py
   ```
   (Pass `--allow-shared` ONLY if the user explicitly authorized edits to `contracts/`, `docs/`, or root config.)
   If any file inside another developer's directory is modified, stop and revert or move it before committing.

2. **Run Module Checks / Tests**:
   - `Atharv-sutar` (`services/backend/`, `apps/`): run `python -m unittest discover -s services/backend/tests -v` and `npm run typecheck && npm run lint && npm run build` inside `apps/ops-dashboard`, `apps/fan-app`, and `apps/sim-studio`.
   - `Shreyas-D-M` (`services/intelligence/`, excluding simulator files): run `pytest` inside `services/intelligence`.

3. **Update Your Personal Sync Status & Directive Queue**:
   Update **only** your own `.agents/sync/status/<your-github-handle>.md` and `.agents/sync/directives/<your-github-handle>.md` (mark completed items `[DONE]`) with:
   - Timestamp and branch name
   - Summary of changes completed
   - Exposed/consumed endpoints or schema dependencies
   - Any handoff notes for teammates

4. **Commit & Push with Username Attribution**:
   Verify `git config user.name` matches your GitHub handle, stage only your owned files + your status/directive files, commit, rebase if needed, and push:
   ```bash
   git status
   git add <your-owned-paths> .agents/sync/status/<your-github-handle>.md .agents/sync/directives/<your-github-handle>.md
   git commit -m "<type>(<module>): <clear description> [<your-github-handle>]"
   git pull --rebase origin main
   git push
   ```
   (If working on a feature branch, push your branch with `git push -u origin <branch-name>`.)
