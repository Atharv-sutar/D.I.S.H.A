# `.agents/` — Shared Antigravity Configuration & Multi-Agent Sync Hub

This directory configures **Antigravity IDE** across all three developer laptops so every agent automatically:
1. Detects which developer (`Atharv-sutar`, `Shreyas-D-M`, `Ankit-Navi-8294`) is currently operating.
2. Enforces strict directory boundaries so no developer edits another developer's codebase.
3. Reads teammates' latest progress and API/contract handoffs from Git.
4. Verifies boundaries and pushes clean, attributed commits after completing changes.

## Directory Layout

- `ownership.json` — Machine-readable mapping of GitHub usernames, aliases, owned directories, and status files.
- `TEAM.md` — Human-readable roster and collaboration contract.
- `rules/` — Auto-discovered Antigravity rules (`always_on`, `model_decision`, and path-`glob` rules).
- `skills/` — On-demand runbooks (`session-sync`, `push-changes`, `propose-contract`).
- `sync/status/` — Conflict-free per-developer progress & endpoint state files.
- `sync/handoffs/` — Dated cross-module contract change requests.
- `scripts/` — Portable Python helpers (`identify_dev.py`, `check_boundaries.py`).
