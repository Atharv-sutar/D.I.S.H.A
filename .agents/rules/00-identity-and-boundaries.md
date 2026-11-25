---
trigger: always_on
description: "Automatically detect the active developer on this laptop and strictly enforce module directory ownership boundaries."
---

# Developer Identity & Module Isolation Rules

1. **Auto-Identify Active Developer First**:
   - At the start of every session (and before editing any file), run `python .agents/scripts/identify_dev.py` (or inspect `git config user.name`, `git config user.email`, and `.agents/.local-dev`) and map against `.agents/ownership.json`.
   - If the active developer cannot be matched to `Atharv-sutar`, `Shreyas-D-M`, or `Ankit-Navi-8294`, ask the user once which developer they are, configure local `git config user.name` and `user.email` (or `.agents/.local-dev`), and confirm before editing code.

2. **Strict Module Ownership Enforcement**:
   - **`Atharv-sutar`** may ONLY create, modify, or delete code inside `services/backend/`.
   - **`Shreyas-D-M`** may ONLY create, modify, or delete code inside `services/intelligence/`.
   - **`Ankit-Navi-8294`** may ONLY create, modify, or delete code inside `apps/`.
   - Each developer may ONLY edit **their own** `.agents/sync/status/<github-username>.md` file and create new dated files in `.agents/sync/handoffs/`.

3. **Zero Cross-Boundary Edits**:
   - NEVER edit, refactor, or delete files inside another developer's owned folder—even to fix a bug or integration mismatch—unless the user explicitly grants a one-time override in chat.
   - Instead, read `contracts/` and the peer module's `README.md` to inspect expected interfaces, and use `.agents/skills/propose-contract/SKILL.md` to write a handoff note in `.agents/sync/handoffs/`.
