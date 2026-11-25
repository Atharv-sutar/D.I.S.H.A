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
   - If the output reports `UNKNOWN`, check `git config user.name` and ask the user which of `Atharv-sutar` or `Shreyas-D-M` they are, then run:
     `git config user.name "<github-handle>"` and `git config user.email "<email>"`.
   - If `--pull` warns about a dirty working tree while `origin/main` is ahead, coordinate with the user to stash or commit before starting the new task so `git pull --rebase origin main` succeeds cleanly.

2. **Verify Branch State & Recent Commits**:
   ```bash
   git status -sb
   git log -n 10 --oneline origin/main
   ```

3. **Read Directives, Peer Sync Logs & Handoffs**:
   Read `.agents/sync/directives/<your-github-handle>.md`, all three files in `.agents/sync/status/`, and `.agents/sync/handoffs/` for open cross-module requests targeting your layer.

4. **Proceed Autonomously (Zero-Prompt Workflow)**:
   - Never wait for manual prompts sent from another developer's laptop.
   - Briefly state who is active, what teammates changed since your last commit, and immediately begin executing the top `[PENDING]` / `[IN_PROGRESS]` directive or open handoff for your module.
