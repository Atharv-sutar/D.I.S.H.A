---
trigger: always_on
description: "Synchronize with teammates via Git on startup and always verify, commit with username, and push after changes."
---

# Git Sync & Push Workflow Rules

1. **Sync Before Coding (Stay in Sync with Other Agents)**:
   - On session start (or when asked to sync), run `git fetch origin` and check `git status` and recent commits (`git log -n 8 --oneline origin/main`).
   - Read all three files in `.agents/sync/status/` (`Atharv-sutar.md`, `Shreyas-D-M.md`, `Ankit-Navi-8294.md`) and any new files in `.agents/sync/handoffs/` so you are aware of peer endpoints, schemas, and open requests.
   - If the local branch is behind `origin/main`, inform the user or rebase cleanly (`git pull --rebase origin main`) before starting new work.

2. **Verify Boundaries & Tests Before Commit**:
   - Run `python .agents/scripts/check_boundaries.py` before staging/committing to ensure no files outside the active developer's owned paths were modified.
   - Run the module's tests/linters before committing.

3. **Update Personal Sync Log & Push After Changes**:
   - Update **only** your own `.agents/sync/status/<github-username>.md` summarizing what you built, changed contracts/ports, and any handoffs needed from teammates.
   - Ensure `git config user.name` reflects the active developer (`Atharv-sutar`, `Shreyas-D-M`, or `Ankit-Navi-8294`).
   - Commit with a descriptive Conventional Commit message tagged with your username:
     `<type>(<module>): <clear description> [<github-username>]`
   - Always `git push` after completing verified changes (running `git pull --rebase` first if remote advanced). Never leave completed work uncommitted or unpushed unless the user explicitly asks not to push.
