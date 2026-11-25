# D.I.S.H.A. Team Roster & Isolation Contract

Three developers collaborate via `https://github.com/Atharv-sutar/D.I.S.H.A.`, each owning one strictly isolated technical layer.

| GitHub Username | Developer | Module | Owned Folder(s) | Forbidden Folders |
| :--- | :--- | :--- | :--- | :--- |
| `Atharv-sutar` | Atharv Sutar | Core Backend & Streaming APIs | `services/backend/` | `services/intelligence/`, `apps/` |
| `Shreyas-D-M` | Shreyas DM | Congestion/Alert Analytics & Simulation | `services/intelligence/` | `services/backend/`, `apps/` |
| `Ankit-Navi-8294` | Ankit Navi | Frontend Apps (Ops Dashboard + Fan App) | `apps/` | `services/backend/`, `services/intelligence/` |

## Synchronization Channels

- **Per-Developer Status Logs** (`.agents/sync/status/<github-username>.md`): Each developer's agent updates **only their own** status file before pushing. Reading all three files keeps every agent informed without merge conflicts.
- **Contract Handoffs** (`.agents/sync/handoffs/<YYYYMMDD>-<handle>-<topic>.md`): Append-only dated proposals when one layer needs a new API endpoint, WebSocket message, or JSON schema field from another layer.
- **Shared Contracts** (`contracts/`): Canonical JSON schemas and endpoint docs shared across all three modules.

## Git Commit & Push Rules

1. Always verify `git config user.name` identifies you accurately before committing.
2. Always run `python .agents/scripts/check_boundaries.py` before committing/pushing.
3. Always push verified work promptly using Conventional Commits tagged with your GitHub username:
   `<type>(<module>): <short description> [<github-username>]`
   (e.g., `feat(intelligence): add gate wait-time estimator [Shreyas-D-M]`).
