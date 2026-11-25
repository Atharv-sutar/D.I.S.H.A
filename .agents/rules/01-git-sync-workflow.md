---
trigger: always_on
description: "MANDATORY: Always pull latest Git changes before starting any new task, read peer sync logs, and verify, attribute, and push after changes."
---

# Git Sync & Push Workflow Rules

1. **MANDATORY Pull Before Starting Any New Task**:
   - Before writing code, designing plans, or starting **any** new task, you MUST sync with GitHub first:
     1. Run `git fetch origin` and `git status -sb`.
     2. Run `git pull --rebase origin main` (or `python .agents/scripts/identify_dev.py --pull`) whenever the working tree is clean so you always build on top of teammates' latest commits.
     3. If the working tree has local uncommitted changes and `origin/main` is ahead, tell the user and stash (`git stash push -m "wip"`) + `git pull --rebase origin main` + `git stash pop` (or commit owned WIP first) before starting the new task.
     4. Inspect recent remote commits (`git log -n 8 --oneline origin/main`), read all three files in `.agents/sync/status/` (`Atharv-sutar.md`, `Shreyas-D-M.md`, `Ankit-Navi-8294.md`), and check `.agents/sync/handoffs/` for open cross-module requests.

2. **Verify Boundaries & Tests Before Commit**:
   - Run `python .agents/scripts/check_boundaries.py` before staging/committing to ensure no files outside the active developer's owned paths were modified.
   - Run the module's tests/linters before committing.

3. **Update Personal Sync Log & Push After Changes**:
   - Update **only** your own `.agents/sync/status/<github-username>.md` summarizing what you built, changed contracts/ports, and any handoffs needed from teammates.
   - Ensure `git config user.name` reflects the active developer (`Atharv-sutar`, `Shreyas-D-M`, or `Ankit-Navi-8294`).
   - Commit with a descriptive Conventional Commit message tagged with your username:
     `<type>(<module>): <clear description> [<github-username>]`
   - Always `git push` after completing verified changes (running `git pull --rebase origin main` first if remote advanced). Never leave completed work uncommitted or unpushed unless the user explicitly asks not to push.
