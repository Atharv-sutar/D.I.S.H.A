---
name: session-sync
description: >-
  MANDATORY before starting any new task or whenever syncing with teammates on GitHub.
  Identifies the active developer, pulls latest remote commits from origin/main,
  and summarizes peer status updates and cross-module contract handoffs.
---

# Session Sync Runbook (Pull Before Every Task)

Run this workflow **before starting any new task**, when opening the workspace, or when checking what teammates pushed.

## Steps

1. **Identify Active Developer & Pull Latest Changes**:
   ```bash
   python .agents/scripts/identify_dev.py --pull
   ```
   - If the output reports `UNKNOWN`, check `git config user.name` and ask the user which of `Atharv-sutar`, `Shreyas-D-M`, or `Ankit-Navi-8294` they are, then run:
     `git config user.name "<github-handle>"` and `git config user.email "<email>"`.
   - If `--pull` warns about a dirty working tree while `origin/main` is ahead, coordinate with the user to stash or commit before starting the new task so `git pull --rebase origin main` succeeds cleanly.

2. **Verify Branch State & Recent Commits**:
   ```bash
   git status -sb
   git log -n 10 --oneline origin/main
   ```

3. **Read Peer Sync Logs & Handoffs**:
   Read all three files in `.agents/sync/status/` and check `.agents/sync/handoffs/` for open cross-module requests targeting your layer.

4. **Report Sync Summary**:
   Briefly inform the user:
   - Who is active, whether local branch is up to date with `origin/main`, and which directory is unlocked (`services/backend/`, `services/intelligence/`, or `apps/`).
   - Recent progress from the other two teammates and any pending contract handoffs.
