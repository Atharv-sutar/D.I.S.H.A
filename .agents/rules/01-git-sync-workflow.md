---
trigger: always_on
description: "MANDATORY: Always pull latest Git changes before starting any new task, read peer sync logs, and verify, attribute, and push after changes."
---

# Git Sync & Push Workflow Rules

1. **MANDATORY Pull & Zero-Prompt Auto-Plan Before Starting Any New Task**:
   - Before writing code, designing plans, or starting **any** new task (even if the user only says `"continue"`, `"sync"`, `"start"`, or `"work on my part"`), you MUST sync with GitHub automatically:
     1. Run `python .agents/scripts/identify_dev.py --pull` (which fetches `origin`, runs `git pull --rebase origin main` when clean, identifies you, and prints pending directives & open handoffs).
     2. If the working tree has local uncommitted changes and `origin/main` is ahead, tell the user and stash (`git stash push -m "wip"`) + `git pull --rebase origin main` + `git stash pop` (or commit owned WIP first) before starting the new task.
     3. Read `.agents/sync/directives/<your-github-handle>.md`, all three `.agents/sync/status/*.md` files, any open `.agents/sync/handoffs/*.md` files targeting your layer, and inspect any `contracts/` changes since your last commit.
     4. **Proceed autonomously without needing a prompt from another developer's PC**: pick the highest-priority `[PENDING]` directive or open handoff targeted to you and execute it inside your owned directory.

2. **Verify Boundaries & Tests Before Commit**:
   - Run `python .agents/scripts/check_boundaries.py` before staging/committing to ensure no files outside the active developer's owned paths were modified.
   - Run the module's tests/linters before committing.

3. **Update Personal Sync Log & Push After Changes**:
   - Update **only** your own `.agents/sync/status/<github-username>.md` summarizing what you built, changed contracts/ports, and any handoffs needed from teammates.
   - Ensure `git config user.name` reflects the active developer (`Atharv-sutar` or `Shreyas-D-M`).
   - Commit with a descriptive Conventional Commit message tagged with your username:
     `<type>(<module>): <clear description> [<github-username>]`
   - Always `git push` after completing verified changes (running `git pull --rebase origin main` first if remote advanced). Never leave completed work uncommitted or unpushed unless the user explicitly asks not to push.
