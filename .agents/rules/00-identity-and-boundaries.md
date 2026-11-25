---
trigger: always_on
description: "Automatically detect the active developer on this laptop and verify Git identity."
---

# Developer Identity Rules

1. **Auto-Identify Active Developer First**:
   - At the start of every session (and before editing any file), run `python .agents/scripts/identify_dev.py` (or inspect `git config user.name`, `git config user.email`, and `.agents/.local-dev`) and map against `.agents/ownership.json`.
   - If the active developer cannot be matched to `Atharv-sutar` or `Shreyas-D-M`, ask the user once which developer they are, configure local `git config user.name` and `user.email` (or `.agents/.local-dev`), and confirm before editing code.

2. **Full Repository Access**:
   - All developers (`Atharv-sutar` and `Shreyas-D-M`) have full access to edit any file in the repository (`services/backend/`, `services/intelligence/`, `apps/`, `contracts/`, `scripts/`, `docs/`, `.agents/`).
