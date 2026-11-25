# Autonomous Developer Directives (`directives/`)

Each developer has a dedicated, conflict-free task queue here (`<github-username>.md`).
When an Antigravity agent starts or resumes work on any laptop:
1. It runs `python .agents/scripts/identify_dev.py --pull`.
2. It reads its own `directives/<github-username>.md`, all `.agents/sync/status/*.md` files, and open `.agents/sync/handoffs/*.md` files.
3. It automatically picks up `[PENDING]` tasks and open handoffs targeting its layer **without needing manual prompts sent from another developer's PC**.
4. Upon completion, it marks completed directives `[DONE]` in its own directive file and updates its own `status/<github-username>.md` before pushing.
