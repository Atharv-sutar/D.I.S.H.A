---
trigger: always_on
description: "Automatically detect the active developer on this laptop and strictly enforce module directory ownership boundaries."
---

# Developer Identity & Module Isolation Rules

1. **Auto-Identify Active Developer First**:
   - At the start of every session (and before editing any file), run `python .agents/scripts/identify_dev.py` (or inspect `git config user.name`, `git config user.email`, and `.agents/.local-dev`) and map against `.agents/ownership.json`.
   - If the active developer cannot be matched to `Atharv-sutar` or `Shreyas-D-M`, ask the user once which developer they are, configure local `git config user.name` and `user.email` (or `.agents/.local-dev`), and confirm before editing code.

2. **Strict Module Ownership Enforcement**:
   - **`Atharv-sutar`** may create, modify, or delete code inside `services/backend/` and `apps/` (`apps/ops-dashboard/`, `apps/fan-app/`, `apps/sim-studio/`, `apps/shared/`).
   - **`Shreyas-D-M`** may create, modify, or delete code inside `services/intelligence/` **EXCEPT** simulator files (`services/intelligence/src/disha_intelligence/simulator.py`, `services/intelligence/src/disha_intelligence/scenarios.py`, `services/intelligence/tests/test_simulator.py`) and `apps/sim-studio/`. `Shreyas-D-M` is strictly prohibited from modifying the simulator.
   - Each developer may ONLY edit **their own** `.agents/sync/status/<github-username>.md` and `.agents/sync/directives/<github-username>.md` files, plus create new dated files in `.agents/sync/handoffs/`.

3. **Zero Cross-Boundary Edits**:
   - NEVER edit, refactor, or delete files inside another developer's owned folder or any `forbidden_paths`—even to fix a bug or integration mismatch—unless the user explicitly grants a one-time override in chat.
   - Instead, read `contracts/` and the peer module's `README.md` to inspect expected interfaces, and use `.agents/skills/propose-contract/SKILL.md` to write a handoff note in `.agents/sync/handoffs/`.
