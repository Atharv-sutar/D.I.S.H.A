# D.I.S.H.A. Team Roster

Two developers collaborate via `https://github.com/Atharv-sutar/D.I.S.H.A.`, with full access across all repository files (`services/backend/`, `services/intelligence/`, `apps/`, `contracts/`).

| GitHub Username | Developer | Access |
| :--- | :--- | :--- |
| `Atharv-sutar` | Atharv Sutar | Full repository access |
| `Shreyas-D-M` | Shreyas DM | Full repository access |

## Synchronization Channels

- **Per-Developer Status Logs** (`.agents/sync/status/<github-username>.md`): Keep teammates informed of your recent changes.
- **Contract Handoffs** (`.agents/sync/handoffs/<YYYYMMDD>-<handle>-<topic>.md`): Cross-module notes when needed.
- **Shared Contracts** (`contracts/`): Canonical JSON schemas and endpoint docs.

## Git Commit & Push Rules

1. Always verify `git config user.name` identifies you accurately before committing.
2. Always push verified work promptly using Conventional Commits tagged with your GitHub username:
   `<type>(<module>): <short description> [<github-username>]`
