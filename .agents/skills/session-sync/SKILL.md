---
name: session-sync
description: >-
  Use at the start of a work session or whenever syncing with teammates on GitHub.
  Identifies the active developer on this laptop, fetches remote changes, and summarizes
  peer status updates and cross-module contract handoffs.
---

# Session Sync Runbook

Run this workflow when opening the workspace, starting a new feature, or checking what teammates pushed.

## Steps

1. **Identify Active Developer & Local Scope**:
   ```bash
   python .agents/scripts/identify_dev.py
   ```
   - If the output reports `UNKNOWN`, check `git config user.name` and ask the user which of `Atharv-sutar`, `Shreyas-D-M`, or `Ankit-Navi-8294` they are, then run:
     `git config user.name "<github-handle>"` and `git config user.email "<email>"`.

2. **Fetch Latest Teammate Commits**:
   ```bash
   git fetch origin
   git status -sb
   git log -n 10 --oneline origin/main
   ```
   If behind `origin/main` and working tree is clean, run `git pull --rebase origin main`.

3. **Read Peer Sync Logs & Handoffs**:
   Read all three files in `.agents/sync/status/` and check `.agents/sync/handoffs/` for open cross-module requests targeting your layer.

4. **Report Sync Summary**:
   Briefly inform the user:
   - Who is active and which directory is unlocked (`services/backend/`, `services/intelligence/`, or `apps/`).
   - Recent progress from the other two teammates and any pending contract handoffs.
